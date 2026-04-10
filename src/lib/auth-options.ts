import { AuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { compare } from 'bcryptjs';
import prisma from '@/lib/prisma';

function getPinMap(): Record<string, string> {
  const raw = process.env.PIN_MAP_JSON;
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    console.error('[Auth] PIN_MAP_JSON env var is not valid JSON');
    return {};
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
          console.warn('[Auth] Failed login attempt', {
            type: 'pin',
            email: 'none',
            timestamp: new Date().toISOString(),
          });
          throw new Error('Senha inválida');
        }

        const user = await prisma.user.findUnique({
          where: { email },
        });

        if (!user) {
          console.warn('[Auth] Failed login attempt', {
            type: pinEmail ? 'pin' : 'password',
            email,
            timestamp: new Date().toISOString(),
          });
          throw new Error('Senha inválida');
        }

        // If not a PIN login, verify bcrypt password
        if (!pinEmail && !(await compare(credentials.password, user.passwordHash))) {
          console.warn('[Auth] Failed login attempt', {
            type: 'password',
            email,
            timestamp: new Date().toISOString(),
          });
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

        // Log login (fire-and-forget)
        prisma.accessLog.create({
          data: { userId: user.id as string, action: 'login' },
        }).catch((err) => console.error('[AccessLog] login error:', err));
      }
      // Always refresh role/status from DB if stale (>5 min) or missing valid role
      const validRoles = ['admin', 'editor', 'viewer'];
      const staleMs = 5 * 60 * 1000;
      const needsRefresh = !validRoles.includes(token.role as string)
        || !token.dbRefreshedAt
        || (Date.now() - (token.dbRefreshedAt as number)) > staleMs;
      if (needsRefresh && token.id) {
        try {
          const dbUser = await prisma.user.findUnique({
            where: { id: token.id as string },
            select: { role: true, status: true, allowedPages: true },
          });
          if (dbUser) {
            token.role = dbUser.role;
            token.status = dbUser.status;
            token.allowedPages = dbUser.allowedPages;
            token.dbRefreshedAt = Date.now();
          }
        } catch (err) {
          console.error('[Auth] Failed to refresh user role from DB:', (err as Error).message);
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
      }
      return session;
    },
  },
  pages: {
    signIn: '/login',
  },
};
