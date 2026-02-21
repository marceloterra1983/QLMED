'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import dynamic from 'next/dynamic';
const InvoiceDetailsModal = dynamic(() => import('@/components/InvoiceDetailsModal'), { ssr: false });
import Skeleton from '@/components/ui/Skeleton';
import type { DashboardStats, FinanceiroSummary, Invoice } from '@/types';
import {
  formatCurrency,
  formatCurrencyShort,
  formatDateShort,
  formatTime,
  formatAccessKey,
  formatValue,
  getStatusDisplay,
  getTypeBadge,
  statusDotClasses,
} from '@/lib/utils';

type Period = 'month' | 'quarter' | 'year';

const periodButtons: { value: Period; label: string }[] = [
  { value: 'month', label: 'Mês' },
  { value: 'quarter', label: 'Trimestre' },
  { value: 'year', label: 'Ano' },
];

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [contasPagar, setContasPagar] = useState<FinanceiroSummary | null>(null);
  const [contasReceber, setContasReceber] = useState<FinanceiroSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>('month');
  const [sortBy, setSortBy] = useState<string>('issueDate');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    loadData();
  }, [period]);

  async function loadData() {
    setLoading(true);
    try {
      const [dashRes, pagarRes, receberRes] = await Promise.all([
        fetch(`/api/dashboard?period=${period}`),
        fetch('/api/financeiro/contas-pagar?limit=1'),
        fetch('/api/financeiro/contas-receber?limit=1'),
      ]);

      if (dashRes.ok) {
        setStats(await dashRes.json());
      }
      if (pagarRes.ok) {
        const data = await pagarRes.json();
        setContasPagar(data.summary);
      }
      if (receberRes.ok) {
        const data = await receberRes.json();
        setContasReceber(data.summary);
      }
    } catch {
      toast.error('Erro ao carregar dashboard');
    } finally {
      setLoading(false);
    }
  }

  const sortedInvoices = useMemo(() => {
    if (!stats?.recentInvoices) return [];
    const items = [...stats.recentInvoices];
    items.sort((a, b) => {
      let cmp = 0;
      switch (sortBy) {
        case 'issueDate':
          cmp = new Date(a.issueDate).getTime() - new Date(b.issueDate).getTime();
          break;
        case 'value':
          cmp = a.totalValue - b.totalValue;
          break;
        case 'sender':
          cmp = a.senderName.localeCompare(b.senderName);
          break;
        case 'status':
          cmp = a.status.localeCompare(b.status);
          break;
        default:
          cmp = 0;
      }
      return sortOrder === 'asc' ? cmp : -cmp;
    });
    return items;
  }, [stats?.recentInvoices, sortBy, sortOrder]);

  const handleSort = (field: string) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
  };

  const getSortIcon = (field: string) => {
    if (sortBy !== field)
      return (
        <span className="material-symbols-outlined text-[16px] text-slate-300 opacity-0 group-hover:opacity-50">
          unfold_more
        </span>
      );
    return (
      <span className="material-symbols-outlined text-[16px] text-primary">
        {sortOrder === 'asc' ? 'expand_less' : 'expand_more'}
      </span>
    );
  };

  const getDirectionBadge = (invoice: Invoice) => {
    if (invoice.type === 'CTE') {
      return (
        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300">
          CT-e
        </span>
      );
    }
    if (invoice.direction === 'issued') {
      return (
        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
          NF-e Emitida
        </span>
      );
    }
    return (
      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
        NF-e Recebida
      </span>
    );
  };

  return (
    <>
      {/* Page Title + Period Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-[28px] text-primary">monitoring</span>
          <div>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
              Visão Geral
            </h2>
            <p className="text-slate-500 dark:text-slate-400 text-xs font-medium capitalize">
              {stats?.period.label || ''}
            </p>
          </div>
        </div>
        <div className="flex items-center bg-white dark:bg-card-dark border border-slate-200 dark:border-slate-700 rounded-lg p-1 shadow-sm">
          {periodButtons.map((btn) => (
            <button
              key={btn.value}
              onClick={() => setPeriod(btn.value)}
              className={`px-3 py-1.5 text-xs font-bold rounded transition-colors ${
                period === btn.value
                  ? 'bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-white'
              }`}
            >
              {btn.label}
            </button>
          ))}
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {/* NF-e Recebidas */}
        <div className="bg-white dark:bg-card-dark p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between h-36 relative overflow-hidden group hover:shadow-md transition-shadow">
          <div className="flex justify-between items-start z-10">
            <div>
              <p className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                NF-e Recebidas
              </p>
              <h3 className="text-3xl font-bold text-slate-900 dark:text-white mt-1">
                {loading ? (
                  <Skeleton className="h-8 w-20" />
                ) : (
                  stats?.nfeReceived.count.toLocaleString()
                )}
              </h3>
            </div>
            <span className="flex items-center justify-center w-10 h-10 rounded-xl bg-primary/10 text-primary">
              <span className="material-symbols-outlined text-[24px]">call_received</span>
            </span>
          </div>
          <div className="flex items-center gap-2 mt-auto z-10">
            <span className="text-xs font-medium text-slate-400">
              {loading ? (
                <Skeleton className="h-3 w-16" />
              ) : (
                formatCurrencyShort(stats?.nfeReceived.totalValue || 0)
              )}
            </span>
          </div>
          <div className="absolute -right-6 -bottom-6 opacity-5 group-hover:opacity-10 transition-opacity transform group-hover:scale-110 duration-500">
            <span className="material-symbols-outlined text-[120px] text-primary">
              call_received
            </span>
          </div>
        </div>

        {/* NF-e Emitidas */}
        <div className="bg-white dark:bg-card-dark p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between h-36 relative overflow-hidden group hover:shadow-md transition-shadow">
          <div className="flex justify-between items-start z-10">
            <div>
              <p className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                NF-e Emitidas
              </p>
              <h3 className="text-3xl font-bold text-slate-900 dark:text-white mt-1">
                {loading ? (
                  <Skeleton className="h-8 w-20" />
                ) : (
                  stats?.nfeIssued.count.toLocaleString()
                )}
              </h3>
            </div>
            <span className="flex items-center justify-center w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400">
              <span className="material-symbols-outlined text-[24px]">call_made</span>
            </span>
          </div>
          <div className="flex items-center gap-2 mt-auto z-10">
            <span className="text-xs font-medium text-slate-400">
              {loading ? (
                <Skeleton className="h-3 w-16" />
              ) : (
                formatCurrencyShort(stats?.nfeIssued.totalValue || 0)
              )}
            </span>
          </div>
          <div className="absolute -right-6 -bottom-6 opacity-5 group-hover:opacity-10 transition-opacity transform group-hover:scale-110 duration-500">
            <span className="material-symbols-outlined text-[120px] text-blue-600">call_made</span>
          </div>
        </div>

        {/* CT-e */}
        <div className="bg-white dark:bg-card-dark p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between h-36 relative overflow-hidden group hover:shadow-md transition-shadow">
          <div className="flex justify-between items-start z-10">
            <div>
              <p className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                CT-e
              </p>
              <h3 className="text-3xl font-bold text-slate-900 dark:text-white mt-1">
                {loading ? (
                  <Skeleton className="h-8 w-20" />
                ) : (
                  stats?.cte.count.toLocaleString()
                )}
              </h3>
            </div>
            <span className="flex items-center justify-center w-10 h-10 rounded-xl bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400">
              <span className="material-symbols-outlined text-[24px]">local_shipping</span>
            </span>
          </div>
          <div className="flex items-center gap-2 mt-auto z-10">
            <span className="text-xs font-medium text-slate-400">
              {loading ? (
                <Skeleton className="h-3 w-16" />
              ) : (
                formatCurrencyShort(stats?.cte.totalValue || 0)
              )}
            </span>
          </div>
          <div className="absolute -right-6 -bottom-6 opacity-5 group-hover:opacity-10 transition-opacity transform group-hover:scale-110 duration-500">
            <span className="material-symbols-outlined text-[120px] text-purple-600">
              local_shipping
            </span>
          </div>
        </div>

        {/* Manifestação Pendente */}
        <div className="bg-white dark:bg-card-dark p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between h-36 relative overflow-hidden group hover:shadow-md transition-shadow">
          <div className="flex justify-between items-start z-10">
            <div>
              <p className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                Manifest. Pendente
              </p>
              <h3 className="text-3xl font-bold text-slate-900 dark:text-white mt-1">
                {loading ? <Skeleton className="h-8 w-20" /> : stats?.pendingManifest}
              </h3>
            </div>
            <span className="flex items-center justify-center w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400">
              <span className="material-symbols-outlined text-[24px]">pending_actions</span>
            </span>
          </div>
          <div className="flex items-center gap-2 mt-auto z-10">
            {!loading && stats && stats.pendingManifest > 0 && (
              <span className="flex items-center text-xs font-bold text-amber-700 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30 px-2 py-1 rounded-md border border-amber-200 dark:border-amber-800">
                Ação Necessária
              </span>
            )}
          </div>
          <div className="absolute -right-6 -bottom-6 opacity-5 group-hover:opacity-10 transition-opacity transform group-hover:scale-110 duration-500">
            <span className="material-symbols-outlined text-[120px] text-amber-600">
              pending_actions
            </span>
          </div>
        </div>
      </div>

      {/* Financial Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Contas a Pagar */}
        <Link
          href="/dashboard/financeiro/contas-pagar"
          className="bg-white dark:bg-card-dark p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md transition-shadow group"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="flex items-center justify-center w-9 h-9 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400">
                <span className="material-symbols-outlined text-[20px]">trending_down</span>
              </span>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Contas a Pagar
              </h3>
            </div>
            <span className="material-symbols-outlined text-[20px] text-slate-400 group-hover:text-primary transition-colors">
              chevron_right
            </span>
          </div>
          {loading ? (
            <div className="space-y-3">
              <Skeleton className="h-6 w-32" />
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-4 w-40" />
            </div>
          ) : contasPagar ? (
            <div className="space-y-2">
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold text-slate-900 dark:text-white">
                  {formatCurrency(contasPagar.totalValor)}
                </span>
                <span className="text-xs text-slate-400 font-medium">
                  {contasPagar.total} {contasPagar.total === 1 ? 'título' : 'títulos'}
                </span>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {contasPagar.vencidasValor > 0 && (
                  <span className="text-sm font-semibold text-red-600 dark:text-red-400">
                    {formatCurrency(contasPagar.vencidasValor)} vencidas
                  </span>
                )}
                {contasPagar.aVencerValor > 0 && (
                  <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                    {formatCurrency(contasPagar.aVencerValor)} a vencer
                  </span>
                )}
                {contasPagar.totalValor === 0 && (
                  <span className="text-sm text-slate-400">Nenhum título encontrado</span>
                )}
              </div>
            </div>
          ) : (
            <span className="text-sm text-slate-400">Sem dados</span>
          )}
        </Link>

        {/* Contas a Receber */}
        <Link
          href="/dashboard/financeiro/contas-receber"
          className="bg-white dark:bg-card-dark p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md transition-shadow group"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="flex items-center justify-center w-9 h-9 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400">
                <span className="material-symbols-outlined text-[20px]">trending_up</span>
              </span>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Contas a Receber
              </h3>
            </div>
            <span className="material-symbols-outlined text-[20px] text-slate-400 group-hover:text-primary transition-colors">
              chevron_right
            </span>
          </div>
          {loading ? (
            <div className="space-y-3">
              <Skeleton className="h-6 w-32" />
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-4 w-40" />
            </div>
          ) : contasReceber ? (
            <div className="space-y-2">
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold text-slate-900 dark:text-white">
                  {formatCurrency(contasReceber.totalValor)}
                </span>
                <span className="text-xs text-slate-400 font-medium">
                  {contasReceber.total} {contasReceber.total === 1 ? 'título' : 'títulos'}
                </span>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {contasReceber.vencidasValor > 0 && (
                  <span className="text-sm font-semibold text-red-600 dark:text-red-400">
                    {formatCurrency(contasReceber.vencidasValor)} vencidas
                  </span>
                )}
                {contasReceber.aVencerValor > 0 && (
                  <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                    {formatCurrency(contasReceber.aVencerValor)} a receber
                  </span>
                )}
                {contasReceber.totalValor === 0 && (
                  <span className="text-sm text-slate-400">Nenhum título encontrado</span>
                )}
              </div>
            </div>
          ) : (
            <span className="text-sm text-slate-400">Sem dados</span>
          )}
        </Link>
      </div>

      {/* Recent Documents Table */}
      <div className="bg-white dark:bg-card-dark border border-slate-200 dark:border-slate-800 rounded-xl shadow-lg shadow-slate-200/50 dark:shadow-none flex flex-col overflow-hidden">
        {/* Table Header */}
        <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-50/30 dark:bg-slate-800/20">
          <div className="flex items-center gap-3">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">
              Documentos Recentes
            </h3>
            <span className="px-2.5 py-1 rounded-full bg-slate-200 dark:bg-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300">
              {sortedInvoices.length}
            </span>
          </div>
          <Link
            href="/dashboard/invoices"
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-primary to-primary-dark hover:from-primary-dark hover:to-primary text-white rounded-lg text-sm font-bold transition-all shadow-md shadow-primary/30 hover:shadow-lg hover:shadow-primary/40 group"
          >
            <span className="material-symbols-outlined text-[20px]">list_alt</span>
            Ver Todas
          </Link>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800 text-xs uppercase text-slate-500 dark:text-slate-400 font-bold tracking-wider">
                <th
                  className="px-6 py-4 cursor-pointer group hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  onClick={() => handleSort('status')}
                >
                  <div className="flex items-center gap-1">
                    Status {getSortIcon('status')}
                  </div>
                </th>
                <th
                  className="px-6 py-4 cursor-pointer group hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  onClick={() => handleSort('sender')}
                >
                  <div className="flex items-center gap-1">
                    Chave / Emitente {getSortIcon('sender')}
                  </div>
                </th>
                <th
                  className="px-6 py-4 cursor-pointer group hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  onClick={() => handleSort('issueDate')}
                >
                  <div className="flex items-center gap-1">
                    Data {getSortIcon('issueDate')}
                  </div>
                </th>
                <th
                  className="px-6 py-4 text-right cursor-pointer group hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  onClick={() => handleSort('value')}
                >
                  <div className="flex items-center justify-end gap-1">
                    Valor (R$) {getSortIcon('value')}
                  </div>
                </th>
                <th className="px-6 py-4 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    <td className="px-6 py-4">
                      <Skeleton className="h-4 w-20" />
                    </td>
                    <td className="px-6 py-4">
                      <div className="space-y-2">
                        <Skeleton className="h-4 w-40" />
                        <Skeleton className="h-3 w-56" />
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <Skeleton className="h-4 w-24" />
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Skeleton className="h-4 w-20 ml-auto" />
                    </td>
                    <td className="px-6 py-4">
                      <Skeleton className="h-4 w-16 mx-auto" />
                    </td>
                  </tr>
                ))
              ) : sortedInvoices.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-400">
                    <span className="material-symbols-outlined text-[48px] opacity-30">
                      description
                    </span>
                    <p className="mt-2 text-sm font-medium">
                      Nenhum documento encontrado no período
                    </p>
                    <p className="text-xs mt-1">Faça upload de XMLs para começar</p>
                    <Link
                      href="/dashboard/upload"
                      className="inline-flex items-center gap-2 mt-4 px-4 py-2 bg-primary text-white rounded-lg text-sm font-bold shadow-md shadow-primary/30"
                    >
                      <span className="material-symbols-outlined text-[18px]">cloud_upload</span>
                      Importar XML
                    </Link>
                  </td>
                </tr>
              ) : (
                sortedInvoices.map((invoice) => {
                  const status = getStatusDisplay(invoice.status);
                  const dotClasses = statusDotClasses[status.color];
                  return (
                    <tr
                      key={invoice.id}
                      className="group hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2.5">
                          {invoice.status === 'confirmed' ? (
                            <span className="relative flex h-2.5 w-2.5">
                              <span
                                className={`animate-ping absolute inline-flex h-full w-full rounded-full ${dotClasses.ping} opacity-75`}
                              ></span>
                              <span
                                className={`relative inline-flex rounded-full h-2.5 w-2.5 ${dotClasses.dot}`}
                              ></span>
                            </span>
                          ) : (
                            <span className={`w-2.5 h-2.5 rounded-full ${dotClasses.dot}`}></span>
                          )}
                          <span className="text-sm font-bold text-slate-700 dark:text-slate-200">
                            {status.label}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-slate-900 dark:text-white">
                              {invoice.senderName}
                            </span>
                            {getDirectionBadge(invoice)}
                          </div>
                          <div className="flex items-center gap-1 mt-1">
                            <span className="text-xs text-slate-500 dark:text-slate-400 font-mono tracking-tight">
                              {formatAccessKey(invoice.accessKey)}
                            </span>
                            <button
                              aria-label="Copiar chave de acesso"
                              className="text-slate-400 hover:text-primary transition-colors"
                              title="Copiar Chave"
                              onClick={() => {
                                navigator.clipboard.writeText(invoice.accessKey);
                                toast.success('Chave copiada!');
                              }}
                            >
                              <span className="material-symbols-outlined text-[14px]">
                                content_copy
                              </span>
                            </button>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                          {formatDateShort(invoice.issueDate)}
                        </span>
                        <div className="text-xs text-slate-400 font-medium">
                          {formatTime(invoice.issueDate)}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span
                          className={`text-sm font-bold font-mono ${
                            invoice.status === 'rejected'
                              ? 'text-slate-500 line-through'
                              : 'text-slate-900 dark:text-white'
                          }`}
                        >
                          {formatValue(invoice.totalValue)}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-center gap-1">
                          {invoice.status === 'received' && (
                            <button
                              onClick={() => toast.info('Manifestação ainda não implementada.')}
                              className="px-3 py-1 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-700/50 rounded-lg text-xs font-bold hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors uppercase tracking-wide"
                            >
                              Manifestar
                            </button>
                          )}
                          <button
                            onClick={() => {
                              setSelectedInvoiceId(invoice.id);
                              setIsModalOpen(true);
                            }}
                            aria-label="Ver detalhes"
                            className="p-2 rounded-lg text-slate-500 hover:text-primary hover:bg-primary/10 transition-colors"
                            title="Ver Detalhes"
                          >
                            <span className="material-symbols-outlined text-[20px]">
                              visibility
                            </span>
                          </button>
                          <a
                            href={`/api/invoices/${invoice.id}/download`}
                            aria-label="Baixar XML"
                            className="p-2 rounded-lg text-slate-500 hover:text-primary hover:bg-primary/10 transition-colors"
                            title="Download XML"
                          >
                            <span className="material-symbols-outlined text-[20px]">download</span>
                          </a>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer with "Ver Todas" */}
        {sortedInvoices.length > 0 && (
          <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/30 dark:bg-slate-800/20 text-center">
            <Link
              href="/dashboard/invoices"
              className="text-sm font-bold text-primary hover:text-primary-dark transition-colors"
            >
              Ver todos os documentos
            </Link>
          </div>
        )}
      </div>

      <InvoiceDetailsModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        invoiceId={selectedInvoiceId}
      />
    </>
  );
}
