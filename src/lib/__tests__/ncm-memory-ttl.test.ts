import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  upsert: vi.fn(),
  findMany: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  default: {
    ncmCache: { findUnique: mocks.findUnique, upsert: mocks.upsert, findMany: mocks.findMany },
  },
}));

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}));

const dbRow = {
  code: '12345678',
  descricao: 'Folha',
  hierarchy: [
    { codigo: '1234', descricao: 'Cap' },
    { codigo: '123456', descricao: 'Sub' },
    { codigo: '12345678', descricao: 'Folha' },
  ],
  fullDescription: 'Cap > Sub > Folha',
};

describe('lookupNcm memory TTL', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    const g = globalThis as unknown as { ncmMemoryCache?: unknown };
    delete g.ncmMemoryCache;
    mocks.findUnique.mockReset();
    mocks.upsert.mockReset();
    mocks.findMany.mockReset();
    mocks.findUnique.mockResolvedValue(dbRow);
    mocks.findMany.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('hit válido expira em 10 min, não 20', async () => {
    const { lookupNcm } = await import('@/lib/ncm-lookup');
    await lookupNcm('12345678');
    mocks.findUnique.mockClear();

    vi.setSystemTime(new Date('2026-01-01T00:09:00.000Z'));
    await lookupNcm('12345678');
    expect(mocks.findUnique).not.toHaveBeenCalled();

    vi.setSystemTime(new Date('2026-01-01T00:10:01.000Z'));
    await lookupNcm('12345678');
    expect(mocks.findUnique).toHaveBeenCalled();
  });

  it('miss nulo expira em 30s, não 10 min', async () => {
    mocks.findUnique.mockResolvedValue(null);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: vi.fn() }));
    const { lookupNcm } = await import('@/lib/ncm-lookup');

    await expect(lookupNcm('12345678')).resolves.toBeNull();
    mocks.findUnique.mockClear();

    vi.setSystemTime(new Date('2026-01-01T00:00:29.000Z'));
    await expect(lookupNcm('12345678')).resolves.toBeNull();
    expect(mocks.findUnique).not.toHaveBeenCalled();

    vi.setSystemTime(new Date('2026-01-01T00:00:31.000Z'));
    await expect(lookupNcm('12345678')).resolves.toBeNull();
    expect(mocks.findUnique).toHaveBeenCalled();
  });
});
