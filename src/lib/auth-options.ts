import { AuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { compare } from 'bcryptjs';
import prisma from '@/lib/prisma';
import { createLogger } from '@/lib/logger';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';

const log = createLogger('auth');

/**
 * Proteção contra força bruta (SPEC-014).
 *
 * Dois limiares sobre o MESMO campo `lockedUntil`, escritos em ordem: o
 * segundo substitui o primeiro quando alcançado, então não são bloqueios
 * independentes — são dois patamares do mesmo temporizador. O único ponto que
 * lê `lockedUntil` é o gate em `authorizeCredentials`, então mudar a duração
 * aqui não exige tocar em mais nenhum lugar.
 *
 * D5(c): o bloqueio de MAX_FAILED_ATTEMPTS NÃO é mais permanente — expira
 * sozinho após LONG_LOCKOUT_MS. Além disso, um admin pode zerar os dois
 * campos a qualquer momento em Sistema › Usuários
 * (src/app/api/users/[id]/route.ts, campo `unlockAccount`). As duas saídas
 * coexistem de propósito: a expiração cobre o caso em que a única conta admin
 * é a que travou.
 */
const SOFT_LOCK_FAILED_ATTEMPTS = 3;
const SOFT_LOCKOUT_MS = 15 * 60 * 1000; // 15 min
const MAX_FAILED_ATTEMPTS = 10;
const LONG_LOCKOUT_MS = 24 * 60 * 60 * 1000; // 24h — número a calibrar, não estrutural

/**
 * ADR-0012 / SPEC-019: e-mail não é fator. A recusa é sempre a mesma
 * (“Senha inválida”) para senha errada, colisão ou PIN sem dono — sem
 * oráculo de conta.
 */
const INVALID_CREDENTIALS_MESSAGE = 'Senha inválida';

function getPinMap(): Record<string, string> {
  const raw = process.env.PIN_MAP_JSON;
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    log.error('PIN_MAP_JSON env var is not valid JSON');
    return {};
  }
}

async function recordFailedLogin(userId: string | null, email: string, type: 'pin' | 'password', reason: string) {
  // NUNCA logar a senha/PIN tentado — só o motivo simbólico (FR-006).
  log.warn({ type, email, reason }, 'Failed login attempt');
  if (!userId) return;
  try {
    const updated = await prisma.user.update({
      where: { id: userId },
      data: { failedAttempts: { increment: 1 } },
      select: { failedAttempts: true },
    });

    if (updated.failedAttempts >= MAX_FAILED_ATTEMPTS) {
      await prisma.user.update({
        where: { id: userId },
        data: { lockedUntil: new Date(Date.now() + LONG_LOCKOUT_MS) },
      });
      log.error({ userId, email, failedAttempts: updated.failedAttempts }, 'Account locked (max failed attempts)');
      await prisma.accessLog.create({ data: { userId, action: 'account_locked' } });
    } else if (updated.failedAttempts >= SOFT_LOCK_FAILED_ATTEMPTS) {
      await prisma.user.update({
        where: { id: userId },
        data: { lockedUntil: new Date(Date.now() + SOFT_LOCKOUT_MS) },
      });
    }

    await prisma.accessLog.create({
      data: { userId, action: 'login_failed', path: `reason=${reason}` },
    });
  } catch (err) {
    log.error({ err, userId }, 'recordFailedLogin write failed');
  }
}

async function recordSuccessfulLogin(userId: string) {
  try {
    await prisma.user.update({
      where: { id: userId },
      data: { failedAttempts: 0, lockedUntil: null },
    });
    await prisma.accessLog.create({
      data: { userId, action: 'login' },
    });
  } catch (err) {
    log.error({ err, userId }, 'recordSuccessfulLogin write failed');
  }
}

async function findUserByPassword(password: string) {
  const candidates = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      passwordHash: true,
      name: true,
      role: true,
      status: true,
      allowedPages: true,
      failedAttempts: true,
      lockedUntil: true,
    },
  });
  const matches = [];
  for (const candidate of candidates) {
    if (await compare(password, candidate.passwordHash)) {
      matches.push(candidate);
    }
  }
  if (matches.length !== 1) return null;
  return matches[0];
}

/**
 * ADR-0012 / SPEC-019: a senha é a identidade. `credentials.email` é
 * ignorado de propósito. NÃO restaurar busca por e-mail para “consertar”
 * força bruta — isso já foi revertido pelo dono.
 */
