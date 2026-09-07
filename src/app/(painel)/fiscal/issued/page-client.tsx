'use client';

import React, { useEffect, useState, useMemo, useRef } from 'react';
import EmptyState from '@/components/ui/EmptyState';
import Field from '@/components/ui/Field';
import { useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import dynamic from 'next/dynamic';
const InvoiceDetailsModal = dynamic(() => import('@/components/InvoiceDetailsModal'), { ssr: false });
const NfeDetailsModal = dynamic(() => import('@/components/NfeDetailsModal'), { ssr: false });
import Skeleton from '@/components/ui/Skeleton';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { formatDate, formatTime, formatAmount, FILTER_INPUT_CLS } from '@/lib/utils';
import { buildNfeGroups, buildYearMonths, splitNfeGroupsForDisplay } from '@/lib/nfe-groups';
import { defaultNfeCollapsedKeys, nfeCollapsibleMonthKeys, resolveCollapsedGroupsAfterFetch, dateGroupItemsVisible } from '@/lib/list-collapse';
import DateGroupHeader from '@/components/ui/DateGroupHeader';
import RelativeMonthGroupBody from '@/components/ui/RelativeMonthGroupBody';
import ListCount from '@/components/ui/ListCount';
import RowActions from '@/components/ui/RowActions';
import MobileFilterWrapper from '@/components/ui/MobileFilterWrapper';
import { getCfopTagByCode, getCfopTagOptions } from '@/lib/cfop';
import { issuedCancelTagLabel } from '@/lib/nfe-cancellation-label';
import { downloadFileFromRequest, downloadFileFromUrl } from '@/lib/client-download';
import type { Invoice } from '@/types';
import { useRole } from '@/hooks/useRole';
import PageHeader from '@/components/PageHeader';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import SortableTh from '@/components/ui/SortableTh';
import Highlight from '@/components/ui/Highlight';

const AUTO_REFRESH_MS = 30_000;

export default function IssuedInvoicesPage() {
  const { canWrite } = useRole();
  const searchParams = useSearchParams();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [dateFrom, setDateFrom] = useState(() => searchParams.get('from') || `${new Date().getFullYear()}-01-01`);
  const [dateTo, setDateTo] = useState(() => searchParams.get('to') || '');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [total, setTotal] = useState(0);
  const [sortBy, setSortBy] = useState('emission');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<'bulk' | string | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [detailsInvoiceId, setDetailsInvoiceId] = useState<string | null>(null);
  const [detailsInitialTab, setDetailsInitialTab] = useState<string | undefined>(undefined);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const collapsedInitializedRef = useRef(false);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [availableYears, setAvailableYears] = useState<number[]>([]);
  const [nicknames, setNicknames] = useState<Map<string, string>>(new Map());
  const nicknamesRef = useRef<Map<string, string>>(new Map());
  const abortControllerRef = useRef<AbortController | null>(null);
  const [hideValues, setHideValues] = useState(false);
  const watermarkEtagRef = useRef<string | null>(null);
  const loadInvoicesRef = useRef(loadInvoices);
  useEffect(() => {
    loadInvoicesRef.current = loadInvoices;
  });

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

  const selectYear = (year: number | null) => {
    const cy = new Date().getFullYear();
    if (year === null) { setDateFrom(`${cy}-01-01`); setDateTo(''); }
    else { setDateFrom(`${year}-01-01`); setDateTo(`${year}-12-31`); }
    setSelectedYear(year);
    collapsedInitializedRef.current = false;
    setSelected(new Set());
  };

  const openModal = (id: string) => { setSelectedInvoiceId(id); setIsModalOpen(true); };
  const openDetails = (id: string) => { setDetailsInvoiceId(id); setDetailsInitialTab('produtos'); setIsDetailsOpen(true); };
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
    watermarkEtagRef.current = null;
    const timer = setInterval(async () => {
      // If user is searching or viewing a single year, query watermark for that slice
      const query = new URLSearchParams();
      if (dateFrom) query.set('dateFrom', dateFrom);
      if (dateTo) query.set('dateTo', dateTo);
      query.set('type', 'NFE');
      query.set('direction', 'issued');

      try {
        const headers: HeadersInit = {};
        if (watermarkEtagRef.current) {
          headers['If-None-Match'] = watermarkEtagRef.current;
        }
        const res = await fetch(`/api/invoices/watermark?${query.toString()}`, {
          cache: 'no-store',
          headers,
        });

        if (res.status === 304) {
          // Unchanged - zero bandwidth, zero re-render!
          return;
        }

        if (res.ok) {
          watermarkEtagRef.current = res.headers.get('etag');
          const data = await res.json();
          if (data.changed) {
            loadInvoicesRef.current({ silent: true });
          }
        }
      } catch {
        // Silent catch on poll
      }
    }, AUTO_REFRESH_MS);
    return () => clearInterval(timer);
  }, [dateFrom, dateTo]);

  useEffect(() => {
    const cy = new Date().getFullYear();
    fetch('/api/invoices/years?type=NFE&direction=issued')
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (Array.isArray(d?.years)) {
          setAvailableYears(d.years.filter((y: number) => y !== cy));
        }
      })
      .catch(() => {});
  }, []);

  const handleExport = () => {
    const headers = ['Numero', 'Chave', 'Destinatario', 'Convenio', 'Paciente', 'Medico', 'Data', 'Valor', 'Status'];
    const rows = invoices.map(inv => [inv.number, inv.accessKey, inv.recipientName, inv.convenioName ?? '', inv.patientName ?? '', inv.doctorName ?? '', formatDate(inv.issueDate), inv.totalValue, inv.status]);
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
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    if (!silent) setLoading(true);
    try {
      const params = new URLSearchParams({ page: '1', limit: '5000' });
      if (search) params.set('search', search);
      // Datas sempre aplicadas quando preenchidas — busca não anula o período
      // (só "Buscar em todos os anos" limpa dateFrom/dateTo).
      if (dateFrom) params.set('dateFrom', dateFrom);
      if (dateTo) params.set('dateTo', dateTo);
      if (tagFilter) params.set('cfopTag', tagFilter);
      params.set('type', 'NFE');
      params.set('direction', 'issued');
      params.set('sort', sortBy);
      params.set('order', sortOrder);

      const res = await fetch(`/api/invoices?${params}`, { signal: controller.signal });
      if (res.ok) {
        const data = await res.json();
        const loaded: Invoice[] = data.invoices || [];
        setInvoices(loaded);
        setTotal(data.pagination?.total || 0);
        if (loaded.length > 0) {
          const collapse = resolveCollapsedGroupsAfterFetch({
            preserve: silent,
            resetToExpanded: Boolean(search) && !silent,
            alreadyInitialized: collapsedInitializedRef.current,
            defaultCollapsed: defaultNfeCollapsedKeys(loaded, selectedYear),
          });
          if (collapse.collapsed) setCollapsedGroups(collapse.collapsed);
          collapsedInitializedRef.current = collapse.initialized;
        }
        const allCnpjs = Array.from(new Set(loaded.map((inv) => inv.recipientCnpj).filter((c): c is string => Boolean(c))));
        const missingCnpjs = allCnpjs.filter((c) => !nicknamesRef.current.has(c));
        if (missingCnpjs.length > 0) {
          const p = new URLSearchParams(); missingCnpjs.forEach((c) => p.append('cnpjs', c));
          const nr = await fetch(`/api/contacts/nickname/batch?${p}`, { signal: controller.signal });
          if (nr.ok) {
            const nd = await nr.json();
            setNicknames((prev) => {
              const next = new Map(prev);
              for (const [cnpj, nick] of Object.entries(nd.nicknames || {})) {
                next.set(cnpj, nick as string);
              }
              nicknamesRef.current = next;
              return next;
            });
          }
        }
      } else if (!silent) { toast.error('Erro ao carregar notas emitidas'); }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return;
      if (!silent) toast.error('Erro ao carregar notas emitidas');
    }
    finally {
      if (abortControllerRef.current === controller) {
        if (!silent) setLoading(false);
      }
    }
  }

  const handleSort = (field: string) => {
    if (sortBy === field) setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    else { setSortBy(field); setSortOrder('desc'); }
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
  const hasDateFilter = Boolean(dateFrom || dateTo || selectedYear !== null);
  const handleSearchAllYears = () => {
    setDateFrom('');
    setDateTo('');
    setSelectedYear(null);
  };

  const getNick = (cnpj: string | null | undefined, name: string | null | undefined) => {
    const full = (name || '').trim() || '-';
    if (!cnpj) return { display: full, full: null };
    const nick = nicknames.get(cnpj);
    if (nick) return { display: nick, full };
    const isCpf = cnpj.replace(/\D/g, '').length === 11;
    return isCpf ? { display: 'PARTICULAR', full } : { display: full, full: null };
  };

  const nfeGroups = useMemo(() => buildNfeGroups(invoices), [invoices]);
  const nfeDisplay = useMemo(() => splitNfeGroupsForDisplay(nfeGroups), [nfeGroups]);
  const yearMonths = useMemo(() => selectedYear !== null ? buildYearMonths(invoices) : [], [invoices, selectedYear]);

  const val = (amount: number) => hideValues
    ? <span className="tracking-widest text-slate-500 dark:text-slate-400 select-none">••••</span>
    : <>{formatAmount(amount)}</>;

  const renderGroupDivider = (key: string, label: string, count: number, _gtotal: number) => (
    <DateGroupHeader
      key={`hdr-${key}`}
      groupKey={key}
      label={label}
      count={count}
      variant="table"
      colSpan={7}
      collapsed={collapsedGroups}
      onToggle={toggleGroup}
    />
  );

  const renderInvoiceRow = (invoice: Invoice) => {
    const cfopTag = getCfopTagByCode(invoice.cfop);
    const highlightRow = !isVendaTag(cfopTag);
    const cancelTag = issuedCancelTagLabel(invoice.cancelledAt);
    return (
      <tr key={invoice.id} className={`group transition-colors cursor-pointer ${highlightRow ? 'bg-amber-50/60 dark:bg-amber-950/20 hover:bg-amber-100/60 dark:hover:bg-amber-900/30' : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'}`} onClick={() => openDetails(invoice.id)}>
        <td className="px-2 py-3" onClick={(e) => e.stopPropagation()}>
          <input className="rounded border-slate-200 text-primary dark:text-blue-400 bg-white dark:bg-slate-800 dark:border-slate-700 w-4 h-4 cursor-pointer" type="checkbox" checked={selected.has(invoice.id)} onChange={() => toggleSelect(invoice.id)} aria-label={`Selecionar NF-e ${invoice.number}`} />
        </td>
        <td className="px-2 py-3 tabular-nums whitespace-nowrap">
          <div className="text-sm font-medium text-slate-700 dark:text-slate-300">{formatDate(invoice.issueDate)}</div>
          <div className="text-xs text-slate-500 dark:text-slate-400">{formatTime(invoice.issueDate)}</div>
        </td>
        <td className="px-2 py-3 tabular-nums whitespace-nowrap">
          <div className="flex flex-col">
            <Highlight text={invoice.number} query={search} className="text-sm font-bold text-slate-900 dark:text-white" />
            {cfopTag && <span className={`mt-1 inline-flex w-fit items-center px-2 py-0.5 rounded-lg text-xs font-bold uppercase tracking-wide ${getTagClasses(cfopTag, highlightRow)}`}>{cfopTag}</span>}
            {cancelTag && <span className="mt-1 inline-flex w-fit items-center px-2 py-0.5 rounded-lg text-xs font-bold uppercase tracking-wide bg-rose-200 text-rose-900 dark:bg-rose-500/30 dark:text-rose-100">{cancelTag}</span>}
          </div>
        </td>
        <td className="px-2 py-3 text-right tabular-nums whitespace-nowrap">
          <span className="text-sm font-bold font-mono text-slate-900 dark:text-white">{val(invoice.totalValue)}</span>
        </td>
        <td className="px-2 py-3">
          {(() => {
            const n = getNick(invoice.recipientCnpj, invoice.recipientName);
            return n.full ? (
              <>
                <Highlight text={n.display} query={search} className="block text-sm font-bold text-slate-900 dark:text-white" />
                <Highlight text={n.full} query={search} className="block text-xs text-slate-500 dark:text-slate-400" />
              </>
            ) : (
              <Highlight text={n.display} query={search} className="text-sm font-bold text-slate-900 dark:text-white" />
            );
          })()}
        </td>
        <td className="px-2 py-3">
          {(invoice.convenioName || invoice.patientName || invoice.doctorName) ? (
            <div className="flex min-w-0 flex-col gap-0.5">
              {invoice.convenioName ? (
                <Highlight text={invoice.convenioName} query={search} className="truncate text-xs font-medium text-slate-600 dark:text-slate-300" />
              ) : null}
              {invoice.patientName ? (
                <Highlight text={invoice.patientName} query={search} className="truncate text-sm font-medium text-slate-800 dark:text-slate-200" />
              ) : null}
              {invoice.doctorName ? (
                <Highlight text={invoice.doctorName} query={search} className="truncate text-xs leading-tight text-slate-500 dark:text-slate-400" />
              ) : null}
              {search && invoice.matchedProduct ? (
                <div className="mt-1 flex items-center gap-1 text-xs text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 rounded-lg border border-amber-200/60 dark:border-amber-900/60 w-fit">
                  <span className="material-symbols-outlined text-[13px]">inventory_2</span>
                  <span>Item: <Highlight text={invoice.matchedProduct} query={search} /></span>
                </div>
              ) : null}
            </div>
          ) : (
            <span className="text-xs text-slate-500 dark:text-slate-400">—</span>
          )}
        </td>
        <td className="px-2 py-3" onClick={(e) => e.stopPropagation()}>
          <RowActions invoiceId={invoice.id} accessKey={invoice.accessKey} onView={openModal} onDetails={openDetails} onViewProducts={openProducts} onDelete={canWrite ? confirmDelete : undefined} />
        </td>
      </tr>
    );
  };

  const renderMobileDivider = (key: string, label: string, count: number, _mtotal: number) => (
    <DateGroupHeader
      key={`mhdr-${key}`}
      groupKey={key}
      label={label}
      count={count}
      variant="mobile"
      collapsed={collapsedGroups}
      onToggle={toggleGroup}
    />
  );

  const renderMobileCard = (invoice: Invoice) => {
    const cfopTag = getCfopTagByCode(invoice.cfop);
    const highlightRow = !isVendaTag(cfopTag);
    const cancelTag = issuedCancelTagLabel(invoice.cancelledAt);
    return (
      <div key={invoice.id} onClick={() => openProducts(invoice.id)} className={`border rounded-xl p-3 cursor-pointer ${highlightRow ? 'bg-amber-50/70 border-amber-200 dark:bg-amber-950/25 dark:border-amber-900/60' : 'bg-white dark:bg-card-dark border-slate-200 dark:border-slate-800'}`}>
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-bold text-slate-900 dark:text-white">
            <Highlight text={invoice.number} query={search} />
            {cfopTag && <span className={`inline-flex items-center px-1.5 py-0.5 rounded-lg text-xs font-bold uppercase tracking-wide ml-1.5 align-middle ${getTagClasses(cfopTag, highlightRow)}`}>{cfopTag === 'Consignação' ? 'Consig.' : cfopTag}</span>}
            {cancelTag && <span className="inline-flex items-center px-1.5 py-0.5 rounded-lg text-xs font-bold uppercase tracking-wide ml-1.5 align-middle bg-rose-200 text-rose-900 dark:bg-rose-500/30 dark:text-rose-100">{cancelTag}</span>}
          </span>
          <span className="text-xs font-bold text-slate-900 dark:text-white">{formatDate(invoice.issueDate)}</span>
        </div>
        <div className="flex items-center justify-between mb-1">
          <Highlight text={getNick(invoice.recipientCnpj, invoice.recipientName).display} query={search} className="text-xs font-bold text-slate-900 dark:text-white truncate" />
          <span className="text-xs text-slate-500 dark:text-slate-400 shrink-0 ml-2">{formatTime(invoice.issueDate)}</span>
        </div>
        {(invoice.convenioName || invoice.patientName || invoice.doctorName) ? (
          <div className="mb-1 min-w-0 space-y-0.5">
            {invoice.convenioName ? (
              <Highlight text={invoice.convenioName} query={search} className="truncate text-xs font-medium text-slate-600 dark:text-slate-300" />
            ) : null}
            {invoice.patientName ? (
              <p className="truncate text-xs text-slate-700 dark:text-slate-200">
                <span className="font-semibold text-slate-500 dark:text-slate-400">Paciente:</span> <Highlight text={invoice.patientName} query={search} />
              </p>
            ) : null}
            {invoice.doctorName ? (
              <Highlight text={invoice.doctorName} query={search} className="truncate text-xs leading-tight text-slate-500 dark:text-slate-400" />
            ) : null}
            {search && invoice.matchedProduct ? (
              <div className="mt-1 flex items-center gap-1 text-xs text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 rounded-lg border border-amber-200/60 dark:border-amber-900/60 w-fit">
                <span className="material-symbols-outlined text-[13px]">inventory_2</span>
                <span>Item: <Highlight text={invoice.matchedProduct} query={search} /></span>
              </div>
            ) : null}
          </div>
        ) : null}
        <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100 dark:border-slate-800" onClick={(e) => e.stopPropagation()}>
          <span className="text-sm font-bold font-mono text-slate-900 dark:text-white">{val(invoice.totalValue)}</span>
          <RowActions invoiceId={invoice.id} accessKey={invoice.accessKey} onView={openModal} onDetails={openDetails} onViewProducts={openProducts} onDelete={canWrite ? confirmDelete : undefined} />
        </div>
      </div>
    );
  };

  const yearNavButtons = ([null, ...availableYears] as Array<number | null>).map((y) => (
    <button key={y ?? 'current'} onClick={() => selectYear(y)} aria-pressed={y === null ? selectedYear === null : selectedYear === y} className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors ${(y === null ? selectedYear === null : selectedYear === y) ? 'bg-primary text-white shadow-sm' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-700 dark:hover:text-slate-200'}`}>
      {y ?? new Date().getFullYear()}
    </button>
  ));

  return (
    <>
      <PageHeader
        icon="output"
        title="NF-e Emitidas"
        subtitle="Notas fiscais emitidas pela empresa"
        actions={(
          <>
            {canWrite && (
              <Button href="/fiscal/issued/nova" icon="post_add">
                Nova NF-e
              </Button>
            )}
            <Button
              onClick={() => setHideValues(v => !v)}
              variant="secondary"
              icon={hideValues ? 'visibility' : 'visibility_off'}
              title={hideValues ? 'Mostrar valores' : 'Ocultar valores'}
              aria-label={hideValues ? 'Mostrar valores' : 'Ocultar valores'}
              className="hidden sm:inline-flex"
            />
            <Button onClick={handleExport} disabled={invoices.length === 0} variant="secondary" icon="download" className="hidden sm:inline-flex">
              Exportar
            </Button>
          </>
        )}
      />

      {/* Filters */}
      <MobileFilterWrapper activeFilterCount={[search, tagFilter, dateFrom, dateTo].filter(Boolean).length}>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 items-end">
          <Field label="Buscar NF-e" className="lg:col-span-2">
            <div className="relative">
              <input
                type="text"
                placeholder="Número, CNPJ/CPF, paciente, convênio, médico, produto ou valor…"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className={`${FILTER_INPUT_CLS} pr-8`}
              />
              {searchInput ? (
                <button
                  type="button"
                  onClick={() => {
                    setSearchInput('');
                    setSearch('');
                  }}
                  aria-label="Limpar busca"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
                >
                  <span className="material-symbols-outlined text-[18px]">close</span>
                </button>
              ) : null}
            </div>
          </Field>
          <Field label="Data Início">
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className={FILTER_INPUT_CLS} />
          </Field>
          <Field label="Data Fim">
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className={FILTER_INPUT_CLS} />
          </Field>
          <Field label="Tipo de NF-e">
            <select value={tagFilter} onChange={(e) => setTagFilter(e.target.value)} className={FILTER_INPUT_CLS}>
              <option value="">Todos</option>
              {getCfopTagOptions().map((tag) => <option key={tag} value={tag}>{tag}</option>)}
            </select>
          </Field>
          <div className="flex gap-2">
            <Button onClick={() => loadInvoices()} icon="filter_alt" className="flex-1">
              Aplicar
            </Button>
            <button onClick={clearFilters} className="px-3 py-2.5 text-slate-500 hover:text-slate-700 text-sm font-medium transition-colors">Limpar</button>
          </div>
        </div>
      </MobileFilterWrapper>

      {/* Bulk Actions Bar */}
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 sm:gap-4 px-3 sm:px-4 py-3 bg-primary/5 border border-primary/20 rounded-xl">
          <span className="text-xs sm:text-sm font-bold text-primary dark:text-blue-400">{selected.size} selecionado(s)</span>
          <div className="hidden sm:block h-4 w-px bg-slate-300"></div>
          <button onClick={handleBulkDownloadXml} className="flex items-center gap-1 text-xs sm:text-sm font-medium text-slate-600 hover:text-primary dark:hover:text-blue-400 transition-colors"><span className="material-symbols-outlined text-[16px] sm:text-[18px]">download</span>XML</button>
          <button onClick={handleBulkDownloadPdf} className="flex items-center gap-1 text-xs sm:text-sm font-medium text-slate-600 hover:text-primary dark:hover:text-blue-400 transition-colors"><span className="material-symbols-outlined text-[16px] sm:text-[18px]">picture_as_pdf</span>PDF</button>
          {canWrite && (<><div className="hidden sm:block h-4 w-px bg-slate-300"></div><button onClick={() => confirmDelete('bulk')} className="flex items-center gap-1 text-xs sm:text-sm font-medium text-red-500 hover:text-red-700 transition-colors"><span className="material-symbols-outlined text-[16px] sm:text-[18px]">delete</span>Excluir</button></>)}
        </div>
      )}

      {/* Mobile Cards */}
      <div className="sm:hidden space-y-2">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <Card padding="sm" key={i} className="space-y-2">
              <Skeleton className="h-4 w-32" /><Skeleton className="h-3 w-48" /><Skeleton className="h-3 w-24" />
            </Card>
          ))
        ) : invoices.length === 0 ? (
          <>
            <Card padding="none">
              <EmptyState
                icon="output"
                title="Nenhuma NF-e emitida encontrada"
                hint={
                  search && hasDateFilter
                    ? `Nenhum resultado para "${search}" no período filtrado.`
                    : undefined
                }
                action={
                  search && hasDateFilter ? (
                    <Button
                      onClick={handleSearchAllYears}
                      variant="secondary"
                      size="sm"
                      icon="calendar_month"
                    >
                      Buscar em todos os anos
                    </Button>
                  ) : undefined
                }
              />
            </Card>
            <div className="flex items-center gap-1 pt-2">
              <span className="text-xs text-slate-500 dark:text-slate-400 mr-1">Ano:</span>
              {yearNavButtons}
            </div>
          </>
        ) : (
          <>
            {search ? (
              <>
                <div className="flex items-center gap-2 px-1 py-1.5 text-xs text-slate-500 dark:text-slate-400">
                  <span className="material-symbols-outlined text-[14px]">search</span>
                  <span>{invoices.length} resultado(s) para &ldquo;<span className="font-bold text-slate-700 dark:text-slate-200">{search}</span>&rdquo;{hasDateFilter ? ' no período' : ' em todos os anos'}</span>
                </div>
                {invoices.map(renderMobileCard)}
              </>
            ) : (
              <>
                {(() => {
                  const allKeys = nfeCollapsibleMonthKeys(invoices, selectedYear);
                  return allKeys.length > 0 ? (
                    <div className="flex justify-start gap-1.5 mb-2">
                      <button onClick={() => setCollapsedGroups(new Set(allKeys))} className="inline-flex items-center gap-0.5 text-xs font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"><span className="material-symbols-outlined text-[13px]">unfold_less</span>Recolher</button>
                      <button onClick={() => setCollapsedGroups(new Set())} className="inline-flex items-center gap-0.5 text-xs font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"><span className="material-symbols-outlined text-[13px]">unfold_more</span>Expandir</button>
                    </div>
                  ) : null;
                })()}
                {selectedYear !== null ? (
                  yearMonths.map(mg => (
                    <React.Fragment key={mg.key}>
                      {renderMobileDivider(mg.key, mg.label, mg.count, mg.total)}
                      {dateGroupItemsVisible(mg.key, collapsedGroups) && mg.invoices.map(renderMobileCard)}
                    </React.Fragment>
                  ))
                ) : (
                  <RelativeMonthGroupBody
                    split={nfeDisplay}
                    collapsed={collapsedGroups}
                    renderDivider={renderMobileDivider}
                    renderItem={renderMobileCard}
                  />
                )}
                <div className="flex items-center gap-1 pt-3 mt-1 border-t border-slate-200 dark:border-slate-700">
                  <span className="text-xs text-slate-500 dark:text-slate-400 mr-1">Ano:</span>
                  {yearNavButtons}
                </div>
              </>
            )}
          </>
        )}
      </div>

      {/* Table (desktop) */}
      <Card padding="none" className="hidden sm:block">
        {!loading && invoices.length > 0 && !search && (() => {
          const allKeys = nfeCollapsibleMonthKeys(invoices, selectedYear);
          return allKeys.length > 0 ? (
            <div className="flex justify-start gap-1.5 px-3 py-1.5 border-b border-slate-100 dark:border-slate-800">
              <button onClick={() => setCollapsedGroups(new Set(allKeys))} className="inline-flex items-center gap-0.5 text-xs font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"><span className="material-symbols-outlined text-[13px]">unfold_less</span>Recolher</button>
              <button onClick={() => setCollapsedGroups(new Set())} className="inline-flex items-center gap-0.5 text-xs font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"><span className="material-symbols-outlined text-[13px]">unfold_more</span>Expandir</button>
            </div>
          ) : null;
        })()}
        {search && !loading && invoices.length > 0 && (
          <div className="flex items-center gap-2 px-4 py-2 border-b border-slate-100 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
            <span className="material-symbols-outlined text-[14px]">search</span>
            <span>{invoices.length} resultado(s) para &ldquo;<span className="font-bold text-slate-700 dark:text-slate-200">{search}</span>&rdquo;{hasDateFilter ? ' no período' : ' em todos os anos'}, por emissão</span>
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <caption className="sr-only">Lista de notas fiscais eletrônicas emitidas</caption>
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800 text-xs uppercase text-slate-500 dark:text-slate-400 font-bold tracking-wider">
                <th className="px-2 py-2 w-px">
                  <input className="rounded border-slate-200 text-primary dark:text-blue-400 bg-white dark:bg-slate-800 dark:border-slate-700 w-4 h-4 cursor-pointer" type="checkbox" checked={selected.size === invoices.length && invoices.length > 0} onChange={toggleSelectAll} aria-label="Selecionar todas" />
                </th>
                <SortableTh col="emission" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} className="w-px whitespace-nowrap">Emissão</SortableTh>
                <SortableTh col="number" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} className="w-px whitespace-nowrap">Número</SortableTh>
                <SortableTh col="value" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} align="right" className="w-px whitespace-nowrap">Valor</SortableTh>
                <SortableTh col="recipient" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort}>Destinatário</SortableTh>
                <th className="px-2 py-2">Paciente</th>
                <th className="px-2 py-2 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    <td className="px-2 py-1.5"><Skeleton className="h-4 w-4" /></td>
                    <td className="px-2 py-1.5"><Skeleton className="h-4 w-20" /><Skeleton className="h-3 w-12 mt-1" /></td>
                    <td className="px-2 py-1.5"><Skeleton className="h-4 w-16" /></td>
                    <td className="px-2 py-1.5 text-right"><Skeleton className="h-4 w-20 ml-auto" /></td>
                    <td className="px-2 py-1.5"><Skeleton className="h-4 w-32" /></td>
                    <td className="px-2 py-1.5"><Skeleton className="h-3 w-20" /><Skeleton className="h-4 w-28 mt-1" /><Skeleton className="h-3 w-24 mt-1" /></td>
                    <td className="px-2 py-1.5"><Skeleton className="h-4 w-16 mx-auto" /></td>
                  </tr>
                ))
              ) : invoices.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12">
                    <EmptyState
                      compact
                      icon="output"
                      title="Nenhuma NF-e emitida encontrada"
                      hint={
                        search && hasDateFilter
                          ? `Nenhum resultado para "${search}" no período filtrado.`
                          : undefined
                      }
                      action={
                        search && hasDateFilter ? (
                          <Button
                            onClick={handleSearchAllYears}
                            variant="secondary"
                            size="sm"
                            icon="calendar_month"
                          >
                            Buscar em todos os anos
                          </Button>
                        ) : (
                          <Button href="/sistema/upload" icon="cloud_upload" variant="secondary" size="sm">Importar XML</Button>
                        )
                      }
                    />
                  </td>
                </tr>
              ) : search ? (
                invoices.map(renderInvoiceRow)
              ) : selectedYear !== null ? (
                yearMonths.map(mg => (
                  <React.Fragment key={mg.key}>
                    {renderGroupDivider(mg.key, mg.label, mg.count, mg.total)}
                    {dateGroupItemsVisible(mg.key, collapsedGroups) && mg.invoices.map(renderInvoiceRow)}
                  </React.Fragment>
                ))
              ) : (
                <RelativeMonthGroupBody
                  split={nfeDisplay}
                  collapsed={collapsedGroups}
                  renderDivider={renderGroupDivider}
                  renderItem={renderInvoiceRow}
                />
              )}
            </tbody>
          </table>
        </div>

        {/* Footer with year navigation */}
        <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/30 dark:bg-slate-800/20">
          {search ? (
            <span className="text-xs text-slate-500 dark:text-slate-400">Busca em todos os anos</span>
          ) : (
            <div className="flex items-center gap-1">
              <span className="text-xs text-slate-500 dark:text-slate-400 mr-1.5">Ano:</span>
              {yearNavButtons}
            </div>
          )}
          <ListCount shown={invoices.length} total={total} noun="nota(s)" />
        </div>
      </Card>

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
