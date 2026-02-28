'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import Skeleton from '@/components/ui/Skeleton';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import MobileFilterWrapper from '@/components/ui/MobileFilterWrapper';
import { formatValue } from '@/lib/utils';
import { useRole } from '@/hooks/useRole';
import { useModalBackButton } from '@/hooks/useModalBackButton';
import InvoiceDetailsModal from '@/components/InvoiceDetailsModal';
import SettingsModal from './SettingsModal';
import type { ProductRow, ProductsSummary, ProductsResponse, SortField } from './types';

function normalizeSearch(s: string) {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function formatQuantity(value: number) {
  return value.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 4 });
}

function formatDate(value: string | null) {
  if (!value) return '-';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '-' : d.toLocaleDateString('pt-BR');
}

function getAnvisaExpirationBadge(expiration: string | null | undefined): { label: string; className: string } | null {
  if (!expiration) return null;
  const trimmed = expiration.trim().toUpperCase();
  if (!trimmed || trimmed === 'N/A' || trimmed.includes('INDETERMINADA') || trimmed.includes('VIGENTE')) return null;
  // Parse DD/MM/YYYY or YYYY-MM-DD
  let date: Date | null = null;
  const brMatch = trimmed.match(/^(\d{2})[\/\-](\d{2})[\/\-](\d{4})$/);
  if (brMatch) date = new Date(Number(brMatch[3]), Number(brMatch[2]) - 1, Number(brMatch[1]));
  else {
    const d = new Date(trimmed);
    if (!isNaN(d.getTime())) date = d;
  }
  if (!date) return null;
  const days = Math.ceil((date.getTime() - Date.now()) / 86400000);
  if (days < 0) return { label: 'Vencido', className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-800/40' };
  if (days <= 90) return { label: `${days}d`, className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200 dark:border-amber-800/40' };
  return null;
}

function formatOptional(value: number | null) {
  if (value == null) return '-';
  return formatValue(value);
}

function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query || !text) return text;
  try {
    const escaped = query.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (!escaped) return text;
    const re = new RegExp(`(${escaped})`, 'gi');
    const parts = text.split(re);
    if (parts.length <= 1) return text;
    return parts.map((part, i) =>
      part.toLowerCase() === query.trim().toLowerCase()
        ? <mark key={i} className="bg-yellow-200 dark:bg-yellow-700/60 text-inherit px-0.5 rounded">{part}</mark>
        : part
    );
  } catch {
    return text;
  }
}


const iconBgMap: Record<string, string> = {
  'text-primary': 'bg-primary/10 dark:bg-primary/20 ring-primary/20 dark:ring-primary/30',
  'text-amber-500': 'bg-amber-500/10 dark:bg-amber-500/20 ring-amber-500/20 dark:ring-amber-500/30',
  'text-orange-500': 'bg-orange-500/10 dark:bg-orange-500/20 ring-orange-500/20 dark:ring-orange-500/30',
  'text-teal-500': 'bg-teal-500/10 dark:bg-teal-500/20 ring-teal-500/20 dark:ring-teal-500/30',
  'text-blue-500': 'bg-blue-500/10 dark:bg-blue-500/20 ring-blue-500/20 dark:ring-blue-500/30',
  'text-emerald-500': 'bg-emerald-500/10 dark:bg-emerald-500/20 ring-emerald-500/20 dark:ring-emerald-500/30',
  'text-rose-500': 'bg-rose-500/10 dark:bg-rose-500/20 ring-rose-500/20 dark:ring-rose-500/30',
  'text-violet-500': 'bg-violet-500/10 dark:bg-violet-500/20 ring-violet-500/20 dark:ring-violet-500/30',
};

const DETAIL_INPUT_CLS = "w-full px-3 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-900/50 text-slate-900 dark:text-white text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-shadow disabled:bg-slate-100 dark:disabled:bg-slate-800 disabled:cursor-not-allowed";

