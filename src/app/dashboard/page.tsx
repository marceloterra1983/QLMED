'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import InvoiceDetailsModal from '@/components/InvoiceDetailsModal';
import Skeleton from '@/components/ui/Skeleton';
import type { DashboardStats, Invoice } from '@/types';
import {
  formatCurrencyShort,
  formatDateShort,
  formatTime,
  formatAccessKey,
  formatValue,
  getStatusDisplay,
  getTypeBadge,
  statusDotClasses,
} from '@/lib/utils';

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats>({
    docsReceived: 0,
    totalValue: 0,
    pendingManifest: 0,
    errors: 0,
  });
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState('emission');
  const [sortOrder, setSortOrder] = useState('desc');
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const [currentDate, setCurrentDate] = useState<Date | null>(null);

  useEffect(() => {
    setCurrentDate(new Date());
  }, []);

  const openModal = (id: string) => {
    setSelectedInvoiceId(id);
    setIsModalOpen(true);
  };

  useEffect(() => {
    loadData();
  }, [sortBy, sortOrder]);

  async function loadData() {
    try {
      const params = new URLSearchParams({
        limit: '10',
        sort: sortBy,
        order: sortOrder,
      });

      const [statsRes, invoicesRes] = await Promise.all([
        fetch('/api/dashboard'),
        fetch(`/api/invoices?${params}`),
      ]);

      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setStats(statsData);
      }

      if (invoicesRes.ok) {
        const invoicesData = await invoicesRes.json();
        setInvoices(invoicesData.invoices || []);
      }
    } catch (err) {
      toast.error('Erro ao carregar dashboard');
    } finally {
      setLoading(false);
    }
  }

  const handleSort = (field: string) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
  };

  const getSortIcon = (field: string) => {
    if (sortBy !== field) return <span className="material-symbols-outlined text-[16px] text-slate-300 opacity-0 group-hover:opacity-50">unfold_more</span>;
    return (
      <span className="material-symbols-outlined text-[16px] text-primary">
        {sortOrder === 'asc' ? 'expand_less' : 'expand_more'}
      </span>
    );
  };

  return (
    <>
      {/* Page Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-[28px] text-primary">dashboard</span>
          <div>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
              Dashboard
            </h2>
            <p className="text-slate-500 dark:text-slate-400 text-xs font-medium capitalize">
              {currentDate ? currentDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }) : ''}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-white dark:bg-card-dark border border-slate-200 dark:border-slate-700 rounded-lg p-1 shadow-sm">
            <button className="px-3 py-1.5 text-xs font-bold rounded bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm">
              Mês
            </button>
            <button className="px-3 py-1.5 text-xs font-bold rounded text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-white transition-colors">
              Trimestre
            </button>
            <button className="px-3 py-1.5 text-xs font-bold rounded text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-white transition-colors">
              Ano
            </button>
          </div>
          <button className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-card-dark border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors shadow-sm">
            <span className="material-symbols-outlined text-[20px]">calendar_today</span>
            <span className="hidden sm:inline">
              {currentDate ? (
                <>
                  {currentDate.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })} - {new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
                </>
              ) : ''}
            </span>
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {/* Docs Received */}
        <div className="bg-white dark:bg-card-dark p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between h-36 relative overflow-hidden group hover:shadow-md transition-shadow">
          <div className="flex justify-between items-start z-10">
            <div>
              <p className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Docs Recebidos</p>
              <h3 className="text-3xl font-bold text-slate-900 dark:text-white mt-1">
                {loading ? <Skeleton className="h-8 w-20" /> : stats.docsReceived.toLocaleString()}
              </h3>
            </div>
            <span className="flex items-center justify-center w-10 h-10 rounded-xl bg-primary/10 text-primary">
              <span className="material-symbols-outlined text-[24px]">description</span>
            </span>
          </div>
          <div className="flex items-center gap-2 mt-auto z-10">
            <span className="text-xs font-medium text-slate-400 dark:text-slate-400">Total no sistema</span>
          </div>
          <div className="absolute -right-6 -bottom-6 opacity-5 group-hover:opacity-10 transition-opacity transform group-hover:scale-110 duration-500">
            <span className="material-symbols-outlined text-[120px] text-primary">description</span>
          </div>
        </div>

        {/* Total Value */}
        <div className="bg-white dark:bg-card-dark p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between h-36 relative overflow-hidden group hover:shadow-md transition-shadow">
          <div className="flex justify-between items-start z-10">
            <div>
              <p className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Valor Total</p>
              <h3 className="text-3xl font-bold text-slate-900 dark:text-white mt-1">
                {loading ? <Skeleton className="h-8 w-20" /> : formatCurrencyShort(stats.totalValue)}
              </h3>
            </div>
            <span className="flex items-center justify-center w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400">
              <span className="material-symbols-outlined text-[24px]">payments</span>
            </span>
          </div>
          <div className="flex items-center gap-2 mt-auto z-10">
            <span className="text-xs font-medium text-slate-400 dark:text-slate-400">Total no sistema</span>
          </div>
          <div className="absolute -right-6 -bottom-6 opacity-5 group-hover:opacity-10 transition-opacity transform group-hover:scale-110 duration-500">
            <span className="material-symbols-outlined text-[120px] text-blue-600">payments</span>
          </div>
        </div>

        {/* Pending Manifest */}
        <div className="bg-white dark:bg-card-dark p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between h-36 relative overflow-hidden group hover:shadow-md transition-shadow">
          <div className="flex justify-between items-start z-10">
            <div>
              <p className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Manifestação Pendente</p>
              <h3 className="text-3xl font-bold text-slate-900 dark:text-white mt-1">
                {loading ? <Skeleton className="h-8 w-20" /> : stats.pendingManifest}
              </h3>
            </div>
            <span className="flex items-center justify-center w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400">
              <span className="material-symbols-outlined text-[24px]">pending_actions</span>
            </span>
          </div>
          <div className="flex items-center gap-2 mt-auto z-10">
            <span className="flex items-center text-xs font-bold text-amber-700 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30 px-2 py-1 rounded-md border border-amber-200 dark:border-amber-800">
              Ação Necessária
            </span>
          </div>
          <div className="absolute -right-6 -bottom-6 opacity-5 group-hover:opacity-10 transition-opacity transform group-hover:scale-110 duration-500">
            <span className="material-symbols-outlined text-[120px] text-amber-600">pending_actions</span>
          </div>
        </div>

        {/* Errors */}
        <div className="bg-white dark:bg-card-dark p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between h-36 relative overflow-hidden group hover:shadow-md transition-shadow">
          <div className="flex justify-between items-start z-10">
            <div>
              <p className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Erros</p>
              <h3 className="text-3xl font-bold text-slate-900 dark:text-white mt-1">
                {loading ? <Skeleton className="h-8 w-20" /> : stats.errors}
              </h3>
            </div>
            <span className="flex items-center justify-center w-10 h-10 rounded-xl bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400">
              <span className="material-symbols-outlined text-[24px]">error</span>
            </span>
          </div>
          <div className="flex items-center gap-2 mt-auto z-10">
            <span className="text-xs font-medium text-slate-400 dark:text-slate-400">Total no sistema</span>
          </div>
          <div className="absolute -right-6 -bottom-6 opacity-5 group-hover:opacity-10 transition-opacity transform group-hover:scale-110 duration-500">
            <span className="material-symbols-outlined text-[120px] text-red-600">error</span>
          </div>
        </div>
      </div>

      {/* Recent Documents Table */}
      <div className="bg-white dark:bg-card-dark border border-slate-200 dark:border-slate-800 rounded-xl shadow-lg shadow-slate-200/50 dark:shadow-none flex flex-col overflow-hidden">
        {/* Table Header */}
        <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-50/30 dark:bg-slate-800/20">
          <div className="flex items-center gap-3">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">Documentos Recentes</h3>
            <span className="px-2.5 py-1 rounded-full bg-slate-200 dark:bg-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300">
              {invoices.length} Total
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button aria-label="Filtrar por status do documento" className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-card-dark border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-300 hover:border-primary dark:hover:border-primary transition-colors shadow-sm">
              <span className="material-symbols-outlined text-[18px]">filter_list</span>
              Status
            </button>
            <button aria-label="Filtrar por tipo de documento" className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-card-dark border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-300 hover:border-primary dark:hover:border-primary transition-colors shadow-sm">
              <span className="material-symbols-outlined text-[18px]">category</span>
              Tipo
            </button>
            <div className="h-8 w-px bg-slate-200 dark:bg-slate-700 mx-1 hidden sm:block"></div>
            <Link
              href="/dashboard/invoices"
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-primary to-primary-dark hover:from-primary-dark hover:to-primary text-white rounded-lg text-sm font-bold transition-all shadow-md shadow-primary/30 hover:shadow-lg hover:shadow-primary/40 group"
            >
              <span className="material-symbols-outlined text-[20px]">list_alt</span>
              Ver Todas
            </Link>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800 text-xs uppercase text-slate-500 dark:text-slate-400 font-bold tracking-wider">
                <th className="px-6 py-4 w-10">
                  <input className="rounded border-slate-300 text-primary focus:ring-primary bg-white dark:bg-slate-800 dark:border-slate-600 w-4 h-4 cursor-pointer" type="checkbox" />
                </th>
                <th className="px-6 py-4 cursor-pointer group hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" onClick={() => handleSort('status')}>
                  <div className="flex items-center gap-1">
                    Status {getSortIcon('status')}
                  </div>
                </th>
                <th className="px-6 py-4 cursor-pointer group hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" onClick={() => handleSort('sender')}>
                  <div className="flex items-center gap-1">
                    Chave / Emitente {getSortIcon('sender')}
                  </div>
                </th>
                <th className="px-6 py-4 cursor-pointer group hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" onClick={() => handleSort('emission')}>
                  <div className="flex items-center gap-1">
                    Data {getSortIcon('emission')}
                  </div>
                </th>
                <th className="px-6 py-4 text-right cursor-pointer group hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" onClick={() => handleSort('value')}>
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
                    <td className="px-6 py-4"><Skeleton className="h-4 w-4" /></td>
                    <td className="px-6 py-4"><Skeleton className="h-4 w-20" /></td>
                    <td className="px-6 py-4"><div className="space-y-2"><Skeleton className="h-4 w-40" /><Skeleton className="h-3 w-56" /></div></td>
                    <td className="px-6 py-4"><Skeleton className="h-4 w-24" /></td>
                    <td className="px-6 py-4 text-right"><Skeleton className="h-4 w-20 ml-auto" /></td>
                    <td className="px-6 py-4"><Skeleton className="h-4 w-16 mx-auto" /></td>
                  </tr>
                ))
              ) : invoices.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-400">
                    <span className="material-symbols-outlined text-[48px] opacity-30">description</span>
                    <p className="mt-2 text-sm font-medium">Nenhum documento encontrado</p>
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
                invoices.map((invoice) => {
                  const status = getStatusDisplay(invoice.status);
                  const dotClasses = statusDotClasses[status.color];
                  return (
                    <tr key={invoice.id} className="group hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="px-6 py-4">
                        <input className="rounded border-slate-300 text-primary focus:ring-primary bg-white dark:bg-slate-800 dark:border-slate-600 w-4 h-4 cursor-pointer" type="checkbox" />
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2.5">
                          {invoice.status === 'confirmed' ? (
                            <span className="relative flex h-2.5 w-2.5">
                              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${dotClasses.ping} opacity-75`}></span>
                              <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${dotClasses.dot}`}></span>
                            </span>
                          ) : (
                            <span className={`w-2.5 h-2.5 rounded-full ${dotClasses.dot}`}></span>
                          )}
                          <span className="text-sm font-bold text-slate-700 dark:text-slate-200">{status.label}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-slate-900 dark:text-white">{invoice.senderName}</span>
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                              {getTypeBadge(invoice.type)}
                            </span>
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
                              <span className="material-symbols-outlined text-[14px]">content_copy</span>
                            </button>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{formatDateShort(invoice.issueDate)}</span>
                        <div className="text-xs text-slate-400 font-medium">{formatTime(invoice.issueDate)}</div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className={`text-sm font-bold font-mono ${invoice.status === 'rejected' ? 'text-slate-500 line-through' : 'text-slate-900 dark:text-white'}`}>
                          {formatValue(invoice.totalValue)}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-center gap-1">
                          {invoice.status === 'received' && (
                            <button className="px-3 py-1 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-700/50 rounded-lg text-xs font-bold hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors uppercase tracking-wide">
                              Manifestar
                            </button>
                          )}
                          <button
                            onClick={() => openModal(invoice.id)}
                            aria-label="Ver detalhes"
                            className="p-2 rounded-lg text-slate-500 hover:text-primary hover:bg-primary/10 transition-colors"
                            title="Ver Detalhes"
                          >
                            <span className="material-symbols-outlined text-[20px]">visibility</span>
                          </button>
                          <a href={`/api/invoices/${invoice.id}/download`} aria-label="Baixar XML" className="p-2 rounded-lg text-slate-500 hover:text-primary hover:bg-primary/10 transition-colors" title="Download XML">
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

        {/* Pagination */}
        {invoices.length > 0 && (
          <div className="px-6 py-5 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/30 dark:bg-slate-800/20">
            <span className="text-sm text-slate-500 dark:text-slate-400">
              Mostrando <span className="font-bold text-slate-900 dark:text-white">1-{invoices.length}</span> de{' '}
              <span className="font-bold text-slate-900 dark:text-white">{invoices.length}</span>
            </span>
            <div className="flex items-center gap-2">
              <button aria-label="Página anterior" className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors" disabled>
                <span className="material-symbols-outlined text-[20px]">chevron_left</span>
              </button>
              <button className="w-9 h-9 flex items-center justify-center rounded-lg bg-primary text-white text-sm font-bold shadow-md shadow-primary/30">1</button>
              <button aria-label="Próxima página" className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
                <span className="material-symbols-outlined text-[20px]">chevron_right</span>
              </button>
            </div>
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
