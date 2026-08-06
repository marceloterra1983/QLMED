import { beforeEach, describe, expect, it, vi } from 'vitest';

const findMany = vi.fn();

vi.mock('@/lib/prisma', () => ({
  prisma: {
    syncLog: { findMany },
  },
}));

vi.mock('@/lib/product-aggregate-updater', () => ({
  scheduleNightlyRebuild: vi.fn(),
}));

vi.mock('@/lib/sync-strategies/sefaz', () => ({ syncViaSefaz: vi.fn() }));
vi.mock('@/lib/sync-strategies/nsdocs', () => ({ syncViaNsdocs: vi.fn() }));
vi.mock('@/lib/sync-strategies/receita-nfse', () => ({ syncViaReceitaNfse: vi.fn() }));
function run(partial: {
  status: 'completed' | 'error';
  completedAt: Date;
  newDocs?: number;
  updatedDocs?: number;
  errorMessage?: string | null;
}) {
  return {
    status: partial.status,
    completedAt: partial.completedAt,
    newDocs: partial.newDocs ?? 0,
    updatedDocs: partial.updatedDocs ?? 0,
    errorMessage: partial.errorMessage ?? null,
  };
}

describe('getSefazCooldown', () => {
  beforeEach(() => {
    findMany.mockReset();
    vi.resetModules();
    vi.stubEnv('SEFAZ_AUTO_SYNC_INTERVAL_MINUTES', '360');
    vi.stubEnv('SEFAZ_EMPTY_SYNC_COOLDOWN_MINUTES', '360');
    vi.stubEnv('SEFAZ_RATE_LIMIT_COOLDOWN_MINUTES', '360');
    vi.stubEnv('SEFAZ_RATE_LIMIT_COOLDOWN_MAX_MINUTES', '1440');
  });

  async function loadCooldown() {
    const mod = await import('@/lib/sync-scheduler');
    return mod.getSefazCooldown;
  }

  it('libera quando não há syncs anteriores', async () => {
    findMany.mockResolvedValue([]);
    const getSefazCooldown = await loadCooldown();
    const result = await getSefazCooldown('co1', new Date('2026-07-27T12:00:00Z'));
    expect(result.active).toBe(false);
  });

  it('aplica cooldown longo após sync vazio (caught-up)', async () => {
    findMany.mockResolvedValue([
      run({ status: 'completed', completedAt: new Date('2026-07-27T08:15:00Z') }),
    ]);
    const getSefazCooldown = await loadCooldown();
    const at3h = await getSefazCooldown('co1', new Date('2026-07-27T11:15:00Z'));
    expect(at3h.active).toBe(true);
    expect(at3h.reason).toMatch(/caught-up|sem documentos/i);

    const at6h = await getSefazCooldown('co1', new Date('2026-07-27T14:15:00Z'));
    expect(at6h.active).toBe(false);
  });

  it('escala cooldown após 656 consecutivos', async () => {
    findMany.mockResolvedValue([
      run({
        status: 'error',
        completedAt: new Date('2026-07-26T15:15:00Z'),
        errorMessage: 'Bloqueio SEFAZ (656): Excesso de consultas. Aguarde 1h.',
      }),
      run({
        status: 'error',
        completedAt: new Date('2026-07-26T11:15:00Z'),
        errorMessage: 'Bloqueio SEFAZ (656): Excesso de consultas. Aguarde 1h.',
      }),
    ]);
    const getSefazCooldown = await loadCooldown();
    // streak=2 → 720 min a partir de 15:15 → ainda ativo 6h depois
    const at6h = await getSefazCooldown('co1', new Date('2026-07-26T21:15:00Z'));
    expect(at6h.active).toBe(true);
    expect(at6h.reason).toMatch(/656/);
  });

  it('empty após 656 não zera o streak — ancora no último 656', async () => {
    findMany.mockResolvedValue([
      run({ status: 'completed', completedAt: new Date('2026-07-26T16:00:00Z') }),
      run({
        status: 'error',
        completedAt: new Date('2026-07-26T11:15:00Z'),
        errorMessage: 'Bloqueio SEFAZ (656): Excesso',
      }),
    ]);
    const getSefazCooldown = await loadCooldown();
    const result = await getSefazCooldown('co1', new Date('2026-07-26T14:00:00Z'));
    expect(result.active).toBe(true);
    expect(result.reason).toMatch(/656/);
  });
});
