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

// OBS-003: o health anônimo entregava o SHA do build e a latência do banco —
// reconhecimento de versão e de infra para quem só sabe a URL.
describe('health público não faz reconhecimento (OBS-003)', () => {
  beforeEach(() => {
    process.env.QLMED_BUILD_COMMIT_SHA = 'deadbeefcafe1234567890';
  });

  it('não expõe build nem latência do banco sem sessão', async () => {
    mocks.requireAuth.mockRejectedValue(new Error('NOT_AUTHENTICATED'));

    const response = await GET();
    const body = await response.json();
    const raw = JSON.stringify(body);

    expect(body.build).toBeUndefined();
    expect(body.db.latencyMs).toBeUndefined();
    expect(raw).not.toContain('deadbeefcafe');
    // O que o load balancer precisa continua lá.
    expect(body.status).toBe('ok');
    expect(body.db.status).toBe('connected');
  });

  it('continua entregando build e latência para quem tem sessão', async () => {
    mocks.requireAuth.mockResolvedValue('user-1');

    const response = await GET();
    const body = await response.json();

    expect(body.build.commitSha).toBe('deadbeefcafe1234567890');
    expect(body.db.latencyMs).toEqual(expect.any(Number));
  });
});
