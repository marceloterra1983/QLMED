import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  queryRaw: vi.fn(),
  groupBy: vi.fn(),
  findFirst: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ requireAuth: mocks.requireAuth }));
vi.mock('@/lib/prisma', () => ({
  default: {
    $queryRaw: mocks.queryRaw,
    notificationDelivery: {
      groupBy: mocks.groupBy,
      findFirst: mocks.findFirst,
    },
  },
}));

import { GET } from '@/app/api/health/route';

describe('health authentication details', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.queryRaw.mockResolvedValue([{ '?column?': 1 }]);
    mocks.groupBy.mockResolvedValue([]);
    mocks.findFirst.mockResolvedValue(null);
  });

  it('does not expose authenticated details for a revoked session', async () => {
    mocks.requireAuth.mockRejectedValue(new Error('NOT_AUTHENTICATED'));

    const response = await GET();
    const body = await response.json();

    expect(body.status).toBe('ok');
    expect(body.uptime).toBeUndefined();
    expect(body.outbox).toBeUndefined();
  });

  it('exposes authenticated details only after the session is validated', async () => {
    mocks.requireAuth.mockResolvedValue('user-1');

    const response = await GET();
    const body = await response.json();

    expect(body.uptime).toEqual(expect.any(Number));
    expect(body.outbox).toBeDefined();
  });
});
