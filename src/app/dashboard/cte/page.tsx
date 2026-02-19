'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import InvoiceDetailsModal from '@/components/InvoiceDetailsModal';
import type { Invoice } from '@/types';
import { formatCnpj, formatDate, formatValue, getManifestBadge } from '@/lib/utils';

export default function CtePage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [limit, setLimit] = useState(10);
  const [sortBy, setSortBy] = useState('emission');
  const [sortOrder, setSortOrder] = useState('desc');
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const openModal = (id: string) => {
    setSelectedInvoiceId(id);
    setIsModalOpen(true);
  };

  useEffect(() => {
    loadInvoices();
  }, [page, limit, search, statusFilter, sortBy, sortOrder]);

  async function loadInvoices() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (search) params.set('search', search);
      if (statusFilter) params.set('status', statusFilter);
      // HARDCODED FILTER FOR CTE
      params.set('type', 'CTE');
      params.set('sort', sortBy);
      params.set('order', sortOrder);

      const res = await fetch(`/api/invoices?${params}`);
      if (res.ok) {
        const data = await res.json();
        setInvoices(data.invoices || []);
        setTotalPages(data.pagination?.pages || 1);
        setTotal(data.pagination?.total || 0);
      }
    } catch (err) {
      console.error('Error loading invoices:', err);
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

  const toggleSelect = (id: string) => {
    const newSelected = new Set(selected);
    if (newSelected.has(id)) newSelected.delete(id);
    else newSelected.add(id);
    setSelected(newSelected);
  };

  const toggleSelectAll = () => {
    if (selected.size === invoices.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(invoices.map((inv) => inv.id)));
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'confirmed':
        return <span className="material-symbols-outlined text-[20px] text-emerald-500">check_circle</span>;
      case 'rejected':
        return <span className="material-symbols-outlined text-[20px] text-red-500">cancel</span>;
      default:
        return <span className="material-symbols-outlined text-[20px] text-emerald-500">check_circle</span>;
    }
  };

  const clearFilters = () => {
    setSearch('');
    setStatusFilter('');
    setPage(1);
  };

  return (
    <>
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">Conhecimentos de Transporte (CT-e)</h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm font-medium mt-1">
            Gerencie seus conhecimentos de transporte eletrônicos recebidos.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={loadInvoices}
            className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-primary to-primary-dark hover:from-primary-dark hover:to-primary text-white rounded-lg text-sm font-bold transition-all shadow-md shadow-primary/30"
          >
            <span className="material-symbols-outlined text-[20px]">sync</span>
            Atualizar
          </button>
          <button className="flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-card-dark border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 transition-colors shadow-sm">
            <span className="material-symbols-outlined text-[20px]">download</span>
            Exportar
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-card-dark border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 items-end">
          <div className="lg:col-span-2">
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">CNPJ / Nome Emitente</label>
            <input
              type="text"
              placeholder="ex: 00.000.000/0001-91"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="block w-full px-3 py-2.5 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-900/50 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary text-sm transition-all"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Período (Emissão)</label>
            <input
              type="date"
              className="block w-full px-3 py-2.5 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-900/50 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary text-sm transition-all"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Status SEFAZ</label>
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
              className="block w-full px-3 py-2.5 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-900/50 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary text-sm transition-all"
            >
              <option value="">Todos</option>
              <option value="received">Recebida</option>
              <option value="confirmed">Confirmada</option>
              <option value="rejected">Rejeitada</option>
            </select>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => { setPage(1); loadInvoices(); }}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-900 dark:bg-primary text-white rounded-lg text-sm font-bold transition-all shadow-md"
            >
              <span className="material-symbols-outlined text-[20px]">filter_alt</span>
              Aplicar
            </button>
            <button
              onClick={clearFilters}
              className="px-3 py-2.5 text-slate-500 hover:text-slate-700 text-sm font-medium transition-colors"
            >
              Limpar
            </button>
          </div>
        </div>
      </div>

      {/* Bulk Actions Bar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-4 px-4 py-3 bg-primary/5 border border-primary/20 rounded-xl">
          <span className="text-sm font-bold text-primary">{selected.size} selecionado(s)</span>
          <div className="h-4 w-px bg-slate-300"></div>
          <button className="flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-primary transition-colors">
            <span className="material-symbols-outlined text-[18px]">download</span>
            Download XML
          </button>
          <button className="flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-primary transition-colors">
            <span className="material-symbols-outlined text-[18px]">picture_as_pdf</span>
            Download PDF
          </button>
          <button className="flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-primary transition-colors">
            <span className="material-symbols-outlined text-[18px]">fact_check</span>
            Manifestar
          </button>
        </div>
      )}

      {/* Table */}
      <div className="bg-white dark:bg-card-dark border border-slate-200 dark:border-slate-800 rounded-xl shadow-lg shadow-slate-200/50 dark:shadow-none overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
          <thead>
              <tr className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800 text-xs uppercase text-slate-500 dark:text-slate-400 font-bold tracking-wider">
                <th className="px-4 py-4 w-10">
                  <input
                    className="rounded border-slate-300 text-primary focus:ring-primary bg-white dark:bg-slate-800 dark:border-slate-600 w-4 h-4 cursor-pointer"
                    type="checkbox"
                    checked={selected.size === invoices.length && invoices.length > 0}
                    onChange={toggleSelectAll}
                  />
                </th>
                <th className="px-4 py-4 w-10 cursor-pointer group hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" onClick={() => handleSort('status')}>
                  <div className="flex items-center gap-1">ST {getSortIcon('status')}</div>
                </th>
                <th className="px-4 py-4 cursor-pointer group hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" onClick={() => handleSort('number')}>
                  <div className="flex items-center gap-1">Número / Série {getSortIcon('number')}</div>
                </th>
                <th className="px-4 py-4 cursor-pointer group hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" onClick={() => handleSort('sender')}>
                  <div className="flex items-center gap-1">Emitente (CNPJ) {getSortIcon('sender')}</div>
                </th>
                <th className="px-4 py-4 cursor-pointer group hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" onClick={() => handleSort('emission')}>
                  <div className="flex items-center gap-1">Emissão {getSortIcon('emission')}</div>
                </th>
                <th className="px-4 py-4 text-right cursor-pointer group hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" onClick={() => handleSort('value')}>
                  <div className="flex items-center justify-end gap-1">Valor (R$) {getSortIcon('value')}</div>
                </th>
                <th className="px-4 py-4">Manifestação</th>
                <th className="px-4 py-4 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-slate-400">
                    <span className="material-symbols-outlined text-[32px] animate-spin">progress_activity</span>
                    <p className="mt-2 text-sm">Carregando CT-es...</p>
                  </td>
                </tr>
              ) : invoices.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-slate-400">
                    <span className="material-symbols-outlined text-[48px] opacity-30">local_shipping</span>
                    <p className="mt-2 text-sm font-medium">Nenhum CT-e encontrado</p>
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
                  const manifest = getManifestBadge(invoice.status);
                  return (
                    <tr key={invoice.id} className="group hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="px-4 py-4">
                        <input
                          className="rounded border-slate-300 text-primary focus:ring-primary bg-white dark:bg-slate-800 dark:border-slate-600 w-4 h-4 cursor-pointer"
                          type="checkbox"
                          checked={selected.has(invoice.id)}
                          onChange={() => toggleSelect(invoice.id)}
                        />
                      </td>
                      <td className="px-4 py-4">{getStatusIcon(invoice.status)}</td>
                      <td className="px-4 py-4">
                        <span className="text-sm font-bold text-slate-900 dark:text-white">{invoice.number}</span>
                        <div className="text-xs text-slate-400">Série {invoice.series || '1'}</div>
                      </td>
                      <td className="px-4 py-4">
                        <span className="text-sm font-bold text-slate-900 dark:text-white">{invoice.senderName}</span>
                        <div className="text-xs text-slate-400 font-mono">{formatCnpj(invoice.senderCnpj)}</div>
                      </td>
                      <td className="px-4 py-4">
                        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{formatDate(invoice.issueDate)}</span>
                      </td>
                      <td className="px-4 py-4 text-right">
                        <span className="text-sm font-bold font-mono text-slate-900 dark:text-white">{formatValue(invoice.totalValue)}</span>
                      </td>
                      <td className="px-4 py-4">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold border ${manifest.classes}`}>
                          • {manifest.label}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => openModal(invoice.id)} className="p-2 rounded-lg text-slate-500 hover:text-primary hover:bg-primary/10 transition-colors" title="Ver">
                            <span className="material-symbols-outlined text-[20px]">visibility</span>
                          </button>
                          <a href={`/api/invoices/${invoice.id}/download`} className="p-2 rounded-lg text-slate-500 hover:text-primary hover:bg-primary/10 transition-colors" title="Download">
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
        <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/30 dark:bg-slate-800/20">
          <div className="flex items-center gap-3">
            <span className="text-sm text-slate-500">Mostrando {invoices.length} de {total} resultados</span>
            <select
              value={limit}
              onChange={(e) => { setLimit(Number(e.target.value)); setPage(1); }}
              className="px-2 py-1 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-sm text-slate-600 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              <option value={10}>10 / página</option>
              <option value={25}>25 / página</option>
              <option value={50}>50 / página</option>
              <option value={100}>100 / página</option>
            </select>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(1)}
              disabled={page === 1}
              className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-40"
              title="Primeira página"
            >
              <span className="material-symbols-outlined text-[20px]">first_page</span>
            </button>
            <button
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page === 1}
              className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-40"
            >
              <span className="material-symbols-outlined text-[20px]">chevron_left</span>
            </button>
            {(() => {
              const pages: number[] = [];
              let start = Math.max(1, page - 2);
              let end = Math.min(totalPages, start + 4);
              start = Math.max(1, end - 4);
              for (let i = start; i <= end; i++) pages.push(i);
              return pages.map((p) => (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={`w-9 h-9 flex items-center justify-center rounded-lg text-sm font-bold transition-colors ${
                    p === page
                      ? 'bg-primary text-white shadow-md shadow-primary/30'
                      : 'border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700'
                  }`}
                >
                  {p}
                </button>
              ));
            })()}
            <button
              onClick={() => setPage(Math.min(totalPages, page + 1))}
              disabled={page === totalPages}
              className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-40"
            >
              <span className="material-symbols-outlined text-[20px]">chevron_right</span>
            </button>
            <button
              onClick={() => setPage(totalPages)}
              disabled={page === totalPages}
              className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-40"
              title="Última página"
            >
              <span className="material-symbols-outlined text-[20px]">last_page</span>
            </button>
          </div>
        </div>
      </div>
      <InvoiceDetailsModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        invoiceId={selectedInvoiceId}
      />
    </>
  );
}
