import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {},
}));

vi.mock('@/lib/product-aggregate-updater', () => ({
  scheduleNightlyRebuild: vi.fn(),
}));

vi.mock('@/lib/sync-strategies/sefaz', () => ({ sefazStrategy: {} }));
vi.mock('@/lib/sync-strategies/nsdocs', () => ({ nsdocsStrategy: {} }));
vi.mock('@/lib/sync-strategies/receita-nfse', () => ({ receitaNfseStrategy: {} }));

describe('shouldRunScheduledSync', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  async function loadHelper() {
    const mod = await import('@/lib/sync-scheduler');
    return mod.shouldRunScheduledSync;
  }

  it('libera o próximo slot horário medindo a partir do início anterior', async () => {
    const shouldRun = await loadHelper();

    expect(shouldRun(
      new Date('2026-07-27T22:00:32Z'),
      new Date('2026-07-27T23:00:32Z'),
      60,
      'America/Campo_Grande',
    )).toBe(true);
  });

  it('bloqueia uma segunda execução dentro da mesma hora local', async () => {
    const shouldRun = await loadHelper();

    expect(shouldRun(
      new Date('2026-07-27T22:00:32Z'),
      new Date('2026-07-27T22:59:59Z'),
      5,
      'America/Campo_Grande',
    )).toBe(false);
  });

  it('respeita intervalos maiores que uma hora', async () => {
    const shouldRun = await loadHelper();

    expect(shouldRun(
      new Date('2026-07-27T20:00:32Z'),
      new Date('2026-07-27T21:00:32Z'),
      120,
      'America/Campo_Grande',
    )).toBe(false);
  });
});
