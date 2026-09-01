'use client';

import { useEffect } from 'react';
import Button from '@/components/ui/Button';

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[Dashboard Error]', error); // console.error intentional — client-side error boundary, pino not available
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center py-20">
      <span className="material-symbols-outlined text-[64px] text-red-300 dark:text-red-800 mb-4">error</span>
      <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-1">Erro ao carregar</h2>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
        Não foi possível carregar esta página. Tente novamente.
      </p>
      <div className="flex items-center gap-3">
        <Button onClick={reset} icon="refresh">
          Tentar novamente
        </Button>
        <Button href="/fiscal/invoices" external variant="ghost" icon="dashboard">
          Painel
        </Button>
      </div>
    </div>
  );
}
