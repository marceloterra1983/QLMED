'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { formatDateTime } from '@/lib/utils';
import type { SyncLog, Company } from '@/types';

export default function ErrorsPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompany, setSelectedCompany] = useState('');
  const [logs, setLogs] = useState<SyncLog[]>([]);
  const [loading, setLoading] = useState(true);

  // Carregar empresas
  useEffect(() => {
    fetch('/api/companies')
      .then(res => res.json())
      .then(data => {
        setCompanies(data.companies || []);
        if (data.companies?.length > 0) {
          setSelectedCompany(data.companies[0].id);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  // Carregar logs quando empresa muda
  useEffect(() => {
    if (!selectedCompany) return;
    setLoading(true);

    fetch(`/api/nsdocs/sync?companyId=${selectedCompany}`)
      .then(res => res.json())
      .then(data => {
        const allLogs: SyncLog[] = data.logs || [];
        setLogs(allLogs.filter(log => log.status === 'error'));
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [selectedCompany]);

  const getSyncMethodBadge = (method: string) => {
    if (method === 'sefaz') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-green-100 text-green-700 border border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800">
          <span className="material-symbols-outlined text-[14px]">verified_user</span>
          SEFAZ Direta
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-700 border border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800">
        <span className="material-symbols-outlined text-[14px]">hub</span>
        NSDocs
      </span>
    );
  };

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
          <span className="material-symbols-outlined text-amber-500 text-[28px]">warning</span>
          Erros de Sincronização
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Monitore e resolva erros de sincronização com a SEFAZ e NSDocs.
        </p>
      </div>

      {/* Company Selector */}
      <div className="bg-white dark:bg-card-dark rounded-xl border border-slate-200 dark:border-slate-800 p-6">
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
              Empresa
            </label>
            <select
              value={selectedCompany}
              onChange={(e) => setSelectedCompany(e.target.value)}
              className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
            >
              {companies.map(c => (
                <option key={c.id} value={c.id}>
                  {c.razaoSocial} — {c.cnpj}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="text-center py-12 text-slate-400">
          <span className="material-symbols-outlined text-[32px] animate-spin">progress_activity</span>
          <p className="mt-2 text-sm">Carregando erros...</p>
        </div>
      )}

      {/* Empty State */}
      {!loading && logs.length === 0 && (
        <div className="bg-white dark:bg-card-dark border border-slate-200 dark:border-slate-800 rounded-xl p-12 text-center shadow-sm">
          <span className="material-symbols-outlined text-emerald-400 dark:text-emerald-500 text-[48px]">check_circle</span>
          <h3 className="text-lg font-bold text-slate-700 dark:text-slate-200 mt-4">Nenhum erro encontrado</h3>
          <p className="text-sm text-slate-400 dark:text-slate-500 mt-2">
            Tudo funcionando!
          </p>
        </div>
      )}

      {/* Error Cards */}
      {!loading && logs.length > 0 && (
        <div className="space-y-4">
          <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">
            {logs.length} {logs.length === 1 ? 'erro encontrado' : 'erros encontrados'}
          </p>

          {logs.map(log => (
            <div
              key={log.id}
              className="bg-white dark:bg-card-dark border border-red-200 dark:border-red-900/50 rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <span className="material-symbols-outlined text-red-500 dark:text-red-400 text-[24px] mt-0.5 shrink-0">
                    error
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-900 dark:text-white break-words">
                      {log.errorMessage || 'Erro desconhecido'}
                    </p>
                    <div className="flex items-center gap-3 mt-3 flex-wrap">
                      {getSyncMethodBadge(log.syncMethod)}
                      <span className="text-xs text-slate-400 dark:text-slate-500 flex items-center gap-1">
                        <span className="material-symbols-outlined text-[14px]">schedule</span>
                        {formatDateTime(log.startedAt)}
                      </span>
                    </div>
                  </div>
                </div>

                <Link
                  href="/dashboard/sync"
                  className="shrink-0 inline-flex items-center gap-1.5 px-4 py-2 bg-primary/10 hover:bg-primary/20 text-primary rounded-lg text-xs font-bold transition-colors"
                >
                  <span className="material-symbols-outlined text-[16px]">refresh</span>
                  Tentar Novamente
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
