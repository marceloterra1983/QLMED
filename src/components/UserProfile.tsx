'use client';

import { signOut } from 'next-auth/react';
import type { Session } from 'next-auth';

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  editor: 'Editor',
  viewer: 'Visualizador',
};

const ROLE_BADGE_COLORS: Record<string, string> = {
  admin: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  editor: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  viewer: 'bg-slate-100 text-slate-600 dark:bg-slate-700/50 dark:text-slate-400',
};

interface UserProfileProps {
  session: Session | null;
  collapsed: boolean;
}

export default function UserProfile({ session, collapsed }: UserProfileProps) {
  const role = session?.user?.role || 'viewer';

  return (
    <div className={`border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/20 ${collapsed ? 'p-2' : 'p-4'}`}>
      {/* User info */}
      <div className={`flex items-center ${collapsed ? 'justify-center mb-2' : 'gap-3 mb-3'}`}>
        <div className="relative flex-shrink-0">
          <div className={`rounded-full border-2 border-primary/30 bg-primary/10 flex items-center justify-center ${collapsed ? 'w-9 h-9' : 'w-10 h-10'}`}>
            <span className="material-symbols-outlined text-primary text-[20px]">person</span>
          </div>
          <span className="absolute bottom-0 right-0 w-3 h-3 bg-accent rounded-full border-2 border-white dark:border-card-dark" />
        </div>
        {!collapsed && (
          <div className="flex flex-col flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-slate-900 dark:text-white truncate">
                {session?.user?.name || 'Usuário'}
              </span>
              <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold leading-none ${ROLE_BADGE_COLORS[role] || ROLE_BADGE_COLORS.viewer}`}>
                {ROLE_LABELS[role] || role}
              </span>
            </div>
            <span className="text-xs text-slate-500 dark:text-slate-400 truncate">
              {session?.user?.email || ''}
            </span>
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className={`flex ${collapsed ? 'flex-col items-center gap-1' : 'gap-2'}`}>
        <button
          onClick={() => signOut({ redirect: false }).then(() => { window.location.href = '/login'; })}
          title="Trocar conta"
          className={`flex items-center gap-2 rounded-lg text-slate-500 hover:text-primary hover:bg-primary/10 transition-colors ${
            collapsed ? 'p-2' : 'flex-1 px-3 py-2'
          }`}
        >
          <span className="material-symbols-outlined text-[18px]">switch_account</span>
          {!collapsed && <span className="text-xs font-medium">Trocar conta</span>}
        </button>
        <button
          onClick={() => signOut({ redirect: false }).then(() => { window.location.href = '/login'; })}
          title="Sair"
          className={`flex items-center gap-2 rounded-lg text-slate-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors ${
            collapsed ? 'p-2' : 'flex-1 px-3 py-2'
          }`}
        >
          <span className="material-symbols-outlined text-[18px]">logout</span>
          {!collapsed && <span className="text-xs font-medium">Sair</span>}
        </button>
      </div>
    </div>
  );
}
