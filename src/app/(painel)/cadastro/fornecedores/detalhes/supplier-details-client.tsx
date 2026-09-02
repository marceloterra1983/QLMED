'use client';

import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import { useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import ContactDetailsModal from '@/components/ContactDetailsModal';

export default function SupplierDetailsClient() {
  const searchParams = useSearchParams();
  const cnpj = searchParams.get('cnpj')?.trim() || '';
  const name = searchParams.get('name')?.trim() || '';

  const supplier = useMemo(() => {
    if (!cnpj && !name) return null;
    return { cnpj, name };
  }, [cnpj, name]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[24px] text-primary dark:text-blue-400">storefront</span>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">Detalhes do Fornecedor</h2>
        </div>

        <Button href="/cadastro/fornecedores" variant="secondary" size="sm" icon="arrow_back">
          Voltar
        </Button>
      </div>

      {!supplier ? (
        <Card padding="lg" className="text-center text-sm text-slate-500 dark:text-slate-400">
          Fornecedor não informado. Abra esta página a partir da lista de fornecedores.
        </Card>
      ) : (
        <ContactDetailsModal kind="supplier" isOpen onClose={() => {}} contact={supplier} inline />
      )}
    </div>
  );
}
