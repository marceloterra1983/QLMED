import { beforeEach, describe, expect, it, vi } from 'vitest';
import { hash } from 'bcryptjs';
import { decode, encode } from 'next-auth/jwt';
import type { JWT } from 'next-auth/jwt';

const mocks = vi.hoisted(() => ({
  userFindUnique: vi.fn(),
  userUpdate: vi.fn(),
  accessLogCreate: vi.fn(),
  logWarn: vi.fn(),
  logError: vi.fn(),
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
    error: mocks.logError,
    warn: mocks.logWarn,
  }),
}));
// SPEC-014: os testes de força bruta abaixo fazem várias tentativas com o
// MESMO e-mail — o rate limit real de login-account (10/15min) colidiria com
// os próprios limiares que o teste tenta provar. É comportamento de
// @/lib/rate-limit, já coberto em rate-limit.test.ts; aqui é ruído.
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

describe('email+password login (SPEC-014)', () => {
  it('identifies the user by email, then checks the password', async () => {
    const passwordHash = await hash('senha-joinner', 4);
    mocks.userFindUnique.mockResolvedValue({
      id: 'user-ana',
      email: 'ana@qlmed.com.br',
      passwordHash,
      name: 'Ana',
      role: 'editor',
      status: 'active',
      allowedPages: ['/fiscal/invoices'],
      failedAttempts: 0,
      lockedUntil: null,
    });

    const user = await authorize({ email: 'ana@qlmed.com.br', password: 'senha-joinner' });

    expect(mocks.userFindUnique).toHaveBeenCalledWith({ where: { email: 'ana@qlmed.com.br' } });
    expect(user).toMatchObject({
      id: 'user-ana',
      email: 'ana@qlmed.com.br',
      name: 'Ana',
      role: 'editor',
      status: 'active',
    });
  });

  it('rejects a missing password', async () => {
    await expect(authorize({ email: 'ana@qlmed.com.br' })).rejects.toThrow('Senha é obrigatória');
    await expect(authorize(undefined)).rejects.toThrow('Senha é obrigatória');
    expect(mocks.userFindUnique).not.toHaveBeenCalled();
  });

  it('rejects a missing email with the same message as a wrong password (D2)', async () => {
    await expect(authorize({ password: 'qualquer' })).rejects.toThrow('Email ou senha inválidos');
    expect(mocks.userFindUnique).not.toHaveBeenCalled();
  });

  it('rejects an unknown email with the identical message of a wrong password (D2, no enumeration)', async () => {
    mocks.userFindUnique.mockResolvedValue(null);

    await expect(
      authorize({ email: 'nao-existe@qlmed.com.br', password: 'qualquer' }),
    ).rejects.toThrow('Email ou senha inválidos');
  });

  it('rejects a wrong password with the identical message of an unknown email (D2)', async () => {
    mocks.userFindUnique.mockResolvedValue({
      id: 'user-ana',
      email: 'ana@qlmed.com.br',
      passwordHash: await hash('outra-senha', 4),
      name: 'Ana',
      role: 'editor',
      status: 'active',
      allowedPages: [],
      failedAttempts: 0,
      lockedUntil: null,
    });

    await expect(
      authorize({ email: 'ana@qlmed.com.br', password: 'senha-errada' }),
    ).rejects.toThrow('Email ou senha inválidos');
  });

  it('accepts a PIN-mapped password only when the submitted email matches its owner', async () => {
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

    const user = await authorize({ email: 'pin@qlmed.com.br', password: '246810' });

    expect(mocks.userFindUnique).toHaveBeenCalledWith({ where: { email: 'pin@qlmed.com.br' } });
    expect(user).toMatchObject({ id: 'user-pin', email: 'pin@qlmed.com.br' });
  });

  it('rejects a PIN submitted with a different email than its owner', async () => {
    vi.stubEnv('PIN_MAP_JSON', JSON.stringify({ '246810': 'pin@qlmed.com.br' }));
    mocks.userFindUnique.mockResolvedValue({
      id: 'user-outro',
      email: 'outro@qlmed.com.br',
      passwordHash: await hash('outra-senha', 4),
      name: 'Outro',
      role: 'viewer',
      status: 'active',
      allowedPages: [],
      failedAttempts: 0,
      lockedUntil: null,
    });

    await expect(
      authorize({ email: 'outro@qlmed.com.br', password: '246810' }),
    ).rejects.toThrow('Email ou senha inválidos');
  });
});

/**
 * Modela um único usuário como um objeto mutável que os mocks de
 * findUnique/update leem e escrevem, para que chamadas sucessivas de
 * `authorize()` no mesmo teste vejam o estado deixado pela chamada anterior
 * — é exatamente esse encadeamento (falha → soma 1 → talvez trava) que os
 * testes abaixo precisam observar.
 */
