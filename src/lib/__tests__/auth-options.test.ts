import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { hash } from 'bcryptjs';
import { decode, encode } from 'next-auth/jwt';
import type { JWT } from 'next-auth/jwt';

const mocks = vi.hoisted(() => ({
  userFindUnique: vi.fn(),
  userFindMany: vi.fn(),
  userUpdate: vi.fn(),
  accessLogCreate: vi.fn(),
  logWarn: vi.fn(),
  logError: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  default: {
    user: {
      findUnique: mocks.userFindUnique,
      findMany: mocks.userFindMany,
      update: mocks.userUpdate,
    },
    accessLog: {
      create: mocks.accessLogCreate,
    },
  },
}));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({
    error: mocks.logError,
    warn: mocks.logWarn,
  }),
}));
// Rate limit real colidiria com os próprios limiares; coberto em rate-limit.test.ts.
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: () => ({ allowed: true, remaining: 99, resetAt: Date.now() + 60_000 }),
  RATE_LIMITS: { loginAccount: { interval: 900_000, maxRequests: 10 } },
}));

import { authOptions, authorizeCredentials } from '@/lib/auth-options';

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  mocks.userUpdate.mockResolvedValue({ failedAttempts: 0 });
  mocks.accessLogCreate.mockResolvedValue({});
});

describe('NextAuth regressions', () => {

  it('round-trips the JWT payload through NextAuth encryption', async () => {
    const secret = 'nextauth-regression-test-secret';
    const salt = 'next-auth.session-token';
    const token: JWT = {
      id: 'user-1',
      role: 'editor',
      status: 'active',
      allowedPages: ['/fiscal/invoices'],
      tokenVersion: 4,
    };

    const encrypted = await encode({ token, secret, salt, maxAge: 60 });
    const decoded = await decode({ token: encrypted, secret, salt });

    expect(encrypted).toEqual(expect.any(String));
    expect(decoded).toMatchObject(token);
    expect(decoded?.jti).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('refreshes authorization claims and exposes them in the session', async () => {
    mocks.userFindUnique.mockResolvedValue({
      role: 'admin',
      status: 'active',
      allowedPages: ['/sistema/usuarios'],
      tokenVersion: 7,
    });

    const jwtCallback = authOptions.callbacks?.jwt;
    const sessionCallback = authOptions.callbacks?.session;
    expect(jwtCallback).toBeTypeOf('function');
    expect(sessionCallback).toBeTypeOf('function');

    const token = await jwtCallback!({
      token: { sub: 'user-1' },
      user: {
        id: 'user-1',
        role: 'editor',
        status: 'active',
        allowedPages: ['/fiscal/invoices'],
      },
      account: null,
      profile: undefined,
      trigger: 'signIn',
      isNewUser: false,
      session: undefined,
    } as never);

    expect(mocks.userFindUnique).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      select: { role: true, status: true, allowedPages: true, tokenVersion: true },
    });
    expect(token).toMatchObject({
      id: 'user-1',
      role: 'admin',
      status: 'active',
      allowedPages: ['/sistema/usuarios'],
      tokenVersion: 7,
    });

    const session = await sessionCallback!({
      session: {
        user: { name: 'QLMED Admin', email: 'admin@qlmed.com.br', image: null },
        expires: new Date(Date.now() + 60_000).toISOString(),
      },
      token,
      user: {
        id: 'user-1',
        role: 'admin',
        status: 'active',
        allowedPages: ['/sistema/usuarios'],
      },
      newSession: undefined,
      trigger: 'update',
    } as never);

    expect(session.user).toMatchObject({
      id: 'user-1',
      role: 'admin',
      status: 'active',
      allowedPages: ['/sistema/usuarios'],
      tokenVersion: 7,
    });
  });

  // AUTH-012: este teste travava o comportamento inverso — "não revalida um
  // token recente". Era exactamente a janela de 5 min que atrasava o
  // logout-everywhere nas páginas do painel: o middleware do Edge não fala com
  // o banco, só confere que a claim é numérica.
  it('revalidates tokenVersion against the DB on EVERY pass, even for a fresh token', async () => {
    const jwtCallback = authOptions.callbacks?.jwt;
    const token: JWT = {
      id: 'user-1',
      role: 'viewer',
      status: 'active',
      allowedPages: ['/fiscal/cte'],
      tokenVersion: 2,
      dbRefreshedAt: Date.now(),
    };
    mocks.userFindUnique.mockResolvedValue({
      role: 'viewer',
      status: 'active',
      allowedPages: ['/fiscal/cte'],
      tokenVersion: 2,
    });

    const result = await jwtCallback!({
      token,
      user: undefined,
      account: null,
      profile: undefined,
      trigger: undefined,
      isNewUser: false,
      session: undefined,
    } as never);

    expect(mocks.userFindUnique).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ id: 'user-1', role: 'viewer', tokenVersion: 2 });
  });

  it('expels a fresh token the instant tokenVersion is bumped in the DB', async () => {
    const jwtCallback = authOptions.callbacks?.jwt;
    const token: JWT = {
      id: 'user-1',
      role: 'viewer',
      status: 'active',
      allowedPages: ['/fiscal/cte'],
      tokenVersion: 2,
      dbRefreshedAt: Date.now(), // "acabou de ser revalidado" — não compra tempo
    };
    mocks.userFindUnique.mockResolvedValue({
      role: 'viewer',
      status: 'active',
      allowedPages: ['/fiscal/cte'],
      tokenVersion: 3, // revokeUserSessions correu agora
    });

    const result = await jwtCallback!({
      token,
      user: undefined,
      account: null,
      profile: undefined,
      trigger: undefined,
      isNewUser: false,
      session: undefined,
    } as never);

    expect(result).toEqual({});
  });

  it('refuses session when tokenVersion diverges from DB (no rebind)', async () => {
    mocks.userFindUnique.mockResolvedValue({
      role: 'admin',
      status: 'active',
      allowedPages: ['/sistema/usuarios'],
      tokenVersion: 9,
    });

    const jwtCallback = authOptions.callbacks?.jwt;
    const result = await jwtCallback!({
      token: {
        id: 'user-1',
        role: 'viewer',
        status: 'active',
        allowedPages: ['/fiscal/cte'],
        tokenVersion: 2,
        dbRefreshedAt: Date.now() - 10 * 60 * 1000,
      },
      user: undefined,
      account: null,
      profile: undefined,
      trigger: undefined,
      isNewUser: false,
      session: undefined,
    } as never);

    expect(mocks.userFindUnique).toHaveBeenCalled();
    expect(result).toEqual({});
    expect(result).not.toMatchObject({ tokenVersion: 9 });
  });
});

