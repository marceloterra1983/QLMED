import { createHash, randomUUID } from 'node:crypto';
import type {
  Invoice,
  NotificationChannel,
  NotificationEventType,
  Prisma,
} from '@prisma/client';
import prisma from '@/lib/prisma';
import {
  acquirePostgresTransactionAdvisoryLock,
  productAggregateLockKey,
} from '@/lib/postgres-advisory-lock';
import {
  markBackgroundServiceError,
  markBackgroundServiceHeartbeat,
  markBackgroundServiceStarted,
} from '@/lib/background-service-health';
import { canAccessPage } from '@/lib/navigation';
import { wantsNotification } from '@/lib/notification-preferences';
import { normalizePushEndpoint } from '@/lib/push-subscriptions';
import { isWebPushConfigured } from '@/lib/web-push';
import { decorateClaimInvoice } from '@/lib/cte-whatsapp-caption';

type TransactionClient = Prisma.TransactionClient;
const OUTBOX_EVENT_TYPE = 'invoice_received' as const;
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
const DEFAULT_NOTIFICATION_MAX_INVOICE_AGE_DAYS = 5;

function getNotificationMaxInvoiceAgeDays(): number {
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

/**
 * Quem, entre os usuários ativos, recebe notificação desta nota.
 *
 * Compõe as DUAS perguntas independentes (decisão D2 da SPEC-010):
 * canReceiveInvoiceNotifications responde PERMISSÃO (pode ver esta nota),
 * wantsNotification responde VONTADE (quer ser avisado). Fundi-las faria um
 * defeito de preferência virar vazamento de autorização.
 *
 * Pura e exportada de propósito: a composição precisa ser exercitável sem
 * banco. O teste de integração que cobriria isso depende de
 * RUN_DB_INTEGRATION_TESTS e fica `skipped` na suíte padrão — sem esta função
 * a remoção da preferência do filtro passaria despercebida com a suíte verde.
 */
export function selectNotifiableUsers<
  T extends {
    role: string;
    allowedPages: string[];
    notificationPreferences?: ReadonlyArray<{ eventType: NotificationEventType; enabled: boolean }> | null;
  },
>(users: readonly T[], invoiceType: Pick<Invoice, 'type'>['type']): T[] {
  return users.filter(
    (user) =>
      canReceiveInvoiceNotifications(user, invoiceType) &&
      wantsNotification(user, 'invoice_received'),
  );
}

const WHATSAPP_GROUP_JID = /^(\d{6,32})@g\.us$/i;

export function normalizeNotificationRecipient(
  channel: NotificationChannel,
  recipient: string,
): string {
  let normalized: string;
  if (channel === 'email') {
    normalized = recipient.trim().toLowerCase();
  } else if (channel === 'push') {
    normalized = normalizePushEndpoint(recipient);
  } else {
    const trimmed = recipient.trim();
    const group = trimmed.match(WHATSAPP_GROUP_JID);
    if (group) {
      normalized = `${group[1]}@g.us`;
    } else {
      const digits = trimmed.replace(/\D/g, '');
      normalized = digits.startsWith('55') || ![10, 11].includes(digits.length)
        ? digits
        : `55${digits}`;
      if (![12, 13].includes(normalized.length)) {
        throw new Error(
          trimmed.toLowerCase().includes('@g.us')
            ? 'WhatsApp group JID is invalid'
            : 'WhatsApp recipient must include a valid Brazilian phone number',
        );
      }
    }
  }

  if (!normalized) {
    throw new Error('Notification recipient is empty after normalization');
  }

  return normalized;
}

export function getConfiguredWhatsAppGroup(
  raw: string | null | undefined = process.env.NOTIFICATION_WHATSAPP_GROUP
    ?? process.env.QLMED_WHATSAPP_GROUP_JID
    ?? null,
): string | null {
  if (!raw?.trim()) return null;
  try {
    const normalized = normalizeNotificationRecipient('whatsapp', raw);
    return normalized.endsWith('@g.us') ? normalized : null;
  } catch {
    return null;
  }
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

/**
 * JOB-005: o backoff satura em 6h mas nada nunca virava `dead`, então uma
 * entrega envenenada antes do provedor (asset que não baixa, destinatário
 * inválido que passou pela normalização) ficava tentando para sempre.
 *
 * O teto só vale para falha ANTES da submissão: depois dela o resultado no
 * provedor é desconhecido e a decisão continua sendo humana, via `uncertain`.
 */
export const MAX_PRE_SUBMIT_ATTEMPTS = 5;

export function resolveDeliveryOutcome(input: {
  outcome: 'sent' | 'retry' | 'uncertain' | 'dead';
  attempts: number;
  submittingAt: Date | null;
}): 'sent' | 'retry' | 'uncertain' | 'dead' {
  if (input.outcome !== 'retry') return input.outcome;
  if (input.submittingAt !== null) return 'retry';
  return input.attempts >= MAX_PRE_SUBMIT_ATTEMPTS ? 'dead' : 'retry';
}

export function buildInvoiceNotificationDestinations(
  invoiceType: Invoice['type'],
  users: Array<{
    email: string;
    phone: string | null;
    pushEndpoints?: readonly string[];
  }>,
  alwaysEmail: string,
  whatsappGroup: string | null | undefined = undefined,
  pushEnabled = false,
): OutboxDestination[] {
  const destinations = new Map<string, OutboxDestination>();
  const add = (channel: NotificationChannel, recipient: string) => {
    const normalized = normalizeNotificationRecipient(channel, recipient);
    destinations.set(`${channel}:${normalized}`, { channel, recipient: normalized });
  };

  if (alwaysEmail.trim()) add('email', alwaysEmail);

  const group = getConfiguredWhatsAppGroup(whatsappGroup);
  if (group) add('whatsapp', group);

  for (const user of users) {
    let phone = '';
    try {
      phone = user.phone ? normalizeNotificationRecipient('whatsapp', user.phone) : '';
    } catch {
      phone = '';
    }
    if (phone && !group) add('whatsapp', phone);
    if (invoiceType === 'NFE' || phone) add('email', user.email);
    if (pushEnabled) {
      for (const endpoint of user.pushEndpoints ?? []) {
        try {
          add('push', endpoint);
        } catch {
          // Inscrição inválida não entra no outbox e não derruba e-mail/WhatsApp.
        }
      }
    }
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
  const pushEnabled = isWebPushConfigured();
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
      select: {
        email: true,
        phone: true,
        role: true,
        allowedPages: true,
        // Carregado no mesmo select de propósito: a montagem de destinatários
        // roda dentro da transação que cria a nota e não pode ganhar uma ida
        // extra ao banco. Array vazio (usuário que nunca escolheu) resolve
        // para o padrão em wantsNotification.
        notificationPreferences: {
          where: { eventType: 'invoice_received' },
          select: { eventType: true, enabled: true },
        },
        ...(pushEnabled
          ? { pushSubscriptions: { select: { endpoint: true } } }
          : {}),
      },
    }),
  ]);
  const alwaysEmail =
    process.env.NOTIFICATION_ALWAYS_EMAIL ||
    process.env.ALWAYS_EMAIL ||
    'faturamento@qlmed.com.br';
  const destinations = buildInvoiceNotificationDestinations(
    invoice.type,
    selectNotifiableUsers(users, invoice.type).map((user) => ({
      email: user.email,
      phone: user.phone,
      pushEndpoints: 'pushSubscriptions' in user
        ? user.pushSubscriptions.map((row) => row.endpoint)
        : [],
    })),
    alwaysEmail,
    getConfiguredWhatsAppGroup(),
    pushEnabled,
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

function newOutboxLockToken(workerId: string): string {
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

    const rows = await tx.notificationDelivery.findMany({
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
                companyId: true,
                senderCnpj: true,
                senderName: true,
                recipientCnpj: true,
                recipientName: true,
                totalValue: true,
                createdAt: true,
                xmlContent: true,
              },
            },
          },
        },
      },
    });

    const nfeInvoices = rows
      .map((row) => row.event.invoice)
      .filter((invoice) => invoice.type === 'NFE');
    const nicknameByKey = new Map<string, string>();
    if (nfeInvoices.length > 0) {
      const companyIds = [...new Set(nfeInvoices.map((invoice) => invoice.companyId))];
      const cnpjs = [
        ...new Set(
          nfeInvoices
            .map((invoice) => invoice.senderCnpj)
            .filter((cnpj): cnpj is string => Boolean(cnpj?.trim())),
        ),
      ];
      if (cnpjs.length > 0) {
        const nicknames = await tx.contactNickname.findMany({
          where: { companyId: { in: companyIds }, cnpj: { in: cnpjs } },
          select: { companyId: true, cnpj: true, shortName: true },
        });
        for (const nick of nicknames) {
          nicknameByKey.set(`${nick.companyId}:${nick.cnpj}`, nick.shortName);
        }
      }
    }

    return rows.map((delivery) => {
      const invoice = delivery.event.invoice;
      const senderShortName =
        invoice.type === 'NFE'
          ? nicknameByKey.get(`${invoice.companyId}:${invoice.senderCnpj}`) || null
          : null;
      return {
        ...delivery,
        event: {
          ...delivery.event,
          invoice: decorateClaimInvoice({
            ...invoice,
            senderShortName,
          }),
        },
      };
    });
  });
}

