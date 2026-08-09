import { beforeEach, describe, expect, it, vi } from 'vitest';
import { decode, encode } from 'next-auth/jwt';
import type { JWT } from 'next-auth/jwt';

const mocks = vi.hoisted(() => ({
  userFindUnique: vi.fn(),
  userUpdate: vi.fn(),
  accessLogCreate: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  default: {
    user: {
      findUnique: mocks.userFindUnique,
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

import { authOptions } from '@/lib/auth-options';

describe('NextAuth regressions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.userUpdate.mockResolvedValue({});
    mocks.accessLogCreate.mockResolvedValue({});
  });

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