function authorize(credentials: Record<string, string> | undefined) {
  return authorizeCredentials(credentials);
}

function sampleUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user-ana',
    email: 'ana@qlmed.com.br',
    passwordHash: '',
    name: 'Ana',
    role: 'editor',
    status: 'active',
    allowedPages: ['/fiscal/invoices'],
    failedAttempts: 0,
    lockedUntil: null as Date | null,
    ...overrides,
  };
}

describe('password-only login (ADR-0012 / SPEC-019)', () => {
  it('identifies the user from the access password without email', async () => {
    const passwordHash = await hash('senha-joinner', 4);
    mocks.userFindMany.mockResolvedValue([sampleUser({ passwordHash })]);

    const user = await authorize({ password: 'senha-joinner' });

    expect(mocks.userFindMany).toHaveBeenCalled();
    expect(mocks.userFindUnique).not.toHaveBeenCalled();
    expect(user).toMatchObject({
      id: 'user-ana',
      email: 'ana@qlmed.com.br',
      name: 'Ana',
      role: 'editor',
      status: 'active',
    });
  });

  it('ignores a submitted email and still resolves by password', async () => {
    const passwordHash = await hash('senha-joinner', 4);
    mocks.userFindMany.mockResolvedValue([sampleUser({ passwordHash, allowedPages: [] })]);

    const user = await authorize({
      email: 'errado@qlmed.com.br',
      password: 'senha-joinner',
    });

    expect(mocks.userFindUnique).not.toHaveBeenCalled();
    expect(user).toMatchObject({ id: 'user-ana', email: 'ana@qlmed.com.br' });
  });

  it('rejects a missing password', async () => {
    await expect(authorize({})).rejects.toThrow('Senha é obrigatória');
    await expect(authorize(undefined)).rejects.toThrow('Senha é obrigatória');
    expect(mocks.userFindMany).not.toHaveBeenCalled();
  });

  it('rejects an unknown password', async () => {
    mocks.userFindMany.mockResolvedValue([
      sampleUser({ passwordHash: await hash('outra-senha', 4), allowedPages: [] }),
    ]);

    await expect(authorize({ password: 'senha-errada' })).rejects.toThrow('Senha inválida');
  });

  it('rejects when the same password matches more than one user', async () => {
    const passwordHash = await hash('senha-compartilhada', 4);
    mocks.userFindMany.mockResolvedValue([
      sampleUser({ id: 'user-a', email: 'a@qlmed.com.br', passwordHash, name: 'A', role: 'viewer', allowedPages: [] }),
      sampleUser({ id: 'user-b', email: 'b@qlmed.com.br', passwordHash, name: 'B', role: 'viewer', allowedPages: [] }),
    ]);

    await expect(authorize({ password: 'senha-compartilhada' })).rejects.toThrow('Senha inválida');
  });

  it('accepts a PIN-mapped password without email', async () => {
    vi.stubEnv('PIN_MAP_JSON', JSON.stringify({ '246810': 'pin@qlmed.com.br' }));
    mocks.userFindUnique.mockResolvedValue(
      sampleUser({
        id: 'user-pin',
        email: 'pin@qlmed.com.br',
        passwordHash: 'unused',
        name: 'Pin User',
        role: 'viewer',
        allowedPages: [],
      }),
    );

    const user = await authorize({ password: '246810' });

    expect(mocks.userFindUnique).toHaveBeenCalledWith({
      where: { email: 'pin@qlmed.com.br' },
    });
    expect(mocks.userFindMany).not.toHaveBeenCalled();
    expect(user).toMatchObject({ id: 'user-pin', email: 'pin@qlmed.com.br' });
  });

  it('does not advertise email as a NextAuth credential (ADR-0012)', () => {
    const provider = authOptions.providers[0] as {
      options?: { credentials?: Record<string, unknown> };
    };
    const credentials = provider.options?.credentials ?? {};
    expect(credentials).not.toHaveProperty('email');
    expect(credentials).toHaveProperty('password');
  });
});

