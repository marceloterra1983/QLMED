import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  prismaPgConstructor: vi.fn(),
  prismaClientConstructor: vi.fn(),
  logError: vi.fn(),
  getCanonicalDatabaseUrl: vi.fn(() => 'postgresql://postgres:secret@localhost:5432/postgres'),
}));

vi.mock('@prisma/adapter-pg', () => {
  class MockPrismaPg {
    constructor(...args: unknown[]) {
      mocks.prismaPgConstructor(...args);
    }
  }
  return {
    PrismaPg: MockPrismaPg,
  };
});

vi.mock('@prisma/client', () => {
  class MockPrismaClient {
    constructor(...args: unknown[]) {
      mocks.prismaClientConstructor(...args);
    }
  }
  return {
    PrismaClient: MockPrismaClient,
  };
});

vi.mock('@/lib/logger', () => ({
  createLogger: vi.fn(() => ({
    error: mocks.logError,
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  })),
}));

vi.mock('@/lib/database-config', () => ({
  getCanonicalDatabaseUrl: mocks.getCanonicalDatabaseUrl,
}));

// Ensure background bootstrap is disabled during tests
process.env.QLMED_DISABLE_BACKGROUND_SERVICES = 'true';

import { prisma } from '@/lib/prisma';

describe('Prisma 7 connection pool configuration', () => {
  beforeEach(() => {
    delete (globalThis as Record<string, unknown>).prisma;
    mocks.prismaPgConstructor.mockClear();
    mocks.prismaClientConstructor.mockClear();
    mocks.logError.mockClear();
    mocks.getCanonicalDatabaseUrl.mockClear();
  });

  it('initializes PrismaPg with explicit connection pool settings', () => {
    // Access a property to trigger lazy initialization
    void (prisma as unknown as { $connect: unknown }).$connect;

    expect(mocks.getCanonicalDatabaseUrl).toHaveBeenCalled();
    expect(mocks.prismaPgConstructor).toHaveBeenCalledTimes(1);

    const [poolConfig, adapterOptions] = mocks.prismaPgConstructor.mock.calls[0] as [
      Record<string, unknown>,
      Record<string, unknown>,
    ];

    expect(poolConfig).toEqual({
      connectionString: 'postgresql://postgres:secret@localhost:5432/postgres',
      max: 8,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 30000,
      keepAlive: true,
      application_name: 'qlmed-web',
    });

    expect(adapterOptions).toBeDefined();
    expect(typeof adapterOptions?.onPoolError).toBe('function');
  });

  it('logs pool errors via onPoolError callback', () => {
    void (prisma as unknown as { $connect: unknown }).$connect;

    expect(mocks.prismaPgConstructor).toHaveBeenCalledTimes(1);
    const [, adapterOptions] = mocks.prismaPgConstructor.mock.calls[0] as [
      Record<string, unknown>,
      { onPoolError: (err: Error) => void },
    ];

    const testError = new Error('database connection lost');
    adapterOptions.onPoolError(testError);

    expect(mocks.logError).toHaveBeenCalledWith(
      { err: testError },
      'Prisma PostgreSQL pool error',
    );
  });

  it('reuses existing PrismaClient instance on subsequent accesses', () => {
    void (prisma as unknown as { $connect: unknown }).$connect;
    void (prisma as unknown as { $disconnect: unknown }).$disconnect;

    expect(mocks.prismaPgConstructor).toHaveBeenCalledTimes(1);
    expect(mocks.prismaClientConstructor).toHaveBeenCalledTimes(1);
  });
});
