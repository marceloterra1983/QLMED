import { afterAll, describe, expect, it } from 'vitest';
import prisma from '@/lib/prisma';
import {
  acknowledgeNotificationDeliveries,
  claimNotificationDeliveries,
  createHistoricalInvoiceWithoutOutbox,
  createInvoiceWithOutbox,
  markNotificationDeliverySubmitting,
  upsertInvoiceWithOutbox,
} from '@/lib/notification-outbox';
import {
  acquirePostgresAdvisoryLock,
  productAggregateLockKey,
} from '@/lib/postgres-advisory-lock';

const integrationDescribe = process.env.RUN_DB_INTEGRATION_TESTS === '1' ? describe : describe.skip;
const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const userEmail = `outbox-${suffix}@qlmed.test`;
const historicalUserEmail = `historical-${userEmail}`;

integrationDescribe('notification outbox database integration', () => {
  afterAll(async () => {
    // `Company.userId` é RESTRICT desde a correção do INFO-002: apagar o
    // utilizador já não arrasta a empresa nem as notas dela.
    const owners = await prisma.user.findMany({
      where: { email: { in: [userEmail, historicalUserEmail] } },
      select: { id: true },
    });
    const ownerIds = owners.map((row) => row.id);
    if (ownerIds.length > 0) {
      await prisma.company.deleteMany({ where: { userId: { in: ownerIds } } });
      await prisma.user.deleteMany({ where: { id: { in: ownerIds } } });
    }
    await prisma.$disconnect();
  });

  it('creates the event and frozen per-recipient deliveries in the invoice transaction', async () => {
    process.env.NOTIFICATION_ALWAYS_EMAIL = 'faturamento@qlmed.test';
    const user = await prisma.user.create({
      data: {
        email: userEmail,
        passwordHash: 'test',
        name: 'Outbox Test',
        phone: '(67) 99999-0000',
        role: 'admin',
        status: 'active',
      },
    });
    const company = await prisma.company.create({
      data: {
        cnpj: `99${Date.now().toString().slice(-12)}`,
        razaoSocial: 'Outbox Test',
        userId: user.id,
      },
    });
    const accessKey = `35${Date.now().toString().padEnd(42, '0').slice(0, 42)}`;
    const data = {
      accessKey,
      type: 'NFE' as const,
      direction: 'received' as const,
      number: '1',
      issueDate: new Date(),
      senderCnpj: '00000000000000',
      senderName: 'Fornecedor',
      recipientCnpj: company.cnpj,
      recipientName: company.razaoSocial,
      totalValue: 1,
      xmlContent: '<nfeProc />',
      companyId: company.id,
    };

    const rebuildLock = await acquirePostgresAdvisoryLock(productAggregateLockKey(company.id));
    expect(rebuildLock).not.toBeNull();
    let creationSettled = false;
    const creationPromise = createInvoiceWithOutbox({ data }).finally(() => {
      creationSettled = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(creationSettled).toBe(false);
    await rebuildLock!.release();

    const created = await creationPromise;
    expect(created.eventCreated).toBe(true);

    const replay = await upsertInvoiceWithOutbox({
      where: { accessKey },
      create: data,
      update: { xmlContent: '<nfeProc replay="true" />' },
    });
    expect(replay.isNewInvoice).toBe(false);
    expect(replay.eventCreated).toBe(false);

    const event = await prisma.notificationOutboxEvent.findUniqueOrThrow({
      where: { invoiceId: created.invoice.id },
      include: { deliveries: { orderBy: [{ channel: 'asc' }, { recipient: 'asc' }] } },
    });
    expect(event.deliveries).toHaveLength(3);
    expect(new Set(event.deliveries.map((delivery) => delivery.idempotencyKey)).size).toBe(3);
    expect(event.deliveries.every((delivery) => delivery.status === 'pending')).toBe(true);

    const [firstWorker, competingWorker] = await Promise.all([
      claimNotificationDeliveries({
        workerId: 'integration-test',
        invoiceType: 'NFE',
        limit: 10,
        leaseSeconds: 900,
      }),
      claimNotificationDeliveries({
        workerId: 'competing-worker',
        invoiceType: 'NFE',
        limit: 10,
        leaseSeconds: 900,
      }),
    ]);
    const claimed = [...firstWorker, ...competingWorker];
    expect(claimed).toHaveLength(3);
    expect(new Set(claimed.map((delivery) => delivery.id)).size).toBe(3);

    expect(await markNotificationDeliverySubmitting({
      id: claimed[0].id,
      lockToken: claimed[0].lockToken!,
    })).toBe(true);
    await prisma.notificationDelivery.updateMany({
      where: { id: { in: [claimed[0].id, claimed[1].id] } },
      data: { lockedAt: new Date(0) },
    });

    const recovered = await claimNotificationDeliveries({
      workerId: 'lease-recovery-worker',
      invoiceType: 'NFE',
      limit: 10,
      leaseSeconds: 60,
    });
    expect(recovered.map((delivery) => delivery.id)).toEqual([claimed[1].id]);
    expect(await prisma.notificationDelivery.findUnique({
      where: { id: claimed[0].id },
      select: { status: true },
    })).toEqual({ status: 'uncertain' });

    const acknowledged = await acknowledgeNotificationDeliveries([claimed[2], recovered[0]].map((delivery) => ({
      id: delivery.id,
      lockToken: delivery.lockToken!,
      outcome: 'sent' as const,
      providerMessageId: `test-${delivery.id}`,
    })));
    expect(acknowledged.every((result) => result.accepted)).toBe(true);
    expect(await prisma.notificationDelivery.count({
      where: { eventId: event.id, status: 'sent' },
    })).toBe(2);
  });

  it('does not enqueue notifications for an explicit historical import', async () => {
    const user = await prisma.user.create({
      data: {
        email: historicalUserEmail,
        passwordHash: 'test',
        name: 'Historical Test',
        role: 'admin',
        status: 'active',
      },
    });
    const company = await prisma.company.create({
      data: {
        cnpj: `98${Date.now().toString().slice(-12)}`,
        razaoSocial: 'Historical Test',
        userId: user.id,
      },
    });
    const invoice = await createHistoricalInvoiceWithoutOutbox({
      data: {
        accessKey: `36${Date.now().toString().padEnd(42, '0').slice(0, 42)}`,
        type: 'NFE',
        direction: 'received',
        number: 'historical-1',
        issueDate: new Date(0),
        senderCnpj: '00000000000000',
        senderName: 'Fornecedor Histórico',
        totalValue: 1,
        xmlContent: '<nfeProc />',
        companyId: company.id,
      },
    });

    expect(await prisma.notificationOutboxEvent.count({
      where: { invoiceId: invoice.id },
    })).toBe(0);
  });
});
