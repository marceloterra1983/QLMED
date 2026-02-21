'use client';

import { useEffect } from 'react';

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[Dashboard Error]', error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center py-20">
      <span className="material-symbols-outlined text-[64px] text-red-300 dark:text-red-800 mb-4">error</span>
      <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-1">Erro ao carregar</h2>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
        Não foi possível carregar esta página. Tente novamente.
      </p>
      <div className="flex items-center gap-3">
        <button
          onClick={reset}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary hover:bg-primary-dark text-white rounded-xl font-bold text-sm transition-all shadow-md shadow-primary/30"
        >
          <span className="material-symbols-outlined text-[18px]">refresh</span>
          Tentar novamente
        </button>
        <a
          href="/dashboard"
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl font-bold text-sm hover:bg-slate-200 dark:hover:bg-slate-700 transition-all"
        >
          <span className="material-symbols-outlined text-[18px]">dashboard</span>
          Painel
        </a>
      </div>
    </div>
  );
}
