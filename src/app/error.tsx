'use client';

import { useEffect } from 'react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[App Error]', error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-white to-blue-50 dark:from-slate-950 dark:via-slate-900 dark:to-blue-950/20 p-4">
      <div className="text-center max-w-md">
        <div className="mb-6">
          <span className="material-symbols-outlined text-[80px] text-red-300 dark:text-red-800">error</span>
        </div>
        <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white mb-2">Algo deu errado</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-8">
          Ocorreu um erro inesperado. Tente novamente ou volte à página inicial.
        </p>
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={reset}
            className="inline-flex items-center gap-2 px-6 py-3 bg-primary hover:bg-primary-dark text-white rounded-xl font-bold text-sm transition-all shadow-md shadow-primary/30 hover:shadow-lg"
          >
            <span className="material-symbols-outlined text-[18px]">refresh</span>
            Tentar novamente
          </button>
          <a
            href="/dashboard"
            className="inline-flex items-center gap-2 px-6 py-3 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl font-bold text-sm hover:bg-slate-200 dark:hover:bg-slate-700 transition-all"
          >
            <span className="material-symbols-outlined text-[18px]">home</span>
            Início
          </a>
        </div>
      </div>
    </div>
  );
}
