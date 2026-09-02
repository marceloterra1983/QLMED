import { beforeEach, describe, expect, it } from 'vitest';
import {
  getBackgroundServiceHealth,
  markBackgroundServiceError,
  markBackgroundServiceHeartbeat,
  markBackgroundServiceStarted,
} from '@/lib/background-service-health';

describe('background service health', () => {
  beforeEach(() => {
    delete (globalThis as { __qlmedBackgroundServiceHealth?: unknown }).__qlmedBackgroundServiceHealth;
  });

  it('records startup and heartbeat timestamps without exposing errors by default', () => {
    markBackgroundServiceStarted('auto-sync');
    markBackgroundServiceHeartbeat('auto-sync');

    expect(getBackgroundServiceHealth()).toMatchObject({
      'auto-sync': {
        status: 'running',
      },
    });
    expect(getBackgroundServiceHealth()['auto-sync']?.lastHeartbeatAt).toEqual(expect.any(String));
  });
});

// OBS-002: um heartbeat que não sabe envelhecer não é sinal, é decoração. O
// serviço reportava 'running' para sempre depois do último batimento — inclusive
// quando o processo tinha morrido horas antes.
describe('OBS-002 — heartbeat envelhece', () => {
  const INTERVAL_MS = 60_000;

  beforeEach(() => {
    delete (globalThis as { __qlmedBackgroundServiceHealth?: unknown }).__qlmedBackgroundServiceHealth;
  });

  it('vira stale quando o batimento passa do limiar, sem ninguém escrever nada', async () => {
    markBackgroundServiceStarted('auto-sync', { heartbeatIntervalMs: INTERVAL_MS });
    const startedAt = Date.parse(getBackgroundServiceHealth()['auto-sync']!.lastHeartbeatAt!);

    const fresh = getBackgroundServiceHealth(startedAt + INTERVAL_MS);
    expect(fresh['auto-sync']?.status).toBe('running');

    // 2 ciclos é o limiar; passar dele é avaria.
    const old = getBackgroundServiceHealth(startedAt + 4 * INTERVAL_MS);
    expect(old['auto-sync']?.status).toBe('stale');
    expect(old['auto-sync']?.lastHeartbeatAgeMs).toBe(4 * INTERVAL_MS);
    expect(old['auto-sync']?.staleAfterMs).toBe(2 * INTERVAL_MS);
  });

  it('heartbeat de uma hora atrás NÃO reporta running', () => {
    markBackgroundServiceStarted('auto-sync', { heartbeatIntervalMs: INTERVAL_MS });
    const startedAt = Date.parse(getBackgroundServiceHealth()['auto-sync']!.lastHeartbeatAt!);

    const health = getBackgroundServiceHealth(startedAt + 60 * 60_000)['auto-sync'];
    expect(health?.status).not.toBe('running');
    expect(health?.status).toBe('stale');
  });

  it('o batimento seguinte rejuvenesce o serviço', () => {
    markBackgroundServiceStarted('auto-sync', { heartbeatIntervalMs: INTERVAL_MS });
    const startedAt = Date.parse(getBackgroundServiceHealth()['auto-sync']!.lastHeartbeatAt!);
    expect(getBackgroundServiceHealth(startedAt + 4 * INTERVAL_MS)['auto-sync']?.status).toBe('stale');

    markBackgroundServiceHeartbeat('auto-sync');

    const beatAt = Date.parse(getBackgroundServiceHealth()['auto-sync']!.lastHeartbeatAt!);
    expect(getBackgroundServiceHealth(beatAt)['auto-sync']?.status).toBe('running');
  });

  it('serviço desligado não envelhece — não há batimento a esperar', () => {
    markBackgroundServiceStarted('local-xml-sync', { enabled: false, heartbeatIntervalMs: INTERVAL_MS });
    const startedAt = Date.parse(getBackgroundServiceHealth()['local-xml-sync']!.lastHeartbeatAt!);

    expect(getBackgroundServiceHealth(startedAt + 100 * INTERVAL_MS)['local-xml-sync']?.status).toBe('disabled');
  });

  it('erro continua erro: stale não apaga a avaria já reportada', () => {
    markBackgroundServiceStarted('impcg-mail-ingest', { heartbeatIntervalMs: INTERVAL_MS });
    markBackgroundServiceError('impcg-mail-ingest', new Error('graph 403'));
    const startedAt = Date.parse(getBackgroundServiceHealth()['impcg-mail-ingest']!.lastHeartbeatAt!);

    const health = getBackgroundServiceHealth(startedAt + 10 * INTERVAL_MS)['impcg-mail-ingest'];
    expect(health?.status).toBe('error');
    expect(health?.lastError).toBe('graph 403');
  });

  it('respeita o intervalo declarado por cada serviço (15 min no ingest de e-mail)', () => {
    const fifteenMin = 15 * 60_000;
    markBackgroundServiceStarted('cassems-mail-ingest', { heartbeatIntervalMs: fifteenMin });
    const startedAt = Date.parse(getBackgroundServiceHealth()['cassems-mail-ingest']!.lastHeartbeatAt!);

    // Meia hora sem bater ainda cabe em 2 ciclos de 15 min; 31 min não cabe.
    expect(getBackgroundServiceHealth(startedAt + 30 * 60_000)['cassems-mail-ingest']?.status).toBe('running');
    expect(getBackgroundServiceHealth(startedAt + 31 * 60_000)['cassems-mail-ingest']?.status).toBe('stale');
  });
});
