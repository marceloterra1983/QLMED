'use client';

import { useEffect } from 'react';
import Button from '@/components/ui/Button';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[App Error]', error); // console.error intentional — client-side error boundary, pino not available
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
          <Button onClick={reset} icon="refresh" size="lg">
            Tentar novamente
          </Button>
          <Button href="/fiscal/invoices" external variant="ghost" icon="home" size="lg">
            Início
          </Button>
        </div>
      </div>
    </div>
  );
}
