import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  queryRaw: vi.fn(),
  groupBy: vi.fn(),
  findFirst: vi.fn(),
  userCount: vi.fn(),
  companyCount: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ requireAuth: mocks.requireAuth }));
vi.mock('@/lib/prisma', () => ({
  default: {
    $queryRaw: mocks.queryRaw,
    notificationDelivery: {
      groupBy: mocks.groupBy,
      findFirst: mocks.findFirst,
    },
    user: { count: mocks.userCount },
    company: { count: mocks.companyCount },
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

// REAUD-B-14: a OBS-003 tirou a latência do 200 anónimo, mas o ramo 503 de
// integridade (banco ligado e sem dados obrigatórios) devolvia
// `db.latencyMs` FORA do `if (authenticated)`.
describe('503 de integridade também não faz reconhecimento (REAUD-B-14)', () => {
  beforeEach(() => {
    vi.stubEnv('QLMED_REQUIRE_NONEMPTY_DB', 'true');
    mocks.queryRaw.mockResolvedValue([{ '?column?': 1 }]);
    mocks.userCount.mockResolvedValue(0);
    mocks.companyCount.mockResolvedValue(0);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('sem sessão, o 503 não traz latencyMs nem build', async () => {
    mocks.requireAuth.mockRejectedValue(new Error('NOT_AUTHENTICATED'));

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.db.status).toBe('connected');
    expect(body.db.latencyMs).toBeUndefined();
    expect(body.build).toBeUndefined();
    expect(body.integrity).toBeUndefined();
  });

  it('com sessão, o 503 continua a entregar latencyMs e integridade', async () => {
    mocks.requireAuth.mockResolvedValue('user-1');

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.db.latencyMs).toEqual(expect.any(Number));
    expect(body.integrity).toEqual({ users: 0, companies: 0, healthy: false });
  });
});
