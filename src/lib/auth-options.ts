import { AuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { compare } from 'bcryptjs';
import prisma from '@/lib/prisma';
import { createLogger } from '@/lib/logger';

const log = createLogger('auth');

// Brute-force defense against the 10^6 PIN space.
// Permanent account lock after MAX_FAILED_ATTEMPTS consecutive failures;
// cleared automatically on the next successful login. Chosen over timed-lock
// because PINs don't rotate frequently and a timed lock leaves a predictable
// cooldown attackers can ride; an admin re-enables explicitly via /api/users.
const MAX_FAILED_ATTEMPTS = 10;
const LOCKOUT_MS = 15 * 60 * 1000; // 15 min soft-lock while we reach 10 failures

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
  log.warn({ type, email, reason }, 'Failed login attempt');
  if (!userId) return;
  try {
    const updated = await prisma.user.update({
      where: { id: userId },
      data: {
        failedAttempts: { increment: 1 },
        lockedUntil: { set: new Date(Date.now() + LOCKOUT_MS) },
      },
      select: { failedAttempts: true },
    });
    await prisma.accessLog.create({
      data: { userId, action: 'login_failed', path: `reason=${reason}` },
    });
    if (updated.failedAttempts >= MAX_FAILED_ATTEMPTS) {
      log.error({ userId, email, failedAttempts: updated.failedAttempts }, 'Account locked (max failed attempts)');
      await prisma.accessLog.create({
        data: { userId, action: 'account_locked' },
      });
    }
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

export const authOptions: AuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Senha', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.password) {
          throw new Error('Senha é obrigatória');
        }

        // Try PIN-based login first
        const pinMap = getPinMap();
        const pinEmail = pinMap[credentials.password];
        const email = pinEmail || credentials.email;

        if (!email) {
          await recordFailedLogin(null, 'unknown', 'pin', 'no_email_resolved');
          throw new Error('Senha inválida');
        }

        const user = await prisma.user.findUnique({
          where: { email },
        });

        if (!user) {
          await recordFailedLogin(null, email, pinEmail ? 'pin' : 'password', 'user_not_found');
          throw new Error('Senha inválida');
        }

        // Brute-force lockout gate. Permanent lock at MAX_FAILED_ATTEMPTS
        // (admin must reset); intermediate soft-lock via lockedUntil prevents
        // rapid enumeration between failures.
        if (user.failedAttempts >= MAX_FAILED_ATTEMPTS) {
          log.warn({ userId: user.id, email }, 'Login attempt on locked account');
          throw new Error('ACCOUNT_LOCKED');
        }
        if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
          log.warn({ userId: user.id, email, until: user.lockedUntil }, 'Login attempt during soft-lock');
          throw new Error('ACCOUNT_LOCKED');
        }

        // If not a PIN login, verify bcrypt password
        if (!pinEmail && !(await compare(credentials.password, user.passwordHash))) {
          await recordFailedLogin(user.id, email, 'password', 'bcrypt_mismatch');
          throw new Error('Email ou senha inválidos');
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
      },
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
      // Always refresh role/status/tokenVersion from DB if stale (>5 min) or
      // missing valid role / tokenVersion.
      const validRoles = ['admin', 'editor', 'viewer'];
      const staleMs = 5 * 60 * 1000;
      const hasTokenVersion = typeof token.tokenVersion === 'number';
      const needsRefresh = !validRoles.includes(token.role as string)
        || !token.dbRefreshedAt
        || (Date.now() - (token.dbRefreshedAt as number)) > staleMs
        || !hasTokenVersion;
      if (needsRefresh && token.id) {
        try {
          const dbUser = await prisma.user.findUnique({
            where: { id: token.id as string },
            select: { role: true, status: true, allowedPages: true, tokenVersion: true },
          });
          if (dbUser) {
            token.role = dbUser.role;
            token.status = dbUser.status;
            token.allowedPages = dbUser.allowedPages;
            token.tokenVersion = dbUser.tokenVersion;
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
