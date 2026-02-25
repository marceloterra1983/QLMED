import { Suspense } from 'react';
import CustomerDetailsClient from './customer-details-client';

export const dynamic = 'force-dynamic';

export default function CustomerDetailsPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-card-dark p-6 text-center text-sm text-slate-500 dark:text-slate-400">
            Carregando detalhes do cliente...
          </div>
        </div>
      }
    >
      <CustomerDetailsClient />
    </Suspense>
  );
}
