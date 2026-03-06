'use client';

import React, { useEffect, useState, useMemo, useRef } from 'react';
import dynamic from 'next/dynamic';
import { toast } from 'sonner';
import Skeleton from '@/components/ui/Skeleton';
import MobileFilterWrapper from '@/components/ui/MobileFilterWrapper';
import { formatDate, formatAmount } from '@/lib/utils';
import { useRole } from '@/hooks/useRole';

const LotEditModal = dynamic(() => import('@/components/LotEditModal'), { ssr: false });

interface InvoiceEntry {
  id: string;
  number: string | null;
  issueDate: string | null;
  supplierName: string | null;
  supplierCnpj: string | null;
  totalValue: number | null;
  entryStatus: 'pending' | 'partial' | 'registered';
  totalItems: number | null;
  matchedItems: number | null;
  registeredAt: string | null;
  unmatchedCount: number | null;
  missingLotCount: number | null;
}

interface ProductBatch {
  id?: number;
  lot: string;
  serial: string | null;
  quantity: number | null;
  fabrication: string | null;
  expiry: string | null;
}

interface InvoiceItem {
  id?: number;
  batchIds?: number[];
  index: number;
  code: string;
  description: string;
  unit: string;
  ncm: string | null;
  ean: string | null;
  anvisa: string | null;
  quantity: number;
  unitPrice: number;
  totalValue: number;
  batches: ProductBatch[];
  productKey: string;
  matchStatus: 'matched' | 'unmatched';
  registryId: string | null;
  codigoInterno: string | null;
  registryCode: string | null;
  registryDescription: string | null;
}

interface Stats {
  pending: number;
  partial: number;
  registered: number;
}

type MonthGroup = { key: string; label: string; entries: InvoiceEntry[]; total: number; count: number };
type EntryHierarchy = {
  estaSemana: InvoiceEntry[]; estaSemanaTotal: number;
  semanaPassada: InvoiceEntry[]; semanaPassadaTotal: number;
  currentYearMonths: MonthGroup[];
};

const MONTH_NAMES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const p2 = (n: number) => String(n).padStart(2, '0');

function buildEntryGroups(entries: InvoiceEntry[]): EntryHierarchy {
  const now = new Date();
  const dow = now.getDay();
  const dfm = dow === 0 ? 6 : dow - 1;
  const ws = new Date(now); ws.setDate(now.getDate() - dfm);
  const we = new Date(ws); we.setDate(ws.getDate() + 6);
  const pwe = new Date(ws); pwe.setDate(ws.getDate() - 1);
  const pws = new Date(pwe); pws.setDate(pwe.getDate() - 6);
  const ts = (d: Date) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
  const [wsS, weS, pwsS, pweS] = [ts(ws), ts(we), ts(pws), ts(pwe)];
  const es: InvoiceEntry[] = [], sp: InvoiceEntry[] = [];
  const mm = new Map<string, InvoiceEntry[]>();
  for (const inv of entries) {
    const d = (inv.issueDate || '').substring(0, 10);
    const mo = d.substring(0, 7);
    if (d >= wsS && d <= weS) es.push(inv);
    else if (d >= pwsS && d <= pweS) sp.push(inv);
    else { if (!mm.has(mo)) mm.set(mo, []); mm.get(mo)!.push(inv); }
  }
  const toMG = (mo: string, invs: InvoiceEntry[]): MonthGroup => {
    const [y, m] = mo.split('-');
    return { key: `mes_${mo}`, label: `${MONTH_NAMES[parseInt(m) - 1]}/${y}`, entries: invs, total: invs.reduce((s, i) => s + (i.totalValue || 0), 0), count: invs.length };
  };
  const cym = Array.from(mm.keys()).sort((a, b) => b.localeCompare(a)).map(m => toMG(m, mm.get(m)!));
  return {
    estaSemana: es, estaSemanaTotal: es.reduce((s, i) => s + (i.totalValue || 0), 0),
    semanaPassada: sp, semanaPassadaTotal: sp.reduce((s, i) => s + (i.totalValue || 0), 0),
    currentYearMonths: cym,
  };
}

function buildYearMonths(entries: InvoiceEntry[]): MonthGroup[] {
  const mm = new Map<string, InvoiceEntry[]>();
  for (const inv of entries) {
    const mo = (inv.issueDate || '').substring(0, 7);
    if (!mm.has(mo)) mm.set(mo, []);
    mm.get(mo)!.push(inv);
  }
  return Array.from(mm.keys()).sort((a, b) => b.localeCompare(a)).map(mo => {
    const [y, m] = mo.split('-');
    const invs = mm.get(mo)!;
    return { key: `mes_${mo}`, label: `${MONTH_NAMES[parseInt(m) - 1]}/${y}`, entries: invs, total: invs.reduce((s, i) => s + (i.totalValue || 0), 0), count: invs.length };
  });
}

