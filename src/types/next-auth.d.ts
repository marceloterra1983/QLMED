import { DefaultSession, DefaultUser } from 'next-auth';
import { DefaultJWT } from 'next-auth/jwt';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      role: 'admin' | 'editor' | 'viewer';
      status: 'pending' | 'active' | 'inactive' | 'rejected';
      allowedPages: string[];
    } & DefaultSession['user'];
  }

  interface User extends DefaultUser {
    role: 'admin' | 'editor' | 'viewer';
    status: 'pending' | 'active' | 'inactive' | 'rejected';
    allowedPages: string[];
  }
}

declare module 'next-auth/jwt' {
  interface JWT extends DefaultJWT {
    id: string;
    role: 'admin' | 'editor' | 'viewer';
    status: 'pending' | 'active' | 'inactive' | 'rejected';
    allowedPages: string[];
    dbRefreshedAt?: number;
  }
}
