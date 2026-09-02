import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Codex P2 (PR #252): com `NOTIFICATION_OUTBOX_RETENTION_DAYS` configurado o
 * purge arrancava sem `heartbeatIntervalMs`. O health assumia 60 s e, dois
 * minutos depois do arranque, `/api/health` declarava
 * `notification-outbox-purge` stale — o dia inteiro, porque o próximo tick
 * era em 24 h. O intervalo do serviço tem de ser o intervalo do purge.
 */

vi.mock('@/lib/prisma', () => {
  const deleteMany = vi.fn().mockResolvedValue({ count: 0 });
  const client = { notificationOutboxEvent: { deleteMany } };
  return { prisma: client, default: client };
});

const SERVICE = 'notification-outbox-purge';
const healthGlobal = () => globalThis as { __qlmedBackgroundServiceHealth?: unknown };

describe('startNotificationOutboxPurge — heartbeat de 24 h', () => {
  const prevRetention = process.env.NOTIFICATION_OUTBOX_RETENTION_DAYS;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetModules();
    delete healthGlobal().__qlmedBackgroundServiceHealth;
    process.env.NOTIFICATION_OUTBOX_RETENTION_DAYS = '30';
  });

  afterEach(() => {
    vi.useRealTimers();
    if (prevRetention === undefined) delete process.env.NOTIFICATION_OUTBOX_RETENTION_DAYS;
    else process.env.NOTIFICATION_OUTBOX_RETENTION_DAYS = prevRetention;
    delete healthGlobal().__qlmedBackgroundServiceHealth;
  });

  it('com retenção configurada, não fica stale antes de 2× o intervalo do purge', async () => {
    const { startNotificationOutboxPurge, OUTBOX_PURGE_INTERVAL_MS } = await import('@/lib/notification-outbox');
    const { getBackgroundServiceHealth } = await import('@/lib/background-service-health');

    await startNotificationOutboxPurge();
    const startedAt = Date.parse(getBackgroundServiceHealth()[SERVICE]!.lastHeartbeatAt!);

    // O sintoma reportado: 2 min depois do arranque, stale pelo default de 60 s.
    expect(getBackgroundServiceHealth(startedAt + 2 * 60_000 + 1)[SERVICE]?.status).toBe('running');
    expect(getBackgroundServiceHealth(startedAt + 2 * OUTBOX_PURGE_INTERVAL_MS - 1)[SERVICE]?.status).toBe('running');
    // E ainda sabe envelhecer: passado o dobro do intervalo sem batimento, é avaria.
    expect(getBackgroundServiceHealth(startedAt + 2 * OUTBOX_PURGE_INTERVAL_MS + 1)[SERVICE]?.status).toBe('stale');
    expect(getBackgroundServiceHealth()[SERVICE]?.staleAfterMs).toBe(2 * OUTBOX_PURGE_INTERVAL_MS);
  });

  it('sem retenção configurada continua `disabled`, visível', async () => {
    delete process.env.NOTIFICATION_OUTBOX_RETENTION_DAYS;
    const { startNotificationOutboxPurge } = await import('@/lib/notification-outbox');
    const { getBackgroundServiceHealth } = await import('@/lib/background-service-health');

    await startNotificationOutboxPurge();
    expect(getBackgroundServiceHealth()[SERVICE]?.status).toBe('disabled');
  });
});