/**
 * JOB-005: nada expirava no outbox — evento fiscal de 2024 continua na tabela,
 * com destinatário e mensagem, sem prazo. A janela é decisão do dono (retenção
 * é matéria de LGPD, não de engenharia), então sem
 * `NOTIFICATION_OUTBOX_RETENTION_DAYS` nada é apagado.
 */
export function getNotificationOutboxRetentionDays(
  raw: string | undefined = process.env.NOTIFICATION_OUTBOX_RETENTION_DAYS,
): number | null {
  if (!raw?.trim()) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export async function purgeNotificationOutbox(options: {
  retentionDays?: number | null;
  now?: Date;
} = {}): Promise<{ purged: number }> {
  const retentionDays = options.retentionDays === undefined
    ? getNotificationOutboxRetentionDays()
    : options.retentionDays;
  if (!retentionDays) return { purged: 0 };

  const cutoff = new Date((options.now ?? new Date()).getTime() - retentionDays * 24 * 60 * 60 * 1000);
  // `every` sobre relação vazia é verdadeiro no Prisma, e é o que se quer: o
  // evento fora da janela anti-backlog nasce sem entrega nenhuma e também expira.
  // Qualquer entrega ainda viva (pending/retry/processing/uncertain) segura o
  // evento inteiro, por mais velho que seja — `uncertain` espera decisão humana.
  const result = await prisma.notificationOutboxEvent.deleteMany({
    where: {
      createdAt: { lt: cutoff },
      deliveries: { every: { status: { in: ['sent', 'dead'] } } },
    },
  });
  return { purged: result.count };
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
        select: { attempts: true, submittingAt: true },
      });

      if (!current) {
        response.push({ id: delivery.id, accepted: false });
        continue;
      }

      const outcome = resolveDeliveryOutcome({
        outcome: delivery.outcome,
        attempts: current.attempts,
        submittingAt: current.submittingAt,
      });
      const retryAt = new Date(Date.now() + getRetryDelaySeconds(current.attempts) * 1000);
      const result = await tx.notificationDelivery.updateMany({
        where: {
          id: delivery.id,
          status: 'processing',
          lockToken: delivery.lockToken,
        },
        data: {
          status: outcome,
          availableAt: outcome === 'retry' ? retryAt : new Date(),
          sentAt: outcome === 'sent' ? new Date() : null,
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

export const OUTBOX_PURGE_INTERVAL_MS = 24 * 60 * 60 * 1000;

/**
 * Fica registrado como `disabled` no /api/health enquanto não houver janela de
 * retenção configurada: a ausência de purga precisa ser visível, não silenciosa.
 */
export async function startNotificationOutboxPurge(): Promise<void> {
  const retentionDays = getNotificationOutboxRetentionDays();
  markBackgroundServiceStarted('notification-outbox-purge', {
    enabled: retentionDays !== null,
    heartbeatIntervalMs: OUTBOX_PURGE_INTERVAL_MS,
  });
  if (retentionDays === null) return;

  const tick = async () => {
    markBackgroundServiceHeartbeat('notification-outbox-purge');
    try {
      await purgeNotificationOutbox();
    } catch (error) {
      markBackgroundServiceError('notification-outbox-purge', error);
    }
  };

  setTimeout(() => {
    void tick();
    setInterval(() => {
      void tick();
    }, OUTBOX_PURGE_INTERVAL_MS);
  }, 20_000);
}
