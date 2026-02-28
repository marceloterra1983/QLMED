'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import dynamic from 'next/dynamic';
const InvoiceDetailsModal = dynamic(() => import('@/components/InvoiceDetailsModal'), { ssr: false });
const NfeDetailsModal = dynamic(() => import('@/components/NfeDetailsModal'), { ssr: false });
import Skeleton from '@/components/ui/Skeleton';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { formatDate, formatTime, formatCurrency, getDateGroupLabel } from '@/lib/utils';
import RowActions from '@/components/ui/RowActions';
import MobileFilterWrapper from '@/components/ui/MobileFilterWrapper';
import { getCfopTagByCode, getCfopTagOptions } from '@/lib/cfop';
import { downloadFileFromRequest, downloadFileFromUrl } from '@/lib/client-download';
import type { Invoice } from '@/types';
import { useRole } from '@/hooks/useRole';

const AUTO_REFRESH_MS = 5_000;

export default function IssuedInvoicesPage() {
  const { canWrite } = useRole();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [limit, setLimit] = useState(50);
  const [sortBy, setSortBy] = useState('emission');
  const [sortOrder, setSortOrder] = useState('desc');
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<'bulk' | string | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [detailsInvoiceId, setDetailsInvoiceId] = useState<string | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [nicknames, setNicknames] = useState<Map<string, string>>(new Map());
  const isVendaTag = (tag?: string | null) => tag === 'Venda';
  const getTagClasses = (tag?: string | null, highlighted?: boolean) => {
    if (tag === 'Venda') {
      return 'bg-emerald-200 text-emerald-900 dark:bg-emerald-500/35 dark:text-emerald-100';
    }
    if (tag === 'Compra') {
      return 'bg-rose-200 text-rose-900 dark:bg-rose-500/30 dark:text-rose-100';
    }
    if (highlighted) {
      return 'bg-amber-200 text-amber-900 dark:bg-amber-500/40 dark:text-amber-100';
    }
    return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300';
  };

  const toggleGroup = (group: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  };

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
  }, [page, limit, search, tagFilter, dateFrom, dateTo, sortBy, sortOrder]);

  useEffect(() => {
    const timer = setInterval(() => {
      loadInvoices({ silent: true });
    }, AUTO_REFRESH_MS);

    return () => clearInterval(timer);
  }, [page, limit, search, tagFilter, dateFrom, dateTo, sortBy, sortOrder]);

  const handleExport = () => {
    const headers = ['Numero', 'Chave', 'Destinatario', 'Data', 'Valor', 'Status'];
    const rows = invoices.map(inv => [
      inv.number,
      inv.accessKey,
      inv.recipientName,
      formatDate(inv.issueDate),
      inv.totalValue,
      inv.status,
    ]);
    const csvContent = '\uFEFF' + [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `nfe-emitidas-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success('CSV exportado com sucesso!');
  };

  const handleBulkDownloadXml = async () => {
    if (selected.size === 0) return;
    const ids = Array.from(selected);

    try {
      if (ids.length === 1) {
        await downloadFileFromUrl(`/api/invoices/${ids[0]}/download`);
      } else {
        await downloadFileFromRequest(
          '/api/invoices/bulk-download',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids, format: 'xml' }),
          },
          'xml_lote.zip',
        );
      }
      toast.success(`Download concluído: ${ids.length} XML(s)`);
    } catch {
      toast.error('Erro ao baixar XMLs selecionados');
    }
  };

  const handleBulkDownloadPdf = async () => {
    if (selected.size === 0) return;
    const ids = Array.from(selected);

    try {
      if (ids.length === 1) {
        await downloadFileFromUrl(`/api/invoices/${ids[0]}/pdf?download=true`);
      } else {
        await downloadFileFromRequest(
          '/api/invoices/bulk-download',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids, format: 'pdf' }),
          },
          'pdf_lote.zip',
        );
      }
      toast.success(`Download concluído: ${ids.length} PDF(s)`);
    } catch {
      toast.error('Erro ao baixar PDFs selecionados');
    }
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
        toast.success(`${data.deleted} nota(s) excluída(s) com sucesso`);
        setSelected(new Set());
        loadInvoices();
      } else {
        toast.error('Erro ao excluir notas');
      }
    } catch {
      toast.error('Erro de rede ao excluir');
    }
  };

  async function loadInvoices(options?: { silent?: boolean }) {
    const silent = options?.silent ?? false;

    if (!silent) {
      setLoading(true);
    }

    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (search) params.set('search', search);
      if (tagFilter) params.set('cfopTag', tagFilter);
      if (dateFrom) params.set('dateFrom', dateFrom);
      if (dateTo) params.set('dateTo', dateTo);
      // HARDCODED FILTER FOR NFE
      params.set('type', 'NFE');
      params.set('direction', 'issued');
      params.set('sort', sortBy);
      params.set('order', sortOrder);

      const res = await fetch(`/api/invoices?${params}`);
      if (res.ok) {
        const data = await res.json();
        const loaded: Invoice[] = data.invoices || [];
        setInvoices(loaded);
        setTotalPages(data.pagination?.pages || 1);
        setTotal(data.pagination?.total || 0);
        const cnpjs = Array.from(new Set(loaded.map((inv) => inv.recipientCnpj).filter(Boolean)));
        if (cnpjs.length > 0) {
          const p = new URLSearchParams();
          cnpjs.forEach((c) => p.append('cnpjs', c));
          const nr = await fetch(`/api/contacts/nickname/batch?${p}`);
          if (nr.ok) { const nd = await nr.json(); setNicknames(new Map(Object.entries(nd.nicknames || {}))); }
        } else { setNicknames(new Map()); }
      } else if (!silent) {
        toast.error('Erro ao carregar notas emitidas');
      }
    } catch {
      if (!silent) {
        toast.error('Erro ao carregar notas emitidas');
      }
    } finally {
      if (!silent) {
        setLoading(false);
      }
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

  const clearFilters = () => {
    setSearchInput('');
    setSearch('');
    setTagFilter('');
    setDateFrom('');
    setDateTo('');
    setPage(1);
  };

  const getNick = (cnpj: string | null | undefined, name: string | null | undefined) => {
    const full = (name || '').trim() || '-';
    if (!cnpj) return { display: full, full: null };
    const nick = nicknames.get(cnpj);
    if (nick) return { display: nick, full };
    const isCpf = cnpj.replace(/\D/g, '').length === 11;
    return isCpf ? { display: 'PARTICULAR', full } : { display: full, full: null };
  };

  return (
    <>
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-[28px] text-primary">output</span>
          <div>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">NF-e Emitidas</h2>
            <p className="text-slate-500 dark:text-slate-400 text-xs font-medium">Notas fiscais emitidas pela empresa</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => { void loadInvoices(); }}
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
      <MobileFilterWrapper activeFilterCount={[search, tagFilter, dateFrom, dateTo].filter(Boolean).length}>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 items-end">
          <div className="lg:col-span-2">
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">CNPJ / Nome Destinatário</label>
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
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Tipo de NF-e</label>
            <select
              value={tagFilter}
              onChange={(e) => { setTagFilter(e.target.value); setPage(1); }}
              className="block w-full px-3 py-2.5 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-900/50 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary text-sm transition-all"
            >
              <option value="">Todos</option>
              {getCfopTagOptions().map((tag) => (
                <option key={tag} value={tag}>{tag}</option>
              ))}
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
      </MobileFilterWrapper>

      {/* Bulk Actions Bar */}
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 sm:gap-4 px-3 sm:px-4 py-3 bg-primary/5 border border-primary/20 rounded-xl">
          <span className="text-xs sm:text-sm font-bold text-primary">{selected.size} selecionado(s)</span>
          <div className="hidden sm:block h-4 w-px bg-slate-300"></div>
          <button onClick={handleBulkDownloadXml} className="flex items-center gap-1 text-xs sm:text-sm font-medium text-slate-600 hover:text-primary transition-colors">
            <span className="material-symbols-outlined text-[16px] sm:text-[18px]">download</span>
            XML
          </button>
          <button onClick={handleBulkDownloadPdf} className="flex items-center gap-1 text-xs sm:text-sm font-medium text-slate-600 hover:text-primary transition-colors">
            <span className="material-symbols-outlined text-[16px] sm:text-[18px]">picture_as_pdf</span>
            PDF
          </button>
          {canWrite && (
            <>
              <div className="hidden sm:block h-4 w-px bg-slate-300"></div>
              <button onClick={() => confirmDelete('bulk')} className="flex items-center gap-1 text-xs sm:text-sm font-medium text-red-500 hover:text-red-700 transition-colors">
                <span className="material-symbols-outlined text-[16px] sm:text-[18px]">delete</span>
                Excluir
              </button>
            </>
          )}
        </div>
      )}

      {/* Mobile Cards */}
      <div className="sm:hidden space-y-2">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-white dark:bg-card-dark border border-slate-200 dark:border-slate-800 rounded-xl p-3 space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-48" />
              <Skeleton className="h-3 w-24" />
            </div>
          ))
        ) : invoices.length === 0 ? (
          <div className="bg-white dark:bg-card-dark border border-slate-200 dark:border-slate-800 rounded-xl p-8 text-center text-slate-400">
            <span className="material-symbols-outlined text-[48px] opacity-30">output</span>
            <p className="mt-2 text-sm font-medium">Nenhuma NF-e emitida encontrada</p>
          </div>
        ) : (
          invoices.map((invoice) => {
            const cfopTag = getCfopTagByCode(invoice.cfop);
            const highlightRow = !isVendaTag(cfopTag);
            return (
              <div
                key={invoice.id}
                className={`border rounded-xl p-3 ${
                  highlightRow
                    ? 'bg-amber-50/70 border-amber-200 dark:bg-amber-950/25 dark:border-amber-900/60'
                    : 'bg-white dark:bg-card-dark border-slate-200 dark:border-slate-800'
                }`}
              >
                <div className="flex items-start mb-1">
                  <div>
                    <span className="text-xs font-bold text-slate-900 dark:text-white">Nº {invoice.number}</span>
                    {cfopTag && (
                      <div className="mt-1">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide ${getTagClasses(cfopTag, highlightRow)}`}>
                          {cfopTag}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
                {(() => { const n = getNick(invoice.recipientCnpj, invoice.recipientName); return n.full ? (<><p className="text-xs font-bold text-slate-900 dark:text-white">{n.display}</p><p className="text-[10px] text-slate-400 dark:text-slate-500">{n.full}</p></>) : (<p className="text-xs text-slate-700 dark:text-slate-300 font-medium">{n.display}</p>); })()}
                <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <div>
                    <span className="text-[10px] text-slate-400">{formatDate(invoice.issueDate)} {formatTime(invoice.issueDate)}</span>
                    <span className="text-sm font-bold font-mono text-slate-900 dark:text-white ml-3">{formatCurrency(invoice.totalValue)}</span>
                  </div>
                  <RowActions invoiceId={invoice.id} onView={openModal} onDetails={openDetails} onDelete={canWrite ? confirmDelete : undefined} />
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
            <caption className="sr-only">Lista de notas fiscais eletrônicas emitidas</caption>
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800 text-xs uppercase text-slate-500 dark:text-slate-400 font-bold tracking-wider">
                <th className="px-3 py-2.5 w-10">
                  <input
                    className="rounded border-slate-300 text-primary focus:ring-primary bg-white dark:bg-slate-800 dark:border-slate-600 w-4 h-4 cursor-pointer"
                    type="checkbox"
                    checked={selected.size === invoices.length && invoices.length > 0}
                    onChange={toggleSelectAll}
                  />
                </th>
                <th className="px-3 py-2.5 cursor-pointer group hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" onClick={() => handleSort('emission')}>
                  <div className="flex items-center gap-1">Emissão {getSortIcon('emission')}</div>
                </th>
                <th className="px-3 py-2.5 cursor-pointer group hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" onClick={() => handleSort('number')}>
                  <div className="flex items-center gap-1">Número {getSortIcon('number')}</div>
                </th>
                <th className="px-3 py-2.5 text-right cursor-pointer group hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" onClick={() => handleSort('value')}>
                  <div className="flex items-center justify-end gap-1">Valor (R$) {getSortIcon('value')}</div>
                </th>
                <th className="px-3 py-2.5 cursor-pointer group hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" onClick={() => handleSort('recipient')}>
                  <div className="flex items-center gap-1">Destinatário {getSortIcon('recipient')}</div>
                </th>
                <th className="px-3 py-2.5 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {loading ? (
                Array.from({ length: limit }).map((_, i) => (
                  <tr key={i}>
                    <td className="px-3 py-2"><Skeleton className="h-4 w-4" /></td>
                    <td className="px-3 py-2"><Skeleton className="h-4 w-20" /><Skeleton className="h-3 w-12 mt-1" /></td>
                    <td className="px-3 py-2"><Skeleton className="h-4 w-16" /></td>
                    <td className="px-3 py-2 text-right"><Skeleton className="h-4 w-20 ml-auto" /></td>
                    <td className="px-3 py-2"><Skeleton className="h-4 w-32" /></td>
                    <td className="px-3 py-2"><Skeleton className="h-4 w-16 mx-auto" /></td>
                  </tr>
                ))
              ) : invoices.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-400">
                    <span className="material-symbols-outlined text-[48px] opacity-30">output</span>
                    <p className="mt-2 text-sm font-medium">Nenhuma NF-e emitida encontrada</p>
                    <Link
                      href="/sistema/upload"
                      className="inline-flex items-center gap-2 mt-4 px-4 py-2 bg-primary text-white rounded-lg text-sm font-bold shadow-md shadow-primary/30"
                    >
                      <span className="material-symbols-outlined text-[18px]">cloud_upload</span>
                      Importar XML
                    </Link>
                  </td>
                </tr>
              ) : (
                (() => {
                  let lastGroup = '';
                  return invoices.map((invoice) => {
                    const group = getDateGroupLabel(invoice.issueDate);
                    const showDivider = group !== lastGroup;
                    lastGroup = group;
                    const cfopTag = getCfopTagByCode(invoice.cfop);
                    const highlightRow = !isVendaTag(cfopTag);
                    return (
                      <React.Fragment key={invoice.id}>
                        {showDivider && (
                          <tr className="cursor-pointer select-none" onClick={() => toggleGroup(group)}>
                            <td colSpan={6} className="px-4 py-2 bg-slate-100/80 dark:bg-slate-800/60 border-y border-slate-200 dark:border-slate-700">
                              <div className="flex items-center gap-2">
                                <span className="material-symbols-outlined text-[16px] text-slate-400 transition-transform" style={{ transform: collapsedGroups.has(group) ? 'rotate(-90deg)' : 'rotate(0deg)' }}>expand_more</span>
                                <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{group}</span>
                              </div>
                            </td>
                          </tr>
                        )}
                        {!collapsedGroups.has(group) && (
                        <tr className={`group transition-colors ${highlightRow ? 'bg-amber-50/60 dark:bg-amber-950/20 hover:bg-amber-100/60 dark:hover:bg-amber-900/30' : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'}`}>
                          <td className="px-3 py-2">
                            <input
                              className="rounded border-slate-300 text-primary focus:ring-primary bg-white dark:bg-slate-800 dark:border-slate-600 w-4 h-4 cursor-pointer"
                              type="checkbox"
                              checked={selected.has(invoice.id)}
                              onChange={() => toggleSelect(invoice.id)}
                            />
                          </td>
                          <td className="px-3 py-2">
                            <div className="text-sm font-medium text-slate-700 dark:text-slate-300">{formatDate(invoice.issueDate)}</div>
                            <div className="text-[11px] text-slate-400">{formatTime(invoice.issueDate)}</div>
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex flex-col">
                              <span className="text-sm font-bold text-slate-900 dark:text-white">{invoice.number}</span>
                              {cfopTag && (
                                <span className={`mt-1 inline-flex w-fit items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide ${getTagClasses(cfopTag, highlightRow)}`}>
                                  {cfopTag}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2 text-right">
                            <span className="text-sm font-bold font-mono text-slate-900 dark:text-white">{formatCurrency(invoice.totalValue)}</span>
                          </td>
                          <td className="px-3 py-2">
                            {(() => { const n = getNick(invoice.recipientCnpj, invoice.recipientName); return n.full ? (<><div className="text-sm font-bold text-slate-900 dark:text-white">{n.display}</div><div className="text-[10px] text-slate-400 dark:text-slate-500">{n.full}</div></>) : (<span className="text-sm font-bold text-slate-900 dark:text-white">{n.display}</span>); })()}
                          </td>
                          <td className="px-3 py-2">
                            <RowActions invoiceId={invoice.id} onView={openModal} onDetails={openDetails} onDelete={canWrite ? confirmDelete : undefined} />
                          </td>
                        </tr>
                        )}
                      </React.Fragment>
                    );
                  });
                })()
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
        title="Excluir notas fiscais"
        message={deleteTarget === 'bulk'
          ? `Tem certeza que deseja excluir ${selected.size} nota(s) selecionada(s)? Esta ação não pode ser desfeita.`
          : 'Tem certeza que deseja excluir esta nota fiscal? Esta ação não pode ser desfeita.'}
        confirmLabel="Excluir"
        confirmVariant="danger"
      />
    </>
  );
}
