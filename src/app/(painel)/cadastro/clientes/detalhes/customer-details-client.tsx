'use client';

import Button from '@/components/ui/Button';
import { useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import ContactDetailsModal from '@/components/ContactDetailsModal';

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
          <span className="material-symbols-outlined text-[24px] text-primary dark:text-blue-400">group</span>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">Detalhes do Cliente</h2>
        </div>

        <Button href="/cadastro/clientes" variant="secondary" size="sm" icon="arrow_back">
          Voltar
        </Button>
      </div>

      {!customer ? (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-card-dark p-6 text-center text-sm text-slate-500 dark:text-slate-400">
          Cliente não informado. Abra esta página a partir da lista de clientes.
        </div>
      ) : (
        <ContactDetailsModal kind="customer" isOpen onClose={() => {}} contact={customer} inline />
      )}
    </div>
  );
}
