import { AuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { compare } from 'bcryptjs';
import prisma from '@/lib/prisma';

export const authOptions: AuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Senha', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error('Email e senha são obrigatórios');
        }

        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
        });

        if (!user || !(await compare(credentials.password, user.passwordHash))) {
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
