import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  apiKeyFindUnique: vi.fn(),
  apiKeyUpdate: vi.fn(),
  accessLogCreate: vi.fn(),
  headers: vi.fn(),
  getServerSession: vi.fn(),
}));

vi.mock('next/headers', () => ({ headers: mocks.headers }));
vi.mock('next-auth', () => ({ getServerSession: mocks.getServerSession }));
vi.mock('@/lib/auth-options', () => ({ authOptions: {} }));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({
    error: vi.fn(),
    warn: vi.fn(),
  }),
}));
vi.mock('@/lib/prisma', () => ({
  default: {
    apiKey: {
      findUnique: mocks.apiKeyFindUnique,
      update: mocks.apiKeyUpdate,
    },
    accessLog: {
      create: mocks.accessLogCreate,
    },
  },
}));

import { requireAuth } from '@/lib/auth';

describe('requireAuth API key scopes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.headers.mockResolvedValue({
      get: (name: string) => (name === 'x-api-key' ? 'worker-key' : null),
    });
    mocks.apiKeyUpdate.mockResolvedValue({});
    mocks.accessLogCreate.mockResolvedValue({});
    mocks.apiKeyFindUnique.mockResolvedValue({
      id: 'key-1',
      createdById: 'user-1',
      scopes: ['notifications:dispatch'],
      revokedAt: null,
      createdBy: { role: 'viewer', status: 'active' },
    });
  });

  it('rejects a narrow worker key on routes without an explicit scope', async () => {
    await expect(requireAuth()).rejects.toThrow('FORBIDDEN');
  });

  it('accepts a worker key only for its declared scope', async () => {
    await expect(requireAuth({ apiKeyScope: 'notifications:dispatch' })).resolves.toBe('user-1');
    await expect(requireAuth({ apiKeyScope: 'notifications:assets' })).rejects.toThrow('FORBIDDEN');
  });

  it('keeps admin API keys as the explicit super-scope', async () => {
    mocks.apiKeyFindUnique.mockResolvedValue({
      id: 'key-admin',
      createdById: 'admin-1',
      scopes: ['admin'],
      revokedAt: null,
      createdBy: { role: 'admin', status: 'active' },
    });

    await expect(requireAuth()).resolves.toBe('admin-1');
    await expect(requireAuth({ apiKeyScope: 'notifications:assets' })).resolves.toBe('admin-1');
  });

  it('does not honor admin scope after the creator is demoted', async () => {
    mocks.apiKeyFindUnique.mockResolvedValue({
      id: 'key-demoted',
      createdById: 'editor-1',
      scopes: ['admin', 'invoices:read'],
      revokedAt: null,
      createdBy: { role: 'editor', status: 'active' },
    });

    await expect(requireAuth()).rejects.toThrow('FORBIDDEN');
    await expect(requireAuth({ apiKeyScope: 'invoices:read' })).resolves.toBe('editor-1');
  });
});