const STATUS_BADGES: Record<string, { label: string; classes: string }> = {
  pending: { label: 'Pendente', classes: 'bg-slate-100 text-slate-600 dark:bg-slate-700/50 dark:text-slate-400' },
  partial: { label: 'Parcial', classes: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
  registered: { label: 'Registrada', classes: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
};

/** Format expiry/fabrication date string for display (YYYY-MM-DD → DD/MM/YY, or DD/MM/YYYY → DD/MM/YY) */
function formatBatchDate(d: string | null): string | null {
  if (!d) return null;
  const iso = d.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1].slice(2)}`;
  const br = d.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) return `${br[1]}/${br[2]}/${br[3].slice(2)}`;
  return d;
}

/** Check if invoice has any pendency */
function hasPendency(inv: InvoiceEntry): boolean {
  return (inv.unmatchedCount != null && inv.unmatchedCount > 0) || (inv.missingLotCount != null && inv.missingLotCount > 0);
}

/** Pendency badges component */
function PendencyBadges({ inv }: { inv: InvoiceEntry }) {
  return (
    <>
      {inv.unmatchedCount != null && inv.unmatchedCount > 0 && (
        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
          {inv.unmatchedCount} s/ cód.
        </span>
      )}
      {inv.missingLotCount != null && inv.missingLotCount > 0 && (
        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
          {inv.missingLotCount} s/ lote
        </span>
      )}
    </>
  );
}

export default function EntradaNfePage() {
  const { canWrite } = useRole();
  const [invoices, setInvoices] = useState<InvoiceEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState(() => `${new Date().getFullYear()}-01-01`);
  const [dateTo, setDateTo] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [stats, setStats] = useState<Stats>({ pending: 0, partial: 0, registered: 0 });
  const [sortBy, setSortBy] = useState('emission');
  const [sortOrder, setSortOrder] = useState('desc');
  const [total, setTotal] = useState(0);
  const [nicknames, setNicknames] = useState<Map<string, string>>(new Map());

  // Year navigation
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [availableYears, setAvailableYears] = useState<number[]>([]);

  // Collapsible groups
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [collapsedInitialized, setCollapsedInitialized] = useState(false);

  // Expanded invoice detail
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedItems, setExpandedItems] = useState<InvoiceItem[]>([]);
  const [expandedLoading, setExpandedLoading] = useState(false);
  const [expandedSource, setExpandedSource] = useState<'xml' | 'persisted' | null>(null);

  // Inline lot editing
  const [editingLotItem, setEditingLotItem] = useState<number | null>(null);
  const [lotDraft, setLotDraft] = useState({ lot: '', expiry: '', quantity: '' });
  const [savingLot, setSavingLot] = useState(false);

  // Lot edit modal
  const [lotModalInvoiceId, setLotModalInvoiceId] = useState<string | null>(null);

  // E509 import modal
  const [showImportModal, setShowImportModal] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);

  const loadAbortRef = useRef<AbortController | null>(null);
  const expandAbortRef = useRef<AbortController | null>(null);
  const expandedIdRef = useRef<string | null>(null);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => { setSearch(searchInput); }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Detect available years
  useEffect(() => {
    const cy = new Date().getFullYear();
    Promise.all([cy - 1, cy - 2, cy - 3, cy - 4].map(y =>
      fetch(`/api/estoque/entrada-nfe?limit=1&page=1&dateFrom=${y}-01-01&dateTo=${y}-12-31`)
        .then(r => r.ok ? r.json() : null)
        .then(d => (d?.pagination?.total ?? 0) > 0 ? y : null)
        .catch(() => null)
    )).then(res => setAvailableYears(res.filter((y): y is number => y !== null)));
  }, []);

  // Load invoices on filter change
  useEffect(() => {
    loadInvoices();
    return () => { loadAbortRef.current?.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, dateFrom, dateTo, statusFilter, sortBy, sortOrder]);

  const selectYear = (year: number | null) => {
    const cy = new Date().getFullYear();
    if (year === null) { setDateFrom(`${cy}-01-01`); setDateTo(''); }
    else { setDateFrom(`${year}-01-01`); setDateTo(`${year}-12-31`); }
    setSelectedYear(year);
    setCollapsedInitialized(false);
  };

  const toggleGroup = (group: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  };

  async function loadInvoices() {
    loadAbortRef.current?.abort();
    const controller = new AbortController();
    loadAbortRef.current = controller;
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: '1', limit: '2000' });
      if (search) params.set('search', search);
      if (dateFrom) params.set('dateFrom', dateFrom);
      if (dateTo) params.set('dateTo', dateTo);
      if (statusFilter) params.set('status', statusFilter);
      params.set('sort', sortBy);
      params.set('order', sortOrder);

      const res = await fetch(`/api/estoque/entrada-nfe?${params}`, { signal: controller.signal });
      if (res.ok) {
        const data = await res.json();
        const loaded: InvoiceEntry[] = data.invoices || [];
        setInvoices(loaded);
        setStats(data.stats || { pending: 0, partial: 0, registered: 0 });
        setTotal(data.pagination?.total || 0);

        if (!collapsedInitialized && loaded.length > 0) {
          if (selectedYear !== null) {
            const months = buildYearMonths(loaded);
            setCollapsedGroups(new Set(months.map(m => m.key)));
          } else {
            const groups = buildEntryGroups(loaded);
            const toCollapse = new Set<string>();
            if (groups.semanaPassada.length > 0) toCollapse.add('semana_passada');
            for (const mg of groups.currentYearMonths) toCollapse.add(mg.key);
            setCollapsedGroups(toCollapse);
          }
          setCollapsedInitialized(true);
        }

        const cnpjs = Array.from(new Set(loaded.map((inv: InvoiceEntry) => inv.supplierCnpj).filter(Boolean) as string[]));
        if (cnpjs.length > 0) {
          try {
            const np = new URLSearchParams(); cnpjs.forEach((c) => np.append('cnpjs', c));
            const nr = await fetch(`/api/contacts/nickname/batch?${np}`, { signal: controller.signal });
            if (nr.ok) { const nd = await nr.json(); setNicknames(new Map(Object.entries(nd.nicknames || {}))); }
          } catch { /* nickname fetch failure is non-critical */ }
        } else { setNicknames(new Map()); }
      }
    } catch {
      toast.error('Erro ao carregar notas fiscais');
    } finally {
      setLoading(false);
    }
  }

  async function loadInvoiceItems(invoiceId: string) {
    expandAbortRef.current?.abort();
    const controller = new AbortController();
    expandAbortRef.current = controller;
    expandedIdRef.current = invoiceId;
    setExpandedLoading(true);
    try {
      const res = await fetch(`/api/estoque/entrada-nfe/${invoiceId}`, { signal: controller.signal });
      if (expandedIdRef.current !== invoiceId) return; // stale response
      if (res.ok) {
        const data = await res.json();
        setExpandedItems(data.items || []);
        setExpandedSource(data.source || null);
      } else {
        toast.error('Erro ao carregar itens da nota');
      }
    } catch (e: any) {
      if (e?.name === 'AbortError') return;
      toast.error('Erro ao carregar itens da nota');
    } finally {
      if (expandedIdRef.current === invoiceId) setExpandedLoading(false);
    }
  }


  async function handleSaveLot(invoiceId: string, item: InvoiceItem) {
    if (!lotDraft.lot.trim()) {
      toast.error('Lote é obrigatório');
      return;
    }

    // If item quantity is 1, lot quantity is always 1
    const effectiveQty = item.quantity === 1 ? 1 : (lotDraft.quantity ? Number(lotDraft.quantity) : null);

    // Validate lot quantity doesn't exceed item quantity
    if (effectiveQty != null && effectiveQty > item.quantity) {
      toast.error(`Qtd lote (${effectiveQty}) não pode ser maior que qtd entrada (${item.quantity})`);
      return;
    }

    // Validate sum of batch quantities doesn't exceed item quantity
    // When editing an existing batch, exclude its old quantity from the sum
    if (effectiveQty != null && item.batches && item.batches.length > 0) {
      const editingBatchId = item.batchIds && item.batchIds.length > 0
        ? item.batchIds[0] : item.id;
      const otherBatchesSum = item.batches
        .filter(b => b.lot && b.id !== editingBatchId)
        .reduce((sum, b) => sum + (b.quantity ?? 0), 0);
      if (otherBatchesSum + effectiveQty > item.quantity) {
        toast.error(`Soma dos lotes (${otherBatchesSum} + ${effectiveQty} = ${otherBatchesSum + effectiveQty}) excede a qtd de entrada (${item.quantity})`);
        return;
      }
    }

    setSavingLot(true);
    try {
      const targetId = item.batchIds && item.batchIds.length > 0
        ? item.batchIds[0]
        : item.id;

      if (!targetId) {
        toast.error('Item sem ID para atualizar');
        return;
      }

      const res = await fetch(`/api/estoque/entrada-nfe/${invoiceId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemId: targetId,
          lot: lotDraft.lot.trim(),
          lotExpiry: lotDraft.expiry.trim() || null,
          lotQuantity: effectiveQty,
        }),
      });

      if (res.ok) {
        toast.success('Lote salvo');
        setEditingLotItem(null);
        setLotDraft({ lot: '', expiry: '', quantity: '' });
        loadInvoiceItems(invoiceId);
        loadInvoices();
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || 'Erro ao salvar lote');
      }
    } catch {
      toast.error('Erro de rede');
    } finally {
      setSavingLot(false);
    }
  }

  async function handleImportE509() {
    if (!importFile) return;
    setImporting(true);
    try {
      const formData = new FormData();
      formData.append('file', importFile);
      const res = await fetch('/api/estoque/import-e509', { method: 'POST', body: formData });
      if (res.ok) {
        const data = await res.json();
        const parts = [`${data.imported} lotes importados`];
        if (data.registered) parts.push(`${data.registered} notas registradas`);
        if (data.skipped) parts.push(`${data.skipped} já existentes`);
        if (data.notFound) parts.push(`${data.notFound} não encontrados`);
        toast.success(`Importação: ${parts.join(', ')}`);
        setShowImportModal(false);
        setImportFile(null);
        loadInvoices();
        if (expandedId) loadInvoiceItems(expandedId);
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || 'Erro na importação');
      }
    } catch {
      toast.error('Erro de rede na importação');
    } finally {
      setImporting(false);
    }
  }

  const toggleExpand = (invoiceId: string) => {
    if (expandedId === invoiceId) {
      expandAbortRef.current?.abort();
      expandedIdRef.current = null;
      setExpandedId(null);
      setExpandedItems([]);
      setExpandedSource(null);
      setEditingLotItem(null);
    } else {
      setExpandedId(invoiceId);
      setEditingLotItem(null);
      loadInvoiceItems(invoiceId);
    }
  };

  const startEditLot = (item: InvoiceItem) => {
    setEditingLotItem(item.index);
    const existingBatch = item.batches?.[0];
    setLotDraft({
      lot: existingBatch?.lot || '',
      expiry: existingBatch?.expiry || '',
      quantity: item.quantity === 1
        ? '1'
        : existingBatch?.quantity != null ? String(existingBatch.quantity) : '',
    });
  };

  const handleSort = (field: string) => {
    if (sortBy === field) setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    else { setSortBy(field); setSortOrder('desc'); }
  };

  const getSortIcon = (field: string) => {
    if (sortBy !== field) return <span className="material-symbols-outlined text-[16px] text-slate-300 opacity-0 group-hover:opacity-50">unfold_more</span>;
    return <span className="material-symbols-outlined text-[16px] text-primary">{sortOrder === 'asc' ? 'expand_less' : 'expand_more'}</span>;
  };

  const getNick = (cnpj: string | null | undefined, name: string | null | undefined) => {
    const full = (name || '').trim() || '-';
    if (!cnpj) return full;
    const nick = nicknames.get(cnpj);
    if (nick) return nick;
    return full;
  };

  const defaultDateFrom = `${new Date().getFullYear()}-01-01`;
  const activeFilterCount = (search ? 1 : 0) + (dateFrom && dateFrom !== defaultDateFrom ? 1 : 0) + (dateTo ? 1 : 0) + (statusFilter ? 1 : 0);

  const entryGroups = useMemo(() => buildEntryGroups(invoices), [invoices]);
  const yearMonths = useMemo(() => selectedYear !== null ? buildYearMonths(invoices) : [], [invoices, selectedYear]);

  const yearNavButtons = ([null, ...availableYears] as Array<number | null>).map((y) => (
    <button key={y ?? 'current'} onClick={() => selectYear(y)} className={`px-2.5 py-1 rounded-md text-xs font-bold transition-colors ${(y === null ? selectedYear === null : selectedYear === y) ? 'bg-primary text-white shadow-sm' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-700 dark:hover:text-slate-200'}`}>
      {y ?? new Date().getFullYear()}
    </button>
  ));

  // --- Render helpers ---

  const renderGroupDivider = (key: string, label: string, count: number, _gtotal: number) => (
    <tr key={`hdr-${key}`} className="cursor-pointer select-none" onClick={() => toggleGroup(key)}>
      <td colSpan={7} className="px-4 py-2 border-y bg-slate-100/80 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[16px] text-slate-400 transition-transform duration-200" style={{ transform: collapsedGroups.has(key) ? 'rotate(-90deg)' : 'rotate(0deg)' }}>expand_more</span>
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</span>
          <span className="text-xs text-slate-400">· {count} {count === 1 ? 'nota' : 'notas'}</span>
        </div>
      </td>
    </tr>
  );

  const renderMobileDivider = (key: string, label: string, count: number, _mtotal: number) => (
    <div key={`mhdr-${key}`} className="cursor-pointer select-none" onClick={() => toggleGroup(key)}>
      <div className="flex items-center gap-2.5 px-2 py-2 rounded-lg bg-gradient-to-r from-slate-100 via-slate-100/70 to-transparent dark:from-slate-800/70 dark:via-slate-800/40 dark:to-transparent">
        <span className="material-symbols-outlined text-[16px] text-slate-400 dark:text-slate-500 transition-transform duration-200" style={{ transform: collapsedGroups.has(key) ? 'rotate(-90deg)' : 'rotate(0deg)' }}>expand_more</span>
        <span className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">{label}</span>
        <span className="text-xs text-slate-400 ml-1">· {count} {count === 1 ? 'nota' : 'notas'}</span>
      </div>
    </div>
  );

  const renderInvoiceRow = (inv: InvoiceEntry) => {
    const badge = STATUS_BADGES[inv.entryStatus] || STATUS_BADGES.pending;
    const isExpanded = expandedId === inv.id;
    const pending = hasPendency(inv);
    const isRegistered = inv.entryStatus === 'registered' || inv.entryStatus === 'partial';
    return (
      <React.Fragment key={inv.id}>
        <tr className={`group transition-colors cursor-pointer ${pending ? 'bg-amber-50/70 hover:bg-amber-100/70 dark:bg-amber-900/10 dark:hover:bg-amber-900/20' : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'}`} onClick={() => toggleExpand(inv.id)}>
          <td className="px-2 py-2.5 text-center">
            <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide ${badge.classes}`}>{badge.label}</span>
          </td>
          <td className="px-2 py-2.5">
            <span className="text-sm text-slate-700 dark:text-slate-300 whitespace-nowrap">{inv.issueDate ? formatDate(inv.issueDate) : '-'}</span>
          </td>
          <td className="px-2 py-2.5">
            <span className="text-sm font-bold text-slate-900 dark:text-white whitespace-nowrap">{inv.number || '-'}</span>
          </td>
          <td className="px-2 py-2.5 text-right">
            <span className="text-sm font-bold font-mono text-slate-900 dark:text-white whitespace-nowrap">{inv.totalValue != null ? formatAmount(inv.totalValue) : '-'}</span>
          </td>
          <td className="px-3 py-2.5">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300 truncate">{getNick(inv.supplierCnpj, inv.supplierName)}</span>
              <PendencyBadges inv={inv} />
            </div>
          </td>
          <td className="px-2 py-2.5 text-center">
            {inv.totalItems != null ? (
              <span className="text-xs text-slate-500">{inv.matchedItems}/{inv.totalItems}</span>
            ) : (
              <span className="text-xs text-slate-400">-</span>
            )}
          </td>
          <td className="px-2 py-2.5 text-center" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-center gap-1">
              <button
                onClick={() => setLotModalInvoiceId(inv.id)}
                className="p-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 hover:text-primary transition-colors"
                title={isRegistered ? 'Editar Lotes' : 'Verificar Lotes e Registrar'}
              >
                <span className="material-symbols-outlined text-[18px]">{isRegistered ? 'edit_note' : 'assignment'}</span>
              </button>
              <span className="material-symbols-outlined text-[18px] text-slate-400 transition-transform duration-200 cursor-pointer" style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }} onClick={() => toggleExpand(inv.id)}>expand_more</span>
            </div>
          </td>
        </tr>
        {isExpanded && (
          <tr><td colSpan={7} className="p-0">{renderExpandedDetailDesktop(inv)}</td></tr>
        )}
      </React.Fragment>
    );
  };

  const renderMobileCard = (inv: InvoiceEntry) => {
    const badge = STATUS_BADGES[inv.entryStatus] || STATUS_BADGES.pending;
    const isExpanded = expandedId === inv.id;
    const pending = hasPendency(inv);
    const isRegistered = inv.entryStatus === 'registered' || inv.entryStatus === 'partial';
    return (
      <div key={inv.id}>
        <div className={`border rounded-xl p-3 cursor-pointer ${pending ? 'bg-amber-50/70 border-amber-200 dark:bg-amber-900/10 dark:border-amber-800' : 'bg-white dark:bg-card-dark border-slate-200 dark:border-slate-800'}`} onClick={() => toggleExpand(inv.id)}>
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide ${badge.classes}`}>{badge.label}</span>
              <span className="text-xs font-bold text-slate-900 dark:text-white">
                {inv.issueDate ? formatDate(inv.issueDate) : '-'}
                <span className="text-slate-400 font-normal ml-2">#{inv.number || '-'}</span>
              </span>
            </div>
            <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
              <button
                onClick={() => setLotModalInvoiceId(inv.id)}
                className="p-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 hover:text-primary transition-colors"
                title={isRegistered ? 'Editar Lotes' : 'Verificar Lotes e Registrar'}
              >
                <span className="material-symbols-outlined text-[16px]">{isRegistered ? 'edit_note' : 'assignment'}</span>
              </button>
            </div>
          </div>
          <div className="flex items-center gap-1.5 mb-1">
            <p className="text-xs font-bold text-slate-900 dark:text-white truncate">{getNick(inv.supplierCnpj, inv.supplierName)}</p>
            <PendencyBadges inv={inv} />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold font-mono text-slate-900 dark:text-white">{inv.totalValue != null ? formatAmount(inv.totalValue) : '-'}</span>
            <span className="material-symbols-outlined text-[16px] text-slate-400 transition-transform duration-200" style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}>expand_more</span>
          </div>
        </div>
        {isExpanded && renderExpandedDetail(inv)}
      </div>
    );
  };

  const renderGroupedDesktopRows = () => {
    if (selectedYear !== null) {
      return yearMonths.map(mg => (
        <React.Fragment key={mg.key}>
          {renderGroupDivider(mg.key, mg.label, mg.count, mg.total)}
          {!collapsedGroups.has(mg.key) && mg.entries.map(renderInvoiceRow)}
        </React.Fragment>
      ));
    }
    return (
      <>
        {renderGroupDivider('esta_semana', 'Esta semana', entryGroups.estaSemana.length, entryGroups.estaSemanaTotal)}
        {!collapsedGroups.has('esta_semana') && entryGroups.estaSemana.map(renderInvoiceRow)}

        {entryGroups.semanaPassada.length > 0 && (<>
          {renderGroupDivider('semana_passada', 'Semana passada', entryGroups.semanaPassada.length, entryGroups.semanaPassadaTotal)}
          {!collapsedGroups.has('semana_passada') && entryGroups.semanaPassada.map(renderInvoiceRow)}
        </>)}

        {entryGroups.currentYearMonths.map(mg => (
          <React.Fragment key={mg.key}>
            {renderGroupDivider(mg.key, mg.label, mg.count, mg.total)}
            {!collapsedGroups.has(mg.key) && mg.entries.map(renderInvoiceRow)}
          </React.Fragment>
        ))}
      </>
    );
  };

  const renderGroupedMobileCards = () => {
    if (selectedYear !== null) {
      return yearMonths.map(mg => (
        <React.Fragment key={mg.key}>
          {renderMobileDivider(mg.key, mg.label, mg.count, mg.total)}
          {!collapsedGroups.has(mg.key) && mg.entries.map(renderMobileCard)}
        </React.Fragment>
      ));
    }
    return (
      <>
        {renderMobileDivider('esta_semana', 'Esta semana', entryGroups.estaSemana.length, entryGroups.estaSemanaTotal)}
        {!collapsedGroups.has('esta_semana') && entryGroups.estaSemana.map(renderMobileCard)}

        {entryGroups.semanaPassada.length > 0 && (<>
          {renderMobileDivider('semana_passada', 'Semana passada', entryGroups.semanaPassada.length, entryGroups.semanaPassadaTotal)}
          {!collapsedGroups.has('semana_passada') && entryGroups.semanaPassada.map(renderMobileCard)}
        </>)}

        {entryGroups.currentYearMonths.map(mg => (
          <React.Fragment key={mg.key}>
            {renderMobileDivider(mg.key, mg.label, mg.count, mg.total)}
            {!collapsedGroups.has(mg.key) && mg.entries.map(renderMobileCard)}
          </React.Fragment>
        ))}
      </>
    );
  };

  // Helper: render lot cell content (inline editing or read-only)
  function renderLotCells(item: InvoiceItem, inv: InvoiceEntry) {
    const isEditing = editingLotItem === item.index;
    const hasBatches = item.batches && item.batches.length > 0;
    const hasLot = hasBatches && item.batches.some(b => b.lot);
    const isPersisted = expandedSource === 'persisted';

    if (isEditing && isPersisted && canWrite) {
      return (
        <>
          <td className="px-2 py-1.5">
            <input
              type="text"
              value={lotDraft.lot}
              onChange={e => setLotDraft(d => ({ ...d, lot: e.target.value }))}
              placeholder="Lote"
              className="w-full px-1.5 py-1 text-[10px] border rounded bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600 focus:ring-1 focus:ring-primary"
              onClick={e => e.stopPropagation()}
            />
          </td>
          <td className="px-2 py-1.5">
            <input
              type="text"
              value={lotDraft.expiry}
              onChange={e => setLotDraft(d => ({ ...d, expiry: e.target.value }))}
              placeholder="YYYY-MM-DD"
              className="w-full px-1.5 py-1 text-[10px] border rounded bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600 focus:ring-1 focus:ring-primary"
              onClick={e => e.stopPropagation()}
            />
          </td>
          <td className="px-2 py-1.5 text-right">
            {item.quantity === 1 ? (
              <span className="text-[10px] text-slate-500">1</span>
            ) : (
              <input
                type="number"
                value={lotDraft.quantity}
                onChange={e => setLotDraft(d => ({ ...d, quantity: e.target.value }))}
                placeholder="Qtd"
                max={item.quantity}
                min={1}
                className="w-20 px-1.5 py-1 text-[10px] text-right border rounded bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600 focus:ring-1 focus:ring-primary"
                onClick={e => e.stopPropagation()}
              />
            )}
          </td>
          <td className="px-2 py-1.5">
            <div className="flex items-center gap-1">
              <button
                onClick={e => { e.stopPropagation(); handleSaveLot(inv.id, item); }}
                disabled={savingLot}
                className="p-0.5 rounded hover:bg-emerald-100 dark:hover:bg-emerald-900/30 text-emerald-600 disabled:opacity-50"
                title="Salvar"
              >
                <span className="material-symbols-outlined text-[16px]">{savingLot ? 'progress_activity' : 'check'}</span>
              </button>
              <button
                onClick={e => { e.stopPropagation(); setEditingLotItem(null); }}
                className="p-0.5 rounded hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400"
                title="Cancelar"
              >
                <span className="material-symbols-outlined text-[16px]">close</span>
              </button>
            </div>
          </td>
        </>
      );
    }

    // Read-only mode — highlight empty lot cells in amber for persisted items
    const emptyLotHighlight = isPersisted && !hasLot
      ? 'bg-amber-50/80 dark:bg-amber-900/20'
      : '';

    return (
      <>
        <td className={`px-2 py-1.5 font-mono text-slate-600 dark:text-slate-400 ${emptyLotHighlight}`}>
          {hasLot ? (
            <div className="flex flex-col gap-0.5">
              {item.batches.map((b, bi) => (
                <span key={bi} className="text-[10px]">
                  {b.serial ? `${b.lot} / ${b.serial}` : b.lot}
                </span>
              ))}
            </div>
          ) : isPersisted ? (
            <span className="text-[10px] text-amber-500 dark:text-amber-400 font-medium">--</span>
          ) : null}
        </td>
        <td className={`px-2 py-1.5 text-slate-600 dark:text-slate-400 ${emptyLotHighlight}`}>
          {hasLot ? (
            <div className="flex flex-col gap-0.5">
              {item.batches.map((b, bi) => (
                <span key={bi} className="text-[10px]">{formatBatchDate(b.expiry) || '-'}</span>
              ))}
            </div>
          ) : isPersisted ? (
            <span className="text-[10px] text-amber-500 dark:text-amber-400 font-medium">--</span>
          ) : null}
        </td>
        <td className={`px-2 py-1.5 text-right font-mono text-slate-600 dark:text-slate-400 ${emptyLotHighlight}`}>
          {hasLot ? (
            <div className="flex flex-col gap-0.5">
              {item.batches.map((b, bi) => (
                <span key={bi} className="text-[10px]">{b.quantity != null ? b.quantity : '-'}</span>
              ))}
            </div>
          ) : isPersisted ? (
            <span className="text-[10px] text-amber-500 dark:text-amber-400 font-medium">--</span>
          ) : null}
        </td>
        <td className={`px-2 py-1.5 ${emptyLotHighlight}`}>
          {isPersisted && canWrite && (
            <button
              onClick={e => { e.stopPropagation(); startEditLot(item); }}
              className={`p-0.5 rounded ${hasLot ? 'hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-600' : 'hover:bg-amber-100 dark:hover:bg-amber-900/30 text-amber-500 hover:text-amber-700'}`}
              title={hasLot ? 'Editar lote' : 'Adicionar lote'}
            >
              <span className="material-symbols-outlined text-[14px]">{hasLot ? 'edit' : 'add_circle'}</span>
            </button>
          )}
          {expandedSource === 'xml' && !hasLot && (
            <span className="text-[9px] text-slate-400 italic" title="Registre a entrada para editar lotes">Registre</span>
          )}
        </td>
      </>
    );
  }

  function renderExpandedDetail(inv: InvoiceEntry) {
    return (
      <div className="mt-1 border rounded-xl p-3 bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700">
        {expandedLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : (
          <>
            <div className="space-y-1.5">
              {expandedItems.map((item) => (
                <div
                  key={item.index}
                  className={`rounded-lg p-2 border ${item.matchStatus === 'matched'
                    ? 'border-emerald-200 bg-emerald-50/50 dark:border-emerald-800 dark:bg-emerald-900/20'
                    : 'border-red-200 bg-red-50/50 dark:border-red-800 dark:bg-red-900/20'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-[10px] text-slate-400">#{item.index}</span>
                        {item.code && <span className="text-[10px] font-mono text-slate-500">{item.code}</span>}
                      </div>
                      <p className="text-xs font-medium text-slate-800 dark:text-slate-200 truncate">{item.description}</p>
                      {item.batches && item.batches.length > 0 && (
                        <div className="flex flex-col gap-0.5 mt-1">
                          {item.batches.map((b, bi) => (
                            <div key={bi} className="flex items-center gap-2 text-[10px] text-slate-600 dark:text-slate-400">
                              <span className="font-mono font-bold">{b.lot}</span>
                              {b.expiry && <span>val. {formatBatchDate(b.expiry)}</span>}
                              {b.quantity != null && <span>qtd. {b.quantity}</span>}
                            </div>
                          ))}
                        </div>
                      )}
                      {item.matchStatus === 'matched' ? (
                        <div className="mt-0.5 flex items-center gap-1.5">
                          <span className="material-symbols-outlined text-[12px] text-emerald-500">check_circle</span>
                          <span
                            className="px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/40 text-[10px] font-mono font-bold text-emerald-700 dark:text-emerald-300 cursor-default"
                            title={item.registryDescription || ''}
                          >
                            {item.codigoInterno}
                          </span>
                        </div>
                      ) : (
                        <p className="text-[10px] text-red-500 dark:text-red-400 mt-0.5">Sem correspondência</p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-xs font-mono font-bold text-slate-900 dark:text-white">{formatAmount(item.totalValue)}</div>
                      <div className="text-[10px] text-slate-400">{item.quantity} {item.unit}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    );
  }

  function renderExpandedDetailDesktop(inv: InvoiceEntry) {
    return (
      <div className="px-4 py-3 bg-slate-50/80 dark:bg-slate-900/50 border-t border-slate-200 dark:border-slate-700">
        {expandedLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
          </div>
        ) : (
          <>
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700">
                  <th className="px-2 py-1.5 text-[10px] font-semibold text-slate-400 uppercase">#</th>
                  <th className="px-2 py-1.5 text-[10px] font-semibold text-slate-400 uppercase">Código NF-e</th>
                  <th className="px-2 py-1.5 text-[10px] font-semibold text-slate-400 uppercase">Descrição</th>
                  <th className="px-2 py-1.5 text-[10px] font-semibold text-slate-400 uppercase">UN</th>
                  <th className="px-2 py-1.5 text-[10px] font-semibold text-slate-400 uppercase text-right">Qtd</th>
                  <th className="px-2 py-1.5 text-[10px] font-semibold text-slate-400 uppercase">Lote</th>
                  <th className="px-2 py-1.5 text-[10px] font-semibold text-slate-400 uppercase">Validade</th>
                  <th className="px-2 py-1.5 text-[10px] font-semibold text-slate-400 uppercase text-right">Qtd Lote</th>
                  <th className="px-2 py-1.5 text-[10px] font-semibold text-slate-400 uppercase w-6"></th>
                  <th className="px-2 py-1.5 text-[10px] font-semibold text-slate-400 uppercase">Código Interno</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {expandedItems.map((item) => (
                  <tr
                    key={item.index}
                    className={item.matchStatus === 'matched'
                      ? 'bg-emerald-50/40 dark:bg-emerald-900/10'
                      : 'bg-red-50/40 dark:bg-red-900/10'
                    }
                  >
                    <td className="px-2 py-1.5 text-slate-400">{item.index}</td>
                    <td className="px-2 py-1.5 font-mono text-slate-600 dark:text-slate-400">{item.code || '-'}</td>
                    <td className="px-2 py-1.5 text-slate-800 dark:text-slate-200 max-w-[300px] truncate">{item.description}</td>
                    <td className="px-2 py-1.5 text-slate-500">{item.unit}</td>
                    <td className="px-2 py-1.5 text-right font-mono text-slate-700 dark:text-slate-300">{item.quantity}</td>
                    {renderLotCells(item, inv)}
                    <td className="px-2 py-1.5">
                      {item.matchStatus === 'matched' ? (
                        <div className="flex items-center gap-1.5">
                          <span className="material-symbols-outlined text-[14px] text-emerald-500">check_circle</span>
                          <span
                            className="px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/40 text-[10px] font-mono font-bold text-emerald-700 dark:text-emerald-300 cursor-default"
                            title={item.registryDescription || ''}
                          >
                            {item.codigoInterno}
                          </span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <span className="material-symbols-outlined text-[14px] text-red-400">cancel</span>
                          <span className="text-red-500 dark:text-red-400">Sem correspondência</span>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>
    );
  }

  return (
    <>
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="hidden sm:flex items-center gap-3 min-w-0">
          <span className="material-symbols-outlined text-[28px] text-primary flex-shrink-0">inventory</span>
          <div className="min-w-0">
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Entrada NF-e</h2>
            <p className="text-slate-500 dark:text-slate-400 text-xs font-medium">Registrar entrada de produtos no estoque</p>
          </div>
        </div>
        {canWrite && (
          <button
            onClick={() => setShowImportModal(true)}
            className="hidden sm:flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 transition-colors"
          >
            <span className="material-symbols-outlined text-[16px]">upload_file</span>
            Importar E509
          </button>
        )}
      </div>

      {/* Stats */}
      <div className="flex flex-wrap gap-3">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
          <span className="text-sm text-slate-500">Pendentes:</span>
          <span className="text-sm font-bold text-slate-700 dark:text-slate-300">{stats.pending}</span>
        </div>
        {stats.partial > 0 && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
            <span className="text-sm text-amber-600 dark:text-amber-400">Parciais:</span>
            <span className="text-sm font-bold text-amber-700 dark:text-amber-300">{stats.partial}</span>
          </div>
        )}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800">
          <span className="text-sm text-emerald-600 dark:text-emerald-400">Registradas:</span>
          <span className="text-sm font-bold text-emerald-700 dark:text-emerald-300">{stats.registered}</span>
        </div>
        {canWrite && (
          <button
            onClick={() => setShowImportModal(true)}
            className="sm:hidden flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-300"
          >
            <span className="material-symbols-outlined text-[14px]">upload_file</span>
            E509
          </button>
        )}
      </div>

      {/* Filters */}
      <MobileFilterWrapper activeFilterCount={activeFilterCount}>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 items-end">
          <div className="lg:col-span-2">
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Fornecedor / Número</label>
            <input type="text" placeholder="ex: LABCOR, 38841..." value={searchInput} onChange={(e) => setSearchInput(e.target.value)} className="block w-full px-3 py-2.5 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-900/50 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary text-sm transition-all" />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Status</label>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="block w-full px-3 py-2.5 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-900/50 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary text-sm transition-all">
              <option value="">Todas</option>
              <option value="pending">Pendentes</option>
              <option value="partial">Parciais</option>
              <option value="registered">Registradas</option>
            </select>
          </div>
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Data Início</label>
              <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="block w-full px-3 py-2.5 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-900/50 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary text-sm transition-all" />
            </div>
            <div className="flex-1">
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Data Fim</label>
              <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="block w-full px-3 py-2.5 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-900/50 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary text-sm transition-all" />
            </div>
          </div>
          <div>
            <button onClick={() => { setSearchInput(''); setSearch(''); setStatusFilter(''); selectYear(null); }} className="px-3 py-2.5 text-slate-500 hover:text-slate-700 text-sm font-medium transition-colors">Limpar</button>
          </div>
        </div>
      </MobileFilterWrapper>

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
              <span className="material-symbols-outlined text-[48px] opacity-30">inventory</span>
              <p className="mt-2 text-sm font-medium">Nenhuma NF-e encontrada</p>
            </div>
            <div className="flex items-center gap-1 pt-2">
              <span className="text-xs text-slate-400 mr-1">Ano:</span>
              {yearNavButtons}
            </div>
          </>
        ) : (
          <>
            {(() => {
              const allKeys: string[] = [];
              if (selectedYear !== null) {
                yearMonths.forEach(mg => allKeys.push(mg.key));
              } else {
                allKeys.push('esta_semana');
                if (entryGroups.semanaPassada.length > 0) allKeys.push('semana_passada');
                entryGroups.currentYearMonths.forEach(mg => allKeys.push(mg.key));
              }
              return allKeys.length > 1 ? (
                <div className="flex justify-start gap-2 mb-2">
                  <button onClick={() => setCollapsedGroups(new Set(allKeys))} className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-600 transition-all"><span className="material-symbols-outlined text-[14px]">unfold_less</span>Recolher</button>
                  <button onClick={() => setCollapsedGroups(new Set())} className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-600 transition-all"><span className="material-symbols-outlined text-[14px]">unfold_more</span>Expandir</button>
                </div>
              ) : null;
            })()}
            {renderGroupedMobileCards()}
            <div className="flex items-center gap-1 pt-3 mt-1 border-t border-slate-200 dark:border-slate-700">
              <span className="text-xs text-slate-400 mr-1">Ano:</span>
              {yearNavButtons}
            </div>
          </>
        )}
      </div>

      {/* Desktop Table */}
      <div className="hidden sm:block bg-white dark:bg-card-dark border border-slate-200 dark:border-slate-800 rounded-xl shadow-lg shadow-slate-200/50 dark:shadow-none overflow-hidden">
        {!loading && invoices.length > 0 && (() => {
          const allKeys: string[] = [];
          if (selectedYear !== null) {
            yearMonths.forEach(mg => allKeys.push(mg.key));
          } else {
            allKeys.push('esta_semana');
            if (entryGroups.semanaPassada.length > 0) allKeys.push('semana_passada');
            entryGroups.currentYearMonths.forEach(mg => allKeys.push(mg.key));
          }
          return allKeys.length > 1 ? (
            <div className="flex justify-start gap-2 px-3 py-2 border-b border-slate-100 dark:border-slate-800">
              <button onClick={() => setCollapsedGroups(new Set(allKeys))} className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-600 transition-all"><span className="material-symbols-outlined text-[14px]">unfold_less</span>Recolher</button>
              <button onClick={() => setCollapsedGroups(new Set())} className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-600 transition-all"><span className="material-symbols-outlined text-[14px]">unfold_more</span>Expandir</button>
            </div>
          ) : null;
        })()}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800 text-xs uppercase text-slate-500 dark:text-slate-400 font-bold tracking-wider">
                <th className="px-2 py-2.5 w-[80px] text-center">Status</th>
                <th className="px-2 py-2.5 w-[85px] cursor-pointer group hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" onClick={() => handleSort('emission')}><div className="flex items-center gap-1">Data {getSortIcon('emission')}</div></th>
                <th className="px-2 py-2.5 w-[70px] cursor-pointer group hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" onClick={() => handleSort('number')}><div className="flex items-center gap-1">Número {getSortIcon('number')}</div></th>
                <th className="px-2 py-2.5 w-[100px] text-right cursor-pointer group hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" onClick={() => handleSort('value')}><div className="flex items-center justify-end gap-1">Valor {getSortIcon('value')}</div></th>
                <th className="px-3 py-2.5 cursor-pointer group hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" onClick={() => handleSort('sender')}><div className="flex items-center gap-1">Fornecedor {getSortIcon('sender')}</div></th>
                <th className="px-2 py-2.5 w-[60px] text-center">Itens</th>
                <th className="px-2 py-2.5 w-[90px] text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    <td className="px-2 py-2.5"><Skeleton className="h-4 w-16 mx-auto" /></td>
                    <td className="px-2 py-2.5"><Skeleton className="h-4 w-16" /></td>
                    <td className="px-2 py-2.5"><Skeleton className="h-4 w-12" /></td>
                    <td className="px-2 py-2.5"><Skeleton className="h-4 w-20" /></td>
                    <td className="px-3 py-2.5"><Skeleton className="h-4 w-40" /></td>
                    <td className="px-2 py-2.5"><Skeleton className="h-4 w-10" /></td>
                    <td className="px-2 py-2.5"><Skeleton className="h-4 w-12 mx-auto" /></td>
                  </tr>
                ))
              ) : invoices.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-slate-400">
                    <span className="material-symbols-outlined text-[48px] opacity-30">inventory</span>
                    <p className="mt-2 text-sm font-medium">Nenhuma NF-e encontrada</p>
                    <p className="text-xs mt-1">Ajuste os filtros ou sincronize novas NF-e</p>
                  </td>
                </tr>
              ) : renderGroupedDesktopRows()}
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

      {/* E509 Import Modal */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => { if (!importing) { setShowImportModal(false); setImportFile(null); } }}>
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 w-full max-w-md mx-4 p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">Importar E509</h3>
              <button onClick={() => { if (!importing) { setShowImportModal(false); setImportFile(null); } }} className="text-slate-400 hover:text-slate-600">
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>
            <p className="text-xs text-slate-500 mb-4">
              Selecione o arquivo E509 (.ods ou .xlsx) exportado do sistema legado. Os lotes serão preenchidos nas notas já registradas.
            </p>
            <div className="mb-4">
              <input
                type="file"
                accept=".ods,.xlsx,.xls"
                onChange={e => setImportFile(e.target.files?.[0] || null)}
                className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-primary/10 file:text-primary hover:file:bg-primary/20"
              />
            </div>
            {importFile && (
              <p className="text-xs text-slate-600 dark:text-slate-400 mb-4">
                Arquivo: <span className="font-medium">{importFile.name}</span> ({(importFile.size / 1024).toFixed(0)} KB)
              </p>
            )}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => { setShowImportModal(false); setImportFile(null); }}
                disabled={importing}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleImportE509}
                disabled={!importFile || importing}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-primary text-white hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
              >
                {importing ? (
                  <span className="material-symbols-outlined text-[16px] animate-spin">progress_activity</span>
                ) : (
                  <span className="material-symbols-outlined text-[16px]">upload</span>
                )}
                {importing ? 'Importando...' : 'Importar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lot Edit Modal */}
      <LotEditModal
        isOpen={!!lotModalInvoiceId}
        onClose={() => setLotModalInvoiceId(null)}
        invoiceId={lotModalInvoiceId}
        canWrite={canWrite}
        onSaved={() => { loadInvoices(); if (expandedId) loadInvoiceItems(expandedId); }}
      />
    </>
  );
}
