'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import InvoiceDetailsModal from '@/components/InvoiceDetailsModal';
import NfeDetailsModal from '@/components/NfeDetailsModal';
import Skeleton from '@/components/ui/Skeleton';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import type { Invoice } from '@/types';
import { formatCnpj, formatDate, formatTime, formatValue } from '@/lib/utils';
import RowActions from '@/components/ui/RowActions';

export default function CtePage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [limit, setLimit] = useState(10);
  const [sortBy, setSortBy] = useState('emission');
  const [sortOrder, setSortOrder] = useState('desc');
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<'bulk' | string | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [detailsInvoiceId, setDetailsInvoiceId] = useState<string | null>(null);

  const openModal = (id: string) => {
    setSelectedInvoiceId(id);
    setIsModalOpen(true);
  };

  const openDetails = (id: string) => {
    setDetailsInvoiceId(id);
    setIsDetailsOpen(true);
  };

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    loadInvoices();
  }, [page, limit, search, statusFilter, dateFrom, dateTo, sortBy, sortOrder]);

  const handleExport = () => {
    const headers = ['Numero', 'Chave', 'Emitente', 'Data', 'Valor', 'Status'];
    const rows = invoices.map(inv => [
      inv.number,
      inv.accessKey,
      inv.senderName,
      formatDate(inv.issueDate),
      inv.totalValue,
      inv.status,
    ]);
    const csvContent = '\uFEFF' + [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `cte-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success('CSV exportado com sucesso!');
  };

  const handleBulkDownloadXml = () => {
    if (selected.size === 0) return;
    selected.forEach(id => {
      window.open(`/api/invoices/${id}/download`, '_blank');
    });
    toast.success(`Iniciando download de ${selected.size} XML(s)`);
  };

  const confirmDelete = (target: 'bulk' | string) => {
    setDeleteTarget(target);
    setShowDeleteConfirm(true);
  };

  const handleDelete = async () => {
    const ids = deleteTarget === 'bulk' ? Array.from(selected) : deleteTarget ? [deleteTarget] : [];
    if (ids.length === 0) return;

    try {
      const res = await fetch('/api/invoices', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      });
      if (res.ok) {
        const data = await res.json();
        toast.success(`${data.deleted} documento(s) excluído(s) com sucesso`);
        setSelected(new Set());
        loadInvoices();
      } else {
        toast.error('Erro ao excluir documentos');
      }
    } catch {
      toast.error('Erro de rede ao excluir');
    }
  };

  async function loadInvoices() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (search) params.set('search', search);
      if (statusFilter) params.set('status', statusFilter);
      if (dateFrom) params.set('dateFrom', dateFrom);
      if (dateTo) params.set('dateTo', dateTo);
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
      toast.error('Erro ao carregar CT-es');
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
        return <><span className="material-symbols-outlined text-[20px] text-emerald-500">check_circle</span><span className="sr-only">Desacordo cancelado</span></>;
      case 'rejected':
        return <><span className="material-symbols-outlined text-[20px] text-red-500">error</span><span className="sr-only">Desacordo registrado</span></>;
      default:
        return <><span className="material-symbols-outlined text-[20px] text-amber-500">schedule</span><span className="sr-only">Sem manifestação</span></>;
    }
  };

  const getCteManifestBadge = (status: string) => {
    switch (status) {
      case 'confirmed':
        return {
          label: 'Desacordo cancelado',
          classes:
            'text-emerald-600 bg-emerald-50 border-emerald-200 dark:text-emerald-400 dark:bg-emerald-900/30 dark:border-emerald-800',
        };
      case 'rejected':
        return {
          label: 'Desacordo',
          classes:
            'text-red-600 bg-red-50 border-red-200 dark:text-red-400 dark:bg-red-900/30 dark:border-red-800',
        };
      default:
        return {
          label: 'Sem manifestação',
          classes:
            'text-amber-600 bg-amber-50 border-amber-200 dark:text-amber-400 dark:bg-amber-900/30 dark:border-amber-800',
        };
    }
  };

  const clearFilters = () => {
    setSearchInput('');
    setSearch('');
    setStatusFilter('');
    setDateFrom('');
    setDateTo('');
    setPage(1);
  };

  return (
    <>
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-[28px] text-primary">local_shipping</span>
          <div>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">CT-e</h2>
            <p className="text-slate-500 dark:text-slate-400 text-xs font-medium">Conhecimentos de transporte eletrônicos</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={loadInvoices}
            className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-primary to-primary-dark hover:from-primary-dark hover:to-primary text-white rounded-lg text-sm font-bold transition-all shadow-md shadow-primary/30"
          >
            <span className="material-symbols-outlined text-[20px]">sync</span>
            Atualizar
          </button>
          <button
            onClick={handleExport}
            disabled={invoices.length === 0}
            className="flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-card-dark border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 transition-colors shadow-sm disabled:opacity-40"
          >
            <span className="material-symbols-outlined text-[20px]">download</span>
            Exportar
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-card-dark border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 items-end">
          <div className="lg:col-span-2">
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">CNPJ / Nome Emitente</label>
            <input
              type="text"
              placeholder="ex: 00.000.000/0001-91"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="block w-full px-3 py-2.5 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-900/50 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary text-sm transition-all"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Data Início</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
              className="block w-full px-3 py-2.5 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-900/50 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary text-sm transition-all"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Data Fim</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
              className="block w-full px-3 py-2.5 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-900/50 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary text-sm transition-all"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Manifestação</label>
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
              className="block w-full px-3 py-2.5 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-900/50 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary text-sm transition-all"
            >
              <option value="">Todos</option>
              <option value="received">Sem manifestação</option>
              <option value="rejected">Desacordo</option>
              <option value="confirmed">Desacordo cancelado</option>
            </select>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => { setPage(1); loadInvoices(); }}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-primary to-primary-dark text-white rounded-lg text-sm font-bold transition-all shadow-md shadow-primary/30"
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
          <button onClick={handleBulkDownloadXml} className="flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-primary transition-colors">
            <span className="material-symbols-outlined text-[18px]">download</span>
            Download XML
          </button>
          <button className="flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-primary transition-colors">
            <span className="material-symbols-outlined text-[18px]">picture_as_pdf</span>
            Download PDF
          </button>
          <button
            onClick={() => toast.info('Envio de manifestação de CT-e ainda não implementado nesta tela.')}
            className="flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-primary transition-colors"
          >
            <span className="material-symbols-outlined text-[18px]">fact_check</span>
            Manifestar
          </button>
          <div className="h-4 w-px bg-slate-300"></div>
          <button onClick={() => confirmDelete('bulk')} className="flex items-center gap-1.5 text-sm font-medium text-red-500 hover:text-red-700 transition-colors">
            <span className="material-symbols-outlined text-[18px]">delete</span>
            Excluir
          </button>
        </div>
      )}

      {/* Mobile Cards */}
      <div className="sm:hidden space-y-3">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-white dark:bg-card-dark border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-3">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-48" />
              <Skeleton className="h-3 w-24" />
            </div>
          ))
        ) : invoices.length === 0 ? (
          <div className="bg-white dark:bg-card-dark border border-slate-200 dark:border-slate-800 rounded-xl p-8 text-center text-slate-400">
            <span className="material-symbols-outlined text-[48px] opacity-30">local_shipping</span>
            <p className="mt-2 text-sm font-medium">Nenhum CT-e encontrado</p>
          </div>
        ) : (
          invoices.map((invoice) => {
            const manifest = getCteManifestBadge(invoice.status);
            return (
              <div key={invoice.id} className="bg-white dark:bg-card-dark border border-slate-200 dark:border-slate-800 rounded-xl p-4">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <span className="text-sm font-bold text-slate-900 dark:text-white">Nº {invoice.number}</span>
                  </div>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold border ${manifest.classes}`}>
                    {manifest.label}
                  </span>
                </div>
                <p className="text-sm text-slate-700 dark:text-slate-300 font-medium">{invoice.senderName}</p>
                <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                  <div>
                    <span className="text-xs text-slate-400">{formatDate(invoice.issueDate)} {formatTime(invoice.issueDate)}</span>
                    <span className="text-sm font-bold font-mono text-slate-900 dark:text-white ml-3">{formatValue(invoice.totalValue)}</span>
                  </div>
                  <RowActions invoiceId={invoice.id} onView={openModal} onDetails={openDetails} onDelete={confirmDelete} />
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Table (desktop) */}
      <div className="hidden sm:block bg-white dark:bg-card-dark border border-slate-200 dark:border-slate-800 rounded-xl shadow-lg shadow-slate-200/50 dark:shadow-none overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <caption className="sr-only">Lista de conhecimentos de transporte eletrônicos</caption>
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
                  <div className="flex items-center gap-1">Número {getSortIcon('number')}</div>
                </th>
                <th className="px-4 py-4 cursor-pointer group hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" onClick={() => handleSort('sender')}>
                  <div className="flex items-center gap-1">Emitente {getSortIcon('sender')}</div>
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
                Array.from({ length: limit }).map((_, i) => (
                  <tr key={i}>
                    <td className="px-4 py-4"><Skeleton className="h-4 w-4" /></td>
                    <td className="px-4 py-4"><Skeleton className="h-5 w-5 rounded-full" /></td>
                    <td className="px-4 py-4"><div className="space-y-1"><Skeleton className="h-4 w-16" /><Skeleton className="h-3 w-12" /></div></td>
                    <td className="px-4 py-4"><div className="space-y-1"><Skeleton className="h-4 w-32" /><Skeleton className="h-3 w-28" /></div></td>
                    <td className="px-4 py-4"><Skeleton className="h-4 w-24" /></td>
                    <td className="px-4 py-4 text-right"><Skeleton className="h-4 w-20 ml-auto" /></td>
                    <td className="px-4 py-4"><Skeleton className="h-5 w-24 rounded-full" /></td>
                    <td className="px-4 py-4"><Skeleton className="h-4 w-16 mx-auto" /></td>
                  </tr>
                ))
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
                  const manifest = getCteManifestBadge(invoice.status);
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
                      </td>
                      <td className="px-4 py-4">
                        <span className="text-sm font-bold text-slate-900 dark:text-white">{invoice.senderName}</span>
                      </td>
                      <td className="px-4 py-4">
                        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{formatDate(invoice.issueDate)}</span>
                        <div className="text-xs text-slate-400">{formatTime(invoice.issueDate)}</div>
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
                        <RowActions invoiceId={invoice.id} onView={openModal} onDetails={openDetails} onDelete={confirmDelete} />
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
              aria-label="Primeira página"
            >
              <span className="material-symbols-outlined text-[20px]">first_page</span>
            </button>
            <button
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page === 1}
              className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-40"
              aria-label="Página anterior"
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
              aria-label="Próxima página"
            >
              <span className="material-symbols-outlined text-[20px]">chevron_right</span>
            </button>
            <button
              onClick={() => setPage(totalPages)}
              disabled={page === totalPages}
              className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-40"
              title="Última página"
              aria-label="Última página"
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
      <NfeDetailsModal
        isOpen={isDetailsOpen}
        onClose={() => setIsDetailsOpen(false)}
        invoiceId={detailsInvoiceId}
      />
      <ConfirmDialog
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={handleDelete}
        title="Excluir documentos"
        message={deleteTarget === 'bulk'
          ? `Tem certeza que deseja excluir ${selected.size} documento(s) selecionado(s)? Esta ação não pode ser desfeita.`
          : 'Tem certeza que deseja excluir este CT-e? Esta ação não pode ser desfeita.'}
        confirmLabel="Excluir"
        confirmVariant="danger"
      />
    </>
  );
}
