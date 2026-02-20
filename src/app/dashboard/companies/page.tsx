'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';

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
      <div>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <span className="material-symbols-outlined text-primary text-[28px]">business</span>
          Empresa
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Modo de empresa única ativo: o sistema opera exclusivamente com a QL MED.
        </p>
      </div>

      {loading && (
        <div className="text-center py-12 text-slate-400">
          <span className="material-symbols-outlined text-[32px] animate-spin">progress_activity</span>
          <p className="mt-2 text-sm">Carregando dados da empresa...</p>
        </div>
      )}

      {!loading && company && (
        <div className="bg-white dark:bg-card-dark border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm">
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
            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
              {company._count?.invoices || 0} notas
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
