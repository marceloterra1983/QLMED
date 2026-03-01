'use client';

import React, { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import dynamic from 'next/dynamic';
const InvoiceDetailsModal = dynamic(() => import('@/components/InvoiceDetailsModal'), { ssr: false });
const NfeDetailsModal = dynamic(() => import('@/components/NfeDetailsModal'), { ssr: false });
import Skeleton from '@/components/ui/Skeleton';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { formatDate, formatTime, formatCurrency } from '@/lib/utils';
import RowActions from '@/components/ui/RowActions';
import MobileFilterWrapper from '@/components/ui/MobileFilterWrapper';
import { getCfopTagByCode, getCfopTagOptions } from '@/lib/cfop';
import { downloadFileFromRequest, downloadFileFromUrl } from '@/lib/client-download';
import type { Invoice } from '@/types';
import { useRole } from '@/hooks/useRole';

const AUTO_REFRESH_MS = 5_000;

const MONTH_NAMES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const _p2 = (n: number) => String(n).padStart(2, '0');

type MonthGroup = { key: string; label: string; invoices: Invoice[]; total: number; count: number };
type YearGroup = { year: number; key: string; months: MonthGroup[]; total: number; count: number };
type NfeHierarchy = { estaSemana: Invoice[]; semanaPassada: Invoice[]; currentYearMonths: MonthGroup[]; previousYears: YearGroup[] };

function buildNfeGroups(invoices: Invoice[]): NfeHierarchy {
  const now = new Date();
  const dow = now.getDay();
  const dfm = dow === 0 ? 6 : dow - 1;
  const ws = new Date(now); ws.setDate(now.getDate() - dfm);
  const we = new Date(ws); we.setDate(ws.getDate() + 6);
  const pwe = new Date(ws); pwe.setDate(ws.getDate() - 1);
  const pws = new Date(pwe); pws.setDate(pwe.getDate() - 6);
  const ts = (d: Date) => `${d.getFullYear()}-${_p2(d.getMonth() + 1)}-${_p2(d.getDate())}`;
  const [wsS, weS, pwsS, pweS] = [ts(ws), ts(we), ts(pws), ts(pwe)];
  const cy = now.getFullYear();
  const es: Invoice[] = [], sp: Invoice[] = [];
  const mm = new Map<string, Invoice[]>();
  const ym = new Map<number, Map<string, Invoice[]>>();
  for (const inv of invoices) {
    const d = (inv.issueDate || '').substring(0, 10);
    const yr = parseInt(d.substring(0, 4));
    const mo = d.substring(0, 7);
    if (d >= wsS && d <= weS) es.push(inv);
    else if (d >= pwsS && d <= pweS) sp.push(inv);
    else if (yr === cy) { if (!mm.has(mo)) mm.set(mo, []); mm.get(mo)!.push(inv); }
    else if (!isNaN(yr) && yr > 1900) { if (!ym.has(yr)) ym.set(yr, new Map()); const y2 = ym.get(yr)!; if (!y2.has(mo)) y2.set(mo, []); y2.get(mo)!.push(inv); }
  }
  const toMG = (mo: string, invs: Invoice[]): MonthGroup => {
    const [y, m] = mo.split('-');
    return { key: `mes_${mo}`, label: `${MONTH_NAMES[parseInt(m) - 1]}/${y}`, invoices: invs, total: invs.reduce((s, i) => s + i.totalValue, 0), count: invs.length };
  };
  const cym = Array.from(mm.keys()).sort((a, b) => b.localeCompare(a)).map(m => toMG(m, mm.get(m)!));
  const py = Array.from(ym.keys()).sort((a, b) => b - a).map(yr => {
    const ms = Array.from(ym.get(yr)!.keys()).sort((a, b) => b.localeCompare(a)).map(m => toMG(m, ym.get(yr)!.get(m)!));
    return { year: yr, key: `year_${yr}`, months: ms, total: ms.reduce((s, m) => s + m.total, 0), count: ms.reduce((s, m) => s + m.count, 0) };
  });
  return { estaSemana: es, semanaPassada: sp, currentYearMonths: cym, previousYears: py };
}

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
  const [showOlderYears, setShowOlderYears] = useState(false);
  const [nicknames, setNicknames] = useState<Map<string, string>>(new Map());

  const isVendaTag = (tag?: string | null) => tag === 'Venda';
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
    const timer = setInterval(() => {
      loadInvoices({ silent: true });
    }, AUTO_REFRESH_MS);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, tagFilter, dateFrom, dateTo, sortBy, sortOrder]);

  const handleExport = () => {
    const headers = ['Numero', 'Chave', 'Destinatario', 'Data', 'Valor', 'Status'];
    const rows = invoices.map(inv => [inv.number, inv.accessKey, inv.recipientName, formatDate(inv.issueDate), inv.totalValue, inv.status]);
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

  async function loadInvoices(options?: { silent?: boolean }) {
    const silent = options?.silent ?? false;
    if (!silent) setLoading(true);
    try {
      const params = new URLSearchParams({ page: '1', limit: '2000' });
      if (search) params.set('search', search);
      if (tagFilter) params.set('cfopTag', tagFilter);
      if (dateFrom) params.set('dateFrom', dateFrom);
      if (dateTo) params.set('dateTo', dateTo);
      params.set('type', 'NFE');
      params.set('direction', 'issued');
      params.set('sort', sortBy);
      params.set('order', sortOrder);

      const res = await fetch(`/api/invoices?${params}`);
      if (res.ok) {
        const data = await res.json();
        const loaded: Invoice[] = data.invoices || [];
        setInvoices(loaded);
        setTotal(data.pagination?.total || 0);
        if (!collapsedInitialized && loaded.length > 0) {
          const groups = buildNfeGroups(loaded);
          const toCollapse = new Set<string>();
          if (groups.semanaPassada.length > 0) toCollapse.add('semana_passada');
          for (const mg of groups.currentYearMonths) toCollapse.add(mg.key);
          for (const yg of groups.previousYears) { toCollapse.add(yg.key); for (const mg of yg.months) toCollapse.add(mg.key); }
          setCollapsedGroups(toCollapse);
          setCollapsedInitialized(true);
        }
        const cnpjs = Array.from(new Set(loaded.map((inv) => inv.recipientCnpj).filter(Boolean)));
        if (cnpjs.length > 0) {
          const p = new URLSearchParams(); cnpjs.forEach((c) => p.append('cnpjs', c));
          const nr = await fetch(`/api/contacts/nickname/batch?${p}`);
          if (nr.ok) { const nd = await nr.json(); setNicknames(new Map(Object.entries(nd.nicknames || {}))); }
        } else { setNicknames(new Map()); }
      } else if (!silent) { toast.error('Erro ao carregar notas emitidas'); }
    } catch { if (!silent) toast.error('Erro ao carregar notas emitidas'); }
    finally { if (!silent) setLoading(false); }
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

  const clearFilters = () => { setSearchInput(''); setSearch(''); setTagFilter(''); setDateFrom(''); setDateTo(''); };

  const getNick = (cnpj: string | null | undefined, name: string | null | undefined) => {
    const full = (name || '').trim() || '-';
    if (!cnpj) return { display: full, full: null };
    const nick = nicknames.get(cnpj);
    if (nick) return { display: nick, full };
    const isCpf = cnpj.replace(/\D/g, '').length === 11;
    return isCpf ? { display: 'PARTICULAR', full } : { display: full, full: null };
  };

  const nfeGroups = useMemo(() => buildNfeGroups(invoices), [invoices]);
  const visiblePreviousYears = showOlderYears ? nfeGroups.previousYears : nfeGroups.previousYears.slice(0, 2);
  const hasOlderYears = nfeGroups.previousYears.length > 2;

  const renderGroupDivider = (key: string, label: string, count: number, gtotal: number, indent = false) => (
    <tr key={`hdr-${key}`} className="cursor-pointer select-none" onClick={() => toggleGroup(key)}>
      <td colSpan={6} className={`px-4 py-2 border-y ${indent ? 'bg-slate-50/80 dark:bg-slate-800/30 border-slate-100 dark:border-slate-700/50' : 'bg-slate-100/80 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700'}`}>
        <div className={`flex items-center gap-2 ${indent ? 'pl-6' : ''}`}>
          <span className="material-symbols-outlined text-[16px] text-slate-400 transition-transform duration-200" style={{ transform: collapsedGroups.has(key) ? 'rotate(-90deg)' : 'rotate(0deg)' }}>expand_more</span>
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</span>
          <span className="text-xs text-slate-400">· {count} {count === 1 ? 'item' : 'itens'}</span>
          <span className="text-xs font-bold text-slate-500 dark:text-slate-400 ml-auto">{formatCurrency(gtotal)}</span>
        </div>
      </td>
    </tr>
  );

  const renderYearDivider = (key: string, label: string, count: number, ytotal: number) => (
    <tr key={`hdr-${key}`} className="cursor-pointer select-none" onClick={() => toggleGroup(key)}>
      <td colSpan={6} className="px-4 py-2.5 bg-slate-200/50 dark:bg-slate-700/40 border-y border-slate-300 dark:border-slate-600">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[16px] text-slate-500 transition-transform duration-200" style={{ transform: collapsedGroups.has(key) ? 'rotate(-90deg)' : 'rotate(0deg)' }}>expand_more</span>
          <span className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">{label}</span>
          <span className="text-xs text-slate-400">· {count} {count === 1 ? 'item' : 'itens'}</span>
          <span className="text-xs font-bold text-slate-500 dark:text-slate-400 ml-auto">{formatCurrency(ytotal)}</span>
        </div>
      </td>
    </tr>
  );

  const renderInvoiceRow = (invoice: Invoice) => {
    const cfopTag = getCfopTagByCode(invoice.cfop);
    const highlightRow = !isVendaTag(cfopTag);
    return (
      <tr key={invoice.id} className={`group transition-colors cursor-pointer ${highlightRow ? 'bg-amber-50/60 dark:bg-amber-950/20 hover:bg-amber-100/60 dark:hover:bg-amber-900/30' : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'}`} onClick={() => openDetails(invoice.id)}>
        <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
          <input className="rounded border-slate-300 text-primary focus:ring-primary bg-white dark:bg-slate-800 dark:border-slate-600 w-4 h-4 cursor-pointer" type="checkbox" checked={selected.has(invoice.id)} onChange={() => toggleSelect(invoice.id)} />
        </td>
        <td className="px-3 py-2">
          <div className="text-sm font-medium text-slate-700 dark:text-slate-300">{formatDate(invoice.issueDate)}</div>
          <div className="text-[11px] text-slate-400">{formatTime(invoice.issueDate)}</div>
        </td>
        <td className="px-3 py-2">
          <div className="flex flex-col">
            <span className="text-sm font-bold text-slate-900 dark:text-white">{invoice.number}</span>
            {cfopTag && <span className={`mt-1 inline-flex w-fit items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide ${getTagClasses(cfopTag, highlightRow)}`}>{cfopTag}</span>}
          </div>
        </td>
        <td className="px-3 py-2 text-right">
          <span className="text-sm font-bold font-mono text-slate-900 dark:text-white">{formatCurrency(invoice.totalValue)}</span>
        </td>
        <td className="px-3 py-2">
          {(() => { const n = getNick(invoice.recipientCnpj, invoice.recipientName); return n.full ? (<><div className="text-sm font-bold text-slate-900 dark:text-white">{n.display}</div><div className="text-[10px] text-slate-400 dark:text-slate-500">{n.full}</div></>) : (<span className="text-sm font-bold text-slate-900 dark:text-white">{n.display}</span>); })()}
        </td>
        <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
          <RowActions invoiceId={invoice.id} accessKey={invoice.accessKey} onView={openModal} onDetails={openDetails} onViewProducts={openProducts} onDelete={canWrite ? confirmDelete : undefined} />
        </td>
      </tr>
    );
  };

  const renderMobileDivider = (key: string, label: string, count: number, mtotal: number, indent = false) => (
    <div key={`mhdr-${key}`} className="cursor-pointer select-none" onClick={() => toggleGroup(key)}>
      <div className={`flex items-center gap-2.5 px-2 py-2 rounded-lg ${indent ? 'bg-slate-50 dark:bg-slate-800/40 ml-4' : 'bg-gradient-to-r from-slate-100 via-slate-100/70 to-transparent dark:from-slate-800/70 dark:via-slate-800/40 dark:to-transparent'}`}>
        <span className="material-symbols-outlined text-[16px] text-slate-400 dark:text-slate-500 transition-transform duration-200" style={{ transform: collapsedGroups.has(key) ? 'rotate(-90deg)' : 'rotate(0deg)' }}>expand_more</span>
        <span className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">{label}</span>
        <span className="text-xs text-slate-400 ml-1">· {count} {count === 1 ? 'item' : 'itens'}</span>
        <span className="text-xs font-bold text-slate-500 dark:text-slate-400 ml-auto">{formatCurrency(mtotal)}</span>
      </div>
    </div>
  );

  const renderMobileYearDivider = (key: string, label: string, count: number, ytotal: number) => (
    <div key={`myhdr-${key}`} className="cursor-pointer select-none" onClick={() => toggleGroup(key)}>
      <div className="flex items-center gap-2.5 px-2 py-2 bg-gradient-to-r from-slate-200 via-slate-200/70 to-transparent dark:from-slate-700/80 dark:via-slate-700/40 dark:to-transparent rounded-lg">
        <span className="material-symbols-outlined text-[16px] text-slate-500 dark:text-slate-400 transition-transform duration-200" style={{ transform: collapsedGroups.has(key) ? 'rotate(-90deg)' : 'rotate(0deg)' }}>expand_more</span>
        <span className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200">{label}</span>
        <span className="text-xs text-slate-400 ml-1">· {count} {count === 1 ? 'item' : 'itens'}</span>
        <span className="text-xs font-bold text-slate-500 dark:text-slate-400 ml-auto">{formatCurrency(ytotal)}</span>
      </div>
    </div>
  );

  const renderMobileCard = (invoice: Invoice) => {
    const cfopTag = getCfopTagByCode(invoice.cfop);
    const highlightRow = !isVendaTag(cfopTag);
    return (
      <div key={invoice.id} className={`border rounded-xl p-3 ${highlightRow ? 'bg-amber-50/70 border-amber-200 dark:bg-amber-950/25 dark:border-amber-900/60' : 'bg-white dark:bg-card-dark border-slate-200 dark:border-slate-800'}`}>
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-bold text-slate-900 dark:text-white">
            {cfopTag && <span className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide mr-1.5 align-middle ${getTagClasses(cfopTag, highlightRow)}`}>{cfopTag}</span>}
            Nº {invoice.number}
          </span>
          <div className="text-right">
            <p className="text-xs font-bold text-slate-900 dark:text-white">{formatDate(invoice.issueDate)}</p>
            <p className="text-[10px] text-slate-400">{formatTime(invoice.issueDate)}</p>
          </div>
        </div>
        <p className="text-xs font-bold text-slate-900 dark:text-white truncate">{getNick(invoice.recipientCnpj, invoice.recipientName).display}</p>
        <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100 dark:border-slate-800">
          <span className="text-sm font-bold font-mono text-slate-900 dark:text-white">{formatCurrency(invoice.totalValue)}</span>
          <RowActions invoiceId={invoice.id} accessKey={invoice.accessKey} onView={openModal} onDetails={openDetails} onViewProducts={openProducts} onDelete={canWrite ? confirmDelete : undefined} />
        </div>
      </div>
    );
  };

  return (
    <>
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="hidden sm:flex items-center gap-3 min-w-0">
          <span className="material-symbols-outlined text-[28px] text-primary flex-shrink-0">output</span>
          <div className="min-w-0">
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">NF-e Emitidas</h2>
            <p className="text-slate-500 dark:text-slate-400 text-xs font-medium">Notas fiscais emitidas pela empresa</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
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
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">CNPJ / Nome Destinatário</label>
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
              {getCfopTagOptions().map((tag) => <option key={tag} value={tag}>{tag}</option>)}
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
          <div className="bg-white dark:bg-card-dark border border-slate-200 dark:border-slate-800 rounded-xl p-8 text-center text-slate-400">
            <span className="material-symbols-outlined text-[48px] opacity-30">output</span>
            <p className="mt-2 text-sm font-medium">Nenhuma NF-e emitida encontrada</p>
          </div>
        ) : (
          <>
            {renderMobileDivider('esta_semana', 'Esta semana', nfeGroups.estaSemana.length, nfeGroups.estaSemana.reduce((s, i) => s + i.totalValue, 0))}
            {!collapsedGroups.has('esta_semana') && nfeGroups.estaSemana.map(renderMobileCard)}

            {nfeGroups.semanaPassada.length > 0 && (<>
              {renderMobileDivider('semana_passada', 'Semana passada', nfeGroups.semanaPassada.length, nfeGroups.semanaPassada.reduce((s, i) => s + i.totalValue, 0))}
              {!collapsedGroups.has('semana_passada') && nfeGroups.semanaPassada.map(renderMobileCard)}
            </>)}

            {nfeGroups.currentYearMonths.map(mg => (
              <React.Fragment key={mg.key}>
                {renderMobileDivider(mg.key, mg.label, mg.count, mg.total)}
                {!collapsedGroups.has(mg.key) && mg.invoices.map(renderMobileCard)}
              </React.Fragment>
            ))}

            {visiblePreviousYears.map(yg => (
              <React.Fragment key={yg.key}>
                {renderMobileYearDivider(yg.key, String(yg.year), yg.count, yg.total)}
                {!collapsedGroups.has(yg.key) && yg.months.map(mg => (
                  <React.Fragment key={mg.key}>
                    {renderMobileDivider(mg.key, mg.label, mg.count, mg.total, true)}
                    {!collapsedGroups.has(mg.key) && mg.invoices.map(renderMobileCard)}
                  </React.Fragment>
                ))}
              </React.Fragment>
            ))}

            {hasOlderYears && !showOlderYears && (
              <button onClick={() => setShowOlderYears(true)} className="w-full flex items-center justify-center gap-2 py-3 text-xs font-medium text-slate-400 hover:text-primary transition-colors">
                <span className="text-base leading-none tracking-widest">•••</span>
                <span>Mostrar anos anteriores ({nfeGroups.previousYears.slice(2).length} a mais)</span>
              </button>
            )}
          </>
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
                  <input className="rounded border-slate-300 text-primary focus:ring-primary bg-white dark:bg-slate-800 dark:border-slate-600 w-4 h-4 cursor-pointer" type="checkbox" checked={selected.size === invoices.length && invoices.length > 0} onChange={toggleSelectAll} />
                </th>
                <th className="px-3 py-2.5 cursor-pointer group hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" onClick={() => handleSort('emission')}><div className="flex items-center gap-1">Emissão {getSortIcon('emission')}</div></th>
                <th className="px-3 py-2.5 cursor-pointer group hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" onClick={() => handleSort('number')}><div className="flex items-center gap-1">Número {getSortIcon('number')}</div></th>
                <th className="px-3 py-2.5 text-right cursor-pointer group hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" onClick={() => handleSort('value')}><div className="flex items-center justify-end gap-1">Valor (R$) {getSortIcon('value')}</div></th>
                <th className="px-3 py-2.5 cursor-pointer group hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" onClick={() => handleSort('recipient')}><div className="flex items-center gap-1">Destinatário {getSortIcon('recipient')}</div></th>
                <th className="px-3 py-2.5 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
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
                    <Link href="/sistema/upload" className="inline-flex items-center gap-2 mt-4 px-4 py-2 bg-primary text-white rounded-lg text-sm font-bold shadow-md shadow-primary/30">
                      <span className="material-symbols-outlined text-[18px]">cloud_upload</span>
                      Importar XML
                    </Link>
                  </td>
                </tr>
              ) : (
                <>
                  {renderGroupDivider('esta_semana', 'Esta semana', nfeGroups.estaSemana.length, nfeGroups.estaSemana.reduce((s, i) => s + i.totalValue, 0))}
                  {!collapsedGroups.has('esta_semana') && nfeGroups.estaSemana.map(renderInvoiceRow)}

                  {nfeGroups.semanaPassada.length > 0 && (<>
                    {renderGroupDivider('semana_passada', 'Semana passada', nfeGroups.semanaPassada.length, nfeGroups.semanaPassada.reduce((s, i) => s + i.totalValue, 0))}
                    {!collapsedGroups.has('semana_passada') && nfeGroups.semanaPassada.map(renderInvoiceRow)}
                  </>)}

                  {nfeGroups.currentYearMonths.map(mg => (
                    <React.Fragment key={mg.key}>
                      {renderGroupDivider(mg.key, mg.label, mg.count, mg.total)}
                      {!collapsedGroups.has(mg.key) && mg.invoices.map(renderInvoiceRow)}
                    </React.Fragment>
                  ))}

                  {visiblePreviousYears.map(yg => (
                    <React.Fragment key={yg.key}>
                      {renderYearDivider(yg.key, String(yg.year), yg.count, yg.total)}
                      {!collapsedGroups.has(yg.key) && yg.months.map(mg => (
                        <React.Fragment key={mg.key}>
                          {renderGroupDivider(mg.key, mg.label, mg.count, mg.total, true)}
                          {!collapsedGroups.has(mg.key) && mg.invoices.map(renderInvoiceRow)}
                        </React.Fragment>
                      ))}
                    </React.Fragment>
                  ))}

                  {hasOlderYears && !showOlderYears && (
                    <tr>
                      <td colSpan={6} className="px-4 py-3 bg-slate-50/80 dark:bg-slate-800/20 border-t border-slate-200 dark:border-slate-700 text-center">
                        <button onClick={() => setShowOlderYears(true)} className="inline-flex items-center gap-2 text-xs font-medium text-slate-400 hover:text-primary transition-colors">
                          <span className="text-base leading-none tracking-widest">•••</span>
                          <span>Mostrar anos anteriores ({nfeGroups.previousYears.slice(2).length} a mais)</span>
                        </button>
                      </td>
                    </tr>
                  )}
                </>
              )}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-200 dark:border-slate-800 flex items-center bg-slate-50/30 dark:bg-slate-800/20">
          <span className="text-sm text-slate-500">{total} nota(s) fiscal(is) no total</span>
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
