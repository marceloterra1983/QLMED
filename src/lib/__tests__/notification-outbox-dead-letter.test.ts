import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * QLMED-JOB-005 — o backoff satura em 6h mas nenhuma entrega virava `dead` por
 * número de tentativas, e nada expirava. Entrega envenenada ANTES da submissão
 * ao provedor ficava tentando para sempre; evento fiscal de 2024 continua na
 * tabela com destinatário e mensagem.
 *
 * O teto vale só pré-submissão: depois dela o resultado no provedor é
 * desconhecido e a decisão continua humana, via `uncertain`.
 */

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  updateMany: vi.fn(),
  deleteMany: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  default: {
    $transaction: async (fn: (tx: unknown) => unknown) => fn({
      notificationDelivery: {
        findFirst: mocks.findFirst,
        updateMany: mocks.updateMany,
      },
    }),
    notificationOutboxEvent: { deleteMany: mocks.deleteMany },
  },
}));

async function ack(outcome: 'sent' | 'retry' | 'uncertain' | 'dead') {
  const { acknowledgeNotificationDeliveries } = await import('@/lib/notification-outbox');
  return acknowledgeNotificationDeliveries([
    { id: 'del-1', lockToken: 'worker:token', outcome, error: 'asset 404' },
  ]);
}

function statusWritten(): string {
  return (mocks.updateMany.mock.calls[0]?.[0] as { data: { status: string } }).data.status;
}

describe('JOB-005 — teto de tentativas e retenção do outbox fiscal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.updateMany.mockResolvedValue({ count: 1 });
    mocks.deleteMany.mockResolvedValue({ count: 0 });
  });

  it('4ª falha pré-submissão ainda agenda retry', async () => {
    mocks.findFirst.mockResolvedValue({ attempts: 4, submittingAt: null });
    await ack('retry');
    expect(statusWritten()).toBe('retry');
  });

  it('5ª falha pré-submissão vira dead', async () => {
    mocks.findFirst.mockResolvedValue({ attempts: 5, submittingAt: null });
    await ack('retry');
    expect(statusWritten()).toBe('dead');
  });

  it('falha depois da submissão ao provedor não vira dead por contagem', async () => {
    mocks.findFirst.mockResolvedValue({ attempts: 40, submittingAt: new Date() });
    await ack('retry');
    expect(statusWritten()).toBe('retry');
  });

  it('sucesso continua sendo sucesso, sem passar pelo teto', async () => {
    mocks.findFirst.mockResolvedValue({ attempts: 90, submittingAt: null });
    await ack('sent');
    expect(statusWritten()).toBe('sent');
  });

  it('sem NOTIFICATION_OUTBOX_RETENTION_DAYS a purga não apaga nada', async () => {
    const { purgeNotificationOutbox } = await import('@/lib/notification-outbox');
    const result = await purgeNotificationOutbox({ retentionDays: null });

    expect(result.purged).toBe(0);
    expect(mocks.deleteMany).not.toHaveBeenCalled();
  });

  it('purga apaga só evento antigo cujas entregas estão todas terminais', async () => {
    mocks.deleteMany.mockResolvedValue({ count: 3 });
    const { purgeNotificationOutbox } = await import('@/lib/notification-outbox');
    const result = await purgeNotificationOutbox({
      retentionDays: 180,
      now: new Date('2026-09-01T00:00:00.000Z'),
    });

    expect(result.purged).toBe(3);
    const where = (mocks.deleteMany.mock.calls[0]?.[0] as {
      where: {
        createdAt: { lt: Date };
        deliveries: { every: { status: { in: string[] } } };
      };
    }).where;
    expect(where.createdAt.lt).toEqual(new Date('2026-03-05T00:00:00.000Z'));
    expect(where.deliveries.every.status.in).toEqual(['sent', 'dead']);
  });
});

describe('JOB-005 — leitura da janela de retenção', () => {
  it('só aceita número positivo; ausente ou lixo desliga a purga', async () => {
    const { getNotificationOutboxRetentionDays } = await import('@/lib/notification-outbox');

    expect(getNotificationOutboxRetentionDays('180')).toBe(180);
    expect(getNotificationOutboxRetentionDays(undefined)).toBeNull();
    expect(getNotificationOutboxRetentionDays('  ')).toBeNull();
    expect(getNotificationOutboxRetentionDays('0')).toBeNull();
    expect(getNotificationOutboxRetentionDays('-5')).toBeNull();
    expect(getNotificationOutboxRetentionDays('sempre')).toBeNull();
  });
});
