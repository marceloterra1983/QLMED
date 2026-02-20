import { Suspense } from 'react';
import SupplierDetailsClient from './supplier-details-client';

export const dynamic = 'force-dynamic';

export default function SupplierDetailsPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-card-dark p-6 text-center text-sm text-slate-500 dark:text-slate-400">
            Carregando detalhes do fornecedor...
          </div>
        </div>
      }
    >
      <SupplierDetailsClient />
    </Suspense>
  );
}
