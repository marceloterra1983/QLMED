'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import CustomerDetailsModal from '@/components/CustomerDetailsModal';

export default function CustomerDetailsClient() {
  const searchParams = useSearchParams();
  const cnpj = searchParams.get('cnpj')?.trim() || '';
  const name = searchParams.get('name')?.trim() || '';

  const customer = useMemo(() => {
    if (!cnpj && !name) return null;
    return { cnpj, name };
  }, [cnpj, name]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[24px] text-primary">group</span>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">Detalhes do Cliente</h2>
        </div>

        <Link
          href="/dashboard/clientes"
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-card-dark text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
        >
          <span className="material-symbols-outlined text-[18px]">arrow_back</span>
          Voltar
        </Link>
      </div>

      {!customer ? (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-card-dark p-6 text-center text-sm text-slate-500 dark:text-slate-400">
          Cliente não informado. Abra esta página a partir da lista de clientes.
        </div>
      ) : (
        <CustomerDetailsModal isOpen onClose={() => {}} customer={customer} inline />
      )}
    </div>
  );
}