function DetailSectionCard({ id, icon, iconColor, title, badge, isOpen, onToggle, children }: { id: string; icon: string; iconColor: string; title: string; badge?: React.ReactNode; isOpen: boolean; onToggle: (id: string) => void; children: React.ReactNode }) {
  const ibg = iconBgMap[iconColor] || iconBgMap['text-primary'];
  return (
    <div data-section-id={id} className="bg-white dark:bg-card-dark rounded-2xl ring-1 ring-slate-200/60 dark:ring-slate-800/50 overflow-hidden">
      <button
        onClick={() => onToggle(id)}
        className="w-full flex items-center gap-2.5 px-4 py-3 hover:bg-slate-50/80 dark:hover:bg-slate-800/30 transition-colors"
      >
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center ring-1 shrink-0 ${ibg}`}>
          <span className={`material-symbols-outlined text-[15px] ${iconColor}`}>{icon}</span>
        </div>
        <h4 className="text-[13px] font-bold text-slate-900 dark:text-white flex-1 text-left">{title}</h4>
        {badge}
        <span className="material-symbols-outlined text-[16px] text-slate-400 transition-transform duration-200" style={{ transform: isOpen ? 'rotate(0deg)' : 'rotate(-90deg)' }}>expand_more</span>
      </button>
      {isOpen && (
        <div className="px-4 pb-4 pt-1 border-t border-slate-100 dark:border-slate-800/60">
          {children}
        </div>
      )}
    </div>
  );
}

function DetailField({ label, children, colSpan2 }: { label: string; children: React.ReactNode; colSpan2?: boolean }) {
  return (
    <div className={`${colSpan2 ? 'col-span-2' : ''}`}>
      <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1.5">{label}</label>
      {children}
    </div>
  );
}

const BULK_INPUT_CLS = "w-full px-3 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-900/50 text-slate-900 dark:text-white text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-shadow";

const bulkFieldIconMap: Record<string, { bg: string; color: string }> = {
  category: { bg: 'bg-indigo-500/10 dark:bg-indigo-500/20 ring-indigo-500/20 dark:ring-indigo-500/30', color: 'text-indigo-500' },
  folder: { bg: 'bg-amber-500/10 dark:bg-amber-500/20 ring-amber-500/20 dark:ring-amber-500/30', color: 'text-amber-500' },
  folder_open: { bg: 'bg-orange-500/10 dark:bg-orange-500/20 ring-orange-500/20 dark:ring-orange-500/30', color: 'text-orange-500' },
  tag: { bg: 'bg-teal-500/10 dark:bg-teal-500/20 ring-teal-500/20 dark:ring-teal-500/30', color: 'text-teal-500' },
  verified: { bg: 'bg-emerald-500/10 dark:bg-emerald-500/20 ring-emerald-500/20 dark:ring-emerald-500/30', color: 'text-emerald-500' },
  toggle_on: { bg: 'bg-rose-500/10 dark:bg-rose-500/20 ring-rose-500/20 dark:ring-rose-500/30', color: 'text-rose-500' },
};

function BulkFieldRow({ checked, onChange, icon, label, children }: { checked: boolean; onChange: (v: boolean) => void; icon: string; label: string; children?: React.ReactNode }) {
  const fm = bulkFieldIconMap[icon] || { bg: 'bg-primary/10 dark:bg-primary/20 ring-primary/20 dark:ring-primary/30', color: 'text-primary' };
  return (
    <div className={`bg-white dark:bg-card-dark rounded-2xl ring-1 overflow-hidden transition-all ${checked ? 'ring-primary/30 dark:ring-primary/40 shadow-sm shadow-primary/5' : 'ring-slate-200/60 dark:ring-slate-800/50'}`}>
      <label className="flex items-center gap-2.5 px-4 py-3 cursor-pointer hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-colors">
        <div className="relative flex items-center">
          <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="sr-only peer" />
          <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${checked ? 'bg-primary border-primary scale-105' : 'border-slate-300 dark:border-slate-600'}`}>
            {checked && <span className="material-symbols-outlined text-[14px] text-white">check</span>}
          </div>
        </div>
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center ring-1 shrink-0 ${fm.bg}`}>
          <span className={`material-symbols-outlined text-[15px] ${fm.color}`}>{icon}</span>
        </div>
        <span className={`text-[13px] font-bold transition-colors ${checked ? 'text-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-400'}`}>{label}</span>
      </label>
      {checked && children && (
        <div className="px-4 pb-3.5 pt-0">
          {children}
        </div>
      )}
    </div>
  );
}

export default function ProdutosPage() {
  const { canWrite } = useRole();

  // --- server-paginated data ---
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [summary, setSummary] = useState<ProductsSummary>({
    totalProducts: 0,
    productsWithAnvisa: 0,
    totalQuantity: 0,
    invoicesProcessed: 0,
  });
  const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0, pages: 1 });
  const [meta, setMeta] = useState<ProductsResponse['meta'] | null>(null);
  const [loading, setLoading] = useState(true);
  const [settingsHierarchy, setSettingsHierarchy] = useState<{ lines: { name: string; groups: { name: string; subgroups: string[] }[] }[] }>({ lines: [] });

  // --- filter/sort state (drives server-side queries) ---
  const [search, setSearch] = useState('');
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [subtypeFilter, setSubtypeFilter] = useState<string>('');
  const [subgroupFilter, setSubgroupFilter] = useState<string>('');
  const [sortBy, setSortBy] = useState<SortField>('productType');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [lineStatusFilter, setLineStatusFilter] = useState<'active' | 'outOfLine' | 'all'>('active');
  const [currentPage, setCurrentPage] = useState(1);

  // Debounced search for server queries
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => setDebouncedSearch(search), 300);
    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current); };
  }, [search]);

  // (pagination removed — all products loaded at once)

  // Backward-compat alias: many places reference `allProducts` / `filtered`
  const allProducts = products;
  const filtered = products;

  // --- action states ---
  const [isSyncingAnvisa, setIsSyncingAnvisa] = useState(false);
  const [isExportingMissing, setIsExportingMissing] = useState(false);
  const [isImportingXls, setIsImportingXls] = useState(false);
  const [isImportingOpenData, setIsImportingOpenData] = useState(false);
  const [isImportingTypes, setIsImportingTypes] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [editingAnvisaKey, setEditingAnvisaKey] = useState<string | null>(null);
  const [isAutoClassifying, setIsAutoClassifying] = useState(false);
  const [invoiceModalId, setInvoiceModalId] = useState<string | null>(null);
  const [autoClassifyPreview, setAutoClassifyPreview] = useState<any>(null);
  const xlsInputRef = useRef<HTMLInputElement>(null);
  const openDataInputRef = useRef<HTMLInputElement>(null);
  const typesInputRef = useRef<HTMLInputElement>(null);

  // --- group collapsing ---
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const toggleGroup = (g: string) => setCollapsedGroups((prev) => {
    const n = new Set(prev);
    if (n.has(g)) {
      n.delete(g);
      // When expanding a line, collapse all its groups by default
      if (g.startsWith('line:')) {
        const lineName = g.slice(5);
        for (const p of filtered) {
          if ((p.productType || 'Sem linha') === lineName) {
            n.add(`group:${lineName}|${p.productSubtype || 'Sem grupo'}`);
          }
        }
      }
    } else {
      n.add(g);
    }
    return n;
  });

  // --- multi-select ---
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const toggleSelect = (key: string) => {
    setSelectedKeys((prev) => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  };
  const toggleSelectGroup = (matchFn: (p: ProductRow) => boolean) => {
    const groupKeys = visible.filter(matchFn).map((p) => p.key);
    if (groupKeys.length === 0) return;
    setSelectedKeys((prev) => {
      const n = new Set(prev);
      const allSelected = groupKeys.every((k) => n.has(k));
      for (const k of groupKeys) { allSelected ? n.delete(k) : n.add(k); }
      return n;
    });
  };

  // --- bulk edit ---
  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const [bulkFields, setBulkFields] = useState({
    enableType: false, productType: '',
    enableSubtype: false, productSubtype: '',
    enableSubgroup: false, productSubgroup: '',
    enableNcm: false, ncm: '',
    enableAnvisa: false, anvisa: '',
    enableOutOfLine: false, outOfLine: false,
  });
  const [bulkNewMode, setBulkNewMode] = useState({ type: false, subtype: false, subgroup: false });
  const [isBulkSaving, setIsBulkSaving] = useState(false);

  const openBulkEdit = () => {
    setBulkFields({ enableType: false, productType: '', enableSubtype: false, productSubtype: '', enableSubgroup: false, productSubgroup: '', enableNcm: false, ncm: '', enableAnvisa: false, anvisa: '', enableOutOfLine: false, outOfLine: false });
    setBulkNewMode({ type: false, subtype: false, subgroup: false });
    setBulkEditOpen(true);
  };

  const enabledCount = [bulkFields.enableType, bulkFields.enableSubtype, bulkFields.enableSubgroup, bulkFields.enableNcm, bulkFields.enableAnvisa, bulkFields.enableOutOfLine].filter(Boolean).length;

  const handleBulkSave = async () => {
    const fields: Record<string, string | null> = {};
    if (bulkFields.enableType) fields.productType = bulkFields.productType || null;
    if (bulkFields.enableSubtype) fields.productSubtype = bulkFields.productSubtype || null;
    if (bulkFields.enableSubgroup) fields.productSubgroup = bulkFields.productSubgroup || null;
    if (bulkFields.enableNcm) fields.ncm = bulkFields.ncm || null;
    if (bulkFields.enableAnvisa) fields.anvisa = bulkFields.anvisa || null;
    if (bulkFields.enableOutOfLine) (fields as any).outOfLine = bulkFields.outOfLine;
    if (Object.keys(fields).length === 0) { toast.error('Selecione pelo menos um campo para editar'); return; }

    const selectedProducts = products.filter((p) => selectedKeys.has(p.key));
    if (selectedProducts.length === 0) return;

    setIsBulkSaving(true);
    const toastId = toast.loading(`Atualizando ${selectedProducts.length} produto(s)...`);
    try {
      // Register new line/group/subgroup in catalog if creating new ones
      if (bulkNewMode.type && fields.productType) {
        await fetch('/api/products/rename-type', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'addLine', name: fields.productType }),
        });
      }
      if (bulkNewMode.subtype && fields.productSubtype) {
        await fetch('/api/products/rename-type', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'addGroup', parentType: fields.productType || bulkFields.productType, subtypeName: fields.productSubtype }),
        });
      }
      if (bulkNewMode.subgroup && fields.productSubgroup) {
        await fetch('/api/products/rename-type', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'addSubgroup', parentType: fields.productType || bulkFields.productType, parentSubtype: fields.productSubtype || bulkFields.productSubtype, subgroupName: fields.productSubgroup }),
        });
      }

      const res = await fetch('/api/products/bulk-update', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          products: selectedProducts.map((p) => ({ productKey: p.key, code: p.code, description: p.description, ncm: p.ncm, unit: p.unit, ean: p.ean })),
          fields,
        }),
      });
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err?.error || 'Falha'); }
      const result = await res.json();
      toast.success(`${result.updated} produto(s) atualizados com sucesso`, { id: toastId });
      setBulkEditOpen(false);
      setSelectedKeys(new Set());
      await loadProducts();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao atualizar', { id: toastId });
    } finally {
      setIsBulkSaving(false);
    }
  };

  // --- product detail modal ---
  const [detailProduct, setDetailProduct] = useState<ProductRow | null>(null);
  const [detailAnvisa, setDetailAnvisa] = useState('');
  const [detailNcm, setDetailNcm] = useState('');
  const [detailNcmInfo, setDetailNcmInfo] = useState<{ hierarchy: Array<{ codigo: string; descricao: string }>; fullDescription: string } | null>(null);
  const [detailNcmExpanded, setDetailNcmExpanded] = useState(false);
  const [ncmSuggestions, setNcmSuggestions] = useState<Array<{ codigo: string; descricao: string; fullDescription: string }>>([]);
  const [ncmSuggestionsOpen, setNcmSuggestionsOpen] = useState(false);
  const ncmInputRef = useRef<HTMLInputElement>(null);
  const [detailType, setDetailType] = useState('');
  const [detailSubtype, setDetailSubtype] = useState('');
  const [detailSubgroup, setDetailSubgroup] = useState('');
  const [detailNewMode, setDetailNewMode] = useState({ type: false, subtype: false, subgroup: false });
  const [detailCodigo, setDetailCodigo] = useState('');
  const [detailShortName, setDetailShortName] = useState('');
  const [detailSitTributaria, setDetailSitTributaria] = useState('');
  const [detailNomeTributacao, setDetailNomeTributacao] = useState('');
  const [detailIcms, setDetailIcms] = useState('');
  const [detailPis, setDetailPis] = useState('');
  const [detailCofins, setDetailCofins] = useState('');
  const [detailFiscalObs, setDetailFiscalObs] = useState('');
  const [detailCest, setDetailCest] = useState('');
  const [detailOrigem, setDetailOrigem] = useState('');

  const [detailIpi, setDetailIpi] = useState('');
  const [detailFcp, setDetailFcp] = useState('');
  const [detailOpenSections, setDetailOpenSections] = useState<Set<string>>(new Set());
  const [detailScrollTo, setDetailScrollTo] = useState<string | null>(null);
  const toggleDetailSection = (s: string) => setDetailOpenSections((prev) => { const n = new Set(prev); n.has(s) ? n.delete(s) : n.add(s); return n; });

  useEffect(() => {
    if (!detailScrollTo) return;
    const timer = setTimeout(() => {
      const el = document.querySelector(`[data-section-id="${detailScrollTo}"]`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setDetailScrollTo(null);
    }, 100);
    return () => clearTimeout(timer);
  }, [detailScrollTo]);
  const [savingDetail, setSavingDetail] = useState(false);
  const [syncingRegistry, setSyncingRegistry] = useState(false);
  const [anvisaValidation, setAnvisaValidation] = useState<{
    status: string | null;
    productName: string | null;
    company: string | null;
    expiration: string | null;
    riskClass: string | null;
    notFound?: boolean;
    loading?: boolean;
  } | null>(null);

  // ANVISA real-time validation with debounce
  useEffect(() => {
    const digits = detailAnvisa.replace(/\D/g, '');
    if (digits.length < 7) { setAnvisaValidation(null); return; }
    setAnvisaValidation({ status: null, productName: null, company: null, expiration: null, riskClass: null, loading: true });
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/anvisa/validate?code=${digits}`);
        if (res.ok) {
          const data = await res.json();
          setAnvisaValidation({
            status: data.status,
            productName: data.productName,
            company: data.company,
            expiration: data.expiration,
            riskClass: data.riskClass,
            notFound: data.notFound || false,
          });
        } else {
          setAnvisaValidation(null);
        }
      } catch {
        setAnvisaValidation(null);
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [detailAnvisa]);

  // --- purchase/sales history ---
  interface HistoryItem {
    invoiceId: string;
    invoiceNumber: string | null;
    issueDate: string | null;
    supplierName: string | null;
    customerName: string | null;
    quantity: number;
    unitPrice: number;
    totalValue: number;
    batch: string | null;
    expiry: string | null;
    fabrication: string | null;
  }
  const [purchaseHistory, setPurchaseHistory] = useState<HistoryItem[]>([]);
  const [salesHistory, setSalesHistory] = useState<HistoryItem[]>([]);
  const [consignmentHistory, setConsignmentHistory] = useState<HistoryItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [loadingSalesHistory, setLoadingSalesHistory] = useState(false);
  const [loadingConsignment, setLoadingConsignment] = useState(false);

  // NCM description lookup with debounce
  useEffect(() => {
    const digits = detailNcm.replace(/\D/g, '');
    if (digits.length < 4) { setDetailNcmInfo(null); setNcmSuggestions([]); setDetailNcmExpanded(false); return; }
    const timer = setTimeout(async () => {
      try {
        // Fetch full info for exact code
        const res = await fetch(`/api/ncm/${digits}`);
        if (res.ok) {
          const data = await res.json();
          setDetailNcmInfo({ hierarchy: data.hierarchy || [], fullDescription: data.fullDescription || data.descricao || '' });
        } else {
          setDetailNcmInfo(null);
        }
        // Fetch suggestions for autocomplete (by code prefix)
        if (digits.length < 8) {
          const sRes = await fetch(`/api/ncm/search?q=${digits}&limit=8`);
          if (sRes.ok) {
            setNcmSuggestions(await sRes.json());
          }
        } else {
          setNcmSuggestions([]);
        }
      } catch {
        setDetailNcmInfo(null);
        setNcmSuggestions([]);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [detailNcm]);

  const openDetail = async (product: ProductRow, initialSections?: string[]) => {
    // Show modal immediately with lightweight data
    setDetailProduct(product);
    setDetailAnvisa(product.anvisa || '');
    setDetailNcm(product.ncm || '');
    setDetailType(product.productType || '');
    setDetailSubtype(product.productSubtype || '');
    setDetailSubgroup(product.productSubgroup || '');
    setDetailNewMode({ type: false, subtype: false, subgroup: false });
    setDetailCodigo(product.codigo || '');
    setDetailShortName(product.shortName || '');
    setDetailSitTributaria(product.fiscalSitTributaria || '');
    setDetailNomeTributacao(product.fiscalNomeTributacao || '');
    setDetailIcms(product.fiscalIcms != null ? String(product.fiscalIcms) : '');
    setDetailPis(product.fiscalPis != null ? String(product.fiscalPis) : '');
    setDetailCofins(product.fiscalCofins != null ? String(product.fiscalCofins) : '');
    setDetailFiscalObs(product.fiscalObs || '');
    setDetailCest(product.fiscalCest || '');
    setDetailOrigem(product.fiscalOrigem || '');
    setDetailIpi(product.fiscalIpi != null ? String(product.fiscalIpi) : '');
    setDetailFcp(product.fiscalFcp != null ? String(product.fiscalFcp) : '');
    const nextOpenSections = new Set(initialSections || []);
    nextOpenSections.add('geral');
    setDetailOpenSections(nextOpenSections);
    setDetailScrollTo(initialSections?.length ? initialSections[0] : null);

    // Load full details (ANVISA, fiscal, aggregates) in background
    try {
      const res = await fetch(`/api/products/details?key=${encodeURIComponent(product.key)}`);
      if (res.ok) {
        const full = (await res.json()) as ProductRow;
        setDetailProduct(full);
        setDetailAnvisa(full.anvisa || '');
        setDetailNcm(full.ncm || '');
        setDetailType(full.productType || '');
        setDetailSubtype(full.productSubtype || '');
        setDetailSubgroup(full.productSubgroup || '');
        setDetailCodigo(full.codigo || '');
        setDetailShortName(full.shortName || '');
        setDetailSitTributaria(full.fiscalSitTributaria || '');
        setDetailNomeTributacao(full.fiscalNomeTributacao || '');
        setDetailIcms(full.fiscalIcms != null ? String(full.fiscalIcms) : '');
        setDetailPis(full.fiscalPis != null ? String(full.fiscalPis) : '');
        setDetailCofins(full.fiscalCofins != null ? String(full.fiscalCofins) : '');
        setDetailFiscalObs(full.fiscalObs || '');
        setDetailCest(full.fiscalCest || '');
        setDetailOrigem(full.fiscalOrigem || '');
        setDetailIpi(full.fiscalIpi != null ? String(full.fiscalIpi) : '');
        setDetailFcp(full.fiscalFcp != null ? String(full.fiscalFcp) : '');
      }
    } catch {
      // Modal still works with lightweight data
    }
  };

  const [historyProduct, setHistoryProduct] = useState<ProductRow | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [expandedBatch, setExpandedBatch] = useState<Set<string>>(new Set());
  const openHistory = (product: ProductRow) => {
    setHistoryProduct(product);
    setPurchaseHistory([]);
    setSalesHistory([]);
    setConsignmentHistory([]);
    setExpandedGroups(new Set());
    setExpandedRows(new Set());
    setExpandedBatch(new Set());
    if (product.code) {
      const params = new URLSearchParams({ code: product.code });
      if (product.unit) params.set('unit', product.unit);
      setLoadingHistory(true);
      fetch(`/api/products/history?${params}`)
        .then(r => r.json())
        .then(d => setPurchaseHistory(d.history || []))
        .catch(() => {})
        .finally(() => setLoadingHistory(false));
      const salesParams = new URLSearchParams({ code: product.code, direction: 'issued', description: product.description });
      if (product.unit) salesParams.set('unit', product.unit);
      setLoadingSalesHistory(true);
      fetch(`/api/products/history?${salesParams}`)
        .then(r => r.json())
        .then(d => setSalesHistory(d.history || []))
        .catch(() => {})
        .finally(() => setLoadingSalesHistory(false));
      // Consignment history (issued only)
      const consigParams = new URLSearchParams({ code: product.code, direction: 'issued', description: product.description, filter: 'consignment' });
      if (product.unit) consigParams.set('unit', product.unit);
      setLoadingConsignment(true);
      fetch(`/api/products/history?${consigParams}`)
        .then(r => r.json())
        .then(d => setConsignmentHistory(d.history || []))
        .catch(() => {})
        .finally(() => setLoadingConsignment(false));
    }
  };

  const detailDirty = detailProduct && (
    detailCodigo !== (detailProduct.codigo || '') ||
    detailAnvisa !== (detailProduct.anvisa || '') ||
    detailNcm !== (detailProduct.ncm || '') ||
    detailType !== (detailProduct.productType || '') ||
    detailSubtype !== (detailProduct.productSubtype || '') ||
    detailSubgroup !== (detailProduct.productSubgroup || '') ||
    detailShortName !== (detailProduct.shortName || '') ||
    detailSitTributaria !== (detailProduct.fiscalSitTributaria || '') ||
    detailNomeTributacao !== (detailProduct.fiscalNomeTributacao || '') ||
    detailIcms !== (detailProduct.fiscalIcms != null ? String(detailProduct.fiscalIcms) : '') ||
    detailPis !== (detailProduct.fiscalPis != null ? String(detailProduct.fiscalPis) : '') ||
    detailCofins !== (detailProduct.fiscalCofins != null ? String(detailProduct.fiscalCofins) : '') ||
    detailFiscalObs !== (detailProduct.fiscalObs || '') ||
    detailCest !== (detailProduct.fiscalCest || '') ||
    detailOrigem !== (detailProduct.fiscalOrigem || '') ||
    detailIpi !== (detailProduct.fiscalIpi != null ? String(detailProduct.fiscalIpi) : '') ||
    detailFcp !== (detailProduct.fiscalFcp != null ? String(detailProduct.fiscalFcp) : '')
  );

  // ---- mobile back button for inline modals ----
  const closeDetail = useCallback(() => setDetailProduct(null), []);
  const closeHistory = useCallback(() => setHistoryProduct(null), []);
  const closeAutoClassify = useCallback(() => setAutoClassifyPreview(null), []);
  const closeBulkEdit = useCallback(() => setBulkEditOpen(false), []);
  useModalBackButton(!!detailProduct, closeDetail);
  useModalBackButton(!!historyProduct, closeHistory);
  useModalBackButton(!!autoClassifyPreview, closeAutoClassify);
  useModalBackButton(bulkEditOpen, closeBulkEdit);

  // ---- load settings hierarchy (lines → groups → subgroups) ----
  const loadSettingsHierarchy = async () => {
    try {
      const res = await fetch('/api/products/settings');
      if (!res.ok) return;
      const data = await res.json();
      setSettingsHierarchy({
        lines: (data.lines || []).map((l: any) => ({
          name: l.name,
          groups: (l.groups || []).map((g: any) => ({
            name: g.name,
            subgroups: (g.subgroups || []).map((s: any) => s.name),
          })),
        })),
      });
    } catch { /* silent */ }
  };

  // ---- server-side sort field mapping ----
  const serverSortField = useMemo(() => {
    const map: Record<string, string> = {
      description: 'description',
      code: 'code',
      ncm: 'ncm',
      anvisa: 'anvisa',
      lastPrice: 'lastPrice',
      lastIssueDate: 'lastIssueDate',
      lastSaleDate: 'lastSaleDate',
      supplier: 'supplier',
      productType: 'productType',
      totalQuantity: 'quantity',
      invoiceCount: 'invoices',
    };
    return map[sortBy] || 'lastIssueDate';
  }, [sortBy]);

  // ---- load products from paginated API ----
  const fetchAbortRef = useRef<AbortController | null>(null);
  const rebuiltOnceRef = useRef(false);
  const [isRebuilding, setIsRebuilding] = useState(false);

  const loadProducts = useCallback(async () => {
    // Abort any in-flight request
    if (fetchAbortRef.current) fetchAbortRef.current.abort();
    const controller = new AbortController();
    fetchAbortRef.current = controller;

    setLoading(true);
    try {
      const params = new URLSearchParams({
        sort: serverSortField,
        order: sortOrder,
        lineStatus: lineStatusFilter,
      });
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (typeFilter) params.set('productType', typeFilter);
      if (subtypeFilter) params.set('productSubtype', subtypeFilter);
      if (subgroupFilter) params.set('productSubgroup', subgroupFilter);
      if (onlyMissing) params.set('onlyMissingAnvisa', '1');

      const res = await fetch(`/api/products/list?${params}`, { signal: controller.signal });
      if (!res.ok) throw new Error('Falha ao carregar produtos');
      const data = (await res.json()) as ProductsResponse & { needsRebuild?: boolean };

      setProducts(data.products || []);
      setSummary(
        data.summary || { totalProducts: 0, productsWithAnvisa: 0, totalQuantity: 0, invoicesProcessed: 0 },
      );
      setPagination(data.pagination || { page: 1, limit: data.products?.length || 0, total: data.products?.length || 0, pages: 1 });
      setMeta(data.meta || null);

      // If aggregates are missing, trigger rebuild in background then reload
      if (data.needsRebuild && !rebuiltOnceRef.current) {
        rebuiltOnceRef.current = true;
        setIsRebuilding(true);
        fetch('/api/products/rebuild-aggregates', { method: 'POST' })
          .then((r) => { if (r.ok) return r.json(); throw new Error(); })
          .then(() => {
            setIsRebuilding(false);
            // Re-fetch to get the aggregated data
            fetch(`/api/products/list?${params}`)
              .then((r) => r.json())
              .then((d: ProductsResponse) => {
                setProducts(d.products || []);
                setSummary(d.summary || { totalProducts: 0, productsWithAnvisa: 0, totalQuantity: 0, invoicesProcessed: 0 });
                setPagination({ page: 1, limit: d.products?.length || 0, total: d.products?.length || 0, pages: 1 });
                setMeta(d.meta || null);
              })
              .catch(() => {});
          })
          .catch(() => setIsRebuilding(false));
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') return;
      toast.error('Erro ao carregar produtos');
    } finally {
      setLoading(false);
    }
  }, [serverSortField, sortOrder, lineStatusFilter, debouncedSearch, typeFilter, subtypeFilter, subgroupFilter, onlyMissing]);

  useEffect(() => {
    loadProducts();
    loadSettingsHierarchy();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadProducts]);

  // ---- merged hierarchy options (products + catalog) ----
  const hierOptions = useMemo(() => {
    const sort = (a: string, b: string) => a.localeCompare(b, 'pt-BR');
    const lineSet = new Set<string>();
    const allGroupSet = new Set<string>();
    const allSubgroupSet = new Set<string>();
    const groupMap = new Map<string, Set<string>>(); // line → groups
    const subgroupMap = new Map<string, Set<string>>(); // line:::group → subgroups
    const subgroupByGroup = new Map<string, Set<string>>(); // group → subgroups (cross-line)

    const addEntry = (line?: string | null, group?: string | null, subgroup?: string | null) => {
      if (line) {
        lineSet.add(line);
        if (!groupMap.has(line)) groupMap.set(line, new Set());
      }
      if (group) {
        allGroupSet.add(group);
        if (line) groupMap.get(line)!.add(group);
        if (!subgroupByGroup.has(group)) subgroupByGroup.set(group, new Set());
      }
      if (subgroup) {
        allSubgroupSet.add(subgroup);
        if (group) subgroupByGroup.get(group)!.add(subgroup);
        if (line && group) {
          const sgKey = `${line}:::${group}`;
          if (!subgroupMap.has(sgKey)) subgroupMap.set(sgKey, new Set());
          subgroupMap.get(sgKey)!.add(subgroup);
        }
      }
    };

    for (const line of settingsHierarchy.lines) {
      for (const group of line.groups) {
        for (const sg of group.subgroups) addEntry(line.name, group.name, sg);
        if (group.subgroups.length === 0) addEntry(line.name, group.name);
      }
      if (line.groups.length === 0) addEntry(line.name);
    }
    for (const p of allProducts) addEntry(p.productType, p.productSubtype, p.productSubgroup);

    // Build grouped lists for dropdowns: { line, groups[] }[]
    const sortedLines = Array.from(lineSet).sort(sort);
    const groupsByLine: { line: string; groups: string[] }[] = sortedLines
      .map((l) => ({ line: l, groups: Array.from(groupMap.get(l) || []).sort(sort) }))
      .filter((e) => e.groups.length > 0);
    // Groups that exist but have no line association (edge case)
    const groupsWithLine = new Set(groupsByLine.flatMap((e) => e.groups));
    const orphanGroups = Array.from(allGroupSet).filter((g) => !groupsWithLine.has(g)).sort(sort);

    // Subgroups grouped by group name
    const subgroupsByGroup: { group: string; subgroups: string[] }[] = Array.from(subgroupByGroup.entries())
      .map(([g, sgs]) => ({ group: g, subgroups: Array.from(sgs).sort(sort) }))
      .filter((e) => e.subgroups.length > 0)
      .sort((a, b) => sort(a.group, b.group));
    const subgroupsWithGroup = new Set(subgroupsByGroup.flatMap((e) => e.subgroups));
    const orphanSubgroups = Array.from(allSubgroupSet).filter((s) => !subgroupsWithGroup.has(s)).sort(sort);

    return {
      lines: sortedLines,
      allGroups: Array.from(allGroupSet).sort(sort),
      allSubgroups: Array.from(allSubgroupSet).sort(sort),
      groupsByLine,
      orphanGroups,
      subgroupsByGroup,
      orphanSubgroups,
      groupsFor: (line: string) => Array.from(groupMap.get(line) || []).sort(sort),
      subgroupsFor: (line: string, group: string) => Array.from(subgroupMap.get(`${line}:::${group}`) || []).sort(sort),
      subgroupsForGroup: (group: string) => Array.from(subgroupByGroup.get(group) || []).sort(sort),
    };
  }, [allProducts, settingsHierarchy]);

  // Server handles filtering/sorting — `filtered` is aliased to `products` above.

  // Collapse all groups when no search; expand all when searching
  const filteredLen = filtered.length;
  const isSearching = search !== '';
  useEffect(() => {
    if (isSearching) {
      // Expand everything when searching
      setCollapsedGroups(new Set());
      return;
    }
    // Collapse by default (lines for productType sort, groups for others)
    if (filteredLen > 0) {
      const groups = new Set<string>();
      for (const p of filtered) {
        switch (sortBy) {
          case 'supplier':    groups.add(p.lastSupplierName || 'Sem fabricante'); break;
          case 'productType': {
            groups.add(`line:${p.productType || 'Sem linha'}`);
            // Also pre-collapse all groups so they start collapsed when line is expanded
            groups.add(`group:${p.productType || 'Sem linha'}|${p.productSubtype || 'Sem grupo'}`);
            break;
          }
          case 'ncm':         groups.add(p.ncm ? p.ncm.slice(0, 4) + '.xx.xx' : 'Sem NCM'); break;
          case 'anvisa':      groups.add(p.anvisa ? 'Com ANVISA' : 'Sem ANVISA'); break;
          default:            break;
        }
      }
      setCollapsedGroups(groups);
    }
  // filtered is derived from products and doesn't change identity independently of filteredLen
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortBy, filteredLen, isSearching]);

  // show all filtered results (no pagination)
  const visible = filtered;

  const getGroupLabel = (product: ProductRow): string => {
    switch (sortBy) {
      case 'supplier':    return product.lastSupplierName || 'Sem fabricante';
      case 'productType': return `group:${product.productType || 'Sem linha'}|${product.productSubtype || 'Sem grupo'}`;
      case 'ncm':         return product.ncm ? product.ncm.slice(0, 4) + '.xx.xx' : 'Sem NCM';
      case 'anvisa':      return product.anvisa ? 'Com ANVISA' : 'Sem ANVISA';
      case 'lastIssueDate': {
        if (!product.lastIssueDate) return 'Sem data';
        const d = new Date(product.lastIssueDate);
        return `${d.toLocaleString('pt-BR', { month: 'long' })} / ${d.getFullYear()}`;
      }
      case 'description': return (product.description?.[0] || '#').toUpperCase();
      case 'code':        return product.code ? product.code[0].toUpperCase() : '#';
      default:            return '';
    }
  };

  const getLineLabel = (product: ProductRow): string => `line:${product.productType || 'Sem linha'}`;

  // --- visible keys for select-all (depends on getGroupLabel) ---
  const visibleKeys = useMemo(() => {
    const keys: string[] = [];
    let lastGroup = '';
    for (const p of filtered) {
      const g = getGroupLabel(p);
      if (g !== lastGroup) lastGroup = g;
      const lineKey = sortBy === 'productType' ? getLineLabel(p) : '';
      if (collapsedGroups.has(g)) continue;
      if (sortBy === 'productType' && collapsedGroups.has(lineKey)) continue;
      keys.push(p.key);
    }
    return keys;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, collapsedGroups, sortBy]);
  const allVisibleSelected = visibleKeys.length > 0 && visibleKeys.every((k) => selectedKeys.has(k));
  const someVisibleSelected = visibleKeys.some((k) => selectedKeys.has(k));
  const toggleSelectAll = () => {
    if (allVisibleSelected) {
      setSelectedKeys((prev) => { const n = new Set(prev); visibleKeys.forEach((k) => n.delete(k)); return n; });
    } else {
      setSelectedKeys((prev) => { const n = new Set(prev); visibleKeys.forEach((k) => n.add(k)); return n; });
    }
  };

  const handleToggleOutOfLine = async (product: ProductRow) => {
    const newVal = !product.outOfLine;
    try {
      const res = await fetch('/api/products/bulk-update', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          products: [{ productKey: product.key, code: product.code, description: product.description, ncm: product.ncm, unit: product.unit, ean: product.ean }],
          fields: { outOfLine: newVal },
        }),
      });
      if (!res.ok) throw new Error();
      setProducts((prev) => prev.map((p) => p.key === product.key ? { ...p, outOfLine: newVal } : p));
      toast.success(newVal ? 'Produto marcado como fora de linha' : 'Produto restaurado para em linha');
    } catch {
      toast.error('Erro ao atualizar produto');
    }
  };

  // ---- handlers ----
  const handleSort = (field: SortField) => {
    if (sortBy === field) {
      setSortOrder((o) => (o === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(field);
      setSortOrder(['description', 'code', 'ncm', 'anvisa', 'supplier', 'productType'].includes(field) ? 'asc' : 'desc');
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortBy !== field)
      return <span className="material-symbols-outlined text-[16px] text-slate-300 opacity-0 group-hover:opacity-50">unfold_more</span>;
    return (
      <span className="material-symbols-outlined text-[16px] text-primary">
        {sortOrder === 'asc' ? 'expand_less' : 'expand_more'}
      </span>
    );
  };

  const [isExporting, setIsExporting] = useState(false);
  const handleExport = async () => {
    if (isExporting) return;
    setIsExporting(true);
    const toastId = toast.loading('Exportando produtos...');
    try {
      const res = await fetch('/api/products?exportAll=1&sort=lastIssue&order=desc');
      if (!res.ok) throw new Error();
      const data = (await res.json()) as ProductsResponse;
      const all = data.products || [];
      if (all.length === 0) { toast.dismiss(toastId); toast.info('Nenhum produto para exportar'); return; }
      const esc = (v: string | null | undefined) => {
        const s = v || '';
        return s.includes(';') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
      };
      const fmtNum = (v: number | null | undefined) => v != null ? String(v).replace('.', ',') : '';
      const headers = [
        'Codigo', 'Referencia', 'Produto', 'Nome Abreviado', 'Unidade', 'EAN',
        'Linha', 'Grupo', 'Subgrupo', 'Fora de Linha',
        'NCM', 'CEST', 'Origem', 'CST ICMS', 'Nome Tributacao',
        'ICMS %', 'PIS %', 'COFINS %', 'IPI %', 'FCP %', 'Obs Fiscal',
        'ANVISA', 'Status ANVISA', 'Vencimento ANVISA', 'Classe Risco', 'Processo ANVISA',
        'Produto Registrado', 'Detentor Registro', 'Fabricante', 'Pais Fabricante',
        'Ultimo Preco Compra', 'Ultimo Preco Venda', 'Qtde Total', 'Notas',
        'Data Ultima Compra', 'Data Ultima Venda', 'Ultimo Fornecedor',
      ];
      const rows = all.map((p: any) => [
        esc(p.codigo), esc(p.code), esc(p.description), esc(p.shortName), esc(p.unit), esc(p.ean),
        esc(p.productType), esc(p.productSubtype), esc(p.productSubgroup), p.outOfLine ? 'Sim' : 'Nao',
        esc(p.ncm), esc(p.fiscalCest), esc(p.fiscalOrigem), esc(p.fiscalSitTributaria), esc(p.fiscalNomeTributacao),
        fmtNum(p.fiscalIcms), fmtNum(p.fiscalPis), fmtNum(p.fiscalCofins), fmtNum(p.fiscalIpi), fmtNum(p.fiscalFcp), esc(p.fiscalObs),
        esc(p.anvisa), esc(p.anvisaStatus), formatDate(p.anvisaExpiration), esc(p.anvisaRiskClass), esc(p.anvisaProcess),
        esc(p.anvisaMatchedProductName), esc(p.anvisaHolder), esc(p.anvisaManufacturer), esc(p.anvisaManufacturerCountry),
        formatValue(p.lastPrice), formatOptional(p.lastSalePrice), formatQuantity(p.totalQuantity), String(p.invoiceCount),
        formatDate(p.lastIssueDate), formatDate(p.lastSaleDate), esc(p.lastSupplierName),
      ]);
      const csv = '\uFEFF' + [headers.join(';'), ...rows.map((r: any) => r.join(';'))].join('\n');
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
      const a = document.createElement('a');
      a.href = url; a.download = `produtos-${new Date().toISOString().split('T')[0]}.csv`; a.click();
      URL.revokeObjectURL(url);
      toast.success(`${all.length.toLocaleString('pt-BR')} produtos exportados`, { id: toastId });
    } catch {
      toast.error('Erro ao exportar', { id: toastId });
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportMissingAnvisa = async () => {
    if (isExportingMissing) return;
    setIsExportingMissing(true);
    const toastId = toast.loading('Exportando produtos sem ANVISA...');
    try {
      const res = await fetch('/api/products?exportAll=1&onlyMissingAnvisa=1&sort=lastIssue&order=desc');
      if (!res.ok) throw new Error();
      const data = (await res.json()) as ProductsResponse;
      const missing = data.products || [];
      if (missing.length === 0) { toast.dismiss(toastId); toast.info('Nenhum produto sem ANVISA'); return; }
      const headers = ['Referencia', 'Produto', 'NCM', 'EAN', 'Ultimo Preco', 'Data Ultima Compra', 'Fornecedor'];
      const rows = missing.map((p: any) => [
        p.code, p.description, p.ncm || '', p.ean || '',
        formatValue(p.lastPrice), formatDate(p.lastIssueDate), p.lastSupplierName || '',
      ]);
      const csv = '\uFEFF' + [headers.join(';'), ...rows.map((r: any) => r.join(';'))].join('\n');
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
      const a = document.createElement('a');
      a.href = url; a.download = `produtos-sem-anvisa-${new Date().toISOString().split('T')[0]}.csv`; a.click();
      URL.revokeObjectURL(url);
      toast.success(`${missing.length.toLocaleString('pt-BR')} produtos exportados`, { id: toastId });
    } catch {
      toast.error('Erro ao exportar', { id: toastId });
    } finally {
      setIsExportingMissing(false);
    }
  };

  const handleSyncAnvisa = async () => {
    if (isSyncingAnvisa) return;
    setIsSyncingAnvisa(true);
    try {
      const res = await fetch('/api/products/sync-anvisa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'missing' }),
      });
      if (!res.ok) throw new Error();
      const payload = await res.json();
      const s = payload?.stats;
      toast.success(`Sincronizado. Atualizados: ${Number(s?.updated || 0).toLocaleString('pt-BR')} | NF-e saída: ${Number(s?.fromIssued || 0).toLocaleString('pt-BR')} | Catálogo: ${Number(s?.fromCatalog || 0).toLocaleString('pt-BR')}`);
      await loadProducts();
    } catch {
      toast.error('Erro ao sincronizar ANVISA');
    } finally {
      setIsSyncingAnvisa(false);
    }
  };

  const handleXlsImport = async (file: File) => {
    if (isImportingXls) return;
    setIsImportingXls(true);
    const toastId = toast.loading('Lendo planilha...');
    try {
      // Read XLS client-side using SheetJS (xlsx)
      const { read, utils } = await import('xlsx');
      const buffer = await file.arrayBuffer();
      const wb = read(buffer, { type: 'array' });
      const sh = wb.Sheets[wb.SheetNames[0]];
      const rows: unknown[][] = utils.sheet_to_json(sh, { header: 1, defval: '' });

      // Find header row (Referência, Reg. Anvisa)
      let codigoCol = -1, anvisaCol = -1, fabricanteCol = -1;
      let dataStartRow = 0;
      for (let r = 0; r < Math.min(20, rows.length); r++) {
        const row = rows[r] as string[];
        const codigoIdx = row.findIndex((v) => String(v).toLowerCase().includes('código') || String(v).toLowerCase() === 'codigo');
        const anvisaIdx = row.findIndex((v) => String(v).toLowerCase().includes('anvisa') || String(v).toLowerCase().includes('reg.'));
        const fabIdx = row.findIndex((v) => String(v).toLowerCase().includes('fabricante'));
        if (codigoIdx >= 0 && anvisaIdx >= 0) {
          codigoCol = codigoIdx;
          anvisaCol = anvisaIdx;
          fabricanteCol = fabIdx;
          dataStartRow = r + 1;
          break;
        }
      }

      if (codigoCol === -1 || anvisaCol === -1) {
        toast.error('Não foi possível identificar as colunas "Referência" e "Reg. Anvisa" na planilha.', { id: toastId });
        return;
      }

      // Extract items
      const items: { codigo: string; anvisa: string; fabricante?: string }[] = [];
      for (let r = dataStartRow; r < rows.length; r++) {
        const row = rows[r] as string[];
        const codigo = String(row[codigoCol] ?? '').trim();
        const anvisaRaw = String(row[anvisaCol] ?? '').trim();
        const anvisa = anvisaRaw.replace(/\D/g, '');
        if (!codigo || anvisa.length !== 11) continue;
        const fabricante = fabricanteCol >= 0 ? String(row[fabricanteCol] ?? '').trim() : undefined;
        items.push({ codigo, anvisa, fabricante });
      }

      if (items.length === 0) {
        toast.error('Nenhum item com código e ANVISA válido encontrado na planilha.', { id: toastId });
        return;
      }

      toast.loading(`${items.length.toLocaleString('pt-BR')} itens encontrados. Cruzando com NF-e...`, { id: toastId });

      const res = await fetch('/api/products/anvisa/bulk-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || 'Falha na importação');
      }

      const result = await res.json();
      toast.success(
        `Importação concluída! Atualizados: ${result.updated} | Já existentes: ${result.skipped} | Itens da planilha: ${items.length}`,
        { id: toastId, duration: 8000 },
      );

      if (result.updated > 0) await loadProducts();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao importar planilha', { id: toastId });
    } finally {
      setIsImportingXls(false);
      if (xlsInputRef.current) xlsInputRef.current.value = '';
    }
  };

  const saveAnvisa = async (product: ProductRow, anvisa: string) => {
    const digits = anvisa.replace(/\D/g, '');
    if (digits && digits.length !== 11) { toast.error('Código ANVISA inválido. Informe exatamente 11 dígitos.'); return false; }
    setEditingAnvisaKey(product.key);
    try {
      const res = await fetch('/api/products/anvisa', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productKey: product.key, anvisa: digits, code: product.code, description: product.description, ncm: product.ncm, unit: product.unit, ean: product.ean }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload?.error || 'Falha ao salvar ANVISA');
      }
      toast.success('Código ANVISA salvo');
      await loadProducts();
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao salvar ANVISA');
      return false;
    } finally {
      setEditingAnvisaKey(null);
    }
  };

  const handleSaveDetail = async () => {
    if (!detailProduct) return;
    setSavingDetail(true);
    const fields: Record<string, string | number | null> = {};

    const anvisaDigits = detailAnvisa.replace(/\D/g, '');
    if (detailAnvisa !== (detailProduct.anvisa || '')) {
      if (anvisaDigits && anvisaDigits.length !== 11) {
        toast.error('Código ANVISA inválido. Informe exatamente 11 dígitos.');
        setSavingDetail(false);
        return;
      }
      fields.anvisa = anvisaDigits || null;
    }
    if (detailNcm !== (detailProduct.ncm || '')) fields.ncm = detailNcm.trim() || null;
    if (detailType !== (detailProduct.productType || '')) fields.productType = detailType.trim() || null;
    if (detailSubtype !== (detailProduct.productSubtype || '')) fields.productSubtype = detailSubtype.trim() || null;
    if (detailSubgroup !== (detailProduct.productSubgroup || '')) fields.productSubgroup = detailSubgroup.trim() || null;
    if (detailCodigo !== (detailProduct.codigo || '')) fields.codigo = detailCodigo.trim() || null;
    if (detailShortName !== (detailProduct.shortName || '')) fields.shortName = detailShortName.trim() || null;
    if (detailSitTributaria !== (detailProduct.fiscalSitTributaria || '')) fields.fiscalSitTributaria = detailSitTributaria.trim() || null;
    if (detailNomeTributacao !== (detailProduct.fiscalNomeTributacao || '')) fields.fiscalNomeTributacao = detailNomeTributacao.trim() || null;
    if (detailIcms !== (detailProduct.fiscalIcms != null ? String(detailProduct.fiscalIcms) : '')) fields.fiscalIcms = detailIcms.trim() ? Number(detailIcms) : null;
    if (detailPis !== (detailProduct.fiscalPis != null ? String(detailProduct.fiscalPis) : '')) fields.fiscalPis = detailPis.trim() ? Number(detailPis) : null;
    if (detailCofins !== (detailProduct.fiscalCofins != null ? String(detailProduct.fiscalCofins) : '')) fields.fiscalCofins = detailCofins.trim() ? Number(detailCofins) : null;
    if (detailFiscalObs !== (detailProduct.fiscalObs || '')) fields.fiscalObs = detailFiscalObs.trim() || null;
    if (detailCest !== (detailProduct.fiscalCest || '')) fields.fiscalCest = detailCest.trim() || null;
    if (detailOrigem !== (detailProduct.fiscalOrigem || '')) fields.fiscalOrigem = detailOrigem.trim() || null;
    if (detailIpi !== (detailProduct.fiscalIpi != null ? String(detailProduct.fiscalIpi) : '')) fields.fiscalIpi = detailIpi.trim() ? Number(detailIpi) : null;
    if (detailFcp !== (detailProduct.fiscalFcp != null ? String(detailProduct.fiscalFcp) : '')) fields.fiscalFcp = detailFcp.trim() ? Number(detailFcp) : null;

    if (Object.keys(fields).length === 0) { setSavingDetail(false); return; }

    try {
      // Register new line/group/subgroup in catalog if creating new ones
      if (detailNewMode.type && fields.productType) {
        await fetch('/api/products/rename-type', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'addLine', name: fields.productType }),
        });
      }
      if (detailNewMode.subtype && fields.productSubtype) {
        await fetch('/api/products/rename-type', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'addGroup', parentType: fields.productType || detailType, subtypeName: fields.productSubtype }),
        });
      }
      if (detailNewMode.subgroup && fields.productSubgroup) {
        await fetch('/api/products/rename-type', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'addSubgroup', parentType: fields.productType || detailType, parentSubtype: fields.productSubtype || detailSubtype, subgroupName: fields.productSubgroup }),
        });
      }

      const res = await fetch('/api/products/bulk-update', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          products: [{ productKey: detailProduct.key, code: detailProduct.code, description: detailProduct.description, ncm: detailProduct.ncm, unit: detailProduct.unit, ean: detailProduct.ean }],
          fields,
        }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e?.error || 'Falha'); }
      toast.success('Produto atualizado');
      setDetailProduct(null);
      await loadProducts();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao salvar');
    } finally {
      setSavingDetail(false);
    }
  };

  const handleSyncRegistry = async (product: ProductRow) => {
    if (syncingRegistry || !product.anvisa) return;
    setSyncingRegistry(true);
    const toastId = toast.loading('Consultando ANVISA...');
    try {
      const res = await fetch('/api/products/anvisa/sync-registry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'selected', productKeys: [product.key] }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      if (data.notFound > 0) {
        toast.warning('Registro não encontrado na base da ANVISA.', { id: toastId });
      } else {
        toast.success('Dados do registro ANVISA atualizados!', { id: toastId });
      }
      await loadProducts();
      // Re-sync detailProduct with updated data
      setDetailProduct((prev) => prev ? { ...prev } : null);
    } catch {
      toast.error('Erro ao consultar a ANVISA', { id: toastId });
    } finally {
      setSyncingRegistry(false);
    }
  };

  const handleOpenDataImport = async (file: File) => {
    if (isImportingOpenData) return;
    setIsImportingOpenData(true);
    const toastId = toast.loading('Lendo arquivo de dados ANVISA...');
    try {
      // Parse CSV (semicolon-delimited, Latin-1) or XLS
      let allRows: string[][];
      const fn = file.name.toLowerCase();
      if (fn.endsWith('.csv') || fn.endsWith('.txt')) {
        const buf = await file.arrayBuffer();
        const text = new TextDecoder('latin1').decode(buf);
        allRows = text.split(/\r?\n/).filter(Boolean).map((line) => {
          const cols: string[] = [];
          let cur = '', inQ = false;
          for (let i = 0; i < line.length; i++) {
            const c = line[i];
            if (c === '"') { inQ = !inQ; continue; }
            if (c === ';' && !inQ) { cols.push(cur.trim()); cur = ''; continue; }
            cur += c;
          }
          cols.push(cur.trim());
          return cols;
        });
      } else {
        const { read, utils } = await import('xlsx');
        const buf = await file.arrayBuffer();
        const wb = read(buf, { type: 'array' });
        allRows = utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' }) as string[][];
      }

      if (allRows.length < 2) { toast.error('Arquivo vazio ou sem dados', { id: toastId }); return; }

      const normH = (s: string) => String(s).trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const headerRow = allRows[0].map(normH);

      // Exact match first, then partial — but skip CNPJ_ columns to avoid matching CNPJ_DETENTOR before DETENTOR
      const findCol = (...candidates: string[]): number => {
        for (const c of candidates) {
          const i = headerRow.findIndex((h) => h === c); if (i >= 0) return i;
        }
        for (const c of candidates) {
          const i = headerRow.findIndex((h) => h.includes(c) && !h.startsWith('CNPJ')); if (i >= 0) return i;
        }
        return -1;
      };

      const regCol      = findCol('NUMERO_REGISTRO_CADASTRO', 'NUMERO_REGISTRO_PRODUTO', 'NU_REGISTRO_PRODUTO', 'NUMERO_REGISTRO');
      const nomeCol     = findCol('NOME_TECNICO', 'NOME_PRODUTO', 'NO_PRODUTO');
      const empresaCol  = findCol('DETENTOR_REGISTRO_CADASTRO', 'EMPRESA_DETENTORA_REGISTRO', 'NO_RAZAO_SOCIAL', 'DETENTOR', 'EMPRESA');
      const processoCol = findCol('NUMERO_PROCESSO', 'PROCESSO');
      const situacaoCol = findCol('SITUACAO_REGISTRO', 'ST_SITUACAO_REGISTRO', 'SITUACAO');
      const venctoCol   = findCol('VALIDADE_REGISTRO_CADASTRO', 'DATA_VENCIMENTO_REGISTRO', 'DT_VENCIMENTO', 'VALIDADE');
      const classeCol   = findCol('CLASSE_RISCO');
      const fabricanteCol = findCol('NOME_FABRICANTE');
      const paisFabCol    = findCol('NOME_PAIS_FABRIC');

      if (regCol === -1) {
        toast.error('Coluna de registro não encontrada. Esperado: "NUMERO_REGISTRO_CADASTRO" ou "NUMERO_REGISTRO_PRODUTO".', { id: toastId });
        return;
      }

      toast.loading(`Processando ${(allRows.length - 1).toLocaleString('pt-BR')} linhas...`, { id: toastId });

      // Fetch all product ANVISA codes to match against the open data file
      let ourCodes = new Set<string>();
      try {
        const allRes = await fetch('/api/products?exportAll=1&sort=lastIssue&order=desc');
        if (allRes.ok) {
          const allData = await allRes.json();
          ourCodes = new Set(
            (allData.products || []).map((p: any) => (p.anvisa || '').replace(/\D/g, '').padStart(11, '0')).filter((c: string) => c.length === 11),
          );
        }
      } catch { /* use empty set */ }

      const items: {
        registration: string; nomeProduto: string | null; nomeEmpresa: string | null;
        processo: string | null; situacao: string | null; vencimento: string | null; classeRisco: string | null;
        nomeFabricante: string | null; paisFabricante: string | null;
      }[] = [];

      const col = (row: string[], idx: number) => idx >= 0 ? (row[idx] ?? '').trim() || null : null;

      for (let i = 1; i < allRows.length; i++) {
        const row = allRows[i];
        const rawReg = String(row[regCol] ?? '').replace(/\D/g, '');
        if (!rawReg) continue;
        const reg = rawReg.padStart(11, '0');
        if (reg.length !== 11) continue;
        if (ourCodes.size > 0 && !ourCodes.has(reg)) continue;

        // Strip CNPJ prefix from empresa field: "12345678000199 - EMPRESA" → "EMPRESA"
        let empresa = col(row, empresaCol);
        if (empresa) empresa = empresa.replace(/^\d{14}\s*-\s*/, '').trim() || empresa;

        let validade = col(row, venctoCol);
        let situacao = col(row, situacaoCol);
        if (validade?.toUpperCase() === 'VIGENTE') {
          situacao = situacao || 'Válido'; validade = null;
        } else if (validade) {
          const m = validade.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
          if (m) validade = `${m[3]}-${m[2]}-${m[1]}`;
        }

        items.push({ registration: reg, nomeProduto: col(row, nomeCol), nomeEmpresa: empresa,
          processo: col(row, processoCol), situacao, vencimento: validade, classeRisco: col(row, classeCol),
          nomeFabricante: col(row, fabricanteCol), paisFabricante: col(row, paisFabCol) });
      }

      if (items.length === 0) {
        toast.error('Nenhum código ANVISA do arquivo corresponde aos produtos cadastrados.', { id: toastId });
        return;
      }

      toast.loading(`${items.length.toLocaleString('pt-BR')} registros encontrados. Salvando...`, { id: toastId });

      const res = await fetch('/api/products/anvisa/upload-opendata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || 'Falha no upload');
      }

      const result = await res.json();
      toast.success(
        `Dados ANVISA atualizados! Atualizados: ${result.updated} | Sem correspondência: ${result.notFound} | Códigos no arquivo: ${result.codesInFile.toLocaleString('pt-BR')}`,
        { id: toastId, duration: 10000 },
      );

      if (result.updated > 0) await loadProducts();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao processar arquivo', { id: toastId });
    } finally {
      setIsImportingOpenData(false);
      if (openDataInputRef.current) openDataInputRef.current.value = '';
    }
  };

  const handleImportTypes = async (file: File) => {
    if (isImportingTypes) return;
    setIsImportingTypes(true);
    const toastId = toast.loading('Importando linhas de produto...');
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/products/import-types', { method: 'POST', body: fd });
      const result = await res.json();
      if (!res.ok) throw new Error(result?.error || 'Falha na importação');
      toast.success(
        `Linhas importadas! Atualizados: ${result.matched} de ${result.parsed} itens do arquivo`,
        { id: toastId },
      );
      loadProducts();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao importar linhas', { id: toastId });
    } finally {
      setIsImportingTypes(false);
      if (typesInputRef.current) typesInputRef.current.value = '';
    }
  };

  const handleBulkSyncRegistry = async () => {
    if (syncingRegistry) return;
    setSyncingRegistry(true);
    const toastId = toast.loading('Sincronizando registros ANVISA...');
    try {
      const res = await fetch('/api/products/anvisa/sync-registry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'all' }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      toast.success(
        `Sincronizado! Atualizados: ${data.synced} | Não encontrados: ${data.notFound} | Total: ${data.total}`,
        { id: toastId, duration: 8000 },
      );
      await loadProducts();
    } catch {
      toast.error('Erro ao sincronizar registros ANVISA', { id: toastId });
    } finally {
      setSyncingRegistry(false);
    }
  };


  const handleAutoClassify = async (dryRun: boolean) => {
    setIsAutoClassifying(true);
    const toastId = dryRun ? undefined : toast.loading('Analisando e classificando produtos...');
    try {
      const res = await fetch('/api/products/auto-classify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dryRun }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      if (dryRun) {
        setAutoClassifyPreview(data);
      } else {
        toast.success(
          `Classificação concluída! ${data.updatesApplied} produto(s) atualizados — ANVISA: ${data.byField.anvisa}, Linha: ${data.byField.productType}, Grupo: ${data.byField.productSubtype}`,
          { id: toastId, duration: 10000 },
        );
        setAutoClassifyPreview(null);
        await loadProducts();
      }
    } catch {
      if (toastId) toast.error('Erro ao classificar produtos', { id: toastId });
      else toast.error('Erro ao analisar produtos');
    } finally {
      setIsAutoClassifying(false);
    }
  };

  const missingCount = meta?.anvisaStats?.missing ?? (summary.totalProducts - summary.productsWithAnvisa);

  return (
    <>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-[28px] text-primary">inventory_2</span>
          <div>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Produtos</h2>
            <p className="text-slate-500 dark:text-slate-400 text-xs font-medium">
              Cadastro automático por produtos das NF-e de entrada, sem duplicar itens repetidos
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap justify-end">
          {canWrite && (
            <button
              onClick={() => setSettingsOpen(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-card-dark border border-violet-200 dark:border-violet-800 rounded-lg text-sm font-medium text-violet-700 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-900/20 transition-colors shadow-sm"
              title="Linhas, fabricantes, dados fiscais"
            >
              <span className="material-symbols-outlined text-[20px]">settings</span>
              Ajustes
            </button>
          )}
          <button
            onClick={handleExport}
            disabled={filtered.length === 0}
            className="flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-card-dark border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 transition-colors shadow-sm disabled:opacity-40"
          >
            <span className="material-symbols-outlined text-[20px]">download</span>
            Exportar
          </button>
        </div>
      </div>



      {/* Search + filters */}
      <MobileFilterWrapper activeFilterCount={[search, typeFilter, subtypeFilter, subgroupFilter, lineStatusFilter !== 'all' ? lineStatusFilter : ''].filter(Boolean).length} title="Filtros" icon="inventory_2">
        <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-end">
          {/* Search - full width on mobile, flex-1 on desktop */}
          <div className="w-full md:flex-1 md:order-last">
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
              Buscar por código, descrição, NCM, ANVISA ou fornecedor
            </label>
            <div className="relative">
              <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-[18px] text-slate-400">search</span>
              <input
                type="text"
                placeholder="ex: 7891234567890 ou dipirona"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="block w-full pl-9 pr-8 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-900/50 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary text-sm transition-all"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <span className="material-symbols-outlined text-[18px]">close</span>
                </button>
              )}
            </div>
          </div>
          {/* Hierarchy selects - grid on mobile */}
          <div className="grid grid-cols-2 gap-3 md:contents">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Linha</label>
              <select
                value={typeFilter}
                onChange={(e) => { setTypeFilter(e.target.value); setSubtypeFilter(''); setSubgroupFilter(''); }}
                className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-900/50 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
              >
                <option value="">Todos</option>
                {hierOptions.lines.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            {typeFilter && (
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Grupo</label>
                <select
                  value={subtypeFilter}
                  onChange={(e) => { setSubtypeFilter(e.target.value); setSubgroupFilter(''); }}
                  className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-900/50 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
                >
                  <option value="">Todos</option>
                  {hierOptions.groupsFor(typeFilter).map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            )}
            {subtypeFilter && (() => {
              const subgroups = hierOptions.subgroupsFor(typeFilter, subtypeFilter);
              return subgroups.length > 0 ? (
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Subgrupo</label>
                  <select
                    value={subgroupFilter}
                    onChange={(e) => setSubgroupFilter(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-900/50 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
                  >
                    <option value="">Todos</option>
                    {subgroups.map((s) => (
                      <option key={s!} value={s!}>{s}</option>
                    ))}
                  </select>
                </div>
              ) : null;
            })()}
          </div>
          {/* Sort + Status + Clear - row on mobile */}
          <div className="flex flex-wrap gap-3 items-end">
            <div className="shrink-0">
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Ordenar por</label>
              <div className="flex gap-1">
                <select
                  value={sortBy}
                  onChange={(e) => {
                    const f = e.target.value as SortField;
                    setSortBy(f);
                    setSortOrder(['description', 'code', 'ncm', 'anvisa', 'supplier', 'productType'].includes(f) ? 'asc' : 'desc');
                    setCollapsedGroups(new Set());
                  }}
                  className="px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-900/50 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
                >
                  <option value="productType">Linha</option>
                  <option value="lastIssueDate">Últ. Compra</option>
                  <option value="ncm">NCM</option>
                  <option value="anvisa">ANVISA</option>
                </select>
                <button
                  onClick={() => setSortOrder((o) => (o === 'asc' ? 'desc' : 'asc'))}
                  className="px-2 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-900/50 text-slate-500 hover:text-primary hover:bg-primary/5 transition-colors"
                  title={sortOrder === 'asc' ? 'Crescente' : 'Decrescente'}
                >
                  <span className="material-symbols-outlined text-[18px]">{sortOrder === 'asc' ? 'arrow_upward' : 'arrow_downward'}</span>
                </button>
              </div>
            </div>
            <div className="shrink-0 flex flex-col justify-end">
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Status</label>
              <div className="flex rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
                {([['all', 'Todos'], ['active', 'Em Linha'], ['outOfLine', 'Fora de Linha']] as const).map(([val, label]) => (
                  <button
                    key={val}
                    onClick={() => setLineStatusFilter(val)}
                    className={`px-3 py-2 text-sm font-medium transition-colors ${lineStatusFilter === val ? 'bg-primary text-white' : 'bg-slate-50 dark:bg-slate-900/50 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <button
              onClick={() => { setSearch(''); setOnlyMissing(false); setTypeFilter(''); setSubtypeFilter(''); setSubgroupFilter(''); setSortBy('productType'); setSortOrder('asc'); setLineStatusFilter('all'); }}
              className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-card-dark border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 transition-colors shadow-sm"
            >
              <span className="material-symbols-outlined text-[18px]">filter_alt_off</span>
              Limpar
            </button>
          </div>
        </div>

        {/* Active filter indicators */}
        {(search || typeFilter || subtypeFilter || subgroupFilter) && (
          <div className="flex items-center gap-2 mt-2.5 flex-wrap">
            <span className="text-xs text-slate-500">Filtros ativos:</span>
            {search && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-medium">
                "{search}"
                <button onClick={() => setSearch('')} className="hover:opacity-70">
                  <span className="material-symbols-outlined text-[13px]">close</span>
                </button>
              </span>
            )}
            {typeFilter && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 text-xs font-medium dark:bg-indigo-900/30 dark:text-indigo-400">
                {typeFilter}
                <button onClick={() => { setTypeFilter(''); setSubtypeFilter(''); setSubgroupFilter(''); }} className="hover:opacity-70">
                  <span className="material-symbols-outlined text-[13px]">close</span>
                </button>
              </span>
            )}
            {subtypeFilter && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs font-medium dark:bg-amber-900/30 dark:text-amber-400">
                {subtypeFilter}
                <button onClick={() => { setSubtypeFilter(''); setSubgroupFilter(''); }} className="hover:opacity-70">
                  <span className="material-symbols-outlined text-[13px]">close</span>
                </button>
              </span>
            )}
            {subgroupFilter && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-teal-100 text-teal-700 text-xs font-medium dark:bg-teal-900/30 dark:text-teal-400">
                {subgroupFilter}
                <button onClick={() => setSubgroupFilter('')} className="hover:opacity-70">
                  <span className="material-symbols-outlined text-[13px]">close</span>
                </button>
              </span>
            )}
            <span className="text-xs text-slate-400">{filtered.length.toLocaleString('pt-BR')} resultado{filtered.length !== 1 ? 's' : ''}</span>
          </div>
        )}
      </MobileFilterWrapper>

      {meta?.invoicesLimited && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-700 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
          A listagem está limitada às {meta.maxInvoices?.toLocaleString('pt-BR') || 3000} NF-e de entrada mais recentes para manter desempenho.
        </div>
      )}

      {/* Table */}
      <div className="bg-white dark:bg-card-dark border border-slate-200 dark:border-slate-800 rounded-xl shadow-lg shadow-slate-200/50 dark:shadow-none overflow-hidden">
        {(() => {
          const allGroups = Array.from(new Set(visible.map(getGroupLabel)));
          const allLines = sortBy === 'productType' ? Array.from(new Set(visible.map(getLineLabel))) : [];
          const allKeys = [...allGroups, ...allLines];
          if (allGroups.length <= 1) return null;
          return (
            <div className="flex justify-start gap-2 px-3 py-2 border-b border-slate-100 dark:border-slate-800">
              <button onClick={() => setCollapsedGroups(new Set(sortBy === 'productType' ? allLines : allGroups))} className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-600 transition-all"><span className="material-symbols-outlined text-[14px]">unfold_less</span>Recolher</button>
              <button onClick={() => setCollapsedGroups(new Set())} className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-600 transition-all"><span className="material-symbols-outlined text-[14px]">unfold_more</span>Expandir</button>
            </div>
          );
        })()}
        {/* Desktop Table */}
        <div className="hidden lg:block overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800 text-xs uppercase text-slate-500 dark:text-slate-400 font-bold tracking-wider">
                <th className="px-3 py-1.5 w-8">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    ref={(el) => { if (el) el.indeterminate = someVisibleSelected && !allVisibleSelected; }}
                    onChange={toggleSelectAll}
                    className="w-4 h-4 rounded border-slate-300 text-primary cursor-pointer"
                    title="Selecionar todos visíveis"
                  />
                </th>
                <th className="px-3 py-1.5 cursor-pointer group hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" onClick={() => handleSort('code')}>
                  <div className="flex items-center gap-1">Referência <SortIcon field="code" /></div>
                </th>
                <th className="px-3 py-1.5 cursor-pointer group hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" onClick={() => handleSort('description')}>
                  <div className="flex items-center gap-1">Produto <SortIcon field="description" /></div>
                </th>
                <th className="px-3 py-1.5 cursor-pointer group hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" onClick={() => handleSort('anvisa')}>
                  <div className="flex items-center gap-1">ANVISA <SortIcon field="anvisa" /></div>
                </th>
                <th className="px-3 py-1.5">
                  <div className="flex items-center gap-1">Fabricante</div>
                </th>
                <th className="px-3 py-1.5 text-right cursor-pointer group hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" onClick={() => handleSort('lastIssueDate')}>
                  <div className="flex items-center justify-end gap-1">Últ. Compra <SortIcon field="lastIssueDate" /></div>
                </th>
                <th className="px-3 py-1.5 text-right cursor-pointer group hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" onClick={() => handleSort('lastPrice')}>
                  <div className="flex items-center justify-end gap-1">Últ. Preço <SortIcon field="lastPrice" /></div>
                </th>
                <th className="px-3 py-1.5 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {isRebuilding ? (
                <tr>
                  <td colSpan={9} className="px-6 py-16 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                      <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Indexando produtos...</p>
                      <p className="text-xs text-slate-400">Primeira carga — processando NF-e para montar a lista. Isso pode levar alguns segundos.</p>
                    </div>
                  </td>
                </tr>
              ) : loading ? (
                Array.from({ length: 20 }).map((_, i) => (
                  <tr key={i}>
                    <td className="px-3 py-2"><Skeleton className="h-4 w-4" /></td>
                    <td className="px-3 py-2"><Skeleton className="h-4 w-16" /></td>
                    <td className="px-3 py-2"><Skeleton className="h-4 w-52" /></td>
                    <td className="px-3 py-2"><Skeleton className="h-4 w-20" /></td>
                    <td className="px-3 py-2"><Skeleton className="h-4 w-24" /></td>
                    <td className="px-3 py-2"><Skeleton className="h-4 w-28" /></td>
                    <td className="px-3 py-2"><Skeleton className="h-4 w-20" /></td>
                    <td className="px-3 py-2"><Skeleton className="h-4 w-16 ml-auto" /></td>
                    <td className="px-3 py-2"><Skeleton className="h-4 w-16 ml-auto" /></td>
                    <td className="px-3 py-2"><Skeleton className="h-4 w-16" /></td>
                    <td className="px-3 py-2"><Skeleton className="h-4 w-8 mx-auto" /></td>
                  </tr>
                ))
              ) : visible.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-6 py-12 text-center text-slate-400">
                    <span className="material-symbols-outlined text-[48px] opacity-30">inventory_2</span>
                    <p className="mt-2 text-sm font-medium">Nenhum produto encontrado</p>
                    <p className="text-xs mt-1">
                      {summary.totalProducts > 0
                        ? 'Tente ajustar os filtros de busca.'
                        : 'A lista é montada automaticamente a partir das NF-e de entrada.'}
                    </p>
                  </td>
                </tr>
              ) : (
                (() => {
                  if (sortBy === 'productType') {
                    // Two-level hierarchy: Linha (type) → Grupo (subtype) → products
                    const lineCountMap = new Map<string, number>();
                    const groupCountMap = new Map<string, number>();
                    for (const p of visible) {
                      const lk = getLineLabel(p);
                      const gk = getGroupLabel(p);
                      lineCountMap.set(lk, (lineCountMap.get(lk) || 0) + 1);
                      groupCountMap.set(gk, (groupCountMap.get(gk) || 0) + 1);
                    }
                    let lastLine = '';
                    let lastGrp = '';
                    let lastSubgroup = '';
                    return visible.map((product) => {
                      const lineKey = getLineLabel(product);
                      const grpKey = getGroupLabel(product);
                      const lineName = product.productType || 'Sem linha';
                      const grpName = product.productSubtype || 'Sem grupo';
                      const subgroupName = product.productSubgroup || '';
                      const subgroupKey = `${grpKey}|${subgroupName}`;
                      const showLine = lineKey !== lastLine;
                      const showGrp = grpKey !== lastGrp;
                      const showSubgroup = subgroupName && subgroupKey !== lastSubgroup;
                      if (showLine) { lastGrp = ''; lastSubgroup = ''; }
                      if (showGrp) lastSubgroup = '';
                      lastLine = lineKey;
                      lastGrp = grpKey;
                      if (subgroupName) lastSubgroup = subgroupKey;
                      const lineCollapsed = collapsedGroups.has(lineKey);
                      const grpCollapsed = collapsedGroups.has(grpKey);
                      return (
                        <React.Fragment key={product.key}>
                          {showLine && (
                            <tr className="cursor-pointer select-none group/line" onClick={() => toggleGroup(lineKey)}>
                              <td colSpan={9} className="px-0 py-0">
                                <div className="flex items-center gap-2.5 px-4 py-2.5 bg-gradient-to-r from-indigo-50 via-indigo-50/80 to-transparent dark:from-indigo-950/50 dark:via-indigo-950/30 dark:to-transparent border-y border-indigo-200/80 dark:border-indigo-800/40">
                                  <input type="checkbox" checked={visible.filter((p) => getLineLabel(p) === lineKey).every((p) => selectedKeys.has(p.key))} onChange={(e) => { e.stopPropagation(); toggleSelectGroup((p) => getLineLabel(p) === lineKey); }} onClick={(e) => e.stopPropagation()} className="w-4 h-4 rounded border-slate-300 text-primary cursor-pointer shrink-0" />
                                  <span className="material-symbols-outlined text-[18px] text-indigo-400 dark:text-indigo-500 transition-transform duration-200" style={{ transform: lineCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}>expand_more</span>
                                  <div className="w-1 h-4 rounded-full bg-indigo-400 dark:bg-indigo-500" />
                                  <span className="text-[13px] font-extrabold uppercase tracking-wider text-indigo-700 dark:text-indigo-300">{lineName}</span>
                                  <span className="text-[11px] font-bold text-indigo-500/80 dark:text-indigo-400/80 bg-indigo-100 dark:bg-indigo-900/40 px-2 py-0.5 rounded-full min-w-[28px] text-center">{lineCountMap.get(lineKey)}</span>
                                </div>
                              </td>
                            </tr>
                          )}
                          {!lineCollapsed && showGrp && (
                            <tr className="cursor-pointer select-none group/grp" onClick={() => toggleGroup(grpKey)}>
                              <td colSpan={9} className="px-0 py-0">
                                <div className="flex items-center gap-2 pl-8 pr-4 py-1.5 bg-gradient-to-r from-amber-50/90 to-transparent dark:from-amber-950/25 dark:to-transparent border-b border-amber-200/50 dark:border-amber-800/25">
                                  <input type="checkbox" checked={visible.filter((p) => getGroupLabel(p) === grpKey).every((p) => selectedKeys.has(p.key))} onChange={(e) => { e.stopPropagation(); toggleSelectGroup((p) => getGroupLabel(p) === grpKey); }} onClick={(e) => e.stopPropagation()} className="w-3.5 h-3.5 rounded border-slate-300 text-primary cursor-pointer shrink-0" />
                                  <span className="material-symbols-outlined text-[15px] text-amber-400 dark:text-amber-600 transition-transform duration-200" style={{ transform: grpCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}>expand_more</span>
                                  <div className="w-0.5 h-3 rounded-full bg-amber-400 dark:bg-amber-600" />
                                  <span className="text-xs font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">{grpName}</span>
                                  <span className="text-[10px] font-bold text-amber-500/80 dark:text-amber-500/70 bg-amber-100 dark:bg-amber-900/30 px-1.5 py-0.5 rounded-full min-w-[24px] text-center">{groupCountMap.get(grpKey)}</span>
                                </div>
                              </td>
                            </tr>
                          )}
                          {!lineCollapsed && !grpCollapsed && showSubgroup && (
                            <tr>
                              <td colSpan={9} className="px-0 py-0">
                                <div className="flex items-center gap-1.5 pl-14 pr-4 py-1 bg-gradient-to-r from-teal-50/60 to-transparent dark:from-teal-950/15 dark:to-transparent border-b border-teal-200/40 dark:border-teal-800/20">
                                  <div className="w-0.5 h-2.5 rounded-full bg-teal-400 dark:bg-teal-600" />
                                  <span className="text-[11px] font-bold uppercase tracking-wider text-teal-600 dark:text-teal-400">{subgroupName}</span>
                                </div>
                              </td>
                            </tr>
                          )}
                          {!lineCollapsed && !grpCollapsed && (
                    <tr key={product.key} className={`hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors border-b border-slate-100 dark:border-slate-800/50 ${selectedKeys.has(product.key) ? 'bg-primary/5 dark:bg-primary/10' : ''} ${product.outOfLine ? 'italic' : ''}`}>
                    <td className="px-3 py-1 w-8" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={selectedKeys.has(product.key)} onChange={() => toggleSelect(product.key)} className="w-4 h-4 rounded border-slate-300 text-primary cursor-pointer" />
                    </td>
                    <td className="px-3 py-1 cursor-pointer" onClick={() => openDetail(product)}><div className="flex items-center gap-1">{product.outOfLine && <span className="material-symbols-outlined text-[14px] text-slate-400 dark:text-slate-500 shrink-0 not-italic" title="Fora de linha">block</span>}<span className={`text-[12px] font-mono font-semibold hover:text-primary transition-colors ${product.outOfLine ? 'text-slate-400 dark:text-slate-500' : 'text-slate-900 dark:text-white'}`}>{product.codigo ? <><span className="text-emerald-600 dark:text-emerald-400">{search ? highlightMatch(product.codigo, search) : product.codigo}</span><span className="text-slate-300 dark:text-slate-600 mx-0.5">/</span></> : null}{search ? highlightMatch(product.code || '-', search) : (product.code || '-')}</span></div></td>
                    <td className="px-3 py-1 cursor-pointer" onClick={() => openDetail(product)}><div className="hover:text-primary transition-colors">{product.shortName ? (<><span className={`text-[12px] font-semibold block leading-tight ${product.outOfLine ? 'text-slate-400 dark:text-slate-500' : 'text-slate-900 dark:text-white'}`}>{search ? highlightMatch(product.shortName, search) : product.shortName}</span><span className={`text-[10px] block leading-tight ${product.outOfLine ? 'text-slate-300 dark:text-slate-600' : 'text-slate-400 dark:text-slate-500'}`}>{search ? highlightMatch(product.description, search) : product.description}</span></>) : (<span className={`text-[12px] font-semibold ${product.outOfLine ? 'text-slate-400 dark:text-slate-500' : 'text-slate-900 dark:text-white'}`}>{search ? highlightMatch(product.description, search) : product.description}</span>)}</div></td>
                    <td className="px-3 py-1 cursor-pointer" onClick={() => openDetail(product, ['anvisa'])}><span className={`text-[12px] font-mono hover:text-teal-600 dark:hover:text-teal-400 transition-colors ${product.outOfLine ? 'text-slate-400 dark:text-slate-500' : product.anvisa ? 'text-slate-700 dark:text-slate-300' : 'text-red-400 dark:text-red-500'}`}>{search ? highlightMatch(product.anvisa || '—', search) : (product.anvisa || '—')}</span>{(() => { const badge = getAnvisaExpirationBadge(product.anvisaExpiration); return badge ? <span className={`ml-1.5 inline-block px-1.5 py-0.5 rounded text-[9px] font-bold border ${badge.className}`}>{badge.label}</span> : null; })()}</td>
                    <td className="px-3 py-1"><span className={`text-[12px] ${product.outOfLine ? 'text-slate-400 dark:text-slate-500' : 'text-slate-600 dark:text-slate-400'}`} title={product.anvisaManufacturer || ''}>{search ? highlightMatch(product.manufacturerShortName || product.anvisaManufacturer || '-', search) : (product.manufacturerShortName || product.anvisaManufacturer || '-')}</span></td>
                    <td className="px-3 py-1 text-right"><span className={`text-[12px] font-medium ${product.outOfLine ? 'text-slate-400 dark:text-slate-500' : 'text-slate-700 dark:text-slate-300'}`}>{formatDate(product.lastIssueDate)}</span></td>
                    <td className="px-3 py-1 text-right"><span className={`text-[12px] font-medium ${product.outOfLine ? 'text-slate-400 dark:text-slate-500' : 'text-slate-700 dark:text-slate-300'}`}>{formatValue(product.lastPrice)}</span></td>
                    <td className="px-3 py-1 text-center">
                      <div className="flex items-center justify-center gap-0.5">
                        <button onClick={() => openDetail(product)} className="p-1 rounded-lg text-slate-500 hover:text-primary hover:bg-primary/10 transition-colors not-italic" title="Ver detalhes do produto"><span className="material-symbols-outlined text-[18px]">visibility</span></button>
                        <button onClick={() => openHistory(product)} className="p-1 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors not-italic" title="Histórico de compras e vendas"><span className="material-symbols-outlined text-[18px]">history</span></button>
                      </div>
                    </td>
                  </tr>
                          )}
                        </React.Fragment>
                      );
                    });
                  }

                  // Single-level grouping for other sort modes
                  const groupCountMap = new Map<string, number>();
                  for (const p of visible) { const g = getGroupLabel(p); groupCountMap.set(g, (groupCountMap.get(g) || 0) + 1); }
                  let lastGroup = '';
                  return visible.map((product) => {
                    const group = getGroupLabel(product);
                    const showDivider = group !== lastGroup;
                    lastGroup = group;
                    return (
                      <React.Fragment key={product.key}>
                        {showDivider && group && (
                          <tr className="cursor-pointer select-none" onClick={() => toggleGroup(group)}>
                            <td colSpan={9} className="px-0 py-0">
                              <div className="flex items-center gap-2.5 px-4 py-2 bg-gradient-to-r from-slate-100 via-slate-100/70 to-transparent dark:from-slate-800/70 dark:via-slate-800/40 dark:to-transparent border-y border-slate-200/80 dark:border-slate-700/60">
                                <input type="checkbox" checked={visible.filter((p) => getGroupLabel(p) === group).every((p) => selectedKeys.has(p.key))} onChange={(e) => { e.stopPropagation(); toggleSelectGroup((p) => getGroupLabel(p) === group); }} onClick={(e) => e.stopPropagation()} className="w-4 h-4 rounded border-slate-300 text-primary cursor-pointer shrink-0" />
                                <span className="material-symbols-outlined text-[16px] text-slate-400 dark:text-slate-500 transition-transform duration-200" style={{ transform: collapsedGroups.has(group) ? 'rotate(-90deg)' : 'rotate(0deg)' }}>expand_more</span>
                                <div className="w-0.5 h-3.5 rounded-full bg-slate-400 dark:bg-slate-500" />
                                <span className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">{group}</span>
                                <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 bg-slate-200 dark:bg-slate-700 px-1.5 py-0.5 rounded-full min-w-[24px] text-center">{groupCountMap.get(group)}</span>
                              </div>
                            </td>
                          </tr>
                        )}
                        {!collapsedGroups.has(group) && (
                  <tr key={product.key} className={`hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors border-b border-slate-100 dark:border-slate-800/50 ${selectedKeys.has(product.key) ? 'bg-primary/5 dark:bg-primary/10' : ''} ${product.outOfLine ? 'italic' : ''}`}>
                    <td className="px-3 py-1 w-8" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={selectedKeys.has(product.key)} onChange={() => toggleSelect(product.key)} className="w-4 h-4 rounded border-slate-300 text-primary cursor-pointer" />
                    </td>
                    <td className="px-3 py-1 cursor-pointer" onClick={() => openDetail(product)}><div className="flex items-center gap-1">{product.outOfLine && <span className="material-symbols-outlined text-[14px] text-slate-400 dark:text-slate-500 shrink-0 not-italic" title="Fora de linha">block</span>}<span className={`text-[12px] font-mono font-semibold hover:text-primary transition-colors ${product.outOfLine ? 'text-slate-400 dark:text-slate-500' : 'text-slate-900 dark:text-white'}`}>{product.codigo ? <><span className="text-emerald-600 dark:text-emerald-400">{search ? highlightMatch(product.codigo, search) : product.codigo}</span><span className="text-slate-300 dark:text-slate-600 mx-0.5">/</span></> : null}{search ? highlightMatch(product.code || '-', search) : (product.code || '-')}</span></div></td>
                    <td className="px-3 py-1 cursor-pointer" onClick={() => openDetail(product)}><div className="hover:text-primary transition-colors">{product.shortName ? (<><span className={`text-[12px] font-semibold block leading-tight ${product.outOfLine ? 'text-slate-400 dark:text-slate-500' : 'text-slate-900 dark:text-white'}`}>{search ? highlightMatch(product.shortName, search) : product.shortName}</span><span className={`text-[10px] block leading-tight ${product.outOfLine ? 'text-slate-300 dark:text-slate-600' : 'text-slate-400 dark:text-slate-500'}`}>{search ? highlightMatch(product.description, search) : product.description}</span></>) : (<span className={`text-[12px] font-semibold ${product.outOfLine ? 'text-slate-400 dark:text-slate-500' : 'text-slate-900 dark:text-white'}`}>{search ? highlightMatch(product.description, search) : product.description}</span>)}</div></td>
                    <td className="px-3 py-1 cursor-pointer" onClick={() => openDetail(product, ['anvisa'])}><span className={`text-[12px] font-mono hover:text-teal-600 dark:hover:text-teal-400 transition-colors ${product.outOfLine ? 'text-slate-400 dark:text-slate-500' : product.anvisa ? 'text-slate-700 dark:text-slate-300' : 'text-red-400 dark:text-red-500'}`}>{search ? highlightMatch(product.anvisa || '—', search) : (product.anvisa || '—')}</span>{(() => { const badge = getAnvisaExpirationBadge(product.anvisaExpiration); return badge ? <span className={`ml-1.5 inline-block px-1.5 py-0.5 rounded text-[9px] font-bold border ${badge.className}`}>{badge.label}</span> : null; })()}</td>
                    <td className="px-3 py-1"><span className={`text-[12px] ${product.outOfLine ? 'text-slate-400 dark:text-slate-500' : 'text-slate-600 dark:text-slate-400'}`} title={product.anvisaManufacturer || ''}>{search ? highlightMatch(product.manufacturerShortName || product.anvisaManufacturer || '-', search) : (product.manufacturerShortName || product.anvisaManufacturer || '-')}</span></td>
                    <td className="px-3 py-1 text-right"><span className={`text-[12px] font-medium ${product.outOfLine ? 'text-slate-400 dark:text-slate-500' : 'text-slate-700 dark:text-slate-300'}`}>{formatDate(product.lastIssueDate)}</span></td>
                    <td className="px-3 py-1 text-right"><span className={`text-[12px] font-medium ${product.outOfLine ? 'text-slate-400 dark:text-slate-500' : 'text-slate-700 dark:text-slate-300'}`}>{formatValue(product.lastPrice)}</span></td>
                    <td className="px-3 py-1 text-center">
                      <div className="flex items-center justify-center gap-0.5">
                        <button onClick={() => openDetail(product)} className="p-1 rounded-lg text-slate-500 hover:text-primary hover:bg-primary/10 transition-colors not-italic" title="Ver detalhes do produto"><span className="material-symbols-outlined text-[18px]">visibility</span></button>
                        <button onClick={() => openHistory(product)} className="p-1 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors not-italic" title="Histórico de compras e vendas"><span className="material-symbols-outlined text-[18px]">history</span></button>
                      </div>
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

        {/* Mobile Cards */}
        <div className="lg:hidden">
          {isRebuilding ? (
            <div className="px-6 py-16 text-center">
              <div className="flex flex-col items-center gap-3">
                <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Indexando produtos...</p>
              </div>
            </div>
          ) : loading ? (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="p-4 space-y-2">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-3 w-64" />
                  <Skeleton className="h-3 w-32" />
                </div>
              ))}
            </div>
          ) : visible.length === 0 ? (
            <div className="px-6 py-12 text-center text-slate-400">
              <span className="material-symbols-outlined text-[48px] opacity-30">inventory_2</span>
              <p className="mt-2 text-sm font-medium">Nenhum produto encontrado</p>
              <p className="text-xs mt-1">
                {summary.totalProducts > 0 ? 'Tente ajustar os filtros de busca.' : 'A lista é montada automaticamente a partir das NF-e de entrada.'}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {(() => {
                if (sortBy === 'productType') {
                  const lineCountMap = new Map<string, number>();
                  const groupCountMap = new Map<string, number>();
                  for (const p of visible) {
                    const lk = getLineLabel(p);
                    const gk = getGroupLabel(p);
                    lineCountMap.set(lk, (lineCountMap.get(lk) || 0) + 1);
                    groupCountMap.set(gk, (groupCountMap.get(gk) || 0) + 1);
                  }
                  let lastLine = '';
                  let lastGrp = '';
                  let lastSubgroup = '';
                  return visible.map((product) => {
                    const lineKey = getLineLabel(product);
                    const grpKey = getGroupLabel(product);
                    const lineName = product.productType || 'Sem linha';
                    const grpName = product.productSubtype || 'Sem grupo';
                    const subgroupName = product.productSubgroup || '';
                    const subgroupKey = `${grpKey}|${subgroupName}`;
                    const showLine = lineKey !== lastLine;
                    const showGrp = grpKey !== lastGrp;
                    const showSubgroup = subgroupName && subgroupKey !== lastSubgroup;
                    if (showLine) { lastGrp = ''; lastSubgroup = ''; }
                    if (showGrp) lastSubgroup = '';
                    lastLine = lineKey;
                    lastGrp = grpKey;
                    if (subgroupName) lastSubgroup = subgroupKey;
                    const lineCollapsed = collapsedGroups.has(lineKey);
                    const grpCollapsed = collapsedGroups.has(grpKey);
                    return (
                      <React.Fragment key={`m-${product.key}`}>
                        {showLine && (
                          <div className="cursor-pointer select-none" onClick={() => toggleGroup(lineKey)}>
                            <div className="flex items-center gap-2.5 px-4 py-2.5 bg-gradient-to-r from-indigo-50 via-indigo-50/80 to-transparent dark:from-indigo-950/50 dark:via-indigo-950/30 dark:to-transparent border-y border-indigo-200/80 dark:border-indigo-800/40">
                              <input type="checkbox" checked={visible.filter((p) => getLineLabel(p) === lineKey).every((p) => selectedKeys.has(p.key))} onChange={(e) => { e.stopPropagation(); toggleSelectGroup((p) => getLineLabel(p) === lineKey); }} onClick={(e) => e.stopPropagation()} className="w-4 h-4 rounded border-slate-300 text-primary cursor-pointer shrink-0" />
                              <span className="material-symbols-outlined text-[18px] text-indigo-400 dark:text-indigo-500 transition-transform duration-200" style={{ transform: lineCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}>expand_more</span>
                              <div className="w-1 h-4 rounded-full bg-indigo-400 dark:bg-indigo-500" />
                              <span className="text-[13px] font-extrabold uppercase tracking-wider text-indigo-700 dark:text-indigo-300">{lineName}</span>
                              <span className="text-[11px] font-bold text-indigo-500/80 dark:text-indigo-400/80 bg-indigo-100 dark:bg-indigo-900/40 px-2 py-0.5 rounded-full min-w-[28px] text-center">{lineCountMap.get(lineKey)}</span>
                            </div>
                          </div>
                        )}
                        {!lineCollapsed && showGrp && (
                          <div className="cursor-pointer select-none" onClick={() => toggleGroup(grpKey)}>
                            <div className="flex items-center gap-2 pl-6 pr-4 py-1.5 bg-gradient-to-r from-amber-50/90 to-transparent dark:from-amber-950/25 dark:to-transparent border-b border-amber-200/50 dark:border-amber-800/25">
                              <input type="checkbox" checked={visible.filter((p) => getGroupLabel(p) === grpKey).every((p) => selectedKeys.has(p.key))} onChange={(e) => { e.stopPropagation(); toggleSelectGroup((p) => getGroupLabel(p) === grpKey); }} onClick={(e) => e.stopPropagation()} className="w-3.5 h-3.5 rounded border-slate-300 text-primary cursor-pointer shrink-0" />
                              <span className="material-symbols-outlined text-[15px] text-amber-400 dark:text-amber-600 transition-transform duration-200" style={{ transform: grpCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}>expand_more</span>
                              <div className="w-0.5 h-3 rounded-full bg-amber-400 dark:bg-amber-600" />
                              <span className="text-xs font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">{grpName}</span>
                              <span className="text-[10px] font-bold text-amber-500/80 dark:text-amber-500/70 bg-amber-100 dark:bg-amber-900/30 px-1.5 py-0.5 rounded-full min-w-[24px] text-center">{groupCountMap.get(grpKey)}</span>
                            </div>
                          </div>
                        )}
                        {!lineCollapsed && !grpCollapsed && showSubgroup && (
                          <div className="flex items-center gap-1.5 pl-10 pr-4 py-1 bg-gradient-to-r from-teal-50/60 to-transparent dark:from-teal-950/15 dark:to-transparent border-b border-teal-200/40 dark:border-teal-800/20">
                            <div className="w-0.5 h-2.5 rounded-full bg-teal-400 dark:bg-teal-600" />
                            <span className="text-[11px] font-bold uppercase tracking-wider text-teal-600 dark:text-teal-400">{subgroupName}</span>
                          </div>
                        )}
                        {!lineCollapsed && !grpCollapsed && (
                          <div className={`p-3 ${selectedKeys.has(product.key) ? 'bg-primary/5 dark:bg-primary/10' : ''} ${product.outOfLine ? 'opacity-60' : ''}`} onClick={() => openDetail(product)}>
                            <div className="flex items-start gap-3 mb-1">
                              <input type="checkbox" checked={selectedKeys.has(product.key)} onChange={(e) => { e.stopPropagation(); toggleSelect(product.key); }} onClick={(e) => e.stopPropagation()} className="w-4 h-4 rounded border-slate-300 text-primary cursor-pointer shrink-0 mt-0.5" />
                              <div className="flex-1 min-w-0">
                                <p className="text-[10px] font-mono text-slate-500 dark:text-slate-400">
                                  {product.codigo ? <><span className="text-emerald-600 dark:text-emerald-400">{product.codigo}</span><span className="text-slate-300 dark:text-slate-600 mx-0.5">/</span></> : null}
                                  {product.code || '-'}
                                </p>
                                <p className="font-bold text-[13px] text-slate-900 dark:text-white truncate leading-tight">
                                  {product.shortName || product.description}
                                </p>
                                {product.shortName && (
                                  <p className="text-[10px] text-slate-400 dark:text-slate-500 truncate">{product.description}</p>
                                )}
                              </div>
                            </div>
                            <div className="flex flex-wrap gap-1 ml-7 mb-1.5">
                              {product.productType && (
                                <span className="px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200/60 dark:border-indigo-800/40 text-[10px] font-bold text-indigo-600 dark:text-indigo-400">{product.productType}</span>
                              )}
                              {product.productSubtype && (
                                <span className="px-2 py-0.5 rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-200/60 dark:border-amber-800/40 text-[10px] font-bold text-amber-600 dark:text-amber-400">{product.productSubtype}</span>
                              )}
                              {product.outOfLine && (
                                <span className="px-2 py-0.5 rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200/60 dark:border-red-800/40 text-[10px] font-bold text-red-600 dark:text-red-400">Fora de Linha</span>
                              )}
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-[10px] ml-7 mb-1.5">
                              <div>
                                <p className="text-slate-400">Últ. Compra</p>
                                <p className="font-medium text-slate-700 dark:text-slate-300">{formatDate(product.lastIssueDate)}</p>
                              </div>
                              <div>
                                <p className="text-slate-400">Últ. Preço</p>
                                <p className="font-medium text-slate-700 dark:text-slate-300">{formatValue(product.lastPrice)}</p>
                              </div>
                            </div>
                            <div className="flex justify-end ml-7" onClick={(e) => e.stopPropagation()}>
                              <button onClick={() => openDetail(product)} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-primary hover:border-primary/30 hover:bg-primary/5 transition-colors">
                                <span className="material-symbols-outlined text-[16px]">visibility</span>
                                Detalhes
                              </button>
                            </div>
                          </div>
                        )}
                      </React.Fragment>
                    );
                  });
                }

                // Single-level grouping for other sort modes
                const groupCountMap = new Map<string, number>();
                for (const p of visible) { const g = getGroupLabel(p); groupCountMap.set(g, (groupCountMap.get(g) || 0) + 1); }
                let lastGroup = '';
                return visible.map((product) => {
                  const group = getGroupLabel(product);
                  const showDivider = group !== lastGroup;
                  lastGroup = group;
                  return (
                    <React.Fragment key={`m-${product.key}`}>
                      {showDivider && group && (
                        <div className="cursor-pointer select-none" onClick={() => toggleGroup(group)}>
                          <div className="flex items-center gap-2.5 px-4 py-2 bg-gradient-to-r from-slate-100 via-slate-100/70 to-transparent dark:from-slate-800/70 dark:via-slate-800/40 dark:to-transparent border-y border-slate-200/80 dark:border-slate-700/60">
                            <input type="checkbox" checked={visible.filter((p) => getGroupLabel(p) === group).every((p) => selectedKeys.has(p.key))} onChange={(e) => { e.stopPropagation(); toggleSelectGroup((p) => getGroupLabel(p) === group); }} onClick={(e) => e.stopPropagation()} className="w-4 h-4 rounded border-slate-300 text-primary cursor-pointer shrink-0" />
                            <span className="material-symbols-outlined text-[16px] text-slate-400 dark:text-slate-500 transition-transform duration-200" style={{ transform: collapsedGroups.has(group) ? 'rotate(-90deg)' : 'rotate(0deg)' }}>expand_more</span>
                            <div className="w-0.5 h-3.5 rounded-full bg-slate-400 dark:bg-slate-500" />
                            <span className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">{group}</span>
                            <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 bg-slate-200 dark:bg-slate-700 px-1.5 py-0.5 rounded-full min-w-[24px] text-center">{groupCountMap.get(group)}</span>
                          </div>
                        </div>
                      )}
                      {!collapsedGroups.has(group) && (
                        <div className={`p-3 ${selectedKeys.has(product.key) ? 'bg-primary/5 dark:bg-primary/10' : ''} ${product.outOfLine ? 'opacity-60' : ''}`} onClick={() => openDetail(product)}>
                          <div className="flex items-start gap-3 mb-1">
                            <input type="checkbox" checked={selectedKeys.has(product.key)} onChange={(e) => { e.stopPropagation(); toggleSelect(product.key); }} onClick={(e) => e.stopPropagation()} className="w-4 h-4 rounded border-slate-300 text-primary cursor-pointer shrink-0 mt-0.5" />
                            <div className="flex-1 min-w-0">
                              <p className="text-[10px] font-mono text-slate-500 dark:text-slate-400">
                                {product.codigo ? <><span className="text-emerald-600 dark:text-emerald-400">{product.codigo}</span><span className="text-slate-300 dark:text-slate-600 mx-0.5">/</span></> : null}
                                {product.code || '-'}
                              </p>
                              <p className="font-bold text-[13px] text-slate-900 dark:text-white truncate leading-tight">
                                {product.shortName || product.description}
                              </p>
                              {product.shortName && (
                                <p className="text-[10px] text-slate-400 dark:text-slate-500 truncate">{product.description}</p>
                              )}
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-1 ml-7 mb-1.5">
                            {product.productType && (
                              <span className="px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200/60 dark:border-indigo-800/40 text-[10px] font-bold text-indigo-600 dark:text-indigo-400">{product.productType}</span>
                            )}
                            {product.productSubtype && (
                              <span className="px-2 py-0.5 rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-200/60 dark:border-amber-800/40 text-[10px] font-bold text-amber-600 dark:text-amber-400">{product.productSubtype}</span>
                            )}
                            {product.outOfLine && (
                              <span className="px-2 py-0.5 rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200/60 dark:border-red-800/40 text-[10px] font-bold text-red-600 dark:text-red-400">Fora de Linha</span>
                            )}
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-[10px] ml-7 mb-1.5">
                            <div>
                              <p className="text-slate-400">Últ. Compra</p>
                              <p className="font-medium text-slate-700 dark:text-slate-300">{formatDate(product.lastIssueDate)}</p>
                            </div>
                            <div>
                              <p className="text-slate-400">Últ. Preço</p>
                              <p className="font-medium text-slate-700 dark:text-slate-300">{formatValue(product.lastPrice)}</p>
                            </div>
                          </div>
                          <div className="flex justify-end ml-7" onClick={(e) => e.stopPropagation()}>
                            <button onClick={() => openDetail(product)} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-primary hover:border-primary/30 hover:bg-primary/5 transition-colors">
                              <span className="material-symbols-outlined text-[16px]">visibility</span>
                              Detalhes
                            </button>
                          </div>
                        </div>
                      )}
                    </React.Fragment>
                  );
                });
              })()}
            </div>
          )}
        </div>

        {!loading && filtered.length > 0 && (
          <div className="px-6 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50/30 dark:bg-slate-800/20 flex items-center justify-between">
            <span className="text-sm text-slate-500">
              {filtered.length.toLocaleString('pt-BR')} produto{filtered.length !== 1 ? 's' : ''}
            </span>
          </div>
        )}
      </div>

      {/* Bulk action toolbar */}
      {selectedKeys.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 px-5 py-3 bg-slate-900 dark:bg-slate-800 text-white rounded-2xl shadow-2xl border border-slate-700">
          <span className="material-symbols-outlined text-[20px] text-primary">checklist</span>
          <span className="text-sm font-semibold">
            {selectedKeys.size.toLocaleString('pt-BR')} produto{selectedKeys.size !== 1 ? 's' : ''} selecionado{selectedKeys.size !== 1 ? 's' : ''}
          </span>
          <div className="w-px h-5 bg-slate-600" />
          {canWrite && (
            <button
              onClick={openBulkEdit}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-primary hover:bg-primary-dark text-white rounded-lg text-sm font-bold transition-colors"
            >
              <span className="material-symbols-outlined text-[16px]">edit</span>
              Editar em massa
            </button>
          )}
          <button
            onClick={() => setSelectedKeys(new Set())}
            className="flex items-center gap-1 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm font-medium transition-colors"
          >
            <span className="material-symbols-outlined text-[16px]">close</span>
            Limpar
          </button>
        </div>
      )}

      {/* Auto-classify preview modal */}
      {autoClassifyPreview && (
        <div className="fixed inset-0 z-50 sm:flex sm:items-center sm:justify-center sm:p-4 sm:bg-black/60 sm:backdrop-blur-sm" onClick={() => setAutoClassifyPreview(null)}>
          <div className="absolute inset-0 sm:relative sm:inset-auto bg-white dark:bg-card-dark sm:rounded-2xl sm:shadow-2xl w-full sm:max-w-3xl sm:max-h-[85vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-slate-200 dark:border-slate-700">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <span className="material-symbols-outlined text-[20px] text-amber-500">auto_fix_high</span>
                  Auto-classificação — Preview
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  {autoClassifyPreview.updatesFound} alteração(ões) encontrada(s) de {autoClassifyPreview.totalProducts} produtos
                  {autoClassifyPreview.byField && (
                    <span className="ml-2">
                      — ANVISA: <b>{autoClassifyPreview.byField.anvisa}</b>, Linha: <b>{autoClassifyPreview.byField.productType}</b>, Grupo: <b>{autoClassifyPreview.byField.productSubtype}</b>
                    </span>
                  )}
                </p>
              </div>
              <button onClick={() => setAutoClassifyPreview(null)} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            <div className="overflow-y-auto flex-1">
              {autoClassifyPreview.updatesFound === 0 ? (
                <div className="px-6 py-12 text-center text-slate-400">
                  <span className="material-symbols-outlined text-[48px] opacity-30">check_circle</span>
                  <p className="mt-2 text-sm font-medium">Nenhum preenchimento automático encontrado</p>
                  <p className="text-xs mt-1">Todos os produtos já possuem os campos preenchidos ou não foram encontrados padrões suficientes.</p>
                </div>
              ) : (
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-800/50 sticky top-0">
                    <tr className="text-[10px] uppercase tracking-wider font-bold text-slate-500">
                      <th className="px-4 py-2">Produto</th>
                      <th className="px-4 py-2">Alterações</th>
                      <th className="px-4 py-2">Motivo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {(autoClassifyPreview.preview || []).map((item: any, i: number) => (
                      <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                        <td className="px-4 py-2 max-w-[200px]">
                          <p className="text-xs font-semibold text-slate-800 dark:text-white truncate">{item.description}</p>
                          {item.code && <p className="text-[10px] font-mono text-slate-400">{item.code}</p>}
                        </td>
                        <td className="px-4 py-2">
                          <div className="flex flex-wrap gap-1">
                            {item.fields.anvisa_code && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-teal-50 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400 border border-teal-200 dark:border-teal-800">
                                ANVISA: {item.fields.anvisa_code}
                              </span>
                            )}
                            {item.fields.product_type && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800">
                                Linha: {item.fields.product_type}
                              </span>
                            )}
                            {item.fields.product_subtype && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-violet-50 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400 border border-violet-200 dark:border-violet-800">
                                Grupo: {item.fields.product_subtype}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-2">
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 max-w-[280px]">{item.reason}</p>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {autoClassifyPreview.updatesFound > 50 && (
                <p className="px-4 py-2 text-xs text-slate-400 text-center border-t border-slate-100 dark:border-slate-800">
                  Mostrando 50 de {autoClassifyPreview.updatesFound} alterações
                </p>
              )}
            </div>

            {/* Footer */}
            <div className="px-4 sm:px-6 py-3.5 border-t border-slate-200 dark:border-slate-700 bg-slate-50/40 dark:bg-slate-800/30 shrink-0">
              {/* Mobile footer */}
              <div className="flex flex-col gap-2 sm:hidden">
                {autoClassifyPreview.updatesFound > 0 && (
                  <button
                    onClick={() => handleAutoClassify(false)}
                    disabled={isAutoClassifying}
                    className="flex items-center justify-center gap-2 w-full px-5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-sm font-bold transition-all shadow-sm disabled:opacity-60"
                  >
                    {isAutoClassifying ? (
                      <><span className="material-symbols-outlined text-[16px] animate-spin">sync</span>Aplicando...</>
                    ) : (
                      <><span className="material-symbols-outlined text-[16px]">auto_fix_high</span>Aplicar {autoClassifyPreview.updatesFound} alteração(ões)</>
                    )}
                  </button>
                )}
                <button onClick={() => setAutoClassifyPreview(null)} className="w-full px-4 py-2.5 text-sm font-semibold text-primary hover:bg-primary/5 rounded-xl transition-colors">
                  <span className="material-symbols-outlined text-[16px] align-middle mr-1">arrow_back</span>Voltar
                </button>
              </div>
              {/* Desktop footer */}
              {autoClassifyPreview.updatesFound > 0 && (
                <div className="hidden sm:flex items-center justify-between">
                  <button onClick={() => setAutoClassifyPreview(null)} className="px-4 py-2 text-sm font-medium text-slate-500 hover:text-slate-700 transition-colors">
                    Cancelar
                  </button>
                  <button
                    onClick={() => handleAutoClassify(false)}
                    disabled={isAutoClassifying}
                    className="flex items-center gap-2 px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-sm font-bold transition-all shadow-sm disabled:opacity-60"
                  >
                    {isAutoClassifying ? (
                      <><span className="material-symbols-outlined text-[16px] animate-spin">sync</span>Aplicando...</>
                    ) : (
                      <><span className="material-symbols-outlined text-[16px]">auto_fix_high</span>Aplicar {autoClassifyPreview.updatesFound} alteração(ões)</>
                    )}
                  </button>
                </div>
              )}
              {autoClassifyPreview.updatesFound === 0 && (
                <div className="hidden sm:block">
                  <button onClick={() => setAutoClassifyPreview(null)} className="px-4 py-2 text-sm font-medium text-slate-500 hover:text-slate-700 transition-colors">
                    Fechar
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Bulk edit modal */}
      {bulkEditOpen && (
        <div className="fixed inset-0 z-50 sm:flex sm:items-center sm:justify-center sm:p-4 sm:bg-black/60 sm:backdrop-blur-sm" onClick={() => setBulkEditOpen(false)}>
          <div className="absolute inset-0 sm:relative sm:inset-auto bg-slate-50 dark:bg-[#1a1e2e] sm:rounded-2xl w-full sm:max-w-md sm:h-auto sm:max-h-[92vh] flex flex-col overflow-hidden sm:shadow-2xl sm:ring-1 ring-black/5 dark:ring-white/5" onClick={(e) => e.stopPropagation()}>

            {/* Header */}
            <div className="px-4 sm:px-6 py-4 bg-white dark:bg-card-dark border-b border-slate-200 dark:border-slate-700 shrink-0 shadow-[0_2px_8px_rgba(0,0,0,0.08)] sm:shadow-none">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 dark:from-primary/30 dark:to-primary/10 flex items-center justify-center ring-1 ring-primary/20 dark:ring-primary/30 shrink-0">
                  <span className="material-symbols-outlined text-[22px] text-primary">edit_note</span>
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-[15px] font-bold text-slate-900 dark:text-white leading-tight">Editar em massa</h3>
                  <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
                    <span className="font-bold text-primary">{selectedKeys.size.toLocaleString('pt-BR')}</span> produto{selectedKeys.size !== 1 ? 's' : ''} selecionado{selectedKeys.size !== 1 ? 's' : ''}
                  </p>
                </div>
                <button onClick={() => setBulkEditOpen(false)} className="flex-shrink-0 p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                  <span className="material-symbols-outlined text-[20px]">close</span>
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-2.5">
              <div className="flex items-start gap-2.5 px-3.5 py-2.5 rounded-xl bg-blue-50/80 dark:bg-blue-900/10 ring-1 ring-blue-200/50 dark:ring-blue-800/30">
                <div className="w-6 h-6 rounded-md bg-blue-500/10 ring-1 ring-blue-500/20 flex items-center justify-center shrink-0 mt-0.5">
                  <span className="material-symbols-outlined text-[13px] text-blue-500">info</span>
                </div>
                <p className="text-[12px] text-blue-700 dark:text-blue-300 leading-relaxed">Marque os campos que deseja alterar. Campos não marcados permanecerão inalterados.</p>
              </div>

              <BulkFieldRow checked={bulkFields.enableType} onChange={(v) => setBulkFields((f) => ({ ...f, enableType: v }))} icon="category" label="Linha">
                {bulkNewMode.type ? (
                  <div className="flex gap-1.5">
                    <input autoFocus type="text" value={bulkFields.productType} onChange={(e) => setBulkFields((f) => ({ ...f, productType: e.target.value }))} placeholder="Nome da nova linha" className={BULK_INPUT_CLS} />
                    <button type="button" onClick={() => { setBulkNewMode((m) => ({ ...m, type: false })); setBulkFields((f) => ({ ...f, productType: '' })); }} className="px-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0"><span className="material-symbols-outlined text-[18px]">close</span></button>
                  </div>
                ) : (
                  <select value={bulkFields.productType} onChange={(e) => { if (e.target.value === '__new__') { setBulkNewMode((m) => ({ ...m, type: true })); setBulkFields((f) => ({ ...f, productType: '' })); } else { setBulkFields((f) => ({ ...f, productType: e.target.value })); } }} className={BULK_INPUT_CLS}>
                    <option value="">— Limpar —</option>
                    {hierOptions.lines.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                    <option value="__new__">+ Criar nova linha...</option>
                  </select>
                )}
              </BulkFieldRow>

              <BulkFieldRow checked={bulkFields.enableSubtype} onChange={(v) => setBulkFields((f) => ({ ...f, enableSubtype: v }))} icon="folder" label="Grupo">
                {bulkNewMode.subtype ? (
                  <div className="flex gap-1.5">
                    <input autoFocus type="text" value={bulkFields.productSubtype} onChange={(e) => setBulkFields((f) => ({ ...f, productSubtype: e.target.value }))} placeholder="Nome do novo grupo" className={BULK_INPUT_CLS} />
                    <button type="button" onClick={() => { setBulkNewMode((m) => ({ ...m, subtype: false })); setBulkFields((f) => ({ ...f, productSubtype: '' })); }} className="px-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0"><span className="material-symbols-outlined text-[18px]">close</span></button>
                  </div>
                ) : (
                  <select value={bulkFields.productSubtype} onChange={(e) => { if (e.target.value === '__new__') { setBulkNewMode((m) => ({ ...m, subtype: true })); setBulkFields((f) => ({ ...f, productSubtype: '' })); } else { setBulkFields((f) => ({ ...f, productSubtype: e.target.value })); } }} className={BULK_INPUT_CLS}>
                    <option value="">— Limpar —</option>
                    {bulkFields.productType ? (
                      hierOptions.groupsFor(bulkFields.productType).map((s) => <option key={s} value={s}>{s}</option>)
                    ) : (
                      <>
                        {hierOptions.groupsByLine.map((entry) => (
                          <optgroup key={entry.line} label={entry.line}>
                            {entry.groups.map((g) => <option key={g} value={g}>{g}</option>)}
                          </optgroup>
                        ))}
                        {hierOptions.orphanGroups.length > 0 && (
                          <optgroup label="Outros">
                            {hierOptions.orphanGroups.map((g) => <option key={g} value={g}>{g}</option>)}
                          </optgroup>
                        )}
                      </>
                    )}
                    <option value="__new__">+ Criar novo grupo...</option>
                  </select>
                )}
              </BulkFieldRow>

              <BulkFieldRow checked={bulkFields.enableSubgroup} onChange={(v) => setBulkFields((f) => ({ ...f, enableSubgroup: v }))} icon="folder_open" label="Subgrupo">
                {bulkNewMode.subgroup ? (
                  <div className="flex gap-1.5">
                    <input autoFocus type="text" value={bulkFields.productSubgroup} onChange={(e) => setBulkFields((f) => ({ ...f, productSubgroup: e.target.value }))} placeholder="Nome do novo subgrupo" className={BULK_INPUT_CLS} />
                    <button type="button" onClick={() => { setBulkNewMode((m) => ({ ...m, subgroup: false })); setBulkFields((f) => ({ ...f, productSubgroup: '' })); }} className="px-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0"><span className="material-symbols-outlined text-[18px]">close</span></button>
                  </div>
                ) : (
                  <select value={bulkFields.productSubgroup} onChange={(e) => { if (e.target.value === '__new__') { setBulkNewMode((m) => ({ ...m, subgroup: true })); setBulkFields((f) => ({ ...f, productSubgroup: '' })); } else { setBulkFields((f) => ({ ...f, productSubgroup: e.target.value })); } }} className={BULK_INPUT_CLS}>
                    <option value="">— Limpar —</option>
                    {bulkFields.productType && bulkFields.productSubtype ? (
                      hierOptions.subgroupsFor(bulkFields.productType, bulkFields.productSubtype).map((s) => <option key={s} value={s}>{s}</option>)
                    ) : bulkFields.productSubtype ? (
                      hierOptions.subgroupsForGroup(bulkFields.productSubtype).map((s) => <option key={s} value={s}>{s}</option>)
                    ) : (
                      <>
                        {hierOptions.subgroupsByGroup.map((entry) => (
                          <optgroup key={entry.group} label={entry.group}>
                            {entry.subgroups.map((s) => <option key={s} value={s}>{s}</option>)}
                          </optgroup>
                        ))}
                        {hierOptions.orphanSubgroups.length > 0 && (
                          <optgroup label="Outros">
                            {hierOptions.orphanSubgroups.map((s) => <option key={s} value={s}>{s}</option>)}
                          </optgroup>
                        )}
                      </>
                    )}
                    <option value="__new__">+ Criar novo subgrupo...</option>
                  </select>
                )}
              </BulkFieldRow>

              <BulkFieldRow checked={bulkFields.enableNcm} onChange={(v) => setBulkFields((f) => ({ ...f, enableNcm: v }))} icon="tag" label="NCM">
                <input type="text" value={bulkFields.ncm} onChange={(e) => setBulkFields((f) => ({ ...f, ncm: e.target.value }))} placeholder="Ex: 90189099" maxLength={8} className={`${BULK_INPUT_CLS} font-mono`} />
              </BulkFieldRow>

              <BulkFieldRow checked={bulkFields.enableAnvisa} onChange={(v) => setBulkFields((f) => ({ ...f, enableAnvisa: v }))} icon="verified" label="ANVISA">
                <input type="text" value={bulkFields.anvisa} onChange={(e) => setBulkFields((f) => ({ ...f, anvisa: e.target.value }))} placeholder="11 dígitos — deixe em branco para limpar" maxLength={13} className={`${BULK_INPUT_CLS} font-mono`} />
              </BulkFieldRow>

              <BulkFieldRow checked={bulkFields.enableOutOfLine} onChange={(v) => setBulkFields((f) => ({ ...f, enableOutOfLine: v }))} icon="toggle_on" label="Status">
                <div className="flex gap-2">
                  <button
                    onClick={() => setBulkFields((f) => ({ ...f, outOfLine: false }))}
                    className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all ring-1 ${!bulkFields.outOfLine ? 'bg-emerald-50 dark:bg-emerald-900/20 ring-emerald-300 dark:ring-emerald-700 text-emerald-700 dark:text-emerald-300 shadow-sm shadow-emerald-100 dark:shadow-none' : 'ring-slate-200 dark:ring-slate-700 text-slate-400 dark:text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
                  >
                    <span className="material-symbols-outlined text-[16px]">check_circle</span>
                    Em Linha
                  </button>
                  <button
                    onClick={() => setBulkFields((f) => ({ ...f, outOfLine: true }))}
                    className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all ring-1 ${bulkFields.outOfLine ? 'bg-red-50 dark:bg-red-900/20 ring-red-300 dark:ring-red-700 text-red-700 dark:text-red-300 shadow-sm shadow-red-100 dark:shadow-none' : 'ring-slate-200 dark:ring-slate-700 text-slate-400 dark:text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
                  >
                    <span className="material-symbols-outlined text-[16px]">block</span>
                    Fora de Linha
                  </button>
                </div>
              </BulkFieldRow>
            </div>

            {/* Footer */}
            <div className="px-4 sm:px-6 py-3.5 border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-card-dark shrink-0 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] sm:shadow-none">
              {/* Mobile footer */}
              <div className="flex flex-col gap-2 sm:hidden">
                <button
                  onClick={handleBulkSave}
                  disabled={isBulkSaving || enabledCount === 0}
                  className="flex items-center justify-center gap-2 w-full px-5 py-2.5 bg-gradient-to-r from-primary to-primary-dark hover:from-primary-dark hover:to-primary text-white rounded-xl text-sm font-bold transition-all shadow-sm shadow-primary/25 disabled:opacity-40 disabled:shadow-none"
                >
                  {isBulkSaving ? (
                    <><span className="material-symbols-outlined text-[16px] animate-spin">progress_activity</span>Salvando...</>
                  ) : (
                    <><span className="material-symbols-outlined text-[16px]">save</span>Salvar {enabledCount > 0 && <span className="px-1.5 py-0.5 rounded-md bg-white/20 text-[11px] font-bold">{enabledCount}</span>}</>
                  )}
                </button>
                <button onClick={() => setBulkEditOpen(false)} className="w-full px-4 py-2.5 text-sm font-semibold text-primary hover:bg-primary/5 rounded-xl transition-colors">
                  <span className="material-symbols-outlined text-[16px] align-middle mr-1">arrow_back</span>Voltar
                </button>
              </div>
              {/* Desktop footer */}
              <div className="hidden sm:flex items-center justify-between">
                <button onClick={() => setBulkEditOpen(false)} className="px-4 py-2.5 text-sm font-medium text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                  Cancelar
                </button>
                <button
                  onClick={handleBulkSave}
                  disabled={isBulkSaving || enabledCount === 0}
                  className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-primary to-primary-dark hover:from-primary-dark hover:to-primary text-white rounded-xl text-sm font-bold transition-all shadow-sm shadow-primary/25 disabled:opacity-40 disabled:shadow-none"
                >
                  {isBulkSaving ? (
                    <><span className="material-symbols-outlined text-[16px] animate-spin">progress_activity</span>Salvando...</>
                  ) : (
                    <><span className="material-symbols-outlined text-[16px]">save</span>Salvar {enabledCount > 0 && <span className="px-1.5 py-0.5 rounded-md bg-white/20 text-[11px] font-bold">{enabledCount}</span>}</>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Product detail modal */}
      {detailProduct && (() => {
        const anvisaStatusColor = detailProduct.anvisaStatus?.toLowerCase().includes('válid')
          ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800'
          : detailProduct.anvisaStatus?.toLowerCase().includes('vencid') || detailProduct.anvisaStatus?.toLowerCase().includes('cancel')
          ? 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
          : 'text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700';

        return (
          <div className="fixed inset-0 z-50 sm:flex sm:items-center sm:justify-center sm:p-4 sm:bg-black/60 sm:backdrop-blur-sm" onClick={() => setDetailProduct(null)}>
            <div className="absolute inset-0 sm:relative sm:inset-auto bg-slate-50 dark:bg-[#1a1e2e] sm:rounded-2xl w-full sm:max-w-3xl sm:h-auto sm:max-h-[92vh] flex flex-col overflow-hidden sm:shadow-2xl sm:ring-1 ring-black/5 dark:ring-white/5" onClick={(e) => e.stopPropagation()}>

              {/* ── Header ── */}
              <div className="px-4 sm:px-6 py-4 bg-white dark:bg-card-dark border-b border-slate-200 dark:border-slate-700 shrink-0 shadow-[0_2px_8px_rgba(0,0,0,0.08)] sm:shadow-none">
                {/* Out of line banner */}
                {detailProduct.outOfLine && (
                  <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-red-400 via-red-500 to-red-400" />
                )}
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 dark:from-primary/30 dark:to-primary/10 flex items-center justify-center ring-1 ring-primary/20 dark:ring-primary/30">
                    <span className="material-symbols-outlined text-[22px] text-primary">inventory_2</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-[15px] font-bold text-slate-900 dark:text-white leading-snug">
                      {detailProduct.codigo && <><span className="font-mono text-emerald-600 dark:text-emerald-400">{detailProduct.codigo}</span><span className="text-slate-300 dark:text-slate-600 mx-1.5">/</span></>}
                      {detailProduct.code && <><span className="font-mono text-blue-600 dark:text-blue-400">{detailProduct.code}</span><span className="text-slate-300 dark:text-slate-600 mx-1.5">/</span></>}
                      {detailProduct.description}
                    </h3>
                    {detailProduct.shortName && (
                      <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-0.5">{detailProduct.shortName}</p>
                    )}
                    <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                      {detailProduct.outOfLine && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-[10px] font-bold text-red-600 dark:text-red-400">
                          <span className="material-symbols-outlined text-[11px]">block</span>Fora de Linha
                        </span>
                      )}
                      {detailProduct.productType && (
                        <span className="px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200/60 dark:border-indigo-800/40 text-[10px] font-bold text-indigo-600 dark:text-indigo-400">{detailProduct.productType}</span>
                      )}
                      {detailProduct.productSubtype && (
                        <span className="px-2 py-0.5 rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-200/60 dark:border-amber-800/40 text-[10px] font-bold text-amber-600 dark:text-amber-400">{detailProduct.productSubtype}</span>
                      )}
                      {detailProduct.productSubgroup && (
                        <span className="px-2 py-0.5 rounded-md bg-teal-50 dark:bg-teal-900/20 border border-teal-200/60 dark:border-teal-800/40 text-[10px] font-bold text-teal-600 dark:text-teal-400">{detailProduct.productSubgroup}</span>
                      )}
                      {detailProduct.ean && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-700/60 text-[10px] font-mono font-medium text-slate-500 dark:text-slate-400">
                          EAN {detailProduct.ean}
                        </span>
                      )}
                      {detailProduct.anvisa && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-teal-50 dark:bg-teal-900/20 border border-teal-200/60 dark:border-teal-800/40 text-[10px] font-mono font-bold text-teal-600 dark:text-teal-400">
                          <span className="material-symbols-outlined text-[11px]">verified</span>{detailProduct.anvisa}
                        </span>
                      )}
                    </div>
                  </div>
                  <button onClick={() => setDetailProduct(null)} className="flex-shrink-0 p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                    <span className="material-symbols-outlined text-[20px]">close</span>
                  </button>
                </div>

              </div>

              {/* ── Body ── */}
              <div className="overflow-y-auto flex-1 p-4 sm:p-5 space-y-3">
                {/* ── Card: Dados Gerais ── */}
                <DetailSectionCard id="geral" icon="analytics" iconColor="text-emerald-500" title="Dados Gerais" isOpen={detailOpenSections.has('geral')} onToggle={toggleDetailSection}>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mt-2">
                    {[
                      { label: 'Último Preço', value: formatValue(detailProduct.lastPrice), icon: 'trending_up', color: 'text-emerald-500 bg-emerald-500/10 ring-emerald-500/20' },
                      { label: 'Qtde Total', value: formatQuantity(detailProduct.totalQuantity), icon: 'inventory_2', color: 'text-blue-500 bg-blue-500/10 ring-blue-500/20' },
                      { label: 'Notas', value: String(detailProduct.invoiceCount), icon: 'receipt_long', color: 'text-amber-500 bg-amber-500/10 ring-amber-500/20' },
                      { label: 'Última Compra', value: formatDate(detailProduct.lastIssueDate), icon: 'calendar_month', color: 'text-violet-500 bg-violet-500/10 ring-violet-500/20' },
                    ].map(s => (
                      <div key={s.label} className="flex items-center gap-2 px-2.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800/40 ring-1 ring-slate-200/50 dark:ring-slate-700/50">
                        <div className={`w-6 h-6 rounded-md flex items-center justify-center ring-1 shrink-0 ${s.color}`}>
                          <span className="material-symbols-outlined text-[13px]">{s.icon}</span>
                        </div>
                        <div className="min-w-0">
                          <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">{s.label}</p>
                          <p className="text-[12px] font-bold text-slate-800 dark:text-white truncate">{s.value}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </DetailSectionCard>

                {/* ── Card: Dados do Cadastro ── */}
                <DetailSectionCard id="cadastro" icon="edit_note" iconColor="text-primary" title="Dados do Cadastro" isOpen={detailOpenSections.has('cadastro')} onToggle={toggleDetailSection}>
                  <div className="space-y-2 mt-1">
                    <DetailField label="Código Interno">
                      <input type="text" value={detailCodigo} onChange={(e) => setDetailCodigo(e.target.value)} maxLength={50} placeholder="Código interno da empresa" disabled={!canWrite} className={DETAIL_INPUT_CLS} />
                    </DetailField>

                    <DetailField label="Nome Abreviado" colSpan2>
                      <input type="text" value={detailShortName} onChange={(e) => setDetailShortName(e.target.value)} maxLength={100} placeholder="Nome curto para identificação rápida" disabled={!canWrite} className={DETAIL_INPUT_CLS} />
                    </DetailField>

                    <div className="grid grid-cols-3 gap-2">
                      <DetailField label="Linha">
                        {detailNewMode.type ? (
                          <div className="flex gap-1">
                            <input autoFocus type="text" value={detailType} onChange={(e) => setDetailType(e.target.value)} placeholder="Nova linha" disabled={!canWrite} className={DETAIL_INPUT_CLS} />
                            <button type="button" onClick={() => { setDetailNewMode((m) => ({ ...m, type: false })); setDetailType(''); }} className="px-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0"><span className="material-symbols-outlined text-[16px]">close</span></button>
                          </div>
                        ) : (
                          <select value={detailType} onChange={(e) => { if (e.target.value === '__new__') { setDetailNewMode((m) => ({ ...m, type: true })); setDetailType(''); } else { setDetailType(e.target.value); } }} disabled={!canWrite} className={DETAIL_INPUT_CLS}>
                            <option value="">— Nenhuma —</option>
                            {hierOptions.lines.map((t) => <option key={t} value={t}>{t}</option>)}
                            <option value="__new__">+ Criar nova...</option>
                          </select>
                        )}
                      </DetailField>

                      <DetailField label="Grupo">
                        {detailNewMode.subtype ? (
                          <div className="flex gap-1">
                            <input autoFocus type="text" value={detailSubtype} onChange={(e) => setDetailSubtype(e.target.value)} placeholder="Novo grupo" disabled={!canWrite} className={DETAIL_INPUT_CLS} />
                            <button type="button" onClick={() => { setDetailNewMode((m) => ({ ...m, subtype: false })); setDetailSubtype(''); }} className="px-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0"><span className="material-symbols-outlined text-[16px]">close</span></button>
                          </div>
                        ) : (
                          <select value={detailSubtype} onChange={(e) => { if (e.target.value === '__new__') { setDetailNewMode((m) => ({ ...m, subtype: true })); setDetailSubtype(''); } else { setDetailSubtype(e.target.value); } }} disabled={!canWrite} className={DETAIL_INPUT_CLS}>
                            <option value="">— Nenhum —</option>
                            {detailType ? (
                              hierOptions.groupsFor(detailType).map((s) => <option key={s} value={s}>{s}</option>)
                            ) : (
                              <>
                                {hierOptions.groupsByLine.map((entry) => (
                                  <optgroup key={entry.line} label={entry.line}>
                                    {entry.groups.map((g) => <option key={g} value={g}>{g}</option>)}
                                  </optgroup>
                                ))}
                                {hierOptions.orphanGroups.length > 0 && (
                                  <optgroup label="Outros">
                                    {hierOptions.orphanGroups.map((g) => <option key={g} value={g}>{g}</option>)}
                                  </optgroup>
                                )}
                              </>
                            )}
                            <option value="__new__">+ Criar novo...</option>
                          </select>
                        )}
                      </DetailField>

                      <DetailField label="Subgrupo">
                        {detailNewMode.subgroup ? (
                          <div className="flex gap-1">
                            <input autoFocus type="text" value={detailSubgroup} onChange={(e) => setDetailSubgroup(e.target.value)} placeholder="Novo subgrupo" disabled={!canWrite} className={DETAIL_INPUT_CLS} />
                            <button type="button" onClick={() => { setDetailNewMode((m) => ({ ...m, subgroup: false })); setDetailSubgroup(''); }} className="px-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0"><span className="material-symbols-outlined text-[16px]">close</span></button>
                          </div>
                        ) : (
                          <select value={detailSubgroup} onChange={(e) => { if (e.target.value === '__new__') { setDetailNewMode((m) => ({ ...m, subgroup: true })); setDetailSubgroup(''); } else { setDetailSubgroup(e.target.value); } }} disabled={!canWrite} className={DETAIL_INPUT_CLS}>
                            <option value="">— Nenhum —</option>
                            {detailType && detailSubtype ? (
                              hierOptions.subgroupsFor(detailType, detailSubtype).map((s) => <option key={s} value={s}>{s}</option>)
                            ) : detailSubtype ? (
                              hierOptions.subgroupsForGroup(detailSubtype).map((s) => <option key={s} value={s}>{s}</option>)
                            ) : (
                              <>
                                {hierOptions.subgroupsByGroup.map((entry) => (
                                  <optgroup key={entry.group} label={entry.group}>
                                    {entry.subgroups.map((s) => <option key={s} value={s}>{s}</option>)}
                                  </optgroup>
                                ))}
                                {hierOptions.orphanSubgroups.length > 0 && (
                                  <optgroup label="Outros">
                                    {hierOptions.orphanSubgroups.map((s) => <option key={s} value={s}>{s}</option>)}
                                  </optgroup>
                                )}
                              </>
                            )}
                            <option value="__new__">+ Criar novo...</option>
                          </select>
                        )}
                      </DetailField>
                    </div>

                    {detailProduct.lastSupplierName && (
                      <div className="flex items-center gap-1.5 text-[12px] text-slate-400">
                        <span className="material-symbols-outlined text-[14px] text-orange-500">local_shipping</span>
                        <span>Fabricante:</span>
                        <span className="font-medium text-slate-700 dark:text-slate-300">{detailProduct.lastSupplierName}</span>
                      </div>
                    )}

                    <label className={`flex items-center gap-2.5 cursor-pointer px-2.5 py-2 rounded-xl border transition-colors ${detailProduct.outOfLine ? 'border-red-200 dark:border-red-800/50 bg-red-50/50 dark:bg-red-900/10' : 'border-dashed border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/30'}`}>
                      <div className="relative">
                        <input type="checkbox" checked={!!detailProduct.outOfLine} disabled={!canWrite} onChange={() => handleToggleOutOfLine(detailProduct)} className="sr-only peer" />
                        <div className="w-9 h-5 bg-slate-300 dark:bg-slate-600 rounded-full peer-checked:bg-red-500 peer-disabled:opacity-50 transition-colors"></div>
                        <div className="absolute left-0.5 top-0.5 w-4 h-4 bg-white rounded-full shadow-sm peer-checked:translate-x-4 transition-transform"></div>
                      </div>
                      <span className={`text-[12px] font-semibold ${detailProduct.outOfLine ? 'text-red-600 dark:text-red-400' : 'text-slate-500 dark:text-slate-400'}`}>Fora de Linha</span>
                    </label>
                  </div>
                </DetailSectionCard>

                {/* ── Card: Dados Fiscais ── */}
                <DetailSectionCard id="fiscal" icon="receipt_long" iconColor="text-amber-500" title="Dados Fiscais" isOpen={detailOpenSections.has('fiscal')} onToggle={toggleDetailSection}>
                  <div className="space-y-2 mt-1">
                    {/* ─── NCM + CEST ─── */}
                    <div className="grid grid-cols-3 gap-2">
                      <div className="col-span-2">
                        <DetailField label="NCM">
                          <div className="relative">
                            <input ref={ncmInputRef} type="text" value={detailNcm} onChange={(e) => { setDetailNcm(e.target.value); setNcmSuggestionsOpen(true); }} onFocus={() => setNcmSuggestionsOpen(true)} onBlur={() => setTimeout(() => setNcmSuggestionsOpen(false), 200)} maxLength={8} placeholder="Ex: 90189099" disabled={!canWrite} className={`${DETAIL_INPUT_CLS} font-mono`} />
                            {ncmSuggestionsOpen && ncmSuggestions.length > 0 && (
                              <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg max-h-48 overflow-y-auto">
                                {ncmSuggestions.map((s) => (
                                  <button key={s.codigo} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { const d = s.codigo.replace(/\D/g, ''); setDetailNcm(d); setNcmSuggestionsOpen(false); }} className="w-full text-left px-3 py-2 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors border-b border-slate-100 dark:border-slate-700/50 last:border-0">
                                    <span className="font-mono text-[12px] font-bold text-amber-600 dark:text-amber-400">{s.codigo}</span>
                                    <span className="ml-2 text-[12px] text-slate-600 dark:text-slate-400">{s.descricao}</span>
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                          {detailNcmInfo && detailNcmInfo.hierarchy.length > 0 && (() => {
                            const levels = detailNcmInfo.hierarchy;
                            const last = levels[levels.length - 1];
                            const hasMore = levels.length > 1;
                            return (
                              <div className="mt-1">
                                {!detailNcmExpanded && (
                                  <div className="flex items-center gap-1.5">
                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] leading-tight bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 font-semibold">
                                      <span className="font-mono opacity-70">{last.codigo}</span>
                                      <span>{last.descricao}</span>
                                    </span>
                                    {hasMore && (
                                      <button type="button" onClick={() => setDetailNcmExpanded(true)} className="text-[10px] text-amber-500 dark:text-amber-400 hover:underline whitespace-nowrap">ver hierarquia</button>
                                    )}
                                  </div>
                                )}
                                {detailNcmExpanded && (
                                  <div className="flex flex-wrap items-center gap-1">
                                    {levels.map((level, i) => (
                                      <React.Fragment key={level.codigo}>
                                        {i > 0 && <span className="material-symbols-outlined text-[12px] text-slate-300 dark:text-slate-600">chevron_right</span>}
                                        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] leading-tight ${i === levels.length - 1 ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 font-semibold' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'}`}>
                                          <span className="font-mono opacity-70">{level.codigo}</span>
                                          <span>{level.descricao}</span>
                                        </span>
                                      </React.Fragment>
                                    ))}
                                    <button type="button" onClick={() => setDetailNcmExpanded(false)} className="text-[10px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:underline whitespace-nowrap ml-1">recolher</button>
                                  </div>
                                )}
                              </div>
                            );
                          })()}
                        </DetailField>
                      </div>
                      <DetailField label="CEST">
                        <input type="text" value={detailCest} onChange={(e) => setDetailCest(e.target.value)} maxLength={9} placeholder="1300400" disabled={!canWrite} list="detail-fiscal-cest-list" className={`${DETAIL_INPUT_CLS} font-mono`} />
                        <datalist id="detail-fiscal-cest-list">
                          {Array.from(new Set(products.map((p) => p.fiscalCest).filter(Boolean))).sort().map((v) => <option key={v!} value={v!} />)}
                        </datalist>
                      </DetailField>
                    </div>

                    {/* ─── Origem + CST + Nome Tributação ─── */}
                    <div className="grid grid-cols-3 gap-2">
                      <DetailField label="Origem">
                        <select value={detailOrigem} onChange={(e) => setDetailOrigem(e.target.value)} disabled={!canWrite} className={DETAIL_INPUT_CLS}>
                          <option value="">—</option>
                          <option value="0">0 – Nacional</option>
                          <option value="1">1 – Estrangeira (import.)</option>
                          <option value="2">2 – Estrangeira (merc. int.)</option>
                          <option value="3">3 – Nacional &gt;40% import.</option>
                          <option value="5">5 – Nacional ≤40% import.</option>
                          <option value="8">8 – Nacional &gt;70% import.</option>
                        </select>
                      </DetailField>
                      <DetailField label="CST ICMS">
                        <select value={detailSitTributaria} onChange={(e) => setDetailSitTributaria(e.target.value)} disabled={!canWrite} className={`${DETAIL_INPUT_CLS} font-mono`}>
                          <option value="">—</option>
                          <option value="00">00 – Trib. integral</option>
                          <option value="10">10 – ICMS por ST</option>
                          <option value="20">20 – Redução BC</option>
                          <option value="30">30 – Isenta c/ ST</option>
                          <option value="40">40 – Isenta</option>
                          <option value="41">41 – Não tributada</option>
                          <option value="50">50 – Suspensão</option>
                          <option value="51">51 – Diferimento</option>
                          <option value="60">60 – ST anterior</option>
                          <option value="70">70 – Red. BC + ST</option>
                          <option value="90">90 – Outras</option>
                        </select>
                      </DetailField>
                      <DetailField label="Nome Tributação">
                        <input type="text" value={detailNomeTributacao} onChange={(e) => setDetailNomeTributacao(e.target.value)} maxLength={200} placeholder="Ex: Isento" disabled={!canWrite} list="detail-fiscal-nome-list" className={DETAIL_INPUT_CLS} />
                        <datalist id="detail-fiscal-nome-list">
                          {Array.from(new Set(products.map((p) => p.fiscalNomeTributacao).filter(Boolean))).sort().map((v) => <option key={v!} value={v!} />)}
                        </datalist>
                      </DetailField>
                    </div>

                    {/* ─── Alíquotas (%) ─── */}
                    <div className="grid grid-cols-5 gap-2">
                      <DetailField label="ICMS %">
                        <input type="number" step="0.01" min="0" max="100" value={detailIcms} onChange={(e) => setDetailIcms(e.target.value)} placeholder="0" disabled={!canWrite} className={`${DETAIL_INPUT_CLS} font-mono`} />
                      </DetailField>
                      <DetailField label="PIS %">
                        <input type="number" step="0.01" min="0" max="100" value={detailPis} onChange={(e) => setDetailPis(e.target.value)} placeholder="0" disabled={!canWrite} className={`${DETAIL_INPUT_CLS} font-mono`} />
                      </DetailField>
                      <DetailField label="COFINS %">
                        <input type="number" step="0.01" min="0" max="100" value={detailCofins} onChange={(e) => setDetailCofins(e.target.value)} placeholder="0" disabled={!canWrite} className={`${DETAIL_INPUT_CLS} font-mono`} />
                      </DetailField>
                      <DetailField label="IPI %">
                        <input type="number" step="0.01" min="0" max="100" value={detailIpi} onChange={(e) => setDetailIpi(e.target.value)} placeholder="0" disabled={!canWrite} className={`${DETAIL_INPUT_CLS} font-mono`} />
                      </DetailField>
                      <DetailField label="FCP %">
                        <input type="number" step="0.01" min="0" max="100" value={detailFcp} onChange={(e) => setDetailFcp(e.target.value)} placeholder="0" disabled={!canWrite} className={`${DETAIL_INPUT_CLS} font-mono`} />
                      </DetailField>
                    </div>

                    <DetailField label="Obs. Fiscal" colSpan2>
                      <textarea value={detailFiscalObs} onChange={(e) => setDetailFiscalObs(e.target.value)} maxLength={500} rows={2} placeholder="Observações fiscais do produto" disabled={!canWrite} className={`${DETAIL_INPUT_CLS} resize-none`} />
                    </DetailField>
                  </div>
                </DetailSectionCard>

                {/* ── Card: Dados da ANVISA ── */}
                <DetailSectionCard id="anvisa" icon="verified_user" iconColor="text-teal-500" title="Dados da ANVISA" isOpen={detailOpenSections.has('anvisa')} onToggle={toggleDetailSection}
                  badge={detailProduct.anvisaStatus ? (
                    <span className={`px-2.5 py-0.5 rounded-lg text-[10px] font-bold border ${anvisaStatusColor}`}>{detailProduct.anvisaStatus}</span>
                  ) : undefined}
                >
                    <div className="grid grid-cols-2 gap-3 mt-2">
                      <DetailField label="Código ANVISA" colSpan2>
                        <div className="flex gap-2">
                          <input type="text" value={detailAnvisa} onChange={(e) => setDetailAnvisa(e.target.value)} maxLength={13} placeholder="11 dígitos numéricos" disabled={!canWrite} className={`flex-1 ${DETAIL_INPUT_CLS} font-mono`} />
                          {canWrite && detailAnvisa && (
                            <button onClick={() => setDetailAnvisa('')} className="px-3 border border-red-200 dark:border-red-800/60 text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl text-sm transition-colors" title="Limpar código ANVISA">
                              <span className="material-symbols-outlined text-[16px]">delete</span>
                            </button>
                          )}
                          {canWrite && detailProduct.anvisa && (
                            <button onClick={() => handleSyncRegistry(detailProduct)} disabled={syncingRegistry} className="flex items-center gap-1.5 px-3.5 py-2.5 border border-teal-200 dark:border-teal-800/60 text-teal-700 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-900/20 rounded-xl text-[12px] font-semibold transition-colors disabled:opacity-60 whitespace-nowrap" title="Consultar dados do registro na ANVISA">
                              <span className={`material-symbols-outlined text-[15px] ${syncingRegistry ? 'animate-spin' : ''}`}>{syncingRegistry ? 'progress_activity' : 'verified'}</span>
                              {syncingRegistry ? 'Consultando...' : 'Buscar'}
                            </button>
                          )}
                        </div>
                      </DetailField>

                      {/* Real-time ANVISA validation */}
                      {anvisaValidation && (
                        <div className="col-span-2">
                          {anvisaValidation.loading ? (
                            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800/30 ring-1 ring-slate-200/50 dark:ring-slate-700/50">
                              <span className="material-symbols-outlined text-[14px] text-slate-400 animate-spin">progress_activity</span>
                              <span className="text-[11px] text-slate-400">Validando na ANVISA...</span>
                            </div>
                          ) : anvisaValidation.notFound ? (
                            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800/30 ring-1 ring-slate-200/50 dark:ring-slate-700/50">
                              <span className="material-symbols-outlined text-[14px] text-slate-400">help_outline</span>
                              <span className="text-[11px] font-medium text-slate-400">Não encontrado na ANVISA</span>
                            </div>
                          ) : (
                            <div className="rounded-xl bg-teal-50/40 dark:bg-teal-900/10 border border-teal-200/40 dark:border-teal-800/30 px-3 py-2.5 space-y-1.5">
                              <div className="flex items-center gap-2 flex-wrap">
                                {anvisaValidation.status && (
                                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                    anvisaValidation.status.toLowerCase().includes('valid') || anvisaValidation.status.toLowerCase().includes('ativ')
                                      ? 'bg-emerald-50 text-emerald-600 ring-1 ring-emerald-500/20 dark:bg-emerald-900/30 dark:text-emerald-400'
                                      : anvisaValidation.status.toLowerCase().includes('cancel') || anvisaValidation.status.toLowerCase().includes('caduc')
                                        ? 'bg-red-50 text-red-600 ring-1 ring-red-500/20 dark:bg-red-900/30 dark:text-red-400'
                                        : 'bg-amber-50 text-amber-600 ring-1 ring-amber-500/20 dark:bg-amber-900/30 dark:text-amber-400'
                                  }`}>
                                    {anvisaValidation.status}
                                  </span>
                                )}
                                {anvisaValidation.riskClass && (
                                  <span className="text-[10px] font-medium text-slate-400 dark:text-slate-500">Classe {anvisaValidation.riskClass}</span>
                                )}
                                {anvisaValidation.expiration && (
                                  <span className="text-[10px] text-slate-400 dark:text-slate-500">Val. {anvisaValidation.expiration}</span>
                                )}
                              </div>
                              {anvisaValidation.productName && (
                                <p className="text-[12px] font-medium text-slate-700 dark:text-slate-300 leading-snug">{anvisaValidation.productName}</p>
                              )}
                              {anvisaValidation.company && (
                                <p className="text-[10px] text-slate-400 dark:text-slate-500">{anvisaValidation.company}</p>
                              )}
                            </div>
                          )}
                        </div>
                      )}

                      {detailProduct.anvisaMatchedProductName && (
                        <div className="col-span-2 bg-teal-50/60 dark:bg-teal-900/10 border border-teal-200/50 dark:border-teal-800/40 rounded-xl px-4 py-3">
                          <p className="text-[10px] uppercase tracking-wider font-bold text-teal-500 dark:text-teal-400 mb-1">Produto Registrado</p>
                          <p className="text-[13px] font-medium text-slate-700 dark:text-slate-300 leading-snug">{detailProduct.anvisaMatchedProductName}</p>
                        </div>
                      )}

                      {(detailProduct.anvisaHolder || detailProduct.anvisaManufacturer) && (
                        <div className="col-span-2 grid grid-cols-1 md:grid-cols-2 gap-3">
                          {detailProduct.anvisaHolder && (
                            <div className="rounded-xl px-4 py-3 bg-slate-50 dark:bg-slate-800/40 ring-1 ring-slate-200/50 dark:ring-slate-700/50">
                              <div className="flex items-center gap-1.5 mb-1">
                                <span className="material-symbols-outlined text-[12px] text-slate-400">business</span>
                                <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400 dark:text-slate-500">Detentor do Registro</p>
                              </div>
                              <p className="text-[13px] font-medium text-slate-700 dark:text-slate-300">{detailProduct.anvisaHolder}</p>
                            </div>
                          )}
                          {detailProduct.anvisaManufacturer && (
                            <div className="rounded-xl px-4 py-3 bg-slate-50 dark:bg-slate-800/40 ring-1 ring-slate-200/50 dark:ring-slate-700/50">
                              <div className="flex items-center gap-1.5 mb-1">
                                <span className="material-symbols-outlined text-[12px] text-slate-400">factory</span>
                                <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400 dark:text-slate-500">
                                  Fabricante Legal{detailProduct.anvisaManufacturerCountry ? ` · ${detailProduct.anvisaManufacturerCountry}` : ''}
                                </p>
                              </div>
                              <p className="text-[13px] font-medium text-slate-700 dark:text-slate-300">
                                {detailProduct.manufacturerShortName ? (
                                  <><span className="font-semibold">{detailProduct.manufacturerShortName}</span> <span className="text-slate-400 text-[11px]">({detailProduct.anvisaManufacturer})</span></>
                                ) : detailProduct.anvisaManufacturer}
                              </p>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Status + Vencimento + Processo + Risco grid */}
                      {(detailProduct.anvisaStatus || detailProduct.anvisaExpiration || detailProduct.anvisaProcess || detailProduct.anvisaRiskClass) && (
                        <div className="col-span-2 grid grid-cols-2 md:grid-cols-4 gap-2">
                          {detailProduct.anvisaStatus && (
                            <div className={`rounded-xl px-3.5 py-2.5 border ${anvisaStatusColor}`}>
                              <p className="text-[9px] uppercase tracking-wider font-bold opacity-60 mb-0.5">Situação</p>
                              <p className="text-[12px] font-bold">{detailProduct.anvisaStatus}</p>
                            </div>
                          )}
                          <div className="rounded-xl px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
                            <p className="text-[9px] uppercase tracking-wider font-bold text-slate-400 dark:text-slate-500 mb-0.5">Vencimento</p>
                            <p className="text-[12px] font-semibold text-slate-700 dark:text-slate-300">
                              {detailProduct.anvisaExpiration ? formatDate(detailProduct.anvisaExpiration) : 'Vigente'}
                            </p>
                          </div>
                          {detailProduct.anvisaProcess && (
                            <div className="rounded-xl px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
                              <p className="text-[9px] uppercase tracking-wider font-bold text-slate-400 dark:text-slate-500 mb-0.5">Processo</p>
                              <p className="text-[11px] font-mono font-medium text-slate-600 dark:text-slate-400">{detailProduct.anvisaProcess}</p>
                            </div>
                          )}
                          {detailProduct.anvisaRiskClass && (
                            <div className="rounded-xl px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
                              <p className="text-[9px] uppercase tracking-wider font-bold text-slate-400 dark:text-slate-500 mb-0.5">Classe de Risco</p>
                              <p className="text-[12px] font-semibold text-slate-600 dark:text-slate-300">{detailProduct.anvisaRiskClass}</p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                </DetailSectionCard>

              </div>

              {/* ── Footer ── */}
              <div className="px-4 sm:px-6 py-3.5 border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-card-dark shrink-0 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] sm:shadow-none">
                {/* Mobile footer */}
                <div className="flex flex-col gap-2 sm:hidden">
                  {canWrite && (
                    <button
                      onClick={handleSaveDetail}
                      disabled={savingDetail || !detailDirty}
                      className="flex items-center justify-center gap-2 w-full px-5 py-2.5 bg-gradient-to-r from-primary to-primary-dark hover:from-primary-dark hover:to-primary text-white rounded-xl text-sm font-bold transition-all shadow-sm shadow-primary/25 disabled:opacity-40 disabled:shadow-none"
                    >
                      {savingDetail ? (
                        <><span className="material-symbols-outlined text-[16px] animate-spin">progress_activity</span>Salvando...</>
                      ) : (
                        <><span className="material-symbols-outlined text-[16px]">save</span>Salvar</>
                      )}
                    </button>
                  )}
                  <button
                    onClick={() => openHistory(detailProduct)}
                    className="flex items-center justify-center gap-1.5 w-full px-4 py-2.5 rounded-xl text-[13px] font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 hover:border-slate-300 dark:hover:border-slate-600 transition-all"
                  >
                    <span className="material-symbols-outlined text-[16px] text-blue-500">history</span>
                    Histórico
                  </button>
                  <button onClick={() => setDetailProduct(null)} className="w-full px-4 py-2.5 text-sm font-semibold text-primary hover:bg-primary/5 rounded-xl transition-colors">
                    <span className="material-symbols-outlined text-[16px] align-middle mr-1">arrow_back</span>Voltar
                  </button>
                </div>
                {/* Desktop footer */}
                <div className="hidden sm:flex items-center justify-between">
                  <button onClick={() => setDetailProduct(null)} className="px-4 py-2.5 text-sm font-medium text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                    Fechar
                  </button>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => openHistory(detailProduct)}
                      className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-[13px] font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 hover:border-slate-300 dark:hover:border-slate-600 transition-all"
                      title="Ver histórico de compras e vendas"
                    >
                      <span className="material-symbols-outlined text-[16px] text-blue-500">history</span>
                      Histórico
                    </button>
                    {canWrite && (
                      <button
                        onClick={handleSaveDetail}
                        disabled={savingDetail || !detailDirty}
                        className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-primary to-primary-dark hover:from-primary-dark hover:to-primary text-white rounded-xl text-sm font-bold transition-all shadow-sm shadow-primary/25 disabled:opacity-40 disabled:shadow-none"
                      >
                        {savingDetail ? (
                          <><span className="material-symbols-outlined text-[16px] animate-spin">progress_activity</span>Salvando...</>
                        ) : (
                          <><span className="material-symbols-outlined text-[16px]">save</span>Salvar</>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* History modal */}
      {historyProduct && (
        <div className="fixed inset-0 z-50 sm:flex sm:items-center sm:justify-center sm:p-4 sm:bg-black/60 sm:backdrop-blur-sm" onClick={() => setHistoryProduct(null)}>
          <div className="absolute inset-0 sm:relative sm:inset-auto bg-slate-50 dark:bg-[#1a1e2e] sm:rounded-2xl w-full sm:max-w-4xl sm:h-auto sm:max-h-[92vh] flex flex-col overflow-hidden sm:shadow-2xl sm:ring-1 ring-black/5 dark:ring-white/5" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="px-4 sm:px-6 py-4 bg-white dark:bg-card-dark border-b border-slate-200 dark:border-slate-700 shrink-0 shadow-[0_2px_8px_rgba(0,0,0,0.08)] sm:shadow-none">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500/20 to-blue-500/5 dark:from-blue-500/30 dark:to-blue-500/10 flex items-center justify-center ring-1 ring-blue-500/20 dark:ring-blue-500/30">
                  <span className="material-symbols-outlined text-[22px] text-blue-500">history</span>
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-[15px] font-bold text-slate-900 dark:text-white leading-snug">
                    {historyProduct.code && <><span className="font-mono text-blue-600 dark:text-blue-400">{historyProduct.code}</span><span className="text-slate-300 dark:text-slate-600 mx-1.5">/</span></>}
                    {historyProduct.description}
                  </h3>
                  {historyProduct.shortName && (
                    <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-0.5">{historyProduct.shortName}</p>
                  )}
                  <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                    {historyProduct.productType && (
                      <span className="px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200/60 dark:border-indigo-800/40 text-[10px] font-bold text-indigo-600 dark:text-indigo-400">{historyProduct.productType}</span>
                    )}
                    {historyProduct.productSubtype && (
                      <span className="px-2 py-0.5 rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-200/60 dark:border-amber-800/40 text-[10px] font-bold text-amber-600 dark:text-amber-400">{historyProduct.productSubtype}</span>
                    )}
                    {historyProduct.productSubgroup && (
                      <span className="px-2 py-0.5 rounded-md bg-teal-50 dark:bg-teal-900/20 border border-teal-200/60 dark:border-teal-800/40 text-[10px] font-bold text-teal-600 dark:text-teal-400">{historyProduct.productSubgroup}</span>
                    )}
                    {historyProduct.outOfLine && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-[10px] font-bold text-red-600 dark:text-red-400">
                        <span className="material-symbols-outlined text-[11px]">block</span>Fora de Linha
                      </span>
                    )}
                  </div>
                </div>
                <button onClick={() => setHistoryProduct(null)} className="flex-shrink-0 p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                  <span className="material-symbols-outlined text-[20px]">close</span>
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="overflow-y-auto flex-1 p-4 sm:p-5 space-y-4">
              {(() => {
                const calcStats = (items: HistoryItem[]) => {
                  const totalValue = items.reduce((s, h) => s + h.totalValue, 0);
                  const totalQty = items.reduce((s, h) => s + h.quantity, 0);
                  const invoiceCount = new Set(items.map(h => h.invoiceId)).size;
                  const sorted = [...items].sort((a, b) => (b.issueDate || '').localeCompare(a.issueDate || ''));
                  const lastPrice = sorted.length > 0 ? sorted[0].unitPrice : 0;
                  const avgPrice = totalQty > 0 ? totalValue / totalQty : 0;
                  return { totalValue, totalQty, invoiceCount, lastPrice, avgPrice };
                };

                const groupBy = (items: HistoryItem[], key: 'supplierName' | 'customerName') => {
                  const map = new Map<string, HistoryItem[]>();
                  for (const h of items) {
                    const name = h[key] || 'Não identificado';
                    if (!map.has(name)) map.set(name, []);
                    map.get(name)!.push(h);
                  }
                  return Array.from(map.entries()).sort((a, b) => {
                    const latestA = a[1].reduce((max, h) => h.issueDate && h.issueDate > max ? h.issueDate : max, '');
                    const latestB = b[1].reduce((max, h) => h.issueDate && h.issueDate > max ? h.issueDate : max, '');
                    return latestB.localeCompare(latestA);
                  });
                };

                const toggleGroup = (key: string) => {
                  setExpandedGroups(prev => {
                    const next = new Set(prev);
                    if (next.has(key)) next.delete(key); else next.add(key);
                    return next;
                  });
                };

                const toggleRows = (key: string) => {
                  setExpandedRows(prev => {
                    const next = new Set(prev);
                    if (next.has(key)) next.delete(key); else next.add(key);
                    return next;
                  });
                };

                const toggleBatch = (key: string) => {
                  setExpandedBatch(prev => {
                    const next = new Set(prev);
                    if (next.has(key)) next.delete(key); else next.add(key);
                    return next;
                  });
                };

                const TruncatedCell = ({ text, id }: { text: string | null; id: string }) => {
                  if (!text || text === '-') return <span>-</span>;
                  if (text.length <= 20) return <span>{text}</span>;
                  const isExpanded = expandedBatch.has(id);
                  return (
                    <span
                      className="cursor-pointer hover:text-blue-500 transition-colors"
                      title={text}
                      onClick={() => toggleBatch(id)}
                    >
                      {isExpanded ? text : text.slice(0, 18) + '...'}
                    </span>
                  );
                };

                const colorMap = {
                  blue: {
                    iconBg: 'bg-blue-500/10 dark:bg-blue-500/20 ring-blue-500/20 dark:ring-blue-500/30',
                    statBg: 'bg-blue-50/80 dark:bg-blue-900/15',
                    statRing: 'ring-1 ring-blue-200/60 dark:ring-blue-800/30',
                    statIconBg: 'bg-blue-500/10 ring-blue-500/20',
                    icon: 'text-blue-500',
                    text: 'text-blue-700 dark:text-blue-300',
                    badge: 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 ring-1 ring-blue-200/50 dark:ring-blue-800/30',
                    btn: 'text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20',
                    groupBorder: 'border-blue-200/40 dark:border-blue-800/30',
                    groupHover: 'hover:bg-blue-50/50 dark:hover:bg-blue-900/10',
                  },
                  amber: {
                    iconBg: 'bg-amber-500/10 dark:bg-amber-500/20 ring-amber-500/20 dark:ring-amber-500/30',
                    statBg: 'bg-amber-50/80 dark:bg-amber-900/15',
                    statRing: 'ring-1 ring-amber-200/60 dark:ring-amber-800/30',
                    statIconBg: 'bg-amber-500/10 ring-amber-500/20',
                    icon: 'text-amber-500',
                    text: 'text-amber-700 dark:text-amber-300',
                    badge: 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 ring-1 ring-amber-200/50 dark:ring-amber-800/30',
                    btn: 'text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20',
                    groupBorder: 'border-amber-200/40 dark:border-amber-800/30',
                    groupHover: 'hover:bg-amber-50/50 dark:hover:bg-amber-900/10',
                  },
                  purple: {
                    iconBg: 'bg-purple-500/10 dark:bg-purple-500/20 ring-purple-500/20 dark:ring-purple-500/30',
                    statBg: 'bg-purple-50/80 dark:bg-purple-900/15',
                    statRing: 'ring-1 ring-purple-200/60 dark:ring-purple-800/30',
                    statIconBg: 'bg-purple-500/10 ring-purple-500/20',
                    icon: 'text-purple-500',
                    text: 'text-purple-700 dark:text-purple-300',
                    badge: 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 ring-1 ring-purple-200/50 dark:ring-purple-800/30',
                    btn: 'text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20',
                    groupBorder: 'border-purple-200/40 dark:border-purple-800/30',
                    groupHover: 'hover:bg-purple-50/50 dark:hover:bg-purple-900/10',
                  },
                };

                const SummaryCards = ({ stats, color }: { stats: ReturnType<typeof calcStats>; color: 'blue' | 'amber' | 'purple' }) => {
                  const cm = colorMap[color];
                  return (
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-4">
                    {[
                      { label: 'Total', value: formatValue(stats.totalValue), icon: 'payments' },
                      { label: 'Qtde Total', value: formatQuantity(stats.totalQty), icon: 'inventory_2' },
                      { label: 'Notas', value: String(stats.invoiceCount), icon: 'receipt_long' },
                      { label: 'Último Preço', value: formatValue(stats.lastPrice), icon: 'trending_up' },
                      { label: 'Preço Médio', value: formatValue(stats.avgPrice), icon: 'monitoring' },
                    ].map(c => (
                      <div key={c.label} className={`flex items-center gap-2 rounded-xl px-2.5 py-2 ${cm.statBg} ${cm.statRing}`}>
                        <div className={`w-6 h-6 rounded-md flex items-center justify-center ring-1 shrink-0 ${cm.statIconBg}`}>
                          <span className={`material-symbols-outlined text-[13px] ${cm.icon}`}>{c.icon}</span>
                        </div>
                        <div className="min-w-0">
                          <p className="text-[9px] uppercase tracking-wider text-slate-500 dark:text-slate-400 font-bold">{c.label}</p>
                          <p className={`text-[13px] font-extrabold ${cm.text} truncate`}>{c.value}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  );
                };

                const HistoryTable = ({ items, nameKey, groupKey, color }: { items: HistoryItem[]; nameKey: 'supplierName' | 'customerName'; groupKey: string; color: 'blue' | 'amber' | 'purple' }) => {
                  const cm = colorMap[color];
                  const groups = groupBy(items, nameKey);

                  return (
                    <div className="space-y-2.5">
                      {groups.map(([name, rows], gi) => {
                        const gk = `${groupKey}-${name}`;
                        const isOpen = expandedGroups.has(gk);
                        const isRowsExpanded = expandedRows.has(gk);
                        const visibleRows = isRowsExpanded ? rows : rows.slice(0, 3);
                        const remaining = rows.length - 3;
                        const grpTotal = rows.reduce((s, r) => s + r.totalValue, 0);

                        return (
                          <div key={gk} className={`rounded-xl overflow-hidden transition-colors ring-1 ${isOpen ? 'ring-slate-200 dark:ring-slate-700 bg-white dark:bg-card-dark shadow-sm' : `ring-slate-200/50 dark:ring-slate-700/40 ${cm.groupHover}`}`}>
                            <button
                              className={`w-full flex items-center justify-between px-4 py-2.5 text-left transition-colors ${isOpen ? '' : 'bg-white/60 dark:bg-slate-800/30'}`}
                              onClick={() => toggleGroup(gk)}
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <span className={`material-symbols-outlined text-[16px] transition-transform duration-200 ${isOpen ? 'rotate-90' : ''} ${cm.icon}`}>chevron_right</span>
                                <span className="text-[13px] font-semibold text-slate-800 dark:text-white truncate">{name}</span>
                                <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold ${cm.badge}`}>{rows.length}</span>
                              </div>
                              <span className={`text-[12px] font-bold tabular-nums ${cm.text}`}>{formatValue(grpTotal)}</span>
                            </button>
                            {isOpen && (
                              <div className="overflow-x-auto border-t border-slate-100 dark:border-slate-800/60">
                                <table className="w-full text-[11px]">
                                  <thead>
                                    <tr className="bg-slate-50 dark:bg-slate-900/70">
                                      <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Data</th>
                                      <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">NF-e</th>
                                      <th className="px-3 py-2 text-right text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Qtde</th>
                                      <th className="px-3 py-2 text-right text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Vlr Unit.</th>
                                      <th className="px-3 py-2 text-right text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Total</th>
                                      <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Lote</th>
                                      <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Validade</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
                                    {visibleRows.map((h, i) => (
                                      <tr key={i} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/20 transition-colors">
                                        <td className="px-3 py-2 text-slate-700 dark:text-slate-300 whitespace-nowrap">{formatDate(h.issueDate)}</td>
                                        <td className="px-3 py-2">
                                          <button
                                            onClick={() => { setHistoryProduct(null); setInvoiceModalId(h.invoiceId); }}
                                            className="text-primary hover:text-primary-dark hover:underline font-mono font-medium transition-colors"
                                          >
                                            {h.invoiceNumber || '-'}
                                          </button>
                                        </td>
                                        <td className="px-3 py-2 text-right font-semibold text-slate-800 dark:text-white tabular-nums">{formatQuantity(h.quantity)}</td>
                                        <td className="px-3 py-2 text-right text-slate-600 dark:text-slate-400 tabular-nums">{formatValue(h.unitPrice)}</td>
                                        <td className="px-3 py-2 text-right font-semibold text-slate-800 dark:text-white tabular-nums">{formatValue(h.totalValue)}</td>
                                        <td className="px-3 py-2 text-slate-600 dark:text-slate-400 font-mono">
                                          <TruncatedCell text={h.batch || '-'} id={`${gk}-batch-${i}`} />
                                        </td>
                                        <td className="px-3 py-2 text-slate-600 dark:text-slate-400 whitespace-nowrap">
                                          <TruncatedCell text={h.expiry ? formatDate(h.expiry) : '-'} id={`${gk}-expiry-${i}`} />
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                                {remaining > 0 && (
                                  <button
                                    onClick={() => toggleRows(gk)}
                                    className={`w-full py-2.5 text-[11px] font-semibold transition-colors border-t border-slate-100 dark:border-slate-800/50 ${cm.btn}`}
                                  >
                                    {isRowsExpanded ? (
                                      <><span className="material-symbols-outlined text-[13px] align-middle mr-1">expand_less</span>Mostrar menos</>
                                    ) : (
                                      <><span className="material-symbols-outlined text-[13px] align-middle mr-1">expand_more</span>Ver mais {remaining} registro{remaining > 1 ? 's' : ''}</>
                                    )}
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                };

                // Section toggle: compras/vendas open by default (track close), consig closed by default (track open)
                const isSectionOpen = (key: string, defaultOpen: boolean) =>
                  defaultOpen ? !expandedGroups.has(`__${key}_closed__`) : expandedGroups.has(`__${key}_open__`);
                const toggleSection = (key: string, defaultOpen: boolean) => {
                  setExpandedGroups(prev => {
                    const n = new Set(prev);
                    if (defaultOpen) {
                      const k = `__${key}_closed__`;
                      if (n.has(k)) n.delete(k); else n.add(k);
                    } else {
                      const k = `__${key}_open__`;
                      if (n.has(k)) n.delete(k); else n.add(k);
                    }
                    return n;
                  });
                };

                const HistSectionCard = ({ sectionKey, defaultOpen, icon, iconColor, label, count, totalValue, loading, empty, emptyMsg, color, children }: {
                  sectionKey: string; defaultOpen: boolean; icon: string; iconColor: string; label: string; count: number; totalValue: number; loading: boolean; empty: boolean; emptyMsg: string; color: 'blue' | 'amber' | 'purple'; children: React.ReactNode;
                }) => {
                  const isOpen = isSectionOpen(sectionKey, defaultOpen);
                  const cm = colorMap[color];
                  return (
                    <div className="bg-white dark:bg-card-dark rounded-2xl ring-1 ring-slate-200/60 dark:ring-slate-800/50 overflow-hidden">
                      <button
                        onClick={() => toggleSection(sectionKey, defaultOpen)}
                        className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50/80 dark:hover:bg-slate-800/30 transition-colors"
                      >
                        <div className="flex items-center gap-2.5">
                          <div className={`w-7 h-7 rounded-lg flex items-center justify-center ring-1 shrink-0 ${cm.iconBg}`}>
                            <span className={`material-symbols-outlined text-[15px] ${iconColor}`}>{icon}</span>
                          </div>
                          <h4 className="text-[13px] font-bold text-slate-900 dark:text-white">{label}</h4>
                          {count > 0 && (
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${cm.badge}`}>{count}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-3">
                          {!loading && count > 0 && (
                            <span className={`text-[13px] font-bold tabular-nums ${cm.text}`}>{formatValue(totalValue)}</span>
                          )}
                          <span className="material-symbols-outlined text-[16px] text-slate-400 transition-transform duration-200" style={{ transform: isOpen ? 'rotate(0deg)' : 'rotate(-90deg)' }}>expand_more</span>
                        </div>
                      </button>
                      {isOpen && (
                        <div className="px-4 py-4 border-t border-slate-100 dark:border-slate-800/60">
                          {loading ? (
                            <div className="flex flex-col items-center justify-center gap-2 py-8">
                              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ring-1 ${cm.iconBg}`}>
                                <span className={`material-symbols-outlined text-[20px] ${cm.icon} animate-spin`}>progress_activity</span>
                              </div>
                              <p className="text-[13px] font-medium text-slate-400">Carregando histórico...</p>
                            </div>
                          ) : empty ? (
                            <div className="flex flex-col items-center py-8">
                              <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center ring-1 ring-slate-200/50 dark:ring-slate-700/50 mb-2">
                                <span className="material-symbols-outlined text-[24px] text-slate-300 dark:text-slate-600">inbox</span>
                              </div>
                              <p className="text-[13px] text-slate-400 dark:text-slate-500">{emptyMsg}</p>
                            </div>
                          ) : (
                            <>{children}</>
                          )}
                        </div>
                      )}
                    </div>
                  );
                };

                return (
                  <>
                    <HistSectionCard sectionKey="compras" defaultOpen={true} icon="shopping_cart" iconColor="text-blue-500" label="Histórico de Compras" count={purchaseHistory.length} totalValue={purchaseHistory.reduce((s, h) => s + h.totalValue, 0)} loading={loadingHistory} empty={purchaseHistory.length === 0} emptyMsg="Nenhum registro de compra encontrado." color="blue">
                      <SummaryCards stats={calcStats(purchaseHistory)} color="blue" />
                      <HistoryTable items={purchaseHistory} nameKey="supplierName" groupKey="purchase" color="blue" />
                    </HistSectionCard>

                    <HistSectionCard sectionKey="vendas" defaultOpen={true} icon="storefront" iconColor="text-amber-500" label="Histórico de Vendas" count={salesHistory.length} totalValue={salesHistory.reduce((s, h) => s + h.totalValue, 0)} loading={loadingSalesHistory} empty={salesHistory.length === 0} emptyMsg="Nenhum registro de venda encontrado." color="amber">
                      <SummaryCards stats={calcStats(salesHistory)} color="amber" />
                      <HistoryTable items={salesHistory} nameKey="customerName" groupKey="sales" color="amber" />
                    </HistSectionCard>

                    <HistSectionCard sectionKey="consig" defaultOpen={false} icon="swap_horiz" iconColor="text-purple-500" label="Movimentações (Consignação)" count={consignmentHistory.length} totalValue={consignmentHistory.reduce((s, h) => s + h.totalValue, 0)} loading={loadingConsignment} empty={consignmentHistory.length === 0} emptyMsg="Nenhuma movimentação de consignação encontrada." color="purple">
                      <SummaryCards stats={calcStats(consignmentHistory)} color="purple" />
                      <HistoryTable items={consignmentHistory} nameKey="customerName" groupKey="consignment" color="purple" />
                    </HistSectionCard>
                  </>
                );
              })()}
            </div>

            {/* Footer */}
            <div className="px-4 sm:px-6 py-3.5 border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-card-dark shrink-0 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] sm:shadow-none">
              {/* Mobile footer */}
              <div className="sm:hidden">
                <button onClick={() => setHistoryProduct(null)} className="w-full px-4 py-2.5 text-sm font-semibold text-primary hover:bg-primary/5 rounded-xl transition-colors">
                  <span className="material-symbols-outlined text-[16px] align-middle mr-1">arrow_back</span>Voltar
                </button>
              </div>
              {/* Desktop footer */}
              <div className="hidden sm:flex justify-end">
                <button onClick={() => setHistoryProduct(null)} className="px-4 py-2.5 text-sm font-medium text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">Fechar</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Invoice detail modal */}
      <InvoiceDetailsModal
        isOpen={!!invoiceModalId}
        onClose={() => setInvoiceModalId(null)}
        invoiceId={invoiceModalId}
      />

      {/* Settings Modal (Ajustes) */}
      {settingsOpen && (
        <SettingsModal
          onClose={() => setSettingsOpen(false)}
          onUpdated={async () => {
            await Promise.all([loadProducts(), loadSettingsHierarchy()]);
          }}
        />
      )}
    </>
  );
}
