'use client';

import React, { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import dynamic from 'next/dynamic';
const InvoiceDetailsModal = dynamic(() => import('@/components/InvoiceDetailsModal'), { ssr: false });
const NfeDetailsModal = dynamic(() => import('@/components/NfeDetailsModal'), { ssr: false });
import Skeleton from '@/components/ui/Skeleton';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import type { Invoice } from '@/types';
import { formatDate, formatTime, formatAmount } from '@/lib/utils';
import { buildNfeGroups, buildYearMonths } from '@/lib/nfe-groups';
import RowActions from '@/components/ui/RowActions';
import MobileFilterWrapper from '@/components/ui/MobileFilterWrapper';
import { getCfopTagByCode, getCfopTagOptions } from '@/lib/cfop';
import { downloadFileFromRequest, downloadFileFromUrl } from '@/lib/client-download';
import { useRole } from '@/hooks/useRole';


export default function InvoicesPage() {
  const { canWrite } = useRole();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [dateFrom, setDateFrom] = useState(() => `${new Date().getFullYear()}-01-01`);
  const [dateTo, setDateTo] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [total, setTotal] = useState(0);
  const [sortBy, setSortBy] = useState('emission');
  const [sortOrder, setSortOrder] = useState('desc');
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<'bulk' | string | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [detailsInvoiceId, setDetailsInvoiceId] = useState<string | null>(null);
  const [detailsInitialTab, setDetailsInitialTab] = useState<string | undefined>(undefined);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [collapsedInitialized, setCollapsedInitialized] = useState(false);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [availableYears, setAvailableYears] = useState<number[]>([]);
  const [nicknames, setNicknames] = useState<Map<string, string>>(new Map());
  const [hideValues, setHideValues] = useState(true);

  const getReceivedTagLabel = (tag?: string | null) => (tag === 'Venda' ? 'Compra' : tag || '');
  const isNeutralTag = (tag?: string | null) => !tag || tag === 'Compra' || tag === 'Venda';
  const getTagClasses = (tag?: string | null, highlighted?: boolean) => {
    if (tag === 'Venda') return 'bg-emerald-200 text-emerald-900 dark:bg-emerald-500/35 dark:text-emerald-100';
    if (tag === 'Compra') return 'bg-rose-200 text-rose-900 dark:bg-rose-500/30 dark:text-rose-100';
    if (highlighted) return 'bg-amber-200 text-amber-900 dark:bg-amber-500/40 dark:text-amber-100';
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

  const selectYear = (year: number | null) => {
    const cy = new Date().getFullYear();
    if (year === null) { setDateFrom(`${cy}-01-01`); setDateTo(''); }
    else { setDateFrom(`${year}-01-01`); setDateTo(`${year}-12-31`); }
    setSelectedYear(year);
    setCollapsedInitialized(false);
    setSelected(new Set());
  };

  const openModal = (id: string) => { setSelectedInvoiceId(id); setIsModalOpen(true); };
  const openDetails = (id: string) => { setDetailsInvoiceId(id); setDetailsInitialTab(undefined); setIsDetailsOpen(true); };
  const openProducts = (id: string) => { setDetailsInvoiceId(id); setDetailsInitialTab('produtos'); setIsDetailsOpen(true); };

  useEffect(() => {
    const timer = setTimeout(() => { setSearch(searchInput); }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    loadInvoices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, tagFilter, dateFrom, dateTo, sortBy, sortOrder]);

  useEffect(() => {
    const cy = new Date().getFullYear();
    Promise.all([cy - 1, cy - 2, cy - 3, cy - 4].map(y =>
      fetch(`/api/invoices?limit=1&page=1&type=NFE&direction=received&dateFrom=${y}-01-01&dateTo=${y}-12-31`)
        .then(r => r.ok ? r.json() : null)
        .then(d => (d?.pagination?.total ?? 0) > 0 ? y : null)
        .catch(() => null)
    )).then(res => setAvailableYears(res.filter((y): y is number => y !== null)));
  }, []);

  const handleExport = () => {
    const headers = ['Numero', 'Chave', 'Emitente', 'Data', 'Valor', 'Status'];
    const rows = invoices.map(inv => [inv.number, inv.accessKey, inv.senderName, formatDate(inv.issueDate), inv.totalValue, inv.status]);
    const csvContent = '\uFEFF' + [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `nfe-recebidas-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success('CSV exportado com sucesso!');
  };

  const handleBulkDownloadXml = async () => {
    if (selected.size === 0) return;
    const ids = Array.from(selected);
    try {
      if (ids.length === 1) { await downloadFileFromUrl(`/api/invoices/${ids[0]}/download`); }
      else { await downloadFileFromRequest('/api/invoices/bulk-download', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids, format: 'xml' }) }, 'xml_lote.zip'); }
      toast.success(`Download concluído: ${ids.length} XML(s)`);
    } catch { toast.error('Erro ao baixar XMLs selecionados'); }
  };

  const handleBulkDownloadPdf = async () => {
    if (selected.size === 0) return;
    const ids = Array.from(selected);
    try {
      if (ids.length === 1) { await downloadFileFromUrl(`/api/invoices/${ids[0]}/pdf?download=true`); }
      else { await downloadFileFromRequest('/api/invoices/bulk-download', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids, format: 'pdf' }) }, 'pdf_lote.zip'); }
      toast.success(`Download concluído: ${ids.length} PDF(s)`);
    } catch { toast.error('Erro ao baixar PDFs selecionados'); }
  };

  const confirmDelete = (target: 'bulk' | string) => { setDeleteTarget(target); setShowDeleteConfirm(true); };

  const handleDelete = async () => {
    const ids = deleteTarget === 'bulk' ? Array.from(selected) : deleteTarget ? [deleteTarget] : [];
    if (ids.length === 0) return;
    try {
      const res = await fetch('/api/invoices', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }) });
      if (res.ok) {
        const data = await res.json();
        toast.success(`${data.deleted} nota(s) excluída(s) com sucesso`);
        setSelected(new Set());
        loadInvoices();
      } else { toast.error('Erro ao excluir notas'); }
    } catch { toast.error('Erro de rede ao excluir'); }
  };

  async function loadInvoices() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: '1', limit: '2000' });
      if (search) params.set('search', search);
      if (tagFilter) params.set('cfopTag', tagFilter);
      if (dateFrom) params.set('dateFrom', dateFrom);
      if (dateTo) params.set('dateTo', dateTo);
      params.set('type', 'NFE');
      params.set('direction', 'received');
      params.set('sort', sortBy);
      params.set('order', sortOrder);

      const res = await fetch(`/api/invoices?${params}`);
      if (res.ok) {
        const data = await res.json();
        const loaded: Invoice[] = data.invoices || [];
        setInvoices(loaded);
        setTotal(data.pagination?.total || 0);
        if (!collapsedInitialized && loaded.length > 0) {
          if (selectedYear !== null) {
            const months = buildYearMonths(loaded);
            setCollapsedGroups(new Set(months.map(m => m.key)));
          } else {
            const groups = buildNfeGroups(loaded);
            const toCollapse = new Set<string>();
            if (groups.semanaPassada.length > 0) toCollapse.add('semana_passada');
            for (const mg of groups.currentYearMonths) toCollapse.add(mg.key);
            setCollapsedGroups(toCollapse);
          }
          setCollapsedInitialized(true);
        }
        const cnpjs = Array.from(new Set(loaded.map((inv) => inv.senderCnpj).filter(Boolean)));
        if (cnpjs.length > 0) {
          const p = new URLSearchParams(); cnpjs.forEach((c) => p.append('cnpjs', c));
          const nr = await fetch(`/api/contacts/nickname/batch?${p}`);
          if (nr.ok) { const nd = await nr.json(); setNicknames(new Map(Object.entries(nd.nicknames || {}))); }
        } else { setNicknames(new Map()); }
      }
    } catch { toast.error('Erro ao carregar notas fiscais'); }
    finally { setLoading(false); }
  }

  const handleSort = (field: string) => {
    if (sortBy === field) setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    else { setSortBy(field); setSortOrder('desc'); }
  };

  const getSortIcon = (field: string) => {
    if (sortBy !== field) return <span className="material-symbols-outlined text-[16px] text-slate-300 opacity-0 group-hover:opacity-50">unfold_more</span>;
    return <span className="material-symbols-outlined text-[16px] text-primary">{sortOrder === 'asc' ? 'expand_less' : 'expand_more'}</span>;
  };

  const toggleSelect = (id: string) => {
    const newSelected = new Set(selected);
    if (newSelected.has(id)) newSelected.delete(id);
    else newSelected.add(id);
    setSelected(newSelected);
  };

  const toggleSelectAll = () => {
    if (selected.size === invoices.length) setSelected(new Set());
    else setSelected(new Set(invoices.map((inv) => inv.id)));
  };

  const clearFilters = () => { setSearchInput(''); setSearch(''); setTagFilter(''); selectYear(null); };

  const getNick = (cnpj: string | null | undefined, name: string | null | undefined) => {
    const full = (name || '').trim() || '-';
    if (!cnpj) return { display: full, full: null };
    const nick = nicknames.get(cnpj);
    if (nick) return { display: nick, full };
    const isCpf = cnpj.replace(/\D/g, '').length === 11;
    return isCpf ? { display: 'PARTICULAR', full } : { display: full, full: null };
  };

  const nfeGroups = useMemo(() => buildNfeGroups(invoices), [invoices]);
  const yearMonths = useMemo(() => selectedYear !== null ? buildYearMonths(invoices) : [], [invoices, selectedYear]);

  const val = (amount: number) => hideValues
    ? <span className="tracking-widest text-slate-300 dark:text-slate-600 select-none">••••</span>
    : <>{formatAmount(amount)}</>;

  const renderGroupDivider = (key: string, label: string, count: number, _gtotal: number) => (
    <tr key={`hdr-${key}`} className="cursor-pointer select-none" onClick={() => toggleGroup(key)}>
      <td colSpan={6} className="px-4 py-2 border-y bg-slate-100/80 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[16px] text-slate-400 transition-transform duration-200" style={{ transform: collapsedGroups.has(key) ? 'rotate(-90deg)' : 'rotate(0deg)' }}>expand_more</span>
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</span>
          <span className="text-xs text-slate-400">· {count} {count === 1 ? 'item' : 'itens'}</span>
        </div>
      </td>
    </tr>
  );

  const renderInvoiceRow = (invoice: Invoice) => {
    const cfopTag = getCfopTagByCode(invoice.cfop);
    const displayTag = getReceivedTagLabel(cfopTag);
    const highlightRow = !isNeutralTag(displayTag);
    return (
      <tr key={invoice.id} className={`group transition-colors cursor-pointer ${highlightRow ? 'bg-amber-50/60 dark:bg-amber-950/20 hover:bg-amber-100/60 dark:hover:bg-amber-900/30' : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'}`} onClick={() => openDetails(invoice.id)}>
        <td className="px-2 py-1.5" onClick={(e) => e.stopPropagation()}>
          <input className="rounded border-slate-300 text-primary focus:ring-primary bg-white dark:bg-slate-800 dark:border-slate-600 w-4 h-4 cursor-pointer" type="checkbox" checked={selected.has(invoice.id)} onChange={() => toggleSelect(invoice.id)} />
        </td>
        <td className="px-2 py-1.5 whitespace-nowrap">
          <div className="text-sm font-medium text-slate-700 dark:text-slate-300">{formatDate(invoice.issueDate)}</div>
          <div className="text-[11px] text-slate-400">{formatTime(invoice.issueDate)}</div>
        </td>
        <td className="px-2 py-1.5 whitespace-nowrap">
          <div className="flex flex-col">
            <span className="text-sm font-bold text-slate-900 dark:text-white">{invoice.number}</span>
            {displayTag && <span className={`mt-1 inline-flex w-fit items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide ${getTagClasses(displayTag, highlightRow)}`}>{displayTag}</span>}
          </div>
        </td>
        <td className="px-2 py-1.5 text-right whitespace-nowrap">
          <span className="text-sm font-bold font-mono text-slate-900 dark:text-white">{val(invoice.totalValue)}</span>
        </td>
        <td className="px-2 py-1.5">
          {(() => { const n = getNick(invoice.senderCnpj, invoice.senderName); return n.full ? (<><div className="text-sm font-bold text-slate-900 dark:text-white">{n.display}</div><div className="text-[10px] text-slate-400 dark:text-slate-500">{n.full}</div></>) : (<span className="text-sm font-bold text-slate-900 dark:text-white">{n.display}</span>); })()}
        </td>
        <td className="px-2 py-1.5" onClick={(e) => e.stopPropagation()}>
          <RowActions invoiceId={invoice.id} accessKey={invoice.accessKey} onView={openModal} onDetails={openDetails} onViewProducts={openProducts} onDelete={canWrite ? confirmDelete : undefined} />
        </td>
      </tr>
    );
  };

  const renderMobileDivider = (key: string, label: string, count: number, mtotal: number) => (
    <div key={`mhdr-${key}`} className="cursor-pointer select-none" onClick={() => toggleGroup(key)}>
      <div className="flex items-center gap-2.5 px-2 py-2 rounded-lg bg-gradient-to-r from-slate-100 via-slate-100/70 to-transparent dark:from-slate-800/70 dark:via-slate-800/40 dark:to-transparent">
        <span className="material-symbols-outlined text-[16px] text-slate-400 dark:text-slate-500 transition-transform duration-200" style={{ transform: collapsedGroups.has(key) ? 'rotate(-90deg)' : 'rotate(0deg)' }}>expand_more</span>
        <span className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">{label}</span>
        <span className="text-xs text-slate-400 ml-1">· {count} {count === 1 ? 'item' : 'itens'}</span>
      </div>
    </div>
  );

  const renderMobileCard = (invoice: Invoice) => {
    const cfopTag = getCfopTagByCode(invoice.cfop);
    const displayTag = getReceivedTagLabel(cfopTag);
    const highlightRow = !isNeutralTag(displayTag);
    return (
      <div key={invoice.id} onClick={() => openProducts(invoice.id)} className={`border rounded-xl p-3 cursor-pointer ${highlightRow ? 'bg-amber-50/70 border-amber-200 dark:bg-amber-950/25 dark:border-amber-900/60' : 'bg-white dark:bg-card-dark border-slate-200 dark:border-slate-800'}`}>
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-bold text-slate-900 dark:text-white">
            {invoice.number}
            {displayTag && <span className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide ml-1.5 align-middle ${getTagClasses(displayTag, highlightRow)}`}>{displayTag === 'Consignação' ? 'Consig.' : displayTag}</span>}
          </span>
          <span className="text-xs font-bold text-slate-900 dark:text-white">{formatDate(invoice.issueDate)}</span>
        </div>
        <div className="flex items-center justify-between mb-1">
          <p className="text-xs font-bold text-slate-900 dark:text-white truncate">{getNick(invoice.senderCnpj, invoice.senderName).display}</p>
          <span className="text-[10px] text-slate-400 shrink-0 ml-2">{formatTime(invoice.issueDate)}</span>
        </div>
        <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100 dark:border-slate-800" onClick={(e) => e.stopPropagation()}>
          <span className="text-sm font-bold font-mono text-slate-900 dark:text-white">{val(invoice.totalValue)}</span>
          <RowActions invoiceId={invoice.id} accessKey={invoice.accessKey} onView={openModal} onDetails={openDetails} onViewProducts={openProducts} onDelete={canWrite ? confirmDelete : undefined} />
        </div>
      </div>
    );
  };

  const yearNavButtons = ([null, ...availableYears] as Array<number | null>).map((y) => (
    <button key={y ?? 'current'} onClick={() => selectYear(y)} className={`px-2.5 py-1 rounded-md text-xs font-bold transition-colors ${(y === null ? selectedYear === null : selectedYear === y) ? 'bg-primary text-white shadow-sm' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-700 dark:hover:text-slate-200'}`}>
      {y ?? new Date().getFullYear()}
    </button>
  ));

  return (
    <>
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="hidden sm:flex items-center gap-3 min-w-0">
          <span className="material-symbols-outlined text-[28px] text-primary flex-shrink-0">receipt_long</span>
          <div className="min-w-0">
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">NF-e Recebidas</h2>
            <p className="text-slate-500 dark:text-slate-400 text-xs font-medium">Notas fiscais eletrônicas recebidas</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setHideValues(v => !v)}
            className="hidden sm:flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-card-dark border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 transition-colors shadow-sm"
            title={hideValues ? 'Mostrar valores' : 'Ocultar valores'}
          >
            <span className="material-symbols-outlined text-[20px]">{hideValues ? 'visibility' : 'visibility_off'}</span>
          </button>
          <button onClick={handleExport} disabled={invoices.length === 0} className="hidden sm:flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-card-dark border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 transition-colors shadow-sm disabled:opacity-40">
            <span className="material-symbols-outlined text-[20px]">download</span>
            Exportar
          </button>
        </div>
      </div>

      {/* Filters */}
      <MobileFilterWrapper activeFilterCount={[search, tagFilter, dateFrom, dateTo].filter(Boolean).length}>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 items-end">
          <div className="lg:col-span-2">
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">CNPJ / Nome Emitente</label>
            <input type="text" placeholder="ex: 00.000.000/0001-91" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} className="block w-full px-3 py-2.5 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-900/50 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary text-sm transition-all" />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Data Início</label>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="block w-full px-3 py-2.5 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-900/50 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary text-sm transition-all" />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Data Fim</label>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="block w-full px-3 py-2.5 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-900/50 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary text-sm transition-all" />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Tipo de NF-e</label>
            <select value={tagFilter} onChange={(e) => setTagFilter(e.target.value)} className="block w-full px-3 py-2.5 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-900/50 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary text-sm transition-all">
              <option value="">Todos</option>
              {getCfopTagOptions().map((tag) => <option key={tag} value={tag}>{getReceivedTagLabel(tag)}</option>)}
            </select>
          </div>
          <div className="flex gap-2">
            <button onClick={() => loadInvoices()} className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-primary to-primary-dark text-white rounded-lg text-sm font-bold transition-all shadow-md shadow-primary/30">
              <span className="material-symbols-outlined text-[20px]">filter_alt</span>
              Aplicar
            </button>
            <button onClick={clearFilters} className="px-3 py-2.5 text-slate-500 hover:text-slate-700 text-sm font-medium transition-colors">Limpar</button>
          </div>
        </div>
      </MobileFilterWrapper>

      {/* Bulk Actions Bar */}
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 sm:gap-4 px-3 sm:px-4 py-3 bg-primary/5 border border-primary/20 rounded-xl">
          <span className="text-xs sm:text-sm font-bold text-primary">{selected.size} selecionado(s)</span>
          <div className="hidden sm:block h-4 w-px bg-slate-300"></div>
          <button onClick={handleBulkDownloadXml} className="flex items-center gap-1 text-xs sm:text-sm font-medium text-slate-600 hover:text-primary transition-colors"><span className="material-symbols-outlined text-[16px] sm:text-[18px]">download</span>XML</button>
          <button onClick={handleBulkDownloadPdf} className="flex items-center gap-1 text-xs sm:text-sm font-medium text-slate-600 hover:text-primary transition-colors"><span className="material-symbols-outlined text-[16px] sm:text-[18px]">picture_as_pdf</span>PDF</button>
          <button onClick={() => toast.info('Manifestação em lote ainda não implementada.')} className="flex items-center gap-1 text-xs sm:text-sm font-medium text-slate-600 hover:text-primary transition-colors"><span className="material-symbols-outlined text-[16px] sm:text-[18px]">fact_check</span>Manifestar</button>
          {canWrite && (<><div className="hidden sm:block h-4 w-px bg-slate-300"></div><button onClick={() => confirmDelete('bulk')} className="flex items-center gap-1 text-xs sm:text-sm font-medium text-red-500 hover:text-red-700 transition-colors"><span className="material-symbols-outlined text-[16px] sm:text-[18px]">delete</span>Excluir</button></>)}
        </div>
      )}

      {/* Mobile Cards */}
      <div className="sm:hidden space-y-2">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-white dark:bg-card-dark border border-slate-200 dark:border-slate-800 rounded-xl p-3 space-y-2">
              <Skeleton className="h-4 w-32" /><Skeleton className="h-3 w-48" /><Skeleton className="h-3 w-24" />
            </div>
          ))
        ) : invoices.length === 0 ? (
          <>
            <div className="bg-white dark:bg-card-dark border border-slate-200 dark:border-slate-800 rounded-xl p-8 text-center text-slate-400">
              <span className="material-symbols-outlined text-[48px] opacity-30">receipt_long</span>
              <p className="mt-2 text-sm font-medium">Nenhuma NF-e encontrada</p>
            </div>
            <div className="flex items-center gap-1 pt-2">
              <span className="text-xs text-slate-400 mr-1">Ano:</span>
              {yearNavButtons}
            </div>
          </>
        ) : (
          <>
            {selectedYear !== null ? (
              yearMonths.map(mg => (
                <React.Fragment key={mg.key}>
                  {renderMobileDivider(mg.key, mg.label, mg.count, mg.total)}
                  {!collapsedGroups.has(mg.key) && mg.invoices.map(renderMobileCard)}
                </React.Fragment>
              ))
            ) : (
              <>
                {renderMobileDivider('esta_semana', 'Esta semana', nfeGroups.estaSemana.length, nfeGroups.estaSemanaTotal)}
                {!collapsedGroups.has('esta_semana') && nfeGroups.estaSemana.map(renderMobileCard)}

                {nfeGroups.semanaPassada.length > 0 && (<>
                  {renderMobileDivider('semana_passada', 'Semana passada', nfeGroups.semanaPassada.length, nfeGroups.semanaPassadaTotal)}
                  {!collapsedGroups.has('semana_passada') && nfeGroups.semanaPassada.map(renderMobileCard)}
                </>)}

                {nfeGroups.currentYearMonths.map(mg => (
                  <React.Fragment key={mg.key}>
                    {renderMobileDivider(mg.key, mg.label, mg.count, mg.total)}
                    {!collapsedGroups.has(mg.key) && mg.invoices.map(renderMobileCard)}
                  </React.Fragment>
                ))}
              </>
            )}
            <div className="flex items-center gap-1 pt-3 mt-1 border-t border-slate-200 dark:border-slate-700">
              <span className="text-xs text-slate-400 mr-1">Ano:</span>
              {yearNavButtons}
            </div>
          </>
        )}
      </div>

      {/* Table (desktop) */}
      <div className="hidden sm:block bg-white dark:bg-card-dark border border-slate-200 dark:border-slate-800 rounded-xl shadow-lg shadow-slate-200/50 dark:shadow-none overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <caption className="sr-only">Lista de notas fiscais eletrônicas recebidas</caption>
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800 text-xs uppercase text-slate-500 dark:text-slate-400 font-bold tracking-wider">
                <th className="px-2 py-2 w-px">
                  <input className="rounded border-slate-300 text-primary focus:ring-primary bg-white dark:bg-slate-800 dark:border-slate-600 w-4 h-4 cursor-pointer" type="checkbox" checked={selected.size === invoices.length && invoices.length > 0} onChange={toggleSelectAll} />
                </th>
                <th className="px-2 py-2 w-px whitespace-nowrap cursor-pointer group hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" onClick={() => handleSort('emission')}><div className="flex items-center gap-1">Emissão {getSortIcon('emission')}</div></th>
                <th className="px-2 py-2 w-px whitespace-nowrap cursor-pointer group hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" onClick={() => handleSort('number')}><div className="flex items-center gap-1">Número {getSortIcon('number')}</div></th>
                <th className="px-2 py-2 w-px whitespace-nowrap text-right cursor-pointer group hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" onClick={() => handleSort('value')}><div className="flex items-center justify-end gap-1">Valor {getSortIcon('value')}</div></th>
                <th className="px-2 py-2 cursor-pointer group hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" onClick={() => handleSort('sender')}><div className="flex items-center gap-1">Emitente {getSortIcon('sender')}</div></th>
                <th className="px-2 py-2 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    <td className="px-2 py-1.5"><Skeleton className="h-4 w-4" /></td>
                    <td className="px-2 py-1.5"><Skeleton className="h-4 w-16" /><Skeleton className="h-3 w-10 mt-1" /></td>
                    <td className="px-2 py-1.5"><Skeleton className="h-4 w-12" /></td>
                    <td className="px-2 py-1.5 text-right"><Skeleton className="h-4 w-20 ml-auto" /></td>
                    <td className="px-2 py-1.5"><Skeleton className="h-4 w-32" /></td>
                    <td className="px-2 py-1.5"><Skeleton className="h-4 w-16 mx-auto" /></td>
                  </tr>
                ))
              ) : invoices.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-400">
                    <span className="material-symbols-outlined text-[48px] opacity-30">receipt_long</span>
                    <p className="mt-2 text-sm font-medium">Nenhuma NF-e encontrada</p>
                    <Link href="/sistema/upload" className="inline-flex items-center gap-2 mt-4 px-4 py-2 bg-primary text-white rounded-lg text-sm font-bold shadow-md shadow-primary/30">
                      <span className="material-symbols-outlined text-[18px]">cloud_upload</span>
                      Importar XML
                    </Link>
                  </td>
                </tr>
              ) : selectedYear !== null ? (
                yearMonths.map(mg => (
                  <React.Fragment key={mg.key}>
                    {renderGroupDivider(mg.key, mg.label, mg.count, mg.total)}
                    {!collapsedGroups.has(mg.key) && mg.invoices.map(renderInvoiceRow)}
                  </React.Fragment>
                ))
              ) : (
                <>
                  {renderGroupDivider('esta_semana', 'Esta semana', nfeGroups.estaSemana.length, nfeGroups.estaSemanaTotal)}
                  {!collapsedGroups.has('esta_semana') && nfeGroups.estaSemana.map(renderInvoiceRow)}

                  {nfeGroups.semanaPassada.length > 0 && (<>
                    {renderGroupDivider('semana_passada', 'Semana passada', nfeGroups.semanaPassada.length, nfeGroups.semanaPassadaTotal)}
                    {!collapsedGroups.has('semana_passada') && nfeGroups.semanaPassada.map(renderInvoiceRow)}
                  </>)}

                  {nfeGroups.currentYearMonths.map(mg => (
                    <React.Fragment key={mg.key}>
                      {renderGroupDivider(mg.key, mg.label, mg.count, mg.total)}
                      {!collapsedGroups.has(mg.key) && mg.invoices.map(renderInvoiceRow)}
                    </React.Fragment>
                  ))}
                </>
              )}
            </tbody>
          </table>
        </div>

        {/* Footer with year navigation */}
        <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/30 dark:bg-slate-800/20">
          <div className="flex items-center gap-1">
            <span className="text-xs text-slate-400 mr-1.5">Ano:</span>
            {yearNavButtons}
          </div>
          <span className="text-xs text-slate-500">{total} nota(s)</span>
        </div>
      </div>

      <InvoiceDetailsModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} invoiceId={selectedInvoiceId} />
      <NfeDetailsModal isOpen={isDetailsOpen} onClose={() => setIsDetailsOpen(false)} invoiceId={detailsInvoiceId} initialTab={detailsInitialTab} />
      <ConfirmDialog
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={handleDelete}
        title="Excluir notas fiscais"
        message={deleteTarget === 'bulk' ? `Tem certeza que deseja excluir ${selected.size} nota(s) selecionada(s)? Esta ação não pode ser desfeita.` : 'Tem certeza que deseja excluir esta nota fiscal? Esta ação não pode ser desfeita.'}
        confirmLabel="Excluir"
        confirmVariant="danger"
      />
    </>
  );
}
