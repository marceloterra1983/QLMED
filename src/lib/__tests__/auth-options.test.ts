import { beforeEach, describe, expect, it, vi } from 'vitest';
import { hash } from 'bcryptjs';
import { decode, encode } from 'next-auth/jwt';
import type { JWT } from 'next-auth/jwt';

const mocks = vi.hoisted(() => ({
  userFindUnique: vi.fn(),
  userFindMany: vi.fn(),
  userUpdate: vi.fn(),
  accessLogCreate: vi.fn(),
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
    error: vi.fn(),
    warn: vi.fn(),
  }),
}));

import { authOptions, authorizeCredentials } from '@/lib/auth-options';

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  mocks.userUpdate.mockResolvedValue({ failedAttempts: 0 });
  mocks.accessLogCreate.mockResolvedValue({});
  mocks.userFindMany.mockResolvedValue([]);
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

  it('does not refresh a recent token with complete claims', async () => {
    const jwtCallback = authOptions.callbacks?.jwt;
    const token: JWT = {
      id: 'user-1',
      role: 'viewer',
      status: 'active',
      allowedPages: ['/fiscal/cte'],
      tokenVersion: 2,
      dbRefreshedAt: Date.now(),
    };

    const result = await jwtCallback!({
      token,
      user: undefined,
      account: null,
      profile: undefined,
      trigger: undefined,
      isNewUser: false,
      session: undefined,
    } as never);

    expect(result).toEqual(token);
    expect(mocks.userFindUnique).not.toHaveBeenCalled();
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

describe('password-only login', () => {
  it('identifies the user from the access password without email', async () => {
    const passwordHash = await hash('senha-joinner', 4);
    mocks.userFindMany.mockResolvedValue([
      {
        id: 'user-ana',
        email: 'ana@qlmed.com.br',
        passwordHash,
        name: 'Ana',
        role: 'editor',
        status: 'active',
        allowedPages: ['/fiscal/invoices'],
        failedAttempts: 0,
        lockedUntil: null,
      },
    ]);

    const user = await authorize({ password: 'senha-joinner' });

    expect(mocks.userFindMany).toHaveBeenCalled();
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
    mocks.userFindMany.mockResolvedValue([
      {
        id: 'user-ana',
        email: 'ana@qlmed.com.br',
        passwordHash,
        name: 'Ana',
        role: 'editor',
        status: 'active',
        allowedPages: [],
        failedAttempts: 0,
        lockedUntil: null,
      },
    ]);

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
      {
        id: 'user-ana',
        email: 'ana@qlmed.com.br',
        passwordHash: await hash('outra-senha', 4),
        name: 'Ana',
        role: 'editor',
        status: 'active',
        allowedPages: [],
        failedAttempts: 0,
        lockedUntil: null,
      },
    ]);

    await expect(authorize({ password: 'senha-errada' })).rejects.toThrow('Senha inválida');
  });

  it('rejects when the same password matches more than one user', async () => {
    const passwordHash = await hash('senha-compartilhada', 4);
    mocks.userFindMany.mockResolvedValue([
      {
        id: 'user-a',
        email: 'a@qlmed.com.br',
        passwordHash,
        name: 'A',
        role: 'viewer',
        status: 'active',
        allowedPages: [],
        failedAttempts: 0,
        lockedUntil: null,
      },
      {
        id: 'user-b',
        email: 'b@qlmed.com.br',
        passwordHash,
        name: 'B',
        role: 'viewer',
        status: 'active',
        allowedPages: [],
        failedAttempts: 0,
        lockedUntil: null,
      },
    ]);

    await expect(authorize({ password: 'senha-compartilhada' })).rejects.toThrow('Senha inválida');
  });

  it('accepts a PIN-mapped password without email', async () => {
    vi.stubEnv('PIN_MAP_JSON', JSON.stringify({ '246810': 'pin@qlmed.com.br' }));
    mocks.userFindUnique.mockResolvedValue({
      id: 'user-pin',
      email: 'pin@qlmed.com.br',
      passwordHash: 'unused',
      name: 'Pin User',
      role: 'viewer',
      status: 'active',
      allowedPages: [],
      failedAttempts: 0,
      lockedUntil: null,
    });

    const user = await authorize({ password: '246810' });

    expect(mocks.userFindUnique).toHaveBeenCalledWith({
      where: { email: 'pin@qlmed.com.br' },
    });
    expect(mocks.userFindMany).not.toHaveBeenCalled();
    expect(user).toMatchObject({ id: 'user-pin', email: 'pin@qlmed.com.br' });
  });
});