function makeUserStore(overrides: Partial<Record<string, unknown>> = {}) {
  const user = sampleUser({
    id: 'user-alvo',
    email: 'alvo@qlmed.com.br',
    name: 'Alvo',
    role: 'viewer',
    allowedPages: [],
    ...overrides,
  });

  mocks.userFindMany.mockImplementation(async () => [{ ...user }]);
  mocks.userFindUnique.mockImplementation(async () => ({ ...user }));
  mocks.userUpdate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
    if (data.failedAttempts && typeof data.failedAttempts === 'object' && 'increment' in data.failedAttempts) {
      user.failedAttempts += (data.failedAttempts as { increment: number }).increment;
    } else if (typeof data.failedAttempts === 'number') {
      user.failedAttempts = data.failedAttempts;
    }
    if ('lockedUntil' in data) {
      user.lockedUntil = data.lockedUntil as Date | null;
    }
    return { failedAttempts: user.failedAttempts };
  });

  return user;
}

describe('lock after identity (ADR-0012)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-26T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not increment failedAttempts on a wrong password (by design — do not restore email)', async () => {
    const passwordHash = await hash('senha-certa', 4);
    const user = makeUserStore({ passwordHash });

    await expect(authorize({ password: 'errada' })).rejects.toThrow('Senha inválida');
    expect(user.failedAttempts).toBe(0);
    expect(mocks.userUpdate).not.toHaveBeenCalled();
  });

  it('refuses a correct password while lockedUntil is in the future', async () => {
    const passwordHash = await hash('senha-certa', 4);
    const user = makeUserStore({
      passwordHash,
      lockedUntil: new Date('2026-08-26T12:15:00Z'),
    });

    await expect(authorize({ password: 'senha-certa' })).rejects.toThrow('ACCOUNT_LOCKED');
    expect(user.failedAttempts).toBe(0);
  });

  it('accepts the correct password after lockedUntil expires', async () => {
    const passwordHash = await hash('senha-certa', 4);
    const user = makeUserStore({
      passwordHash,
      failedAttempts: 10,
      lockedUntil: new Date('2026-08-27T12:00:00Z'),
    });

    await expect(authorize({ password: 'senha-certa' })).rejects.toThrow('ACCOUNT_LOCKED');

    vi.setSystemTime(new Date('2026-08-27T12:00:01Z'));
    const result = await authorize({ password: 'senha-certa' });
    expect(result).toMatchObject({ id: user.id });
  });

  it('a successful login zeroes failedAttempts and lockedUntil', async () => {
    const passwordHash = await hash('senha-certa', 4);
    const user = makeUserStore({ passwordHash, failedAttempts: 2, lockedUntil: null });

    await authorize({ password: 'senha-certa' });

    expect(mocks.userUpdate).toHaveBeenCalledWith({
      where: { id: user.id },
      data: { failedAttempts: 0, lockedUntil: null },
    });
  });

  it('never writes the attempted password/PIN value to any log call', async () => {
    const passwordHash = await hash('senha-certa', 4);
    makeUserStore({ passwordHash });

    const secretPassword = 'senha-secreta-nao-pode-vazar';
    await expect(authorize({ password: secretPassword })).rejects.toThrow();
    await expect(authorize({ password: '999999' })).rejects.toThrow();

    const allLoggedArgs = [
      ...mocks.logWarn.mock.calls,
      ...mocks.logError.mock.calls,
      ...mocks.accessLogCreate.mock.calls,
      ...mocks.userUpdate.mock.calls,
    ].flat();
    const serialized = JSON.stringify(allLoggedArgs);

    expect(serialized).not.toContain(secretPassword);
    expect(serialized).not.toContain('999999');
  });
});