function makeUserStore(overrides: Partial<Record<string, unknown>> = {}) {
  const user = {
    id: 'user-alvo',
    email: 'alvo@qlmed.com.br',
    passwordHash: '',
    name: 'Alvo',
    role: 'viewer',
    status: 'active',
    allowedPages: [],
    failedAttempts: 0,
    lockedUntil: null as Date | null,
    ...overrides,
  };

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

describe('brute-force lockout (SPEC-014)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-26T12:00:00Z'));
  });

  it('T009 increments failedAttempts on each wrong-password attempt', async () => {
    const passwordHash = await hash('senha-certa', 4);
    const user = makeUserStore({ passwordHash });

    await expect(authorize({ email: user.email, password: 'errada' })).rejects.toThrow();
    expect(user.failedAttempts).toBe(1);

    await expect(authorize({ email: user.email, password: 'errada' })).rejects.toThrow();
    expect(user.failedAttempts).toBe(2);
  });

  it('T010 soft-locks for 15min at the 3rd failure and blocks the next attempt', async () => {
    const passwordHash = await hash('senha-certa', 4);
    const user = makeUserStore({ passwordHash });

    for (let i = 0; i < 3; i++) {
      await expect(authorize({ email: user.email, password: 'errada' })).rejects.toThrow();
    }
    expect(user.failedAttempts).toBe(3);
    expect(user.lockedUntil).toEqual(new Date('2026-08-26T12:15:00Z'));

    // mesmo com a senha CERTA, a conta travada nunca chega a comparar bcrypt.
    await expect(authorize({ email: user.email, password: 'senha-certa' })).rejects.toThrow('ACCOUNT_LOCKED');
    expect(user.failedAttempts).toBe(3); // não reinicia o temporizador de quem insiste

    // 15min e 1s depois, o soft-lock já expirou e a senha certa entra.
    vi.setSystemTime(new Date('2026-08-26T12:15:01Z'));
    const result = await authorize({ email: user.email, password: 'senha-certa' });
    expect(result).toMatchObject({ id: user.id });
  });

  it('T011 long-locks for 24h at the 10th failure, independent of the 15min soft window', async () => {
    const passwordHash = await hash('senha-certa', 4);
    const user = makeUserStore({ passwordHash });

    for (let i = 0; i < 9; i++) {
      // avança além de cada soft-lock de 15min para poder tentar de novo
      vi.setSystemTime(new Date(Date.now() + 16 * 60 * 1000));
      await expect(authorize({ email: user.email, password: 'errada' })).rejects.toThrow();
    }
    expect(user.failedAttempts).toBe(9);

    vi.setSystemTime(new Date(Date.now() + 16 * 60 * 1000));
    await expect(authorize({ email: user.email, password: 'errada' })).rejects.toThrow();
    expect(user.failedAttempts).toBe(10);

    const lockedAt = Date.now();
    expect(user.lockedUntil).toEqual(new Date(lockedAt + 24 * 60 * 60 * 1000));

    // 20min depois (venceria um soft-lock, mas este é o long-lock de 24h) continua travado.
    vi.setSystemTime(new Date(lockedAt + 20 * 60 * 1000));
    await expect(authorize({ email: user.email, password: 'senha-certa' })).rejects.toThrow('ACCOUNT_LOCKED');
  });

  it('T012 the long lock expires by itself after 24h (D5c: auto-expiry)', async () => {
    const passwordHash = await hash('senha-certa', 4);
    const user = makeUserStore({
      passwordHash,
      failedAttempts: 10,
      lockedUntil: new Date('2026-08-27T12:00:00Z'), // travado até exatamente 24h à frente
    });

    await expect(authorize({ email: user.email, password: 'senha-certa' })).rejects.toThrow('ACCOUNT_LOCKED');

    vi.setSystemTime(new Date('2026-08-27T12:00:01Z'));
    const result = await authorize({ email: user.email, password: 'senha-certa' });
    expect(result).toMatchObject({ id: user.id });
  });

  it('T013 a successful login zeroes failedAttempts and lockedUntil', async () => {
    const passwordHash = await hash('senha-certa', 4);
    const user = makeUserStore({ passwordHash, failedAttempts: 2, lockedUntil: null });

    await authorize({ email: user.email, password: 'senha-certa' });

    expect(mocks.userUpdate).toHaveBeenCalledWith({
      where: { id: user.id },
      data: { failedAttempts: 0, lockedUntil: null },
    });
  });

  it('T014 an unknown email and a wrong password produce the identical thrown message (D2)', async () => {
    makeUserStore(); // usado só pelo segundo caso
    mocks.userFindUnique.mockImplementationOnce(async () => null);
    let unknownEmailMessage = '';
    try {
      await authorize({ email: 'fantasma@qlmed.com.br', password: 'qualquer' });
    } catch (e) {
      unknownEmailMessage = (e as Error).message;
    }

    let wrongPasswordMessage = '';
    try {
      await authorize({ email: 'alvo@qlmed.com.br', password: 'errada' });
    } catch (e) {
      wrongPasswordMessage = (e as Error).message;
    }

    expect(unknownEmailMessage).toBe(wrongPasswordMessage);
    expect(unknownEmailMessage).toBe('Email ou senha inválidos');
  });

  it('T015 never writes the attempted password/PIN value to any log call', async () => {
    vi.stubEnv('PIN_MAP_JSON', JSON.stringify({ '246810': 'alvo@qlmed.com.br' }));
    const passwordHash = await hash('senha-certa', 4);
    makeUserStore({ passwordHash });

    const secretPassword = 'senha-secreta-nao-pode-vazar';
    await expect(authorize({ email: 'alvo@qlmed.com.br', password: secretPassword })).rejects.toThrow();
    await expect(authorize({ email: 'alvo@qlmed.com.br', password: '999999' })).rejects.toThrow(); // PIN errado

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

  it('T016 a wrong PIN increments the failedAttempts of the PIN owner account', async () => {
    vi.stubEnv('PIN_MAP_JSON', JSON.stringify({ '246810': 'alvo@qlmed.com.br' }));
    const user = makeUserStore({ passwordHash: await hash('senha-certa', 4) });

    await expect(authorize({ email: user.email, password: '999999' })).rejects.toThrow('Email ou senha inválidos');

    expect(user.failedAttempts).toBe(1);
  });
});
