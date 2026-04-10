'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import Skeleton from '@/components/ui/Skeleton';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { formatCurrency, formatAmount } from '@/lib/utils';
import { useRole } from '@/hooks/useRole';
import { useModalBackButton } from '@/hooks/useModalBackButton';
import InvoiceDetailsModal from '@/components/InvoiceDetailsModal';
import SettingsModal from './SettingsModal';
import type { ProductRow, ProductsSummary, ProductsResponse, SortField } from './types';
import { normalizeSearch, formatQuantity, formatDate, getAnvisaExpirationBadge, formatOptional, highlightMatch } from './components/product-utils';
import type { HierOptions } from './components/product-utils';
import ProductFilters from './components/ProductFilters';
import ProductDetailModal from './components/ProductDetailModal';
import BulkEditModal from './components/BulkEditModal';
import ExportCSVButton from './components/ExportCSVButton';
import ProductTable from './components/ProductTable';
import HistoryModal from './components/HistoryModal';

export default function ProdutosPage() {
  const { canWrite } = useRole();

  // --- server-paginated data ---
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [summary, setSummary] = useState<ProductsSummary>({ totalProducts: 0, productsWithAnvisa: 0, totalQuantity: 0, invoicesProcessed: 0 });
  const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0, pages: 1 });
  const [meta, setMeta] = useState<ProductsResponse['meta'] | null>(null);
  const [loading, setLoading] = useState(true);
  const [settingsHierarchy, setSettingsHierarchy] = useState<{ lines: { name: string; groups: { name: string; subgroups: string[] }[] }[] }>({ lines: [] });
  const [nomeTributacaoOptions, setNomeTributacaoOptions] = useState<string[]>([]);
  const [obsIcmsOptions, setObsIcmsOptions] = useState<string[]>([]);
  const [obsPisCofinsOptions, setObsPisCofinsOptions] = useState<string[]>([]);
  const [manufacturerOptions, setManufacturerOptions] = useState<string[]>([]);
  const [ncmOptions, setNcmOptions] = useState<string[]>([]);
  const [cestOptions, setCestOptions] = useState<string[]>([]);
  const [aliqIcmsOptions, setAliqIcmsOptions] = useState<string[]>([]);
  const [aliqPisOptions, setAliqPisOptions] = useState<string[]>([]);
  const [aliqCofinsOptions, setAliqCofinsOptions] = useState<string[]>([]);
  const [aliqIpiOptions, setAliqIpiOptions] = useState<string[]>([]);
  const [aliqFcpOptions, setAliqFcpOptions] = useState<string[]>([]);

  // --- filter/sort state ---
  const [search, setSearch] = useState('');
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [subtypeFilter, setSubtypeFilter] = useState<string>('');
  const [subgroupFilter, setSubgroupFilter] = useState<string>('');
  const [sortBy, setSortBy] = useState<SortField>('productType');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [lineStatusFilter, setLineStatusFilter] = useState<'active' | 'outOfLine' | 'all'>('active');

  // Debounced search
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => setDebouncedSearch(search), 300);
    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current); };
  }, [search]);

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
  const [selectionEnabled, setSelectionEnabled] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const toggleSelect = (key: string) => {
    setSelectedKeys((prev) => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  };
  const toggleSelectGroup = (matchFn: (p: ProductRow) => boolean) => {
    const groupKeys = filtered.filter(matchFn).map((p) => p.key);
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

  // --- product detail modal ---
  const [detailProduct, setDetailProduct] = useState<ProductRow | null>(null);
  const [detailInitialSections, setDetailInitialSections] = useState<string[] | undefined>(undefined);
  const openDetail = (product: ProductRow, initialSections?: string[]) => {
    setDetailProduct(product);
    setDetailInitialSections(initialSections);
  };

  // --- history modal ---
  const [historyProduct, setHistoryProduct] = useState<ProductRow | null>(null);

  // ---- mobile back button for inline modals ----
  const closeAutoClassify = useCallback(() => setAutoClassifyPreview(null), []);
  useModalBackButton(!!autoClassifyPreview, closeAutoClassify);

  // ---- load settings hierarchy ----
  const loadSettingsHierarchy = async () => {
    try {
      const res = await fetch('/api/products/settings');
      if (!res.ok) return;
      const data = await res.json();
      interface SettingsSubgroup { name: string }
      interface SettingsGroup { name: string; subgroups?: SettingsSubgroup[] }
      interface SettingsLine { name: string; groups?: SettingsGroup[] }
      interface FiscalOption { value: string }
      interface ManufacturerOption { name: string; shortName?: string }
      setSettingsHierarchy({
        lines: (data.lines || []).map((l: SettingsLine) => ({
          name: l.name,
          groups: (l.groups || []).map((g: SettingsGroup) => ({
            name: g.name,
            subgroups: (g.subgroups || []).map((s: SettingsSubgroup) => s.name),
          })),
        })),
      });
      setNomeTributacaoOptions((data.fiscal?.fiscalNomeTributacao || []).map((i: FiscalOption) => i.value).filter(Boolean).sort());
      setObsIcmsOptions((data.fiscal?.obsIcms || []).map((i: FiscalOption) => i.value).filter(Boolean).sort());
      setObsPisCofinsOptions((data.fiscal?.obsPisCofins || []).map((i: FiscalOption) => i.value).filter(Boolean).sort());
      setManufacturerOptions((data.manufacturers || []).map((m: ManufacturerOption) => (m.shortName || m.name) as string).filter(Boolean).sort());
      setNcmOptions((data.fiscal?.ncm || []).map((i: FiscalOption) => i.value).filter(Boolean).sort());
      setCestOptions((data.fiscal?.cest || []).map((i: FiscalOption) => i.value).filter(Boolean).sort());
      const numSort = (a: string, b: string) => parseFloat(a) - parseFloat(b);
      setAliqIcmsOptions((data.fiscal?.aliqIcms || []).map((i: FiscalOption) => i.value).filter(Boolean).sort(numSort));
      setAliqPisOptions((data.fiscal?.aliqPis || []).map((i: FiscalOption) => i.value).filter(Boolean).sort(numSort));
      setAliqCofinsOptions((data.fiscal?.aliqCofins || []).map((i: FiscalOption) => i.value).filter(Boolean).sort(numSort));
      setAliqIpiOptions((data.fiscal?.aliqIpi || []).map((i: FiscalOption) => i.value).filter(Boolean).sort(numSort));
      setAliqFcpOptions((data.fiscal?.aliqFcp || []).map((i: FiscalOption) => i.value).filter(Boolean).sort(numSort));
    } catch { /* silent */ }
  };

  // ---- server-side sort field mapping ----
  const serverSortField = useMemo(() => {
    const map: Record<string, string> = { description: 'description', code: 'code', ncm: 'ncm', anvisa: 'anvisa', lastPrice: 'lastPrice', lastIssueDate: 'lastIssueDate', lastSaleDate: 'lastSaleDate', supplier: 'supplier', productType: 'productType', totalQuantity: 'quantity', invoiceCount: 'invoices' };
    return map[sortBy] || 'lastIssueDate';
  }, [sortBy]);

  // ---- load products ----
  const fetchAbortRef = useRef<AbortController | null>(null);
  const rebuiltOnceRef = useRef(false);
  const [isRebuilding, setIsRebuilding] = useState(false);

  const loadProducts = useCallback(async () => {
    if (fetchAbortRef.current) fetchAbortRef.current.abort();
    const controller = new AbortController();
    fetchAbortRef.current = controller;
    setLoading(true);
    try {
      const params = new URLSearchParams({ sort: serverSortField, order: sortOrder, lineStatus: lineStatusFilter });
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (typeFilter) params.set('productType', typeFilter);
      if (subtypeFilter) params.set('productSubtype', subtypeFilter);
      if (subgroupFilter) params.set('productSubgroup', subgroupFilter);
      if (onlyMissing) params.set('onlyMissingAnvisa', '1');
      const res = await fetch(`/api/products/list?${params}`, { signal: controller.signal });
      if (!res.ok) throw new Error('Falha ao carregar produtos');
      const data = (await res.json()) as ProductsResponse & { needsRebuild?: boolean };
      setProducts(data.products || []);
      setSummary(data.summary || { totalProducts: 0, productsWithAnvisa: 0, totalQuantity: 0, invoicesProcessed: 0 });
      setPagination(data.pagination || { page: 1, limit: data.products?.length || 0, total: data.products?.length || 0, pages: 1 });
      setMeta(data.meta || null);
      if (data.needsRebuild && !rebuiltOnceRef.current) {
        rebuiltOnceRef.current = true;
        setIsRebuilding(true);
        fetch('/api/products/rebuild-aggregates', { method: 'POST' })
          .then((r) => { if (r.ok) return r.json(); throw new Error(); })
          .then(() => {
            setIsRebuilding(false);
            fetch(`/api/products/list?${params}`).then((r) => r.json()).then((d: ProductsResponse) => {
              setProducts(d.products || []);
              setSummary(d.summary || { totalProducts: 0, productsWithAnvisa: 0, totalQuantity: 0, invoicesProcessed: 0 });
              setPagination({ page: 1, limit: d.products?.length || 0, total: d.products?.length || 0, pages: 1 });
              setMeta(d.meta || null);
            }).catch(() => {});
          })
          .catch(() => setIsRebuilding(false));
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return;
      toast.error('Erro ao carregar produtos');
    } finally {
      setLoading(false);
    }
  }, [serverSortField, sortOrder, lineStatusFilter, debouncedSearch, typeFilter, subtypeFilter, subgroupFilter, onlyMissing]);

  useEffect(() => { loadProducts(); loadSettingsHierarchy(); }, [loadProducts]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- merged hierarchy options ----
  const hierOptions: HierOptions = useMemo(() => {
    const sort = (a: string, b: string) => a.localeCompare(b, 'pt-BR');
    const lineSet = new Set<string>();
    const allGroupSet = new Set<string>();
    const allSubgroupSet = new Set<string>();
    const groupMap = new Map<string, Set<string>>();
    const subgroupMap = new Map<string, Set<string>>();
    const subgroupByGroup = new Map<string, Set<string>>();
    const addEntry = (line?: string | null, group?: string | null, subgroup?: string | null) => {
      if (line) { lineSet.add(line); if (!groupMap.has(line)) groupMap.set(line, new Set()); }
      if (group) { allGroupSet.add(group); if (line) groupMap.get(line)!.add(group); if (!subgroupByGroup.has(group)) subgroupByGroup.set(group, new Set()); }
      if (subgroup) { allSubgroupSet.add(subgroup); if (group) subgroupByGroup.get(group)!.add(subgroup); if (line && group) { const sgKey = `${line}:::${group}`; if (!subgroupMap.has(sgKey)) subgroupMap.set(sgKey, new Set()); subgroupMap.get(sgKey)!.add(subgroup); } }
    };
    for (const line of settingsHierarchy.lines) { for (const group of line.groups) { for (const sg of group.subgroups) addEntry(line.name, group.name, sg); if (group.subgroups.length === 0) addEntry(line.name, group.name); } if (line.groups.length === 0) addEntry(line.name); }
    for (const p of products) addEntry(p.productType, p.productSubtype, p.productSubgroup);
    const sortedLines = Array.from(lineSet).sort(sort);
    const groupsByLine = sortedLines.map((l) => ({ line: l, groups: Array.from(groupMap.get(l) || []).sort(sort) })).filter((e) => e.groups.length > 0);
    const groupsWithLine = new Set(groupsByLine.flatMap((e) => e.groups));
    const orphanGroups = Array.from(allGroupSet).filter((g) => !groupsWithLine.has(g)).sort(sort);
    const subgroupsByGroup = Array.from(subgroupByGroup.entries()).map(([g, sgs]) => ({ group: g, subgroups: Array.from(sgs).sort(sort) })).filter((e) => e.subgroups.length > 0).sort((a, b) => sort(a.group, b.group));
    const subgroupsWithGroup = new Set(subgroupsByGroup.flatMap((e) => e.subgroups));
    const orphanSubgroups = Array.from(allSubgroupSet).filter((s) => !subgroupsWithGroup.has(s)).sort(sort);
    return {
      lines: sortedLines, allGroups: Array.from(allGroupSet).sort(sort), allSubgroups: Array.from(allSubgroupSet).sort(sort), groupsByLine, orphanGroups, subgroupsByGroup, orphanSubgroups,
      groupsFor: (line: string) => Array.from(groupMap.get(line) || []).sort(sort),
      subgroupsFor: (line: string, group: string) => Array.from(subgroupMap.get(`${line}:::${group}`) || []).sort(sort),
      subgroupsForGroup: (group: string) => Array.from(subgroupByGroup.get(group) || []).sort(sort),
    };
  }, [products, settingsHierarchy]);

  // Collapse behavior on sort/search change
  const filteredLen = filtered.length;
  const isSearching = search !== '';
  useEffect(() => {
    if (isSearching) { setCollapsedGroups(new Set()); return; }
    if (filteredLen > 0) {
      const groups = new Set<string>();
      for (const p of filtered) {
        switch (sortBy) {
          case 'supplier': groups.add(p.lastSupplierName || 'Sem fabricante'); break;
          case 'productType': { groups.add(`line:${p.productType || 'Sem linha'}`); groups.add(`group:${p.productType || 'Sem linha'}|${p.productSubtype || 'Sem grupo'}`); break; }
          case 'ncm': groups.add(p.ncm ? p.ncm.slice(0, 4) + '.xx.xx' : 'Sem NCM'); break;
          case 'anvisa': groups.add(p.anvisa ? 'Com ANVISA' : 'Sem ANVISA'); break;
          default: break;
        }
      }
      setCollapsedGroups(groups);
    }
  }, [sortBy, filteredLen, isSearching]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- handlers ----
  const handleSort = (field: SortField) => {
    if (sortBy === field) { setSortOrder((o) => (o === 'asc' ? 'desc' : 'asc')); } else { setSortBy(field); setSortOrder(['description', 'code', 'ncm', 'anvisa', 'supplier', 'productType'].includes(field) ? 'asc' : 'desc'); }
  };

  const handleAutoClassify = async (dryRun: boolean) => {
    setIsAutoClassifying(true);
    const toastId = dryRun ? undefined : toast.loading('Analisando e classificando produtos...');
    try {
      const res = await fetch('/api/products/auto-classify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dryRun }) });
      if (!res.ok) throw new Error();
      const data = await res.json();
      if (dryRun) { setAutoClassifyPreview(data); } else {
        toast.success(`Classificacao concluida! ${data.updatesApplied} produto(s) atualizados`, { id: toastId, duration: 10000 });
        setAutoClassifyPreview(null);
        await loadProducts();
      }
    } catch { if (toastId) toast.error('Erro ao classificar produtos', { id: toastId }); else toast.error('Erro ao analisar produtos'); }
    finally { setIsAutoClassifying(false); }
  };

  const settingsOptions = useMemo(() => ({ nomeTributacaoOptions, obsIcmsOptions, obsPisCofinsOptions, manufacturerOptions, ncmOptions, cestOptions, aliqIcmsOptions, aliqPisOptions, aliqCofinsOptions, aliqIpiOptions, aliqFcpOptions }), [nomeTributacaoOptions, obsIcmsOptions, obsPisCofinsOptions, manufacturerOptions, ncmOptions, cestOptions, aliqIcmsOptions, aliqPisOptions, aliqCofinsOptions, aliqIpiOptions, aliqFcpOptions]);

  return (
    <>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="hidden sm:flex items-center gap-3 min-w-0">
          <span className="material-symbols-outlined text-[28px] text-primary flex-shrink-0">inventory_2</span>
          <div className="min-w-0">
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Produtos</h2>
            <p className="text-slate-500 dark:text-slate-400 text-xs font-medium">Cadastro automatico por produtos das NF-e de entrada, sem duplicar itens repetidos</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <ExportCSVButton filteredCount={filtered.length} />
        </div>
      </div>

      {/* Search + filters */}
      <ProductFilters
        search={search} setSearch={setSearch}
        typeFilter={typeFilter} setTypeFilter={setTypeFilter}
        subtypeFilter={subtypeFilter} setSubtypeFilter={setSubtypeFilter}
        subgroupFilter={subgroupFilter} setSubgroupFilter={setSubgroupFilter}
        sortBy={sortBy} setSortBy={setSortBy}
        sortOrder={sortOrder} setSortOrder={setSortOrder}
        lineStatusFilter={lineStatusFilter} setLineStatusFilter={setLineStatusFilter}
        setCollapsedGroups={setCollapsedGroups}
        hierOptions={hierOptions}
        filteredCount={filtered.length}
      />

      {meta?.invoicesLimited && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-700 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
          A listagem esta limitada as {meta.maxInvoices?.toLocaleString('pt-BR') || 3000} NF-e de entrada mais recentes para manter desempenho.
        </div>
      )}

      {/* Product Table */}
      <ProductTable
        products={filtered}
        loading={loading}
        isRebuilding={isRebuilding}
        summary={summary}
        sortBy={sortBy}
        sortOrder={sortOrder}
        search={search}
        collapsedGroups={collapsedGroups}
        toggleGroup={toggleGroup}
        selectionEnabled={selectionEnabled}
        setSelectionEnabled={setSelectionEnabled}
        selectedKeys={selectedKeys}
        setSelectedKeys={setSelectedKeys}
        toggleSelect={toggleSelect}
        toggleSelectGroup={toggleSelectGroup}
        setCollapsedGroups={setCollapsedGroups}
        handleSort={handleSort}
        openDetail={openDetail}
        openHistory={(p: ProductRow) => setHistoryProduct(p)}
        canWrite={canWrite}
        setSettingsOpen={setSettingsOpen}
      />

      {/* Bulk action toolbar */}
      {selectedKeys.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 px-5 py-3 bg-slate-900 dark:bg-slate-800 text-white rounded-2xl shadow-2xl border border-slate-700">
          <span className="material-symbols-outlined text-[20px] text-primary">checklist</span>
          <span className="text-sm font-semibold">{selectedKeys.size.toLocaleString('pt-BR')} produto{selectedKeys.size !== 1 ? 's' : ''} selecionado{selectedKeys.size !== 1 ? 's' : ''}</span>
          <div className="w-px h-5 bg-slate-600" />
          {canWrite && (
            <button onClick={() => setBulkEditOpen(true)} className="flex items-center gap-1.5 px-3 py-1.5 bg-primary hover:bg-primary-dark text-white rounded-lg text-sm font-bold transition-colors">
              <span className="material-symbols-outlined text-[16px]">edit</span>
              Editar em massa
            </button>
          )}
          <button onClick={() => setSelectedKeys(new Set())} className="flex items-center gap-1 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm font-medium transition-colors">
            <span className="material-symbols-outlined text-[16px]">close</span>
            Limpar
          </button>
        </div>
      )}

      {/* Auto-classify preview modal */}
      {autoClassifyPreview && (
        <div className="fixed inset-0 z-50 !mt-0 sm:flex sm:items-center sm:justify-center sm:p-4 sm:bg-black/60 sm:backdrop-blur-sm" onClick={() => setAutoClassifyPreview(null)}>
          <div className="absolute inset-0 sm:relative sm:inset-auto bg-white dark:bg-card-dark sm:rounded-2xl sm:shadow-2xl w-full sm:max-w-3xl sm:max-h-[85vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-slate-200 dark:border-slate-700">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <span className="material-symbols-outlined text-[20px] text-amber-500">auto_fix_high</span>
                  Auto-classificacao — Preview
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">{autoClassifyPreview.updatesFound} alteracao(oes) encontrada(s) de {autoClassifyPreview.totalProducts} produtos</p>
              </div>
              <button onClick={() => setAutoClassifyPreview(null)} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"><span className="material-symbols-outlined text-[20px]">close</span></button>
            </div>
            <div className="overflow-y-auto flex-1">
              {autoClassifyPreview.updatesFound === 0 ? (
                <div className="px-6 py-12 text-center text-slate-400">
                  <span className="material-symbols-outlined text-[48px] opacity-30">check_circle</span>
                  <p className="mt-2 text-sm font-medium">Nenhum preenchimento automatico encontrado</p>
                </div>
              ) : (
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-800/50 sticky top-0">
                    <tr className="text-[10px] uppercase tracking-wider font-bold text-slate-500">
                      <th className="px-4 py-2">Produto</th>
                      <th className="px-4 py-2">Alteracoes</th>
                      <th className="px-4 py-2">Motivo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {(autoClassifyPreview.preview || []).map((item: { description: string; code?: string; fields: Record<string, string | undefined>; reason: string }, i: number) => (
                      <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                        <td className="px-4 py-2 max-w-[200px]"><p className="text-xs font-semibold text-slate-800 dark:text-white truncate">{item.description}</p>{item.code && <p className="text-[10px] font-mono text-slate-400">{item.code}</p>}</td>
                        <td className="px-4 py-2">
                          <div className="flex flex-wrap gap-1">
                            {item.fields.anvisa_code && <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-teal-50 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400 border border-teal-200 dark:border-teal-800">ANVISA: {item.fields.anvisa_code}</span>}
                            {item.fields.product_type && <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800">Linha: {item.fields.product_type}</span>}
                            {item.fields.product_subtype && <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-violet-50 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400 border border-violet-200 dark:border-violet-800">Grupo: {item.fields.product_subtype}</span>}
                          </div>
                        </td>
                        <td className="px-4 py-2"><p className="text-[11px] text-slate-500 dark:text-slate-400 max-w-[280px]">{item.reason}</p></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className="px-4 sm:px-6 py-3.5 border-t border-slate-200 dark:border-slate-700 bg-slate-50/40 dark:bg-slate-800/30 shrink-0">
              {autoClassifyPreview.updatesFound > 0 ? (
                <div className="flex items-center justify-between">
                  <button onClick={() => setAutoClassifyPreview(null)} className="px-4 py-2 text-sm font-medium text-slate-500 hover:text-slate-700 transition-colors">Cancelar</button>
                  <button onClick={() => handleAutoClassify(false)} disabled={isAutoClassifying} className="flex items-center gap-2 px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-sm font-bold transition-all shadow-sm disabled:opacity-60">
                    {isAutoClassifying ? <><span className="material-symbols-outlined text-[16px] animate-spin">sync</span>Aplicando...</> : <><span className="material-symbols-outlined text-[16px]">auto_fix_high</span>Aplicar {autoClassifyPreview.updatesFound} alteracao(oes)</>}
                  </button>
                </div>
              ) : (
                <button onClick={() => setAutoClassifyPreview(null)} className="px-4 py-2 text-sm font-medium text-slate-500 hover:text-slate-700 transition-colors">Fechar</button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Bulk edit modal */}
      {bulkEditOpen && (
        <BulkEditModal
          selectedKeys={selectedKeys}
          products={products}
          onClose={() => setBulkEditOpen(false)}
          onSaved={async () => { setBulkEditOpen(false); setSelectedKeys(new Set()); await loadProducts(); }}
          hierOptions={hierOptions}
        />
      )}

      {/* Product detail modal */}
      {detailProduct && (
        <ProductDetailModal
          product={detailProduct}
          onClose={() => setDetailProduct(null)}
          onUpdated={async () => { await Promise.all([loadProducts(), loadSettingsHierarchy()]); }}
          onOpenHistory={(p: ProductRow) => setHistoryProduct(p)}
          hierOptions={hierOptions}
          settingsOptions={settingsOptions}
          initialSections={detailInitialSections}
        />
      )}

      {/* History modal */}
      {historyProduct && (
        <HistoryModal
          product={historyProduct}
          onClose={() => setHistoryProduct(null)}
          onOpenInvoice={(id: string) => setInvoiceModalId(id)}
        />
      )}

      {/* Invoice detail modal */}
      <InvoiceDetailsModal isOpen={!!invoiceModalId} onClose={() => setInvoiceModalId(null)} invoiceId={invoiceModalId} />

      {/* Settings Modal */}
      {settingsOpen && (
        <SettingsModal onClose={() => setSettingsOpen(false)} onUpdated={async () => { await Promise.all([loadProducts(), loadSettingsHierarchy()]); }} />
      )}
    </>
  );
}