export async function authorizeCredentials(
  credentials: Record<string, string> | undefined,
) {
  if (!credentials?.password) {
    throw new Error('Senha é obrigatória');
  }

  const pinMap = getPinMap();
  const pinEmail = pinMap[credentials.password]?.trim().toLowerCase();
  const user = pinEmail
    ? await prisma.user.findUnique({ where: { email: pinEmail } })
    : await findUserByPassword(credentials.password);

  if (!user) {
    await recordFailedLogin(null, pinEmail || 'unknown', pinEmail ? 'pin' : 'password', 'user_not_found');
    throw new Error(INVALID_CREDENTIALS_MESSAGE);
  }

  const accountLimit = checkRateLimit(`login-account:${user.id}`, RATE_LIMITS.loginAccount);
  if (!accountLimit.allowed) {
    log.warn({ userId: user.id, resetAt: accountLimit.resetAt }, 'Login account rate limited');
    throw new Error('TOO_MANY_ATTEMPTS');
  }

  if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
    log.warn({ userId: user.id, email: user.email, until: user.lockedUntil }, 'Login attempt while locked');
    throw new Error('ACCOUNT_LOCKED');
  }

  if (user.status === 'pending') {
    throw new Error('ACCOUNT_PENDING');
  }
  if (user.status === 'rejected') {
    throw new Error('ACCOUNT_REJECTED');
  }
  if (user.status === 'inactive') {
    throw new Error('ACCOUNT_INACTIVE');
  }

  await recordSuccessfulLogin(user.id);

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    status: user.status,
    allowedPages: user.allowedPages,
  };
}

export const authOptions: AuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        password: { label: 'Senha de acesso', type: 'password' },
      },
      authorize: authorizeCredentials,
    }),
  ],
  session: {
    strategy: 'jwt',
    maxAge: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24,  // refresh token daily
  },
  jwt: {
    maxAge: 60 * 60 * 24 * 7, // 7 days
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.status = user.status;
        token.allowedPages = user.allowedPages ?? [];
        token.dbRefreshedAt = Date.now();
        // tokenVersion bootstrap — picked up from DB on the refresh path below
        // because `user` (the NextAuth internal) doesn't expose tokenVersion.
        // login accessLog now written by recordSuccessfulLogin with
        // failedAttempts reset — no duplicate write here.
      }
      // AUTH-012: revalidar SEMPRE, sem janela de frescura.
      //
      // O middleware corre no Edge e não fala com o banco: tudo o que ele
      // consegue verificar é que `tokenVersion` é um número. Quem compara com o
      // banco é este callback e o `requireAuth` das rotas. Com a janela de 5 min
      // que existia aqui, um logout-everywhere (ou uma mudança de papel/estado)
      // só expulsava a sessão das PÁGINAS do painel até 5 minutos depois — as
      // rotas de API fechavam na hora, as páginas não.
      const hasTokenVersion = typeof token.tokenVersion === 'number';
      if (token.id) {
        try {
          const dbUser = await prisma.user.findUnique({
            where: { id: token.id as string },
            select: { role: true, status: true, allowedPages: true, tokenVersion: true },
          });
          if (dbUser) {
            // US3: never rebind tokenVersion from DB onto an existing JWT.
            // Divergence means logout / sensitive change — force re-login.
            if (hasTokenVersion && token.tokenVersion !== dbUser.tokenVersion) {
              log.warn({ userId: token.id }, 'tokenVersion mismatch; refusing session');
              return {} as typeof token;
            }
            token.role = dbUser.role;
            token.status = dbUser.status;
            token.allowedPages = dbUser.allowedPages;
            // Bootstrap only when the claim is missing (first post-login refresh).
            if (!hasTokenVersion) {
              token.tokenVersion = dbUser.tokenVersion;
            }
            token.dbRefreshedAt = Date.now();
          }
        } catch (err) {
          log.error({ err }, 'Failed to refresh user role from DB');
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id;
        session.user.role = token.role;
        session.user.status = token.status;
        session.user.allowedPages = token.allowedPages ?? [];
        session.user.tokenVersion = typeof token.tokenVersion === 'number' ? token.tokenVersion : 0;
      }
      return session;
    },
  },
  pages: {
    signIn: '/login',
  },
};
