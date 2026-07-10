import { AuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { compare } from 'bcryptjs';
import prisma from '@/lib/prisma';
import { createLogger } from '@/lib/logger';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';

const log = createLogger('auth');

// Brute-force defense against the 10^6 PIN space.
// Permanent account lock after MAX_FAILED_ATTEMPTS consecutive failures.
// Soft-lock starts only after a few misses to reduce accidental/low-effort DoS
// while still slowing brute force against the PIN/password surface.
const MAX_FAILED_ATTEMPTS = 10;
const SOFT_LOCK_FAILED_ATTEMPTS = 3;
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
      },
      select: { failedAttempts: true },
    });
    if (updated.failedAttempts >= SOFT_LOCK_FAILED_ATTEMPTS) {
      await prisma.user.update({
        where: { id: userId },
        data: { lockedUntil: new Date(Date.now() + LOCKOUT_MS) },
      });
    }
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
        const submittedEmail = credentials.email?.trim().toLowerCase();
        if (!submittedEmail) {
          await recordFailedLogin(null, 'unknown', 'password', 'missing_email');
          throw new Error('Email é obrigatório');
        }

        const accountLimit = checkRateLimit(`login-account:${submittedEmail}`, RATE_LIMITS.loginAccount);
        if (!accountLimit.allowed) {
          log.warn({ email: submittedEmail, resetAt: accountLimit.resetAt }, 'Login account rate limited');
          throw new Error('TOO_MANY_ATTEMPTS');
        }

        // PINs are only accepted when the submitted email matches the PIN owner.
        const pinMap = getPinMap();
        const pinEmail = pinMap[credentials.password]?.trim().toLowerCase();
        const isPinLogin = Boolean(pinEmail);

        const user = await prisma.user.findUnique({
          where: { email: submittedEmail },
        });

        if (!user) {
          await recordFailedLogin(null, submittedEmail, isPinLogin ? 'pin' : 'password', 'user_not_found');
          throw new Error('Senha inválida');
        }

        // Brute-force lockout gate. Permanent lock at MAX_FAILED_ATTEMPTS
        // (admin must reset); intermediate soft-lock via lockedUntil prevents
        // rapid enumeration between failures.
        if (user.failedAttempts >= MAX_FAILED_ATTEMPTS) {
          log.warn({ userId: user.id, email: submittedEmail }, 'Login attempt on locked account');
          throw new Error('ACCOUNT_LOCKED');
        }
        if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
          log.warn({ userId: user.id, email: submittedEmail, until: user.lockedUntil }, 'Login attempt during soft-lock');
          throw new Error('ACCOUNT_LOCKED');
        }

        if (isPinLogin && pinEmail !== submittedEmail) {
          await recordFailedLogin(user.id, submittedEmail, 'pin', 'pin_email_mismatch');
          throw new Error('Email ou senha inválidos');
        }

        // If not a PIN login, verify bcrypt password.
        if (!isPinLogin && !(await compare(credentials.password, user.passwordHash))) {
          await recordFailedLogin(user.id, submittedEmail, 'password', 'bcrypt_mismatch');
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
