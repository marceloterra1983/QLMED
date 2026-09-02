import { beforeEach, describe, expect, it, vi } from 'vitest';

// FISCAL-008: o relógio (30 min) só ELEGE candidatos a "preso". Quem decide é o
// lock de execução — advisory lock de SESSÃO do Postgres, largado pelo servidor
// quando a conexão morre. Antes, um sync legítimo de mais de 30 min era marcado
// como 'error' e o guarda de concorrência abria caminho para uma segunda
// corrida em paralelo com a primeira, ainda viva.

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  update: vi.fn(),
  acquire: vi.fn(),
  release: vi.fn(),
}));

vi.mock('@/lib/prisma', () => {
  const client = { syncLog: { findMany: mocks.findMany, update: mocks.update } };
  return { prisma: client, default: client };
});

vi.mock('@/lib/postgres-advisory-lock', () => ({
  acquirePostgresAdvisoryLock: mocks.acquire,
  syncExecutionLockKey: (companyId: string) => `sync-execution:${companyId}`,
  beginSyncRun: vi.fn(),
}));

vi.mock('@/lib/product-aggregate-updater', () => ({ scheduleNightlyRebuild: vi.fn() }));
vi.mock('@/lib/sync-strategies/sefaz', () => ({ syncViaSefaz: vi.fn() }));
vi.mock('@/lib/sync-strategies/nsdocs', () => ({ syncViaNsdocs: vi.fn() }));
vi.mock('@/lib/receita-nfse-sync', () => ({ syncViaReceitaNfse: vi.fn() }));

const NOW = new Date('2026-09-01T12:00:00Z').getTime();

function stuckLog(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sync-log-preso',
    companyId: 'company-1',
    syncMethod: 'nsdocs',
    // 90 minutos em 'running': muito além do piso de 30 min.
    startedAt: new Date(NOW - 90 * 60 * 1000),
    company: { razaoSocial: 'QLMED' },
    ...overrides,
  };
}

async function loadRecover() {
  const mod = await import('@/lib/sync-scheduler');
  return mod.recoverStuckSyncLogs;
}

describe('FISCAL-008 — recuperação de sync preso exige liveness real', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mocks.update.mockResolvedValue({});
  });

  it('NÃO fecha o log quando o lock de execução continua tomado (processo vivo)', async () => {
    mocks.findMany.mockResolvedValue([stuckLog()]);
    mocks.acquire.mockResolvedValue(null); // pg_try_advisory_lock devolveu false

    const recoverStuckSyncLogs = await loadRecover();
    await recoverStuckSyncLogs(NOW);

    expect(mocks.acquire).toHaveBeenCalledWith('sync-execution:company-1');
    // O ponto do finding: 90 minutos NÃO bastam para matar uma corrida viva.
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('fecha o log órfão quando o lock está livre (o dono morreu) e larga o lock', async () => {
    mocks.findMany.mockResolvedValue([stuckLog()]);
    mocks.acquire.mockResolvedValue({ release: mocks.release });

    const recoverStuckSyncLogs = await loadRecover();
    await recoverStuckSyncLogs(NOW);

    expect(mocks.update).toHaveBeenCalledTimes(1);
    const payload = mocks.update.mock.calls[0][0];
    expect(payload.where).toEqual({ id: 'sync-log-preso' });
    expect(payload.data.status).toBe('error');
    expect(payload.data.errorMessage).toContain('lock de execução livre');
    expect(mocks.release).toHaveBeenCalledTimes(1);
  });

  it('decide log a log: fecha o órfão e poupa o vivo no mesmo ciclo', async () => {
    mocks.findMany.mockResolvedValue([
      stuckLog({ id: 'vivo', companyId: 'company-viva' }),
      stuckLog({ id: 'orfao', companyId: 'company-morta' }),
    ]);
    mocks.acquire.mockImplementation(async (key: string) =>
      key === 'sync-execution:company-viva' ? null : { release: mocks.release },
    );

    const recoverStuckSyncLogs = await loadRecover();
    await recoverStuckSyncLogs(NOW);

    expect(mocks.update).toHaveBeenCalledTimes(1);
    expect(mocks.update.mock.calls[0][0].where).toEqual({ id: 'orfao' });
  });

  it('larga o lock mesmo quando a escrita do log falha', async () => {
    mocks.findMany.mockResolvedValue([stuckLog()]);
    mocks.acquire.mockResolvedValue({ release: mocks.release });
    mocks.update.mockRejectedValue(new Error('db caiu'));

    const recoverStuckSyncLogs = await loadRecover();
    await recoverStuckSyncLogs(NOW);

    expect(mocks.release).toHaveBeenCalledTimes(1);
  });
});
