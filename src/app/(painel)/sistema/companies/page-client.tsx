'use client';

import { useEffect, useState } from 'react';
import Badge from '@/components/ui/Badge';
import Card from '@/components/ui/Card';
import Spinner from '@/components/ui/Spinner';
import { toast } from 'sonner';
import PageHeader from '@/components/PageHeader';

interface Company {
  id: string;
  cnpj: string;
  razaoSocial: string;
  nomeFantasia: string | null;
  _count?: { invoices: number };
}

function formatCnpj(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 14);
  return digits
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2');
}

export default function CompaniesPage() {
  const [company, setCompany] = useState<Company | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/companies')
      .then((res) => res.json())
      .then((data) => {
        setCompany(data.companies?.[0] || null);
      })
      .catch(() => toast.error('Erro ao carregar empresa'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-8">
      <PageHeader
        icon="business"
        title="Empresa"
        subtitle="Modo de empresa única ativo: o sistema opera exclusivamente com a QL MED."
        showTitleOnMobile
      />

      {loading && (
        <div className="text-center py-12 text-slate-500 dark:text-slate-400">
          <Spinner size="lg" />
          <p className="mt-2 text-sm">Carregando dados da empresa...</p>
        </div>
      )}

      {!loading && company && (
        <Card padding="lg">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">{company.razaoSocial}</h3>
              {company.nomeFantasia && (
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">{company.nomeFantasia}</p>
              )}
              <p className="text-sm text-slate-600 dark:text-slate-300 mt-3 font-mono">
                CNPJ: {formatCnpj(company.cnpj)}
              </p>
            </div>
            <Badge dot={false}>{company._count?.invoices || 0} notas</Badge>
          </div>
        </Card>
      )}
    </div>
  );
}
