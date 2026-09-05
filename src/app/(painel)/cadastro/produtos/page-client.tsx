'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import EmptyState from '@/components/ui/EmptyState';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Spinner from '@/components/ui/Spinner';
import { formatInt } from '@/lib/utils';
import { toast } from 'sonner';
import { useRole } from '@/hooks/useRole';
import { useModalBackButton } from '@/hooks/useModalBackButton';
import InvoiceDetailsModal from '@/components/InvoiceDetailsModal';
import SettingsModal from './SettingsModal';
import type { ProductRow, ProductsHierarchyCounts, ProductsSummary, ProductsResponse, SortField } from './types';
import type { HierOptions } from './components/product-utils';
import ProductFilters from './components/ProductFilters';
import ProductDetailModal from './components/ProductDetailModal';
import BulkEditModal from './components/BulkEditModal';
import ExportCSVButton from './components/ExportCSVButton';
import ImportSpicaModal from './components/ImportSpicaModal';
import ProductTable from './components/ProductTable';
import { allCollapseKeys } from './components/product-group-visibility';
import HistoryModal from './components/HistoryModal';
import { ANVISA_PRODUTOS_SAUDE_URL } from '@/lib/anvisa-consulta';
import PageHeader from '@/components/PageHeader';

export default function ProdutosPage() {
  const { canWrite } = useRole();

  // --- server-paginated data ---
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [summary, setSummary] = useState<ProductsSummary>({ totalProducts: 0, productsWithAnvisa: 0, totalQuantity: 0 });
  const [hierarchyCounts, setHierarchyCounts] = useState<ProductsHierarchyCounts | null>(null);
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
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [subtypeFilter, setSubtypeFilter] = useState<string>('');
  const [subgroupFilter, setSubgroupFilter] = useState<string>('');
  const [sortBy, setSortBy] = useState<SortField>('productType');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [lineStatusFilter, setLineStatusFilter] = useState<'active' | 'outOfLine' | 'all'>('all');

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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [spicaImportOpen, setSpicaImportOpen] = useState(false);
  const [isAutoClassifying, setIsAutoClassifying] = useState(false);
  const [invoiceModalId, setInvoiceModalId] = useState<string | null>(null);
  const [autoClassifyPreview, setAutoClassifyPreview] = useState<any>(null);

  // --- group collapsing ---
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  // Toggle puro: expandir linha NÃO deve recolher os grupos filhos (bug que
  // deixava a página em branco após um clique em "Clique para expandir").
  const toggleGroup = (g: string) => setCollapsedGroups((prev) => {
    const n = new Set(prev);
    if (n.has(g)) n.delete(g);
    else n.add(g);
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
    const map: Record<string, string> = { description: 'description', code: 'code', codigo: 'codigo', ncm: 'ncm', anvisa: 'anvisa', lastPrice: 'lastPrice', lastIssueDate: 'lastIssueDate', lastSaleDate: 'lastSaleDate', supplier: 'supplier', productType: 'productType', totalQuantity: 'quantity', invoiceCount: 'invoices' };
    return map[sortBy] || 'lastIssueDate';
  }, [sortBy]);
  const exportQuery = useMemo(() => ({
    search: debouncedSearch,
    sort: serverSortField,
    order: sortOrder,
    lineStatus: lineStatusFilter,
    productType: typeFilter,
    productSubtype: subtypeFilter,
    productSubgroup: subgroupFilter,
  }), [debouncedSearch, serverSortField, sortOrder, lineStatusFilter, typeFilter, subtypeFilter, subgroupFilter]);

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
      const params = new URLSearchParams({
        sort: serverSortField,
        order: sortOrder,
        lineStatus: lineStatusFilter,
        page: String(pagination.page),
        limit: String(pagination.limit),
      });
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (typeFilter) params.set('productType', typeFilter);
      if (subtypeFilter) params.set('productSubtype', subtypeFilter);
      if (subgroupFilter) params.set('productSubgroup', subgroupFilter);
      const res = await fetch(`/api/products/list?${params}`, { signal: controller.signal });
      if (!res.ok) throw new Error('Falha ao carregar produtos');
      const data = (await res.json()) as ProductsResponse & { needsRebuild?: boolean };
      setProducts(data.products || []);
      setSummary(data.summary || { totalProducts: 0, productsWithAnvisa: 0, totalQuantity: 0 });
      setHierarchyCounts(data.hierarchyCounts || null);
      setPagination(data.pagination || { page: 1, limit: data.products?.length || 0, total: data.products?.length || 0, pages: 1 });
      setMeta(data.meta || null);
      // Sempre iniciar recolhido (Linha → Grupo → Subgrupo); Expandir abre tudo.
      // Busca: manter expandido; demais cargas: tudo recolhido.
      setCollapsedGroups(
        debouncedSearch.trim()
          ? new Set()
          : allCollapseKeys(data.products || [], sortBy),
      );
      if (data.needsRebuild && !rebuiltOnceRef.current) {
        rebuiltOnceRef.current = true;
        setIsRebuilding(true);
        fetch('/api/products/rebuild-aggregates', { method: 'POST' })
          .then((r) => { if (r.ok) return r.json(); throw new Error(); })
          .then(() => {
            setIsRebuilding(false);
            fetch(`/api/products/list?${params}`).then((r) => r.json()).then((d: ProductsResponse) => {
              setProducts(d.products || []);
              setSummary(d.summary || { totalProducts: 0, productsWithAnvisa: 0, totalQuantity: 0 });
              setHierarchyCounts(d.hierarchyCounts || null);
              setPagination(d.pagination || { page: 1, limit: d.products?.length || 0, total: d.products?.length || 0, pages: 1 });
              setMeta(d.meta || null);
              setCollapsedGroups(
                debouncedSearch.trim()
                  ? new Set()
                  : allCollapseKeys(d.products || [], sortBy),
              );
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
  }, [serverSortField, sortBy, sortOrder, lineStatusFilter, debouncedSearch, typeFilter, subtypeFilter, subgroupFilter, pagination.page, pagination.limit]);

  useEffect(() => {
    setPagination((current) => current.page === 1 ? current : { ...current, page: 1 });
  }, [serverSortField, sortOrder, lineStatusFilter, debouncedSearch, typeFilter, subtypeFilter, subgroupFilter]);

  useEffect(() => { loadProducts(); loadSettingsHierarchy(); }, [loadProducts]);

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

  // Com busca ativa: expandir todos os grupos para exibir resultados imediatamente.
  const isSearching = debouncedSearch.trim() !== '';
  useEffect(() => {
    if (isSearching) {
      setCollapsedGroups(new Set());
    }
  }, [isSearching]);

  // ---- handlers ----
  const handleSort = (field: SortField) => {
    if (sortBy === field) { setSortOrder((o) => (o === 'asc' ? 'desc' : 'asc')); } else { setSortBy(field); setSortOrder(['description', 'code', 'codigo', 'ncm', 'anvisa', 'supplier', 'productType'].includes(field) ? 'asc' : 'desc'); }
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
      <PageHeader
        icon="inventory_2"
        title="Produtos"
        subtitle="Cadastro automatico por produtos das NF-e de entrada, sem duplicar itens repetidos"
        actions={(
          <>
            <Button
              href={ANVISA_PRODUTOS_SAUDE_URL}
              external
              target="_blank"
              rel="noopener noreferrer"
              title="Abrir consulta de Produtos para Saúde no site da ANVISA"
              variant="secondary"
              icon="open_in_new"
            >
              Consulta ANVISA
            </Button>
            {canWrite && (
              <Button
                type="button"
                variant="secondary"
                icon="upload_file"
                title="Importar cadastro oficial Spica (Rel_Produtos)"
                onClick={() => setSpicaImportOpen(true)}
              >
                Importar Spica
              </Button>
            )}
            <ExportCSVButton filteredCount={filtered.length} query={exportQuery} />
          </>
        )}
      />

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
        catalogTotal={pagination.total}
        pageSize={products.length}
      />

      {meta?.invoicesLimited && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-700 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
          A listagem usa os agregados materializados de todas as NF-e processadas.
        </div>
      )}

      {/* Product Table */}
      <ProductTable
        products={filtered}
        loading={loading}
        isRebuilding={isRebuilding}
        summary={summary}
        hierarchyCounts={hierarchyCounts}
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

      <Card padding="none" className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3">
        <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
          {formatInt(pagination.total)} produtos no cadastro
          {lineStatusFilter === 'active' ? ' (em linha)' : lineStatusFilter === 'outOfLine' ? ' (fora de linha)' : ''}
          {pagination.pages > 1
            ? ` · pagina ${formatInt(pagination.page)} de ${formatInt(pagination.pages)} · ${formatInt(products.length)} nesta pagina`
            : ''}
        </p>
        {pagination.pages > 1 && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPagination((current) => ({ ...current, page: Math.max(1, current.page - 1) }))}
              disabled={loading || pagination.page <= 1}
              className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 disabled:opacity-40"
            >
              Anterior
            </button>
            <button
              type="button"
              onClick={() => setPagination((current) => ({ ...current, page: Math.min(current.pages, current.page + 1) }))}
              disabled={loading || pagination.page >= pagination.pages}
              className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 disabled:opacity-40"
            >
              Proxima
            </button>
          </div>
        )}
      </Card>

      {/* Bulk action toolbar */}
      {selectedKeys.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 px-5 py-3 bg-slate-900 dark:bg-slate-800 text-white rounded-xl shadow-2xl border border-slate-700">
          <span className="material-symbols-outlined text-[20px] text-primary dark:text-blue-400">checklist</span>
          <span className="text-sm font-semibold">{formatInt(selectedKeys.size)} produto{selectedKeys.size !== 1 ? 's' : ''} selecionado{selectedKeys.size !== 1 ? 's' : ''}</span>
          <div className="w-px h-5 bg-slate-600" />
          {canWrite && (
            <Button onClick={() => setBulkEditOpen(true)} size="sm" icon="edit">
              Editar em massa
            </Button>
          )}
          <button onClick={() => setSelectedKeys(new Set())} className="flex items-center gap-1 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm font-medium transition-colors">
            <span className="material-symbols-outlined text-[16px]">close</span>
            Limpar
          </button>
        </div>
      )}

      {/* Auto-classify preview modal */}
      {autoClassifyPreview && (
        <Modal
      isOpen
      onClose={() => setAutoClassifyPreview(null)}
      title="Auto-classificação — prévia"
      surface="card"
      width="sm:max-w-3xl"
      height="sm:max-h-[85vh]"
      bodyClassName=""
      header={
<div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-slate-200 dark:border-slate-700">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <span className="material-symbols-outlined text-[20px] text-amber-500">auto_fix_high</span>
                  Auto-classificacao — Preview
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{autoClassifyPreview.updatesFound} alteracao(oes) encontrada(s) de {autoClassifyPreview.totalProducts} produtos</p>
              </div>
              <button onClick={() => setAutoClassifyPreview(null)} aria-label="Fechar" className="p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"><span className="material-symbols-outlined text-[20px]">close</span></button>
            </div>
      }
      footer={null}
    >
<div className="overflow-y-auto flex-1">
              {autoClassifyPreview.updatesFound === 0 ? (
                <EmptyState icon="check_circle" title="Nenhum preenchimento automatico encontrado" />
              ) : (
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-800/50 sticky top-0">
                    <tr className="text-xs uppercase tracking-wider font-bold text-slate-500">
                      <th className="px-4 py-2">Produto</th>
                      <th className="px-4 py-2">Alteracoes</th>
                      <th className="px-4 py-2">Motivo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {(autoClassifyPreview.preview || []).map((item: { description: string; code?: string; fields: Record<string, string | undefined>; reason: string }, i: number) => (
                      <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                        <td className="px-4 py-2 max-w-[200px]"><p className="text-xs font-semibold text-slate-800 dark:text-white truncate">{item.description}</p>{item.code && <p className="text-xs font-mono text-slate-500 dark:text-slate-400">{item.code}</p>}</td>
                        <td className="px-4 py-2">
                          <div className="flex flex-wrap gap-1">
                            {item.fields.anvisa_code && <span className="px-1.5 py-0.5 rounded text-xs font-semibold bg-teal-50 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400 border border-teal-200 dark:border-teal-800">ANVISA: {item.fields.anvisa_code}</span>}
                            {item.fields.product_type && <span className="px-1.5 py-0.5 rounded text-xs font-semibold bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800">Linha: {item.fields.product_type}</span>}
                            {item.fields.product_subtype && <span className="px-1.5 py-0.5 rounded text-xs font-semibold bg-violet-50 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400 border border-violet-200 dark:border-violet-800">Grupo: {item.fields.product_subtype}</span>}
                          </div>
                        </td>
                        <td className="px-4 py-2"><p className="text-xs text-slate-500 dark:text-slate-400 max-w-[280px]">{item.reason}</p></td>
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
                    {isAutoClassifying ? <><Spinner size="sm" />Aplicando...</> : <><span className="material-symbols-outlined text-[16px]">auto_fix_high</span>Aplicar {autoClassifyPreview.updatesFound} alteracao(oes)</>}
                  </button>
                </div>
              ) : (
                <button onClick={() => setAutoClassifyPreview(null)} className="px-4 py-2 text-sm font-medium text-slate-500 hover:text-slate-700 transition-colors">Fechar</button>
              )}
            </div>
    </Modal>
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

      {spicaImportOpen && (
        <ImportSpicaModal
          onClose={() => setSpicaImportOpen(false)}
          onImported={async () => { await Promise.all([loadProducts(), loadSettingsHierarchy()]); }}
        />
      )}

      {/* Settings Modal */}
      {settingsOpen && (
        <SettingsModal onClose={() => setSettingsOpen(false)} onUpdated={async () => { await Promise.all([loadProducts(), loadSettingsHierarchy()]); }} />
      )}
    </>
  );
}
