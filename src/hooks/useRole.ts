import { useSession } from 'next-auth/react';

export function useRole() {
  const { data: session } = useSession();
  const role = session?.user?.role ?? 'viewer';
  const allowedPages: string[] = session?.user?.allowedPages ?? [];

  const isAdmin = role === 'admin';

  const hasPageAccess = (path: string): boolean => {
    if (isAdmin) return true;
    if (allowedPages.length === 0) return true;
    return allowedPages.includes(path);
  };

  return {
    role,
    isAdmin,
    canWrite: role === 'admin' || role === 'editor',
    canManageUsers: role === 'admin',
    canManageSettings: role === 'admin',
    allowedPages,
    hasPageAccess,
  };
}
