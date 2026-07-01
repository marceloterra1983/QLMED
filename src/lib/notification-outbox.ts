import { createHash, randomUUID } from 'node:crypto';
import type {
  Invoice,
  NotificationChannel,
  Prisma,
} from '@prisma/client';
import prisma from '@/lib/prisma';
import {
  acquirePostgresTransactionAdvisoryLock,
  productAggregateLockKey,
} from '@/lib/postgres-advisory-lock';
import { canAccessPage } from '@/lib/navigation';

type TransactionClient = Prisma.TransactionClient;
export const OUTBOX_EVENT_TYPE = 'invoice_received' as const;
export const DEFAULT_OUTBOX_LEASE_SECONDS = 15 * 60;
export const MAX_OUTBOX_LEASE_SECONDS = 60 * 60;

export function isNotificationEligibleInvoice(
  invoice: Pick<Invoice, 'type' | 'direction'>,
): boolean {
  return invoice.direction === 'received' && (invoice.type === 'NFE' || invoice.type === 'CTE');
}

// Guarda anti-backlog: a SEFAZ/NSDocs pode distribuir documentos emitidos há
// semanas todos de uma vez. Sem esta guarda, cada documento antigo dispararia
// uma notificação, inundando os destinatários com CT-e/NF-e velhos. Documentos
// mais antigos que a janela ainda são importados e ficam visíveis no sistema —
// apenas não geram notificação. 0 (ou negativo) desliga a guarda.
export const DEFAULT_NOTIFICATION_MAX_INVOICE_AGE_DAYS = 5;

