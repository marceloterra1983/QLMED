'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import dynamic from 'next/dynamic';
const InvoiceDetailsModal = dynamic(() => import('@/components/InvoiceDetailsModal'), { ssr: false });
const CteDetailsModal = dynamic(() => import('@/components/CteDetailsModal'), { ssr: false });
import Skeleton from '@/components/ui/Skeleton';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import type { Invoice } from '@/types';
import { formatDate, formatTime, formatAmount, getDateGroupLabel } from '@/lib/utils';
import RowActions from '@/components/ui/RowActions';
import MobileFilterWrapper from '@/components/ui/MobileFilterWrapper';
import { downloadFileFromRequest, downloadFileFromUrl } from '@/lib/client-download';
import { useRole } from '@/hooks/useRole';

export default function CtePage() {
  const { canWrite } = useRole();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
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
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [collapsedInitialized, setCollapsedInitialized] = useState(false);
  const [nicknames, setNicknames] = useState<Map<string, string>>(new Map());
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [availableYears, setAvailableYears] = useState<number[]>([]);
  const [hideValues, setHideValues] = useState(true);

  const normalizeName = (value: string | null | undefined): string => (value || '').replace(/\s+/g, ' ').trim();

  const abbreviateQlMed = (value: string | null | undefined): string => {
    const normalized = normalizeName(value);
    if (!normalized) return '-';
    if (/\bQL\s*MED\b/i.test(normalized)) return 'QL MED';
    return normalized;
  };

  const getNick = (cnpj: string | null | undefined, fallbackName: string | null | undefined): { display: string; full: string | null } => {
    const full = abbreviateQlMed(fallbackName);
    if (!cnpj) return { display: full, full: null };
    const nick = nicknames.get(cnpj);
    if (nick) return { display: nick, full };
    const isCpf = cnpj.replace(/\D/g, '').length === 11;
    return isCpf ? { display: 'PARTICULAR', full } : { display: full, full: null };
  };

  const getFreightFlow = (invoice: Invoice): { remetente: string; remetenteFull: string | null; recebedor: string; recebedorFull: string | null } => {
    const rem = getNick(invoice.cteRemetenteCnpj, invoice.cteRemetenteName || '-');
    const rec = getNick(invoice.cteRecebedorCnpj, invoice.cteRecebedorName || '-');
    return { remetente: rem.display, remetenteFull: rem.full, recebedor: rec.display, recebedorFull: rec.full };
  };

  const openModal = (id: string) => {
    setSelectedInvoiceId(id);
    setIsModalOpen(true);
  };

  const openDetails = (id: string) => {
    setDetailsInvoiceId(id);
    setIsDetailsOpen(true);
  };

  const toggleGroup = (group: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  };

  const val = (amount: number) => hideValues
    ? <span className="tracking-widest text-slate-300 dark:text-slate-600 select-none">••••</span>
    : <>{formatAmount(amount)}</>;

  const selectYear = (year: number | null) => {
    const cy = new Date().getFullYear();
    if (year === null) { setDateFrom(`${cy}-01-01`); setDateTo(''); }
    else { setDateFrom(`${year}-01-01`); setDateTo(`${year}-12-31`); }
    setSelectedYear(year);
    setCollapsedInitialized(false);
    setSelected(new Set());
  };

  const yearNavButtons = ([null, ...availableYears] as Array<number | null>).map((y) => (
    <button key={y ?? 'current'} onClick={() => selectYear(y)} className={`px-2.5 py-1 rounded-md text-xs font-bold transition-colors ${(y === null ? selectedYear === null : selectedYear === y) ? 'bg-primary text-white shadow-sm' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-700 dark:hover:text-slate-200'}`}>
      {y ?? new Date().getFullYear()}
    </button>
  ));

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    loadInvoices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, statusFilter, dateFrom, dateTo, sortBy, sortOrder]);

  useEffect(() => {
    const cy = new Date().getFullYear();
    Promise.all([cy - 1, cy - 2, cy - 3, cy - 4].map(y =>
      fetch(`/api/invoices?limit=1&page=1&type=CTE&dateFrom=${y}-01-01&dateTo=${y}-12-31`)
        .then(r => r.ok ? r.json() : null)
        .then(d => (d?.pagination?.total ?? 0) > 0 ? y : null)
        .catch(() => null)
    )).then(res => setAvailableYears(res.filter((y): y is number => y !== null)));
  }, []);

	  const handleExport = () => {
    const headers = ['Numero', 'Chave', 'Emitente', 'Tomador', 'Data', 'Valor', 'Status'];
    const rows = invoices.map(inv => [
      inv.number,
      inv.accessKey,
      abbreviateQlMed(inv.senderName),
      abbreviateQlMed(inv.recipientName),
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

  const resolveBulkManifestAction = (): (
    | { targetStatus: 'rejected' | 'confirmed'; actionLabel: string }
    | { error: string }
    | null
  ) => {
    const selectedInvoices = invoices.filter((invoice) => selected.has(invoice.id));
    if (selectedInvoices.length === 0) return null;

    const allRejected = selectedInvoices.every((invoice) => invoice.status === 'rejected');
    const hasRejected = selectedInvoices.some((invoice) => invoice.status === 'rejected');

    if (hasRejected && !allRejected) {
      return { error: 'Selecione apenas CT-es no mesmo estágio para manifestar em lote.' };
    }

    if (allRejected) {
      return { targetStatus: 'confirmed', actionLabel: 'Cancelar desacordo' };
    }

    return { targetStatus: 'rejected', actionLabel: 'Registrar desacordo' };
  };

  const handleBulkManifest = async () => {
    if (selected.size === 0) return;

    const action = resolveBulkManifestAction();
    if (!action) return;
    if ('error' in action) {
      toast.error(action.error);
      return;
    }

    const ids = Array.from(selected);
    if (!window.confirm(`${action.actionLabel} para ${ids.length} CT-e(s) selecionado(s)?`)) {
      return;
    }

    try {
      const res = await fetch('/api/cte/manifest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, targetStatus: action.targetStatus }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data?.error || 'Falha ao manifestar CT-es selecionados.');
        return;
      }

      toast.success(`${action.actionLabel} aplicado em ${data.updated || 0} CT-e(s).`);
      if (data?.skipped > 0) {
        toast.info(`${data.skipped} item(ns) não elegível(is) foram ignorados.`);
      }
      if (data?.provider === 'local' && data?.providerNote) {
        toast.info(data.providerNote);
      }

      setSelected(new Set());
      loadInvoices();
    } catch {
      toast.error('Erro de rede ao manifestar CT-es.');
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
      const params = new URLSearchParams({ page: '1', limit: '2000' });
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
        const loaded: Invoice[] = data.invoices || [];
        setInvoices(loaded);
        setTotal(data.pagination?.total || 0);
        if (!collapsedInitialized && loaded.length > 0) {
          const groupOrder: string[] = [];
          for (const inv of loaded) {
            const g = getDateGroupLabel(inv.issueDate);
            if (g && !groupOrder.includes(g)) groupOrder.push(g);
          }
          const firstGroup = groupOrder[0];
          setCollapsedGroups(new Set(groupOrder.filter((g) => g !== firstGroup)));
          setCollapsedInitialized(true);
        }

        // Fetch nicknames for all CNPJs present in this page
        const cnpjSet = new Set<string>();
        for (const inv of loaded) {
          if (inv.senderCnpj) cnpjSet.add(inv.senderCnpj);
          if (inv.recipientCnpj) cnpjSet.add(inv.recipientCnpj);
          if (inv.cteRemetenteCnpj) cnpjSet.add(inv.cteRemetenteCnpj);
          if (inv.cteRecebedorCnpj) cnpjSet.add(inv.cteRecebedorCnpj);
        }
        if (cnpjSet.size > 0) {
          const params2 = new URLSearchParams();
          Array.from(cnpjSet).forEach((c) => params2.append('cnpjs', c));
          const nickRes = await fetch(`/api/contacts/nickname/batch?${params2}`);
          if (nickRes.ok) {
            const nickData = await nickRes.json();
            setNicknames(new Map(Object.entries(nickData.nicknames || {})));
          }
        } else {
          setNicknames(new Map());
        }
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
    selectYear(null);
  };

  const manifestAction = resolveBulkManifestAction();
  const manifestButtonLabel = manifestAction && !('error' in manifestAction)
    ? manifestAction.actionLabel
    : 'Manifestar';

  return (
    <>
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="hidden sm:flex items-center gap-3 min-w-0">
          <span className="material-symbols-outlined text-[28px] text-primary flex-shrink-0">local_shipping</span>
          <div className="min-w-0">
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">CT-e</h2>
            <p className="text-slate-500 dark:text-slate-400 text-xs font-medium">Conhecimentos de transporte eletrônicos</p>
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
          <button
            onClick={handleExport}
            disabled={invoices.length === 0}
            className="hidden sm:flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-card-dark border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 transition-colors shadow-sm disabled:opacity-40"
          >
            <span className="material-symbols-outlined text-[20px]">download</span>
            Exportar
          </button>
        </div>
      </div>

      {/* Filters */}
      <MobileFilterWrapper activeFilterCount={[search, statusFilter, dateFrom, dateTo].filter(Boolean).length}>
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
              onChange={(e) => setDateFrom(e.target.value)}
              className="block w-full px-3 py-2.5 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-900/50 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary text-sm transition-all"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Data Fim</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="block w-full px-3 py-2.5 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-900/50 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary text-sm transition-all"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Manifestação</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
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
              onClick={() => loadInvoices()}
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
            <button
              onClick={handleBulkManifest}
              className="flex items-center gap-1 text-xs sm:text-sm font-medium text-slate-600 hover:text-primary transition-colors"
            >
              <span className="material-symbols-outlined text-[16px] sm:text-[18px]">fact_check</span>
              <span className="hidden sm:inline">{manifestButtonLabel}</span>
              <span className="sm:hidden">Manifestar</span>
            </button>
          )}
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
            <span className="material-symbols-outlined text-[48px] opacity-30">local_shipping</span>
            <p className="mt-2 text-sm font-medium">Nenhum CT-e encontrado</p>
          </div>
        ) : (() => {
          let lastGroup = '';
          return invoices.map((invoice) => {
            const group = getDateGroupLabel(invoice.issueDate);
            const showDivider = group !== lastGroup;
            lastGroup = group;
            const flow = getFreightFlow(invoice);
            return (
              <React.Fragment key={invoice.id}>
                {showDivider && group && (
                  <div className="cursor-pointer select-none" onClick={() => toggleGroup(group)}>
                    <div className="flex items-center gap-2.5 px-2 py-2 bg-gradient-to-r from-slate-100 via-slate-100/70 to-transparent dark:from-slate-800/70 dark:via-slate-800/40 dark:to-transparent rounded-lg">
                      <span className="material-symbols-outlined text-[16px] text-slate-400 dark:text-slate-500 transition-transform duration-200" style={{ transform: collapsedGroups.has(group) ? 'rotate(-90deg)' : 'rotate(0deg)' }}>expand_more</span>
                      <span className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">{group}</span>
                    </div>
                  </div>
                )}
                {!collapsedGroups.has(group) && (
                  <div onClick={() => openDetails(invoice.id)} className="bg-white dark:bg-card-dark border border-slate-200 dark:border-slate-800 rounded-xl p-3 cursor-pointer">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold text-slate-900 dark:text-white">{invoice.number}</span>
                      <span className="text-xs font-bold text-slate-900 dark:text-white">{formatDate(invoice.issueDate)}</span>
                    </div>
                    <div className="flex items-center justify-between mb-0.5">
                      <p className="text-xs font-bold text-slate-900 dark:text-white truncate">{getNick(invoice.senderCnpj, invoice.senderName).display}</p>
                      <span className="text-[10px] text-slate-400 shrink-0 ml-2">{formatTime(invoice.issueDate)}</span>
                    </div>
                    <div className="flex items-center gap-1 text-xs font-semibold text-slate-600 dark:text-slate-400 mb-0.5">
                      <span className="truncate">{flow.remetente}</span>
                      <span className="material-symbols-outlined text-[12px] text-primary shrink-0">local_shipping</span>
                      <span className="truncate">{flow.recebedor}</span>
                    </div>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">Tomador: {abbreviateQlMed(invoice.recipientName || '-')}</p>
                    <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100 dark:border-slate-800" onClick={(e) => e.stopPropagation()}>
                      <span className="text-sm font-bold font-mono text-slate-900 dark:text-white">{val(invoice.totalValue)}</span>
                      <RowActions invoiceId={invoice.id} accessKey={invoice.accessKey} onView={openModal} onDetails={openDetails} onViewProducts={openDetails} onDelete={canWrite ? confirmDelete : undefined} />
                    </div>
                  </div>
                )}
              </React.Fragment>
            );
          });
        })()}
        {invoices.length > 0 && (
          <div className="flex items-center gap-1 pt-3 mt-1 border-t border-slate-200 dark:border-slate-700">
            <span className="text-xs text-slate-400 mr-1">Ano:</span>
            {yearNavButtons}
          </div>
        )}
      </div>

      {/* Table (desktop) */}
      <div className="hidden sm:block bg-white dark:bg-card-dark border border-slate-200 dark:border-slate-800 rounded-xl shadow-lg shadow-slate-200/50 dark:shadow-none overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <caption className="sr-only">Lista de conhecimentos de transporte eletrônicos</caption>
          <thead>
              <tr className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800 text-xs uppercase text-slate-500 dark:text-slate-400 font-bold tracking-wider">
                <th className="px-2 py-2 w-px">
                  <input
                    className="rounded border-slate-300 text-primary focus:ring-primary bg-white dark:bg-slate-800 dark:border-slate-600 w-4 h-4 cursor-pointer"
                    type="checkbox"
                    checked={selected.size === invoices.length && invoices.length > 0}
                    onChange={toggleSelectAll}
                  />
                </th>
                <th className="px-2 py-2 w-px whitespace-nowrap cursor-pointer group hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" onClick={() => handleSort('emission')}>
                  <div className="flex items-center gap-1">Emissão {getSortIcon('emission')}</div>
                </th>
                <th className="px-2 py-2 w-px whitespace-nowrap cursor-pointer group hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" onClick={() => handleSort('number')}>
                  <div className="flex items-center gap-1">Número {getSortIcon('number')}</div>
                </th>
                <th className="px-2 py-2 w-px whitespace-nowrap text-right cursor-pointer group hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" onClick={() => handleSort('value')}>
                  <div className="flex items-center justify-end gap-1">Valor {getSortIcon('value')}</div>
                </th>
                <th className="px-2 py-2 cursor-pointer group hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" onClick={() => handleSort('sender')}>
                  <div className="flex items-center gap-1">Emitente {getSortIcon('sender')}</div>
                </th>
                <th className="px-2 py-2 cursor-pointer group hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" onClick={() => handleSort('recipient')}>
                  <div className="flex items-center gap-1">Tomador {getSortIcon('recipient')}</div>
                </th>
                <th className="px-2 py-2">Manifestação</th>
                <th className="px-2 py-2 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i}>
                    <td className="px-2 py-1.5"><Skeleton className="h-4 w-4" /></td>
                    <td className="px-2 py-1.5"><Skeleton className="h-4 w-16" /><Skeleton className="h-3 w-10 mt-1" /></td>
                    <td className="px-2 py-1.5"><Skeleton className="h-4 w-12" /></td>
                    <td className="px-2 py-1.5 text-right"><Skeleton className="h-4 w-20 ml-auto" /></td>
                    <td className="px-2 py-1.5"><Skeleton className="h-4 w-32" /></td>
                    <td className="px-2 py-1.5"><Skeleton className="h-4 w-32" /></td>
                    <td className="px-2 py-1.5"><Skeleton className="h-5 w-24 rounded-full" /></td>
                    <td className="px-2 py-1.5"><Skeleton className="h-4 w-16 mx-auto" /></td>
                  </tr>
                ))
              ) : invoices.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-slate-400">
                    <span className="material-symbols-outlined text-[48px] opacity-30">local_shipping</span>
                    <p className="mt-2 text-sm font-medium">Nenhum CT-e encontrado</p>
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
	                    const manifest = getCteManifestBadge(invoice.status);
                      const flow = getFreightFlow(invoice);
	                    return (
	                      <React.Fragment key={invoice.id}>
                        {showDivider && (
                          <tr className="cursor-pointer select-none" onClick={() => toggleGroup(group)}>
                            <td colSpan={8} className="px-4 py-2 bg-slate-100/80 dark:bg-slate-800/60 border-y border-slate-200 dark:border-slate-700">
                              <div className="flex items-center gap-2">
                                <span className="material-symbols-outlined text-[16px] text-slate-400 transition-transform" style={{ transform: collapsedGroups.has(group) ? 'rotate(-90deg)' : 'rotate(0deg)' }}>expand_more</span>
                                <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{group}</span>
                              </div>
                            </td>
                          </tr>
                        )}
                        {!collapsedGroups.has(group) && (
                        <tr className="group hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors cursor-pointer" onClick={() => openDetails(invoice.id)}>
                          <td className="px-2 py-1.5" onClick={(e) => e.stopPropagation()}>
                            <input
                              className="rounded border-slate-300 text-primary focus:ring-primary bg-white dark:bg-slate-800 dark:border-slate-600 w-4 h-4 cursor-pointer"
                              type="checkbox"
                              checked={selected.has(invoice.id)}
                              onChange={() => toggleSelect(invoice.id)}
                            />
                          </td>
                          <td className="px-2 py-1.5 whitespace-nowrap">
                            <div className="text-sm font-medium text-slate-700 dark:text-slate-300">{formatDate(invoice.issueDate)}</div>
                            <div className="text-[11px] text-slate-400">{formatTime(invoice.issueDate)}</div>
                          </td>
                          <td className="px-2 py-1.5 whitespace-nowrap">
                            <span className="text-sm font-bold text-slate-900 dark:text-white">{invoice.number}</span>
                          </td>
	                          <td className="px-2 py-1.5 text-right whitespace-nowrap">
	                            <span className="text-sm font-bold font-mono text-slate-900 dark:text-white">{val(invoice.totalValue)}</span>
	                          </td>
	                          <td className="px-2 py-1.5">
                              <div className="flex items-center gap-1 text-sm font-semibold text-slate-800 dark:text-slate-200 mb-0.5">
                                <span className="truncate">{flow.remetente}</span>
                                <span className="material-symbols-outlined text-[14px] text-primary shrink-0">local_shipping</span>
                                <span className="truncate">{flow.recebedor}</span>
                              </div>
                              {(() => { const e = getNick(invoice.senderCnpj, invoice.senderName); return e.full ? (
                                <>
                                  <span className="text-sm font-bold text-slate-900 dark:text-white">{e.display}</span>
                                  <div className="text-[11px] text-slate-500 dark:text-slate-400">{e.full}</div>
                                </>
                              ) : (
                                <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">{e.display}</span>
                              ); })()}
	                          </td>
	                          <td className="px-2 py-1.5">
                              {(() => { const r = getNick(invoice.recipientCnpj, invoice.recipientName || '-'); return r.full ? (
                                <>
                                  <span className="text-sm font-bold text-slate-900 dark:text-white">{r.display}</span>
                                  <div className="text-[10px] text-slate-400 dark:text-slate-500">{r.full}</div>
                                </>
                              ) : (
                                <span className="text-sm font-bold text-slate-900 dark:text-white">{r.display}</span>
                              ); })()}
	                          </td>
                          <td className="px-2 py-1.5">
                            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold border ${manifest.classes}`}>
                              • {manifest.label}
                            </span>
                          </td>
                          <td className="px-2 py-1.5" onClick={(e) => e.stopPropagation()}>
                            <RowActions invoiceId={invoice.id} accessKey={invoice.accessKey} onView={openModal} onDetails={openDetails} onDelete={canWrite ? confirmDelete : undefined} />
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

        {/* Footer with year navigation */}
        <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/30 dark:bg-slate-800/20">
          <div className="flex items-center gap-1">
            <span className="text-xs text-slate-400 mr-1.5">Ano:</span>
            {yearNavButtons}
          </div>
          <span className="text-xs text-slate-500">{total} CT-e(s)</span>
        </div>
      </div>
      <InvoiceDetailsModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        invoiceId={selectedInvoiceId}
      />
      <CteDetailsModal
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