export function getNotificationMaxInvoiceAgeDays(): number {
  const raw = process.env.NOTIFICATION_MAX_INVOICE_AGE_DAYS;
  if (raw === undefined || raw.trim() === '') {
    return DEFAULT_NOTIFICATION_MAX_INVOICE_AGE_DAYS;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0
    ? parsed
    : DEFAULT_NOTIFICATION_MAX_INVOICE_AGE_DAYS;
}

export function isInvoiceWithinNotificationWindow(
  invoice: { issueDate: Date | null },
  maxAgeDays: number = getNotificationMaxInvoiceAgeDays(),
  now: Date = new Date(),
): boolean {
  if (!(maxAgeDays > 0)) return true; // guarda desligada
  if (!invoice.issueDate) return true; // sem data de emissão: fail-open (não suprime)
  const ageMs = now.getTime() - new Date(invoice.issueDate).getTime();
  return ageMs <= maxAgeDays * 24 * 60 * 60 * 1000;
}

export function buildNotificationEventKey(invoiceId: string): string {
  return `${OUTBOX_EVENT_TYPE}:${invoiceId}`;
}

export function canReceiveInvoiceNotifications(user: {
  role: string;
  allowedPages: string[];
}, invoiceType: Pick<Invoice, 'type'>['type']): boolean {
  const requiredPage = invoiceType === 'CTE' ? '/fiscal/cte' : '/fiscal/invoices';
  return canAccessPage(user.role, user.allowedPages, requiredPage);
}

export function normalizeNotificationRecipient(
  channel: NotificationChannel,
  recipient: string,
): string {
  let normalized: string;
  if (channel === 'email') {
    normalized = recipient.trim().toLowerCase();
  } else {
    const digits = recipient.replace(/\D/g, '');
    normalized = digits.startsWith('55') || ![10, 11].includes(digits.length)
      ? digits
      : `55${digits}`;
    if (![12, 13].includes(normalized.length)) {
      throw new Error('WhatsApp recipient must include a valid Brazilian phone number');
    }
  }

  if (!normalized) {
    throw new Error('Notification recipient is empty after normalization');
  }

  return normalized;
}

export function buildDeliveryIdempotencyKey(
  eventKey: string,
  channel: NotificationChannel,
  recipient: string,
): string {
  const normalized = normalizeNotificationRecipient(channel, recipient);
  return createHash('sha256')
    .update(`${eventKey}\0${channel}\0${normalized}`, 'utf8')
    .digest('hex');
}

export function getRetryDelaySeconds(attempts: number): number {
  return Math.min(6 * 60 * 60, Math.max(60, 2 ** Math.max(0, attempts - 1) * 60));
}

export function buildInvoiceNotificationDestinations(
  invoiceType: Invoice['type'],
  users: Array<{ email: string; phone: string | null }>,
  alwaysEmail: string,
): OutboxDestination[] {
  const destinations = new Map<string, OutboxDestination>();
  const add = (channel: NotificationChannel, recipient: string) => {
    const normalized = normalizeNotificationRecipient(channel, recipient);
    destinations.set(`${channel}:${normalized}`, { channel, recipient: normalized });
  };

  if (alwaysEmail.trim()) add('email', alwaysEmail);

  for (const user of users) {
    let phone = '';
    try {
      phone = user.phone ? normalizeNotificationRecipient('whatsapp', user.phone) : '';
    } catch {
      phone = '';
    }
    if (phone) add('whatsapp', phone);
    if (invoiceType === 'NFE' || phone) add('email', user.email);
  }

  return Array.from(destinations.values());
}

async function enqueueInvoiceEvent(
  tx: TransactionClient,
  invoice: Invoice,
): Promise<boolean> {
  if (!isNotificationEligibleInvoice(invoice)) return false;

  const eventKey = buildNotificationEventKey(invoice.id);
  const result = await tx.notificationOutboxEvent.createMany({
    data: [{
      eventKey,
      eventType: OUTBOX_EVENT_TYPE,
      companyId: invoice.companyId,
      invoiceId: invoice.id,
    }],
    skipDuplicates: true,
  });

  if (result.count !== 1) return false;

  // Backlog antigo (ex.: distribuição SEFAZ/NSDocs de documentos emitidos há
  // semanas, todos de uma vez): registra o evento — a nota continua contando
  // como recebida/nova — mas NÃO gera nenhuma entrega, evitando inundar os
  // destinatários com notificações de documentos velhos.
  if (!isInvoiceWithinNotificationWindow(invoice)) {
    return true;
  }

  const companyCount = await tx.company.count();
  const [event, users] = await Promise.all([
    tx.notificationOutboxEvent.findUniqueOrThrow({
      where: { eventKey },
      select: { id: true },
    }),
    tx.user.findMany({
      where: {
        status: 'active',
        ...(companyCount > 1 ? { companies: { some: { id: invoice.companyId } } } : {}),
      },
      select: { email: true, phone: true, role: true, allowedPages: true },
    }),
  ]);
  const alwaysEmail =
    process.env.NOTIFICATION_ALWAYS_EMAIL ||
    process.env.ALWAYS_EMAIL ||
    'faturamento@qlmed.com.br';
  const destinations = buildInvoiceNotificationDestinations(
    invoice.type,
    users.filter((user) => canReceiveInvoiceNotifications(user, invoice.type)),
    alwaysEmail,
  );

  await tx.notificationDelivery.createMany({
    data: destinations.map(({ channel, recipient }) => ({
      eventId: event.id,
      channel,
      recipient,
      idempotencyKey: buildDeliveryIdempotencyKey(eventKey, channel, recipient),
    })),
    skipDuplicates: true,
  });

  return true;
}

export async function createInvoiceWithOutbox(
  args: Prisma.InvoiceCreateArgs,
): Promise<{ invoice: Invoice; eventCreated: boolean }> {
  return prisma.$transaction(async (tx) => {
    const companyId = getInvoiceWriteCompanyId(args.data);
    if (companyId) {
      await acquirePostgresTransactionAdvisoryLock(tx, productAggregateLockKey(companyId));
    }
    const invoice = await tx.invoice.create(args);
    const eventCreated = await enqueueInvoiceEvent(tx, invoice);
    return { invoice, eventCreated };
  });
}

export async function createHistoricalInvoiceWithoutOutbox(
  args: Prisma.InvoiceCreateArgs,
): Promise<Invoice> {
  return prisma.$transaction(async (tx) => {
    const companyId = getInvoiceWriteCompanyId(args.data);
    if (companyId) {
      await acquirePostgresTransactionAdvisoryLock(tx, productAggregateLockKey(companyId));
    }
    return tx.invoice.create(args);
  });
}

export async function upsertInvoiceWithOutbox(
  args: Prisma.InvoiceUpsertArgs,
): Promise<{ invoice: Invoice; isNewInvoice: boolean; eventCreated: boolean }> {
  return prisma.$transaction(async (tx) => {
    const companyId = getInvoiceWriteCompanyId(args.create);
    if (companyId) {
      await acquirePostgresTransactionAdvisoryLock(tx, productAggregateLockKey(companyId));
    }
    const existing = await tx.invoice.findUnique({
      where: args.where,
      select: { id: true },
    });
    const invoice = await tx.invoice.upsert(args);

    if (existing) {
      return { invoice, isNewInvoice: false, eventCreated: false };
    }

    const eventCreated = await enqueueInvoiceEvent(tx, invoice);
    return {
      invoice,
      isNewInvoice: eventCreated || !isNotificationEligibleInvoice(invoice),
      eventCreated,
    };
  });
}

function getInvoiceWriteCompanyId(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const writeData = data as {
    companyId?: unknown;
    company?: { connect?: { id?: unknown } };
  };
  if (typeof writeData.companyId === 'string') return writeData.companyId;
  const connectedId = writeData.company?.connect?.id;
  return typeof connectedId === 'string' ? connectedId : null;
}

export interface OutboxDestination {
  channel: NotificationChannel;
  recipient: string;
}

export function newOutboxLockToken(workerId: string): string {
  return `${workerId}:${randomUUID()}`;
}

export async function claimNotificationDeliveries(options: {
  workerId: string;
  invoiceType: 'NFE' | 'CTE';
  limit: number;
  leaseSeconds: number;
}) {
  const { workerId, invoiceType, limit, leaseSeconds } = options;

  return prisma.$transaction(async (tx) => {
    const leaseCutoff = new Date(Date.now() - leaseSeconds * 1000);

    // A worker that expired before entering provider submission is safe to
    // retry. Once submission began, the provider outcome may be unknown and
    // requires an explicit administrator decision.
    await tx.notificationDelivery.updateMany({
      where: {
        status: 'processing',
        lockedAt: { lt: leaseCutoff },
        submittingAt: null,
      },
      data: {
        status: 'retry',
        availableAt: new Date(),
        lockedAt: null,
        lockToken: null,
        lastError: 'Lease expired before provider submission',
      },
    });
    await tx.notificationDelivery.updateMany({
      where: {
        status: 'processing',
        lockedAt: { lt: leaseCutoff },
        submittingAt: { not: null },
      },
      data: {
        status: 'uncertain',
        lockToken: null,
        lastError: 'Lease expired after provider submission began',
      },
    });

    const candidates = await tx.notificationDelivery.findMany({
      where: {
        status: { in: ['pending', 'retry'] },
        availableAt: { lte: new Date() },
        event: {
          eventType: OUTBOX_EVENT_TYPE,
          invoice: { type: invoiceType, direction: 'received' },
        },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: limit,
      select: { id: true },
    });

    const claimedIds: string[] = [];
    for (const candidate of candidates) {
      const lockToken = newOutboxLockToken(workerId);
      const result = await tx.notificationDelivery.updateMany({
        where: {
          id: candidate.id,
          status: { in: ['pending', 'retry'] },
          availableAt: { lte: new Date() },
        },
        data: {
          status: 'processing',
          lockedAt: new Date(),
          lockToken,
          submittingAt: null,
          attempts: { increment: 1 },
        },
      });
      if (result.count === 1) claimedIds.push(candidate.id);
    }

    return tx.notificationDelivery.findMany({
      where: { id: { in: claimedIds } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        channel: true,
        recipient: true,
        idempotencyKey: true,
        attempts: true,
        lockToken: true,
        event: {
          select: {
            eventKey: true,
            invoice: {
              select: {
                id: true,
                accessKey: true,
                type: true,
                direction: true,
                number: true,
                series: true,
                issueDate: true,
                senderCnpj: true,
                senderName: true,
                recipientCnpj: true,
                recipientName: true,
                totalValue: true,
                createdAt: true,
              },
            },
          },
        },
      },
    });
  });
}

export async function markNotificationDeliverySubmitting(delivery: {
  id: string;
  lockToken: string;
}): Promise<boolean> {
  const result = await prisma.notificationDelivery.updateMany({
    where: {
      id: delivery.id,
      status: 'processing',
      lockToken: delivery.lockToken,
      submittingAt: null,
    },
    data: { submittingAt: new Date() },
  });
  return result.count === 1;
}

export async function acknowledgeNotificationDeliveries(
  deliveries: Array<{
    id: string;
    lockToken: string;
    outcome: 'sent' | 'retry' | 'uncertain' | 'dead';
    providerMessageId?: string;
    error?: string;
  }>,
) {
  return prisma.$transaction(async (tx) => {
    const response: Array<{ id: string; accepted: boolean }> = [];

    for (const delivery of deliveries) {
      const current = await tx.notificationDelivery.findFirst({
        where: {
          id: delivery.id,
          status: 'processing',
          lockToken: delivery.lockToken,
        },
        select: { attempts: true },
      });

      if (!current) {
        response.push({ id: delivery.id, accepted: false });
        continue;
      }

      const retryAt = new Date(Date.now() + getRetryDelaySeconds(current.attempts) * 1000);
      const result = await tx.notificationDelivery.updateMany({
        where: {
          id: delivery.id,
          status: 'processing',
          lockToken: delivery.lockToken,
        },
        data: {
          status: delivery.outcome,
          availableAt: delivery.outcome === 'retry' ? retryAt : new Date(),
          sentAt: delivery.outcome === 'sent' ? new Date() : null,
          providerMessageId: delivery.providerMessageId,
          lastError: delivery.error ?? null,
          lockedAt: null,
          lockToken: null,
        },
      });
      response.push({ id: delivery.id, accepted: result.count === 1 });
    }

    return response;
  });
}
