'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import Skeleton from '@/components/ui/Skeleton';
import { formatValue } from '@/lib/utils';
import { useRole } from '@/hooks/useRole';
import InvoiceDetailsModal from '@/components/InvoiceDetailsModal';

interface ProductRow {
  key: string;
  code: string;
  description: string;
  ncm: string | null;
  unit: string;
  ean?: string | null;
  anvisa: string | null;
  anvisaMatchMethod?: 'xml' | 'manual' | 'issued_nfe' | 'catalog_code_exact' | 'catalog_name' | null;
  anvisaConfidence?: number | null;
  anvisaMatchedProductName?: string | null;
  anvisaHolder?: string | null;
  anvisaProcess?: string | null;
  anvisaStatus?: string | null;
  anvisaExpiration?: string | null;
  anvisaRiskClass?: string | null;
  anvisaManufacturer?: string | null;
  anvisaManufacturerCountry?: string | null;
  totalQuantity: number;
  invoiceCount: number;
  lastPrice: number;
  lastIssueDate: string | null;
  lastSaleDate: string | null;
  lastSalePrice: number | null;
  lastSupplierName?: string | null;
  lastInvoiceId?: string | null;
  lastInvoiceNumber?: string | null;
  shortName?: string | null;
  productType?: string | null;
  productSubtype?: string | null;
}

interface ProductsSummary {
  totalProducts: number;
  productsWithAnvisa: number;
  totalQuantity: number;
  invoicesProcessed: number;
}

interface ProductsResponse {
  products: ProductRow[];
  summary: ProductsSummary;
  pagination: { page: number; limit: number; total: number; pages: number };
  meta?: {
    invoicesLimited?: boolean;
    maxInvoices?: number;
    anvisaStats?: { manual: number; xml: number; issuedNfe: number; catalog: number; missing: number };
  };
}

type SortField = 'description' | 'code' | 'ncm' | 'anvisa' | 'lastPrice' | 'lastIssueDate' | 'lastSaleDate' | 'supplier' | 'productType' | 'totalQuantity' | 'invoiceCount';

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

function formatOptional(value: number | null) {
  if (value == null) return '-';
  return formatValue(value);
}


export default function ProdutosPage() {
  const { canWrite } = useRole();

  // --- raw data (loaded once) ---
  const [allProducts, setAllProducts] = useState<ProductRow[]>([]);
  const [summary, setSummary] = useState<ProductsSummary>({
    totalProducts: 0,
    productsWithAnvisa: 0,
    totalQuantity: 0,
    invoicesProcessed: 0,
  });
  const [meta, setMeta] = useState<ProductsResponse['meta'] | null>(null);
  const [loading, setLoading] = useState(true);

  // --- client-side state ---
  const [search, setSearch] = useState('');
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [subtypeFilter, setSubtypeFilter] = useState<string>('');
  const [sortBy, setSortBy] = useState<SortField>('lastIssueDate');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // --- action states ---
  const [isSyncingAnvisa, setIsSyncingAnvisa] = useState(false);
  const [isExportingMissing, setIsExportingMissing] = useState(false);
  const [isImportingXls, setIsImportingXls] = useState(false);
  const [isImportingOpenData, setIsImportingOpenData] = useState(false);
  const [isImportingTypes, setIsImportingTypes] = useState(false);
  const [editingAnvisaKey, setEditingAnvisaKey] = useState<string | null>(null);
  const [isAutoClassifying, setIsAutoClassifying] = useState(false);
  const [invoiceModalId, setInvoiceModalId] = useState<string | null>(null);
  const [autoClassifyPreview, setAutoClassifyPreview] = useState<any>(null);
  const xlsInputRef = useRef<HTMLInputElement>(null);
  const openDataInputRef = useRef<HTMLInputElement>(null);
  const typesInputRef = useRef<HTMLInputElement>(null);

  // --- group collapsing ---
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const toggleGroup = (g: string) => setCollapsedGroups((prev) => { const n = new Set(prev); n.has(g) ? n.delete(g) : n.add(g); return n; });

  // --- multi-select ---
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const toggleSelect = (key: string) => {
    setSelectedKeys((prev) => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  };

  // --- bulk edit ---
  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const [bulkFields, setBulkFields] = useState({
    enableType: false, productType: '',
    enableSubtype: false, productSubtype: '',
    enableNcm: false, ncm: '',
    enableAnvisa: false, anvisa: '',
  });
  const [isBulkSaving, setIsBulkSaving] = useState(false);

  const openBulkEdit = () => {
    setBulkFields({ enableType: false, productType: '', enableSubtype: false, productSubtype: '', enableNcm: false, ncm: '', enableAnvisa: false, anvisa: '' });
    setBulkEditOpen(true);
  };

  const handleBulkSave = async () => {
    const fields: Record<string, string | null> = {};
    if (bulkFields.enableType) fields.productType = bulkFields.productType || null;
    if (bulkFields.enableSubtype) fields.productSubtype = bulkFields.productSubtype || null;
    if (bulkFields.enableNcm) fields.ncm = bulkFields.ncm || null;
    if (bulkFields.enableAnvisa) fields.anvisa = bulkFields.anvisa || null;
    if (Object.keys(fields).length === 0) { toast.error('Selecione pelo menos um campo para editar'); return; }

    const selectedProducts = allProducts.filter((p) => selectedKeys.has(p.key));
    if (selectedProducts.length === 0) return;

    setIsBulkSaving(true);
    const toastId = toast.loading(`Atualizando ${selectedProducts.length} produto(s)...`);
    try {
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
  const [detailType, setDetailType] = useState('');
  const [detailSubtype, setDetailSubtype] = useState('');
  const [detailShortName, setDetailShortName] = useState('');
  const [detailOpenSections, setDetailOpenSections] = useState<Set<string>>(new Set());
  const toggleDetailSection = (s: string) => setDetailOpenSections((prev) => { const n = new Set(prev); n.has(s) ? n.delete(s) : n.add(s); return n; });
  const [savingDetail, setSavingDetail] = useState(false);
  const [syncingRegistry, setSyncingRegistry] = useState(false);

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

  const openDetail = (product: ProductRow) => {
    setDetailProduct(product);
    setDetailAnvisa(product.anvisa || '');
    setDetailNcm(product.ncm || '');
    setDetailType(product.productType || '');
    setDetailSubtype(product.productSubtype || '');
    setDetailShortName(product.shortName || '');
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
    detailAnvisa !== (detailProduct.anvisa || '') ||
    detailNcm !== (detailProduct.ncm || '') ||
    detailType !== (detailProduct.productType || '') ||
    detailSubtype !== (detailProduct.productSubtype || '') ||
    detailShortName !== (detailProduct.shortName || '')
  );

  // ---- load all products once ----
  const loadProducts = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/products?exportAll=1&sort=lastIssue&order=desc');
      if (!res.ok) throw new Error('Falha ao carregar produtos');
      const data = (await res.json()) as ProductsResponse;
      setAllProducts(data.products || []);
      setSummary(
        data.summary || { totalProducts: 0, productsWithAnvisa: 0, totalQuantity: 0, invoicesProcessed: 0 },
      );
      setMeta(data.meta || null);
    } catch {
      toast.error('Erro ao carregar produtos');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProducts();
  }, []);

  // ---- client-side filter + sort ----
  const filtered = useMemo(() => {
    const norm = normalizeSearch(search);
    const digits = search.replace(/\D/g, '');

    let result = allProducts;

    if (norm) {
      result = result.filter((p) => {
        if (normalizeSearch(p.description).includes(norm)) return true;
        if (normalizeSearch(p.code || '').includes(norm)) return true;
        if (normalizeSearch(p.ncm || '').includes(norm)) return true;
        if (normalizeSearch(p.anvisa || '').includes(norm)) return true;
        if (normalizeSearch(p.lastSupplierName || '').includes(norm)) return true;
        if (digits) {
          if ((p.code || '').replace(/\D/g, '').includes(digits)) return true;
          if ((p.ncm || '').replace(/\D/g, '').includes(digits)) return true;
          if ((p.anvisa || '').replace(/\D/g, '').includes(digits)) return true;
        }
        return false;
      });
    }

    if (onlyMissing) {
      result = result.filter((p) => !p.anvisa);
    }

    if (typeFilter) {
      result = result.filter((p) => (p.productType || '') === typeFilter);
    }
    if (subtypeFilter) {
      result = result.filter((p) => (p.productSubtype || '') === subtypeFilter);
    }

    result = [...result].sort((a, b) => {
      let cmp = 0;
      switch (sortBy) {
        case 'description':
          cmp = (a.description || '').localeCompare(b.description || '', 'pt-BR');
          break;
        case 'code':
          cmp = (a.code || '').localeCompare(b.code || '', 'pt-BR');
          break;
        case 'ncm':
          cmp = (a.ncm || '').localeCompare(b.ncm || '', 'pt-BR');
          break;
        case 'anvisa':
          cmp = (a.anvisa || '').localeCompare(b.anvisa || '', 'pt-BR');
          break;
        case 'lastPrice':
          cmp = a.lastPrice - b.lastPrice;
          break;
        case 'lastIssueDate':
          cmp = (a.lastIssueDate ? new Date(a.lastIssueDate).getTime() : 0)
              - (b.lastIssueDate ? new Date(b.lastIssueDate).getTime() : 0);
          break;
        case 'lastSaleDate':
          cmp = (a.lastSaleDate ? new Date(a.lastSaleDate).getTime() : 0)
              - (b.lastSaleDate ? new Date(b.lastSaleDate).getTime() : 0);
          break;
        case 'supplier':
          cmp = (a.lastSupplierName || '').localeCompare(b.lastSupplierName || '', 'pt-BR');
          break;
        case 'productType':
          cmp = (a.productType || '').localeCompare(b.productType || '', 'pt-BR');
          if (cmp === 0) cmp = (a.productSubtype || '').localeCompare(b.productSubtype || '', 'pt-BR');
          break;
      }
      if (cmp === 0) cmp = (a.description || '').localeCompare(b.description || '', 'pt-BR');
      return sortOrder === 'asc' ? cmp : -cmp;
    });

    return result;
  }, [allProducts, search, onlyMissing, typeFilter, subtypeFilter, sortBy, sortOrder]);

  // show all filtered results (no pagination)
  const visible = filtered;

  const getGroupLabel = (product: ProductRow): string => {
    switch (sortBy) {
      case 'supplier':    return product.lastSupplierName || 'Sem fabricante';
      case 'productType': return product.productSubtype || product.productType || 'Sem tipo';
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

  // --- visible keys for select-all (depends on getGroupLabel) ---
  const visibleKeys = useMemo(() => {
    const keys: string[] = [];
    let lastGroup = '';
    for (const p of filtered) {
      const g = getGroupLabel(p);
      if (g !== lastGroup) lastGroup = g;
      if (!collapsedGroups.has(g)) keys.push(p.key);
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

  // ---- handlers ----
  const handleSort = (field: SortField) => {
    if (sortBy === field) {
      setSortOrder((o) => (o === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(field);
      setSortOrder(['description', 'code', 'ncm', 'anvisa', 'supplier', 'productType'].includes(field) ? 'asc' : 'desc');
      setCollapsedGroups(new Set());
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

  const handleExport = () => {
    if (filtered.length === 0) return;
    const headers = ['Codigo', 'Produto', 'NCM', 'ANVISA', 'Ultimo Preco', 'Ultimo Preco Venda', 'Data Ultima Compra', 'Data Ultima Venda'];
    const rows = filtered.map((p) => [
      p.code, p.description, p.ncm || '', p.anvisa || '',
      formatValue(p.lastPrice), formatOptional(p.lastSalePrice),
      formatDate(p.lastIssueDate), formatDate(p.lastSaleDate),
    ]);
    const csv = '\uFEFF' + [headers.join(';'), ...rows.map((r) => r.join(';'))].join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a');
    a.href = url; a.download = `produtos-${new Date().toISOString().split('T')[0]}.csv`; a.click();
    URL.revokeObjectURL(url);
    toast.success(`${filtered.length.toLocaleString('pt-BR')} produtos exportados`);
  };

  const handleExportMissingAnvisa = () => {
    if (isExportingMissing) return;
    const missing = allProducts.filter((p) => !p.anvisa);
    if (missing.length === 0) { toast.info('Nenhum produto sem ANVISA'); return; }
    setIsExportingMissing(true);
    const headers = ['Codigo', 'Produto', 'NCM', 'EAN', 'Ultimo Preco', 'Data Ultima Compra', 'Fornecedor'];
    const rows = missing.map((p) => [
      p.code, p.description, p.ncm || '', p.ean || '',
      formatValue(p.lastPrice), formatDate(p.lastIssueDate), p.lastSupplierName || '',
    ]);
    const csv = '\uFEFF' + [headers.join(';'), ...rows.map((r) => r.join(';'))].join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a');
    a.href = url; a.download = `produtos-sem-anvisa-${new Date().toISOString().split('T')[0]}.csv`; a.click();
    URL.revokeObjectURL(url);
    toast.success(`${missing.length.toLocaleString('pt-BR')} produtos exportados`);
    setIsExportingMissing(false);
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

      // Find header row (Código, Reg. Anvisa)
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
        toast.error('Não foi possível identificar as colunas "Código" e "Reg. Anvisa" na planilha.', { id: toastId });
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
    const fields: Record<string, string | null> = {};

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
    if (detailShortName !== (detailProduct.shortName || '')) fields.shortName = detailShortName.trim() || null;

    if (Object.keys(fields).length === 0) { setSavingDetail(false); return; }

    try {
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

      const ourCodes = new Set(
        allProducts.map((p) => (p.anvisa || '').replace(/\D/g, '').padStart(11, '0')).filter((c) => c.length === 11),
      );

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
    const toastId = toast.loading('Importando tipos de produto...');
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/products/import-types', { method: 'POST', body: fd });
      const result = await res.json();
      if (!res.ok) throw new Error(result?.error || 'Falha na importação');
      toast.success(
        `Tipos importados! Atualizados: ${result.matched} de ${result.parsed} itens do arquivo`,
        { id: toastId },
      );
      loadProducts();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao importar tipos', { id: toastId });
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
          `Classificação concluída! ${data.updatesApplied} produto(s) atualizados — ANVISA: ${data.byField.anvisa}, Tipo: ${data.byField.productType}, Subtipo: ${data.byField.productSubtype}`,
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

  const missingCount = meta?.anvisaStats?.missing ?? allProducts.filter((p) => !p.anvisa).length;

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
            <>
              <button
                onClick={handleSyncAnvisa}
                disabled={isSyncingAnvisa}
                className="flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-card-dark border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 transition-colors shadow-sm disabled:opacity-60"
              >
                <span className={`material-symbols-outlined text-[20px] ${isSyncingAnvisa ? 'animate-spin' : ''}`}>autorenew</span>
                {isSyncingAnvisa ? 'Sincronizando...' : 'Sincronizar ANVISA'}
              </button>
              <button
                onClick={() => handleAutoClassify(true)}
                disabled={isAutoClassifying}
                className="flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-card-dark border border-amber-200 dark:border-amber-800 rounded-lg text-sm font-bold text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors shadow-sm disabled:opacity-60"
                title="Analisa produtos e preenche ANVISA, tipo e subtipo automaticamente por similaridade"
              >
                <span className={`material-symbols-outlined text-[20px] ${isAutoClassifying ? 'animate-spin' : ''}`}>{isAutoClassifying ? 'sync' : 'auto_fix_high'}</span>
                {isAutoClassifying ? 'Analisando...' : 'Auto-classificar'}
              </button>
              <button
                onClick={handleBulkSyncRegistry}
                disabled={syncingRegistry}
                className="flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-card-dark border border-teal-200 dark:border-teal-800 rounded-lg text-sm font-bold text-teal-700 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-900/20 transition-colors shadow-sm disabled:opacity-60"
                title="Consulta a API pública da ANVISA para atualizar nome do produto, detentor, situação e vencimento do registro"
              >
                <span className={`material-symbols-outlined text-[20px] ${syncingRegistry ? 'animate-spin' : ''}`}>verified</span>
                {syncingRegistry ? 'Consultando...' : 'Buscar Registros ANVISA'}
              </button>
              <input
                ref={openDataInputRef}
                type="file"
                accept=".xls,.xlsx,.csv"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleOpenDataImport(f); }}
              />
              <button
                onClick={() => openDataInputRef.current?.click()}
                disabled={isImportingOpenData}
                className="flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-card-dark border border-teal-200 dark:border-teal-800 rounded-lg text-sm font-bold text-teal-700 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-900/20 transition-colors shadow-sm disabled:opacity-60"
                title="Importar arquivo de dados abertos da ANVISA (dados.anvisa.gov.br) com situação, vencimento e detentor dos registros"
              >
                <span className={`material-symbols-outlined text-[20px] ${isImportingOpenData ? 'animate-spin' : ''}`}>
                  {isImportingOpenData ? 'sync' : 'upload_file'}
                </span>
                {isImportingOpenData ? 'Processando...' : 'Dados Abertos ANVISA'}
              </button>
            </>
          )}
          <button
            onClick={loadProducts}
            className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-primary to-primary-dark hover:from-primary-dark hover:to-primary text-white rounded-lg text-sm font-bold transition-all shadow-md shadow-primary/30"
          >
            <span className="material-symbols-outlined text-[20px]">sync</span>
            Atualizar
          </button>
          {canWrite && (
            <>
              <input
                ref={xlsInputRef}
                type="file"
                accept=".xls,.xlsx,.csv"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleXlsImport(file);
                }}
              />
              <button
                onClick={() => xlsInputRef.current?.click()}
                disabled={isImportingXls}
                className="flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-card-dark border border-emerald-200 dark:border-emerald-800 rounded-lg text-sm font-medium text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors shadow-sm disabled:opacity-60"
                title="Importar planilha XLS com códigos ANVISA (colunas: Código, Reg. Anvisa)"
              >
                <span className={`material-symbols-outlined text-[20px] ${isImportingXls ? 'animate-spin' : ''}`}>
                  {isImportingXls ? 'sync' : 'upload'}
                </span>
                {isImportingXls ? 'Importando...' : 'Importar XLS'}
              </button>
              <input
                ref={typesInputRef}
                type="file"
                accept=".xls,.xlsx"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImportTypes(f); }}
              />
              <button
                onClick={() => typesInputRef.current?.click()}
                disabled={isImportingTypes}
                className="flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-card-dark border border-violet-200 dark:border-violet-800 rounded-lg text-sm font-medium text-violet-700 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-900/20 transition-colors shadow-sm disabled:opacity-60"
                title="Importar tipos e subtipos de produto (planilha SPICA Prod_Tipo)"
              >
                <span className={`material-symbols-outlined text-[20px] ${isImportingTypes ? 'animate-spin' : ''}`}>
                  {isImportingTypes ? 'sync' : 'category'}
                </span>
                {isImportingTypes ? 'Importando...' : 'Importar Tipos'}
              </button>
            </>
          )}
          <button
            onClick={handleExportMissingAnvisa}
            disabled={loading || missingCount === 0}
            className="flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-card-dark border border-red-200 dark:border-red-800 rounded-lg text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors shadow-sm disabled:opacity-40"
            title="Exportar planilha com todos os produtos sem ANVISA"
          >
            <span className="material-symbols-outlined text-[20px]">download</span>
            Exportar sem ANVISA
          </button>
          <a
            href="https://consultas.anvisa.gov.br/#/saude/"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-card-dark border border-teal-200 dark:border-teal-800 rounded-lg text-sm font-medium text-teal-700 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-900/20 transition-colors shadow-sm"
            title="Consulta pública ANVISA – Produtos para Saúde"
          >
            <span className="material-symbols-outlined text-[20px]">biotech</span>
            ANVISA Saúde
          </a>
          <a
            href="https://consultas.anvisa.gov.br/#/medicamentos/"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-card-dark border border-teal-200 dark:border-teal-800 rounded-lg text-sm font-medium text-teal-700 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-900/20 transition-colors shadow-sm"
            title="Consulta pública ANVISA – Medicamentos"
          >
            <span className="material-symbols-outlined text-[20px]">medication</span>
            ANVISA Medicamentos
          </a>
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

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-card-dark px-4 py-3">
          <p className="text-[11px] uppercase tracking-wider text-slate-500">Produtos únicos</p>
          <p className="text-lg font-bold text-slate-900 dark:text-white">
            {loading ? <span className="inline-block w-12 h-5 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" /> : summary.totalProducts.toLocaleString('pt-BR')}
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-card-dark px-4 py-3">
          <p className="text-[11px] uppercase tracking-wider text-slate-500">Com ANVISA</p>
          <p className="text-lg font-bold text-slate-900 dark:text-white">
            {loading ? <span className="inline-block w-12 h-5 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" /> : summary.productsWithAnvisa.toLocaleString('pt-BR')}
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-card-dark px-4 py-3">
          <p className="text-[11px] uppercase tracking-wider text-slate-500">Qtde comprada</p>
          <p className="text-lg font-bold text-slate-900 dark:text-white">
            {loading ? <span className="inline-block w-12 h-5 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" /> : formatQuantity(summary.totalQuantity)}
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-card-dark px-4 py-3">
          <p className="text-[11px] uppercase tracking-wider text-slate-500">NF-e processadas</p>
          <p className="text-lg font-bold text-slate-900 dark:text-white">
            {loading ? <span className="inline-block w-12 h-5 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" /> : summary.invoicesProcessed.toLocaleString('pt-BR')}
          </p>
        </div>
      </div>


      {/* Search + filters */}
      <div className="bg-white dark:bg-card-dark border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm">
        <div className="flex gap-3 items-end">
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
                <option value="lastIssueDate">Última Compra</option>
                <option value="ncm">NCM</option>
                <option value="anvisa">ANVISA</option>
                <option value="productType">Tipo</option>
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
          <div className="flex-1">
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
          <div className="shrink-0 flex flex-col justify-end">
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">&nbsp;</label>
            <button
              onClick={() => setOnlyMissing((v) => !v)}
              className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${onlyMissing ? 'bg-red-600 text-white border-red-600' : 'bg-slate-50 dark:bg-slate-900/50 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-red-300 hover:text-red-600'}`}
              title="Filtrar somente produtos sem ANVISA"
            >
              Sem ANVISA {missingCount > 0 && <span className={`ml-1 text-[11px] font-bold ${onlyMissing ? 'opacity-80' : 'text-red-500'}`}>{missingCount}</span>}
            </button>
          </div>
          <div className="shrink-0">
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Tipo</label>
            <select
              value={typeFilter}
              onChange={(e) => { setTypeFilter(e.target.value); setSubtypeFilter(''); }}
              className="px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-900/50 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
            >
              <option value="">Todos</option>
              {Array.from(new Set(allProducts.map((p) => p.productType).filter(Boolean))).sort().map((t) => (
                <option key={t!} value={t!}>{t}</option>
              ))}
            </select>
          </div>
          {typeFilter && (
            <div className="shrink-0">
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Subtipo</label>
              <select
                value={subtypeFilter}
                onChange={(e) => setSubtypeFilter(e.target.value)}
                className="px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-900/50 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
              >
                <option value="">Todos</option>
                {Array.from(new Set(allProducts.filter((p) => p.productType === typeFilter).map((p) => p.productSubtype).filter(Boolean))).sort().map((s) => (
                  <option key={s!} value={s!}>{s}</option>
                ))}
              </select>
            </div>
          )}
          <button
            onClick={() => { setSearch(''); setOnlyMissing(false); setTypeFilter(''); setSubtypeFilter(''); setSortBy('lastIssueDate'); setSortOrder('desc'); }}
            className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-card-dark border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 transition-colors shadow-sm"
          >
            <span className="material-symbols-outlined text-[18px]">filter_alt_off</span>
            Limpar
          </button>
        </div>

        {/* Active filter indicators */}
        {(search || onlyMissing || typeFilter) && (
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
            {onlyMissing && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-xs font-medium dark:bg-red-900/30 dark:text-red-400">
                Sem ANVISA
                <button onClick={() => setOnlyMissing(false)} className="hover:opacity-70">
                  <span className="material-symbols-outlined text-[13px]">close</span>
                </button>
              </span>
            )}
            {typeFilter && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 text-xs font-medium dark:bg-indigo-900/30 dark:text-indigo-400">
                {typeFilter}
                <button onClick={() => setTypeFilter('')} className="hover:opacity-70">
                  <span className="material-symbols-outlined text-[13px]">close</span>
                </button>
              </span>
            )}
            <span className="text-xs text-slate-400">{filtered.length.toLocaleString('pt-BR')} resultado{filtered.length !== 1 ? 's' : ''}</span>
          </div>
        )}
      </div>

      {meta?.invoicesLimited && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-700 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
          A listagem está limitada às {meta.maxInvoices?.toLocaleString('pt-BR') || 3000} NF-e de entrada mais recentes para manter desempenho.
        </div>
      )}

      {/* Table */}
      <div className="bg-white dark:bg-card-dark border border-slate-200 dark:border-slate-800 rounded-xl shadow-lg shadow-slate-200/50 dark:shadow-none overflow-hidden">
        {(() => {
          const allGroups = Array.from(new Set(visible.map(getGroupLabel)));
          if (allGroups.length <= 1) return null;
          return (
            <div className="flex justify-end gap-2 px-3 py-2 border-b border-slate-100 dark:border-slate-800">
              <button onClick={() => setCollapsedGroups(new Set(allGroups))} className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 px-2 py-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">Recolher tudo</button>
              <button onClick={() => setCollapsedGroups(new Set())} className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 px-2 py-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">Expandir tudo</button>
            </div>
          );
        })()}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[1200px]">
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
                  <div className="flex items-center gap-1">Código <SortIcon field="code" /></div>
                </th>
                <th className="px-3 py-1.5 cursor-pointer group hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" onClick={() => handleSort('description')}>
                  <div className="flex items-center gap-1">Produto <SortIcon field="description" /></div>
                </th>
                <th className="px-3 py-1.5 cursor-pointer group hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" onClick={() => handleSort('ncm')}>
                  <div className="flex items-center gap-1">NCM <SortIcon field="ncm" /></div>
                </th>
                <th className="px-3 py-1.5 cursor-pointer group hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" onClick={() => handleSort('anvisa')}>
                  <div className="flex items-center gap-1">ANVISA <SortIcon field="anvisa" /></div>
                </th>
                <th className="px-3 py-1.5">
                  <div className="flex items-center gap-1">Fabricante</div>
                </th>
                <th className="px-3 py-1.5 cursor-pointer group hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" onClick={() => handleSort('productType')}>
                  <div className="flex items-center gap-1">Tipo <SortIcon field="productType" /></div>
                </th>
                <th className="px-3 py-1.5 text-right cursor-pointer group hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" onClick={() => handleSort('totalQuantity')}>
                  <div className="flex items-center justify-end gap-1">Qtde <SortIcon field="totalQuantity" /></div>
                </th>
                <th className="px-3 py-1.5 text-right cursor-pointer group hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" onClick={() => handleSort('invoiceCount')}>
                  <div className="flex items-center justify-end gap-1">NF-es <SortIcon field="invoiceCount" /></div>
                </th>
                <th className="px-3 py-1.5 text-right cursor-pointer group hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" onClick={() => handleSort('lastIssueDate')}>
                  <div className="flex items-center justify-end gap-1">Última Compra <SortIcon field="lastIssueDate" /></div>
                </th>
                <th className="px-3 py-1.5">NF-e</th>
                <th className="px-3 py-1.5 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {loading ? (
                Array.from({ length: 20 }).map((_, i) => (
                  <tr key={i}>
                    <td className="px-3 py-2"><Skeleton className="h-4 w-4" /></td>
                    <td className="px-3 py-2"><Skeleton className="h-4 w-16" /></td>
                    <td className="px-3 py-2"><Skeleton className="h-4 w-52" /></td>
                    <td className="px-3 py-2"><Skeleton className="h-4 w-20" /></td>
                    <td className="px-3 py-2"><Skeleton className="h-4 w-24" /></td>
                    <td className="px-3 py-2"><Skeleton className="h-4 w-28" /></td>
                    <td className="px-3 py-2"><Skeleton className="h-4 w-20" /></td>
                    <td className="px-3 py-2"><Skeleton className="h-4 w-12 ml-auto" /></td>
                    <td className="px-3 py-2"><Skeleton className="h-4 w-8 ml-auto" /></td>
                    <td className="px-3 py-2"><Skeleton className="h-4 w-24 ml-auto" /></td>
                    <td className="px-3 py-2"><Skeleton className="h-4 w-16" /></td>
                    <td className="px-3 py-2"><Skeleton className="h-4 w-8 mx-auto" /></td>
                  </tr>
                ))
              ) : visible.length === 0 ? (
                <tr>
                  <td colSpan={12} className="px-6 py-12 text-center text-slate-400">
                    <span className="material-symbols-outlined text-[48px] opacity-30">inventory_2</span>
                    <p className="mt-2 text-sm font-medium">Nenhum produto encontrado</p>
                    <p className="text-xs mt-1">
                      {allProducts.length > 0
                        ? 'Tente ajustar os filtros de busca.'
                        : 'A lista é montada automaticamente a partir das NF-e de entrada.'}
                    </p>
                  </td>
                </tr>
              ) : (
                (() => {
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
                            <td colSpan={12} className="px-3 py-1 bg-slate-100/80 dark:bg-slate-800/60 border-y border-slate-200 dark:border-slate-700">
                              <div className="flex items-center gap-2">
                                <span className="material-symbols-outlined text-[15px] text-slate-400 transition-transform" style={{ transform: collapsedGroups.has(group) ? 'rotate(-90deg)' : 'rotate(0deg)' }}>expand_more</span>
                                {sortBy === 'productType' && product.productType && product.productSubtype && (
                                  <span className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">{product.productType}</span>
                                )}
                                {sortBy === 'productType' && product.productType && product.productSubtype && (
                                  <span className="text-slate-300 dark:text-slate-600 text-xs">›</span>
                                )}
                                <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{group}</span>
                                <span className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 bg-slate-200 dark:bg-slate-700 px-1.5 py-0.5 rounded-full">{groupCountMap.get(group)}</span>
                              </div>
                            </td>
                          </tr>
                        )}
                        {!collapsedGroups.has(group) && (
                  <tr key={product.key} className={`hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors border-b border-slate-100 dark:border-slate-800/50 ${selectedKeys.has(product.key) ? 'bg-primary/5 dark:bg-primary/10' : ''}`}>
                    <td className="px-3 py-1 w-8" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedKeys.has(product.key)}
                        onChange={() => toggleSelect(product.key)}
                        className="w-4 h-4 rounded border-slate-300 text-primary cursor-pointer"
                      />
                    </td>
                    <td className="px-3 py-1">
                      <span className="text-[12px] font-mono font-semibold text-slate-900 dark:text-white">{product.code || '-'}</span>
                    </td>
                    <td className="px-3 py-1">
                      <span className="text-[12px] font-semibold text-slate-900 dark:text-white">{product.description}</span>
                    </td>
                    <td className="px-3 py-1">
                      <span className="text-[12px] font-mono text-slate-700 dark:text-slate-300">{product.ncm || '-'}</span>
                    </td>
                    <td className="px-3 py-1">
                      <span className={`text-[12px] font-mono ${product.anvisa ? 'text-slate-700 dark:text-slate-300' : 'text-red-400 dark:text-red-500'}`}>
                        {product.anvisa || '—'}
                      </span>
                    </td>
                    <td className="px-3 py-1">
                      <span className="text-[12px] text-slate-600 dark:text-slate-400">{product.anvisaManufacturer || '-'}</span>
                    </td>
                    <td className="px-3 py-1">
                      {product.productType ? (
                        <div className="flex flex-col gap-0.5">
                          <span className="inline-block px-1.5 py-0 rounded-full text-[11px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200 dark:bg-indigo-900/20 dark:text-indigo-400 dark:border-indigo-800 whitespace-nowrap w-fit">
                            {product.productType}
                          </span>
                          {product.productSubtype && (
                            <span className="text-[11px] text-slate-500 dark:text-slate-400 truncate max-w-[160px]">{product.productSubtype}</span>
                          )}
                        </div>
                      ) : (
                        <span className="text-[12px] text-slate-400">-</span>
                      )}
                    </td>
                    <td className="px-3 py-1 text-right">
                      <span className="text-[12px] font-medium text-slate-700 dark:text-slate-300">{formatQuantity(product.totalQuantity)}</span>
                    </td>
                    <td className="px-3 py-1 text-right">
                      <span className="text-[12px] font-medium text-slate-500 dark:text-slate-400">{product.invoiceCount}</span>
                    </td>
                    <td className="px-3 py-1 text-right">
                      <span className="text-[12px] font-medium text-slate-700 dark:text-slate-300">{formatDate(product.lastIssueDate)}</span>
                    </td>
                    <td className="px-3 py-1">
                      {product.lastInvoiceNumber ? (
                        <button
                          onClick={(e) => { e.stopPropagation(); setInvoiceModalId(product.lastInvoiceId || null); }}
                          className="inline-flex items-center gap-1 text-[11px] font-mono text-primary hover:text-primary-dark hover:underline transition-colors"
                          title="Abrir NF-e"
                        >
                          <span className="material-symbols-outlined text-[14px]">receipt_long</span>
                          {product.lastInvoiceNumber}
                        </button>
                      ) : (
                        <span className="text-[11px] text-slate-400">-</span>
                      )}
                    </td>
                    <td className="px-3 py-1 text-center">
                      <div className="flex items-center justify-center gap-0.5">
                        <button
                          onClick={() => openDetail(product)}
                          className="p-1 rounded-lg text-slate-500 hover:text-primary hover:bg-primary/10 transition-colors"
                          title="Ver detalhes do produto"
                        >
                          <span className="material-symbols-outlined text-[18px]">visibility</span>
                        </button>
                        <button
                          onClick={() => openHistory(product)}
                          className="p-1 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                          title="Histórico de compras e vendas"
                        >
                          <span className="material-symbols-outlined text-[18px]">history</span>
                        </button>
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

        {!loading && filtered.length > 0 && (
          <div className="px-6 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50/30 dark:bg-slate-800/20">
            <span className="text-sm text-slate-500">
              {filtered.length.toLocaleString('pt-BR')} produto{filtered.length !== 1 ? 's' : ''}
              {filtered.length !== allProducts.length && (
                <span className="text-xs text-primary font-medium ml-2">
                  (filtrado de {allProducts.length.toLocaleString('pt-BR')})
                </span>
              )}
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setAutoClassifyPreview(null)}>
          <div className="bg-white dark:bg-card-dark rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <span className="material-symbols-outlined text-[20px] text-amber-500">auto_fix_high</span>
                  Auto-classificação — Preview
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  {autoClassifyPreview.updatesFound} alteração(ões) encontrada(s) de {autoClassifyPreview.totalProducts} produtos
                  {autoClassifyPreview.byField && (
                    <span className="ml-2">
                      — ANVISA: <b>{autoClassifyPreview.byField.anvisa}</b>, Tipo: <b>{autoClassifyPreview.byField.productType}</b>, Subtipo: <b>{autoClassifyPreview.byField.productSubtype}</b>
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
                                Tipo: {item.fields.product_type}
                              </span>
                            )}
                            {item.fields.product_subtype && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-violet-50 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400 border border-violet-200 dark:border-violet-800">
                                Subtipo: {item.fields.product_subtype}
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

            {autoClassifyPreview.updatesFound > 0 && (
              <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50/40 dark:bg-slate-800/30">
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
          </div>
        </div>
      )}

      {/* Bulk edit modal */}
      {bulkEditOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={() => setBulkEditOpen(false)}>
          <div className="bg-white dark:bg-card-dark rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Editar em massa</h3>
                <p className="text-xs text-slate-400 mt-0.5">{selectedKeys.size.toLocaleString('pt-BR')} produto{selectedKeys.size !== 1 ? 's' : ''} selecionado{selectedKeys.size !== 1 ? 's' : ''}</p>
              </div>
              <button onClick={() => setBulkEditOpen(false)} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">
              <p className="text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/50 rounded-lg px-3 py-2">
                Marque os campos que deseja alterar. Campos não marcados permanecerão inalterados.
              </p>

              {/* Tipo */}
              <div className="space-y-1.5">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={bulkFields.enableType} onChange={(e) => setBulkFields((f) => ({ ...f, enableType: e.target.checked }))} className="w-4 h-4 rounded border-slate-300 text-primary" />
                  <span className="text-xs font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider">Tipo</span>
                </label>
                {bulkFields.enableType && (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={bulkFields.productType}
                      onChange={(e) => setBulkFields((f) => ({ ...f, productType: e.target.value }))}
                      placeholder="Deixe em branco para limpar"
                      list="bulk-types-list"
                      className="flex-1 px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-900/50 text-slate-900 dark:text-white text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
                    />
                    <datalist id="bulk-types-list">
                      {Array.from(new Set(allProducts.map((p) => p.productType).filter(Boolean))).sort().map((t) => (
                        <option key={t!} value={t!} />
                      ))}
                    </datalist>
                  </div>
                )}
              </div>

              {/* Subtipo */}
              <div className="space-y-1.5">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={bulkFields.enableSubtype} onChange={(e) => setBulkFields((f) => ({ ...f, enableSubtype: e.target.checked }))} className="w-4 h-4 rounded border-slate-300 text-primary" />
                  <span className="text-xs font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider">Subtipo</span>
                </label>
                {bulkFields.enableSubtype && (
                  <input
                    type="text"
                    value={bulkFields.productSubtype}
                    onChange={(e) => setBulkFields((f) => ({ ...f, productSubtype: e.target.value }))}
                    placeholder="Deixe em branco para limpar"
                    list="bulk-subtypes-list"
                    className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-900/50 text-slate-900 dark:text-white text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
                  />
                )}
                <datalist id="bulk-subtypes-list">
                  {Array.from(new Set(
                    allProducts
                      .filter((p) => !bulkFields.productType || p.productType === bulkFields.productType)
                      .map((p) => p.productSubtype).filter(Boolean)
                  )).sort().map((s) => <option key={s!} value={s!} />)}
                </datalist>
              </div>

              {/* NCM */}
              <div className="space-y-1.5">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={bulkFields.enableNcm} onChange={(e) => setBulkFields((f) => ({ ...f, enableNcm: e.target.checked }))} className="w-4 h-4 rounded border-slate-300 text-primary" />
                  <span className="text-xs font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider">NCM</span>
                </label>
                {bulkFields.enableNcm && (
                  <input
                    type="text"
                    value={bulkFields.ncm}
                    onChange={(e) => setBulkFields((f) => ({ ...f, ncm: e.target.value }))}
                    placeholder="Ex: 90189099"
                    maxLength={8}
                    className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-900/50 text-slate-900 dark:text-white font-mono text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
                  />
                )}
              </div>

              {/* ANVISA */}
              <div className="space-y-1.5">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={bulkFields.enableAnvisa} onChange={(e) => setBulkFields((f) => ({ ...f, enableAnvisa: e.target.checked }))} className="w-4 h-4 rounded border-slate-300 text-primary" />
                  <span className="text-xs font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider">ANVISA</span>
                </label>
                {bulkFields.enableAnvisa && (
                  <input
                    type="text"
                    value={bulkFields.anvisa}
                    onChange={(e) => setBulkFields((f) => ({ ...f, anvisa: e.target.value }))}
                    placeholder="11 dígitos — deixe em branco para limpar"
                    maxLength={13}
                    className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-900/50 text-slate-900 dark:text-white font-mono text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
                  />
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/30">
              <button onClick={() => setBulkEditOpen(false)} className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-slate-800 transition-colors">
                Cancelar
              </button>
              <button
                onClick={handleBulkSave}
                disabled={isBulkSaving || (!bulkFields.enableType && !bulkFields.enableSubtype && !bulkFields.enableNcm && !bulkFields.enableAnvisa)}
                className="flex items-center gap-2 px-5 py-2 bg-primary hover:bg-primary-dark text-white rounded-lg text-sm font-bold transition-colors disabled:opacity-40"
              >
                {isBulkSaving ? (
                  <><span className="material-symbols-outlined text-[16px] animate-spin">sync</span> Salvando...</>
                ) : (
                  <><span className="material-symbols-outlined text-[16px]">save</span> Salvar</>
                )}
              </button>
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

        const SectionCard = ({ id, icon, iconColor, title, badge, children }: { id: string; icon: string; iconColor: string; title: string; badge?: React.ReactNode; children: React.ReactNode }) => (
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/30 overflow-hidden">
            <button
              onClick={() => toggleDetailSection(id)}
              className="w-full flex items-center gap-2.5 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
            >
              <span className={`material-symbols-outlined text-[18px] ${iconColor}`}>{icon}</span>
              <h4 className="text-[12px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 flex-1 text-left">{title}</h4>
              {badge}
              <span className="material-symbols-outlined text-[18px] text-slate-400 transition-transform duration-200" style={{ transform: detailOpenSections.has(id) ? 'rotate(0deg)' : 'rotate(-90deg)' }}>expand_more</span>
            </button>
            {detailOpenSections.has(id) && (
              <div className="px-4 pb-4 pt-0">
                {children}
              </div>
            )}
          </div>
        );

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setDetailProduct(null)}>
            <div className="bg-slate-50 dark:bg-[#1a1e2e] rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>

              {/* ── Header ── */}
              <div className="flex items-start justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-card-dark">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="mt-0.5 flex-shrink-0 w-10 h-10 rounded-xl bg-primary/10 dark:bg-primary/20 flex items-center justify-center">
                    <span className="material-symbols-outlined text-[22px] text-primary">inventory_2</span>
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-[15px] font-bold text-slate-900 dark:text-white leading-tight">{detailProduct.description}</h3>
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      {detailProduct.code && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-200 dark:bg-slate-700 text-[11px] font-mono font-semibold text-slate-600 dark:text-slate-300">
                          <span className="material-symbols-outlined text-[12px]">qr_code</span>{detailProduct.code}
                        </span>
                      )}
                      {detailProduct.unit && (
                        <span className="px-2 py-0.5 rounded-md bg-blue-100 dark:bg-blue-900/30 text-[11px] font-bold text-blue-700 dark:text-blue-400">{detailProduct.unit}</span>
                      )}
                      {detailProduct.ean && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-700/60 text-[11px] font-mono text-slate-500 dark:text-slate-400">
                          EAN: {detailProduct.ean}
                        </span>
                      )}
                      {detailProduct.anvisa && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-teal-100 dark:bg-teal-900/30 text-[11px] font-mono font-semibold text-teal-700 dark:text-teal-400">
                          <span className="material-symbols-outlined text-[12px]">verified</span>ANVISA: {detailProduct.anvisa}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <button onClick={() => setDetailProduct(null)} className="flex-shrink-0 ml-3 p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
                  <span className="material-symbols-outlined text-[20px]">close</span>
                </button>
              </div>

              {/* ── Body ── */}
              <div className="overflow-y-auto flex-1 px-5 py-4 space-y-3">

                {/* ── Card: Dados do Cadastro ── */}
                <SectionCard id="cadastro" icon="edit_note" iconColor="text-primary" title="Dados do Cadastro">
                  <div className="grid grid-cols-2 gap-3">
                    {/* Nome Abreviado */}
                    <div className="col-span-2 bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3 border border-slate-200 dark:border-slate-700">
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Nome Abreviado</label>
                      <input
                        type="text"
                        value={detailShortName}
                        onChange={(e) => setDetailShortName(e.target.value)}
                        maxLength={100}
                        placeholder="Nome curto para identificação rápida"
                        disabled={!canWrite}
                        className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900/50 text-slate-900 dark:text-white text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary disabled:bg-slate-100 dark:disabled:bg-slate-800 disabled:cursor-not-allowed"
                      />
                    </div>

                    {/* NCM */}
                    <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3 border border-slate-200 dark:border-slate-700">
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">NCM</label>
                      <input
                        type="text"
                        value={detailNcm}
                        onChange={(e) => setDetailNcm(e.target.value)}
                        maxLength={8}
                        placeholder="Ex: 90189099"
                        disabled={!canWrite}
                        className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900/50 text-slate-900 dark:text-white font-mono text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary disabled:bg-slate-100 dark:disabled:bg-slate-800 disabled:cursor-not-allowed"
                      />
                    </div>

                    {/* Tipo */}
                    <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3 border border-slate-200 dark:border-slate-700">
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Tipo</label>
                      <input
                        type="text"
                        value={detailType}
                        onChange={(e) => setDetailType(e.target.value)}
                        placeholder="ex: Medicamento"
                        disabled={!canWrite}
                        list="detail-types-list"
                        className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900/50 text-slate-900 dark:text-white text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary disabled:bg-slate-100 dark:disabled:bg-slate-800 disabled:cursor-not-allowed"
                      />
                      <datalist id="detail-types-list">
                        {Array.from(new Set(allProducts.map((p) => p.productType).filter(Boolean))).sort().map((t) => <option key={t!} value={t!} />)}
                      </datalist>
                    </div>

                    {/* Subtipo */}
                    <div className="col-span-2 bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3 border border-slate-200 dark:border-slate-700">
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Subtipo</label>
                      <input
                        type="text"
                        value={detailSubtype}
                        onChange={(e) => setDetailSubtype(e.target.value)}
                        placeholder="ex: Antibiótico"
                        disabled={!canWrite}
                        list="detail-subtypes-list"
                        className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900/50 text-slate-900 dark:text-white text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary disabled:bg-slate-100 dark:disabled:bg-slate-800 disabled:cursor-not-allowed"
                      />
                      <datalist id="detail-subtypes-list">
                        {Array.from(new Set(allProducts.filter((p) => !detailType || p.productType === detailType).map((p) => p.productSubtype).filter(Boolean))).sort().map((s) => <option key={s!} value={s!} />)}
                      </datalist>
                    </div>

                    {/* Dados Comerciais resumidos */}
                    <div className="col-span-2 grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg px-3 py-2 border border-slate-200 dark:border-slate-700">
                        <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-0.5">Últ. Preço Compra</p>
                        <p className="text-[13px] font-bold text-slate-800 dark:text-white">{formatValue(detailProduct.lastPrice)}</p>
                      </div>
                      {detailProduct.lastSalePrice != null && (
                        <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg px-3 py-2 border border-slate-200 dark:border-slate-700">
                          <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-0.5">Últ. Preço Venda</p>
                          <p className="text-[13px] font-bold text-slate-800 dark:text-white">{formatOptional(detailProduct.lastSalePrice)}</p>
                        </div>
                      )}
                      <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg px-3 py-2 border border-slate-200 dark:border-slate-700">
                        <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-0.5">Última Compra</p>
                        <p className="text-[13px] font-semibold text-slate-800 dark:text-white">{formatDate(detailProduct.lastIssueDate)}</p>
                      </div>
                      {detailProduct.lastSaleDate && (
                        <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg px-3 py-2 border border-slate-200 dark:border-slate-700">
                          <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-0.5">Última Venda</p>
                          <p className="text-[13px] font-semibold text-slate-800 dark:text-white">{formatDate(detailProduct.lastSaleDate)}</p>
                        </div>
                      )}
                      <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg px-3 py-2 border border-slate-200 dark:border-slate-700">
                        <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-0.5">Qtde Total</p>
                        <p className="text-[13px] font-semibold text-slate-800 dark:text-white">{formatQuantity(detailProduct.totalQuantity)}</p>
                      </div>
                      <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg px-3 py-2 border border-slate-200 dark:border-slate-700">
                        <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-0.5">Último Fornecedor</p>
                        <p className="text-[12px] font-semibold text-slate-800 dark:text-white truncate" title={detailProduct.lastSupplierName || '-'}>{detailProduct.lastSupplierName || '-'}</p>
                      </div>
                      {detailProduct.lastInvoiceNumber && (
                        <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg px-3 py-2 border border-slate-200 dark:border-slate-700">
                          <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-0.5">Última NF-e</p>
                          <button
                            onClick={() => { setDetailProduct(null); setInvoiceModalId(detailProduct.lastInvoiceId || null); }}
                            className="text-[13px] font-mono font-semibold text-primary hover:text-primary-dark hover:underline transition-colors flex items-center gap-1"
                          >
                            <span className="material-symbols-outlined text-[14px]">receipt_long</span>
                            {detailProduct.lastInvoiceNumber}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </SectionCard>

                {/* ── Card: Dados da ANVISA ── */}
                <SectionCard id="anvisa" icon="verified_user" iconColor="text-teal-600 dark:text-teal-400" title="Dados da ANVISA"
                  badge={detailProduct.anvisaStatus ? (
                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${anvisaStatusColor}`}>{detailProduct.anvisaStatus}</span>
                  ) : undefined}
                >
                    <div className="grid grid-cols-2 gap-3">
                      {/* Código ANVISA input */}
                      <div className="col-span-2 bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3 border border-slate-200 dark:border-slate-700">
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Código ANVISA</label>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={detailAnvisa}
                            onChange={(e) => setDetailAnvisa(e.target.value)}
                            maxLength={13}
                            placeholder="11 dígitos numéricos"
                            disabled={!canWrite}
                            className="flex-1 px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900/50 text-slate-900 dark:text-white font-mono text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary disabled:bg-slate-100 dark:disabled:bg-slate-800 disabled:cursor-not-allowed"
                          />
                          {canWrite && detailAnvisa && (
                            <button
                              onClick={() => setDetailAnvisa('')}
                              className="px-2.5 border border-red-200 dark:border-red-800 text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg text-sm transition-colors"
                              title="Limpar código ANVISA"
                            >
                              <span className="material-symbols-outlined text-[16px]">delete</span>
                            </button>
                          )}
                          {canWrite && detailProduct.anvisa && (
                            <button
                              onClick={() => handleSyncRegistry(detailProduct)}
                              disabled={syncingRegistry}
                              className="flex items-center gap-1.5 px-3 py-2 border border-teal-200 dark:border-teal-800 text-teal-700 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-900/20 rounded-lg text-[12px] font-medium transition-colors disabled:opacity-60 whitespace-nowrap"
                              title="Consultar dados do registro na ANVISA"
                            >
                              <span className={`material-symbols-outlined text-[15px] ${syncingRegistry ? 'animate-spin' : ''}`}>{syncingRegistry ? 'sync' : 'verified'}</span>
                              {syncingRegistry ? 'Consultando...' : 'Buscar'}
                            </button>
                          )}
                        </div>
                      </div>
                      {detailProduct.anvisaMatchedProductName && (
                        <div className="col-span-2 bg-teal-50/50 dark:bg-teal-900/10 border border-teal-200/60 dark:border-teal-800/60 rounded-xl px-3 py-2.5">
                          <p className="text-[10px] uppercase tracking-wider font-bold text-teal-500 dark:text-teal-400 mb-0.5">Produto Registrado</p>
                          <p className="text-[12px] font-medium text-slate-700 dark:text-slate-300">{detailProduct.anvisaMatchedProductName}</p>
                        </div>
                      )}
                      {detailProduct.anvisaHolder && (
                        <div className="col-span-2 bg-slate-50 dark:bg-slate-800/50 rounded-xl px-3 py-2.5 border border-slate-200 dark:border-slate-700">
                          <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-0.5">Detentor do Registro</p>
                          <p className="text-[12px] text-slate-700 dark:text-slate-300">{detailProduct.anvisaHolder}</p>
                        </div>
                      )}
                      {detailProduct.anvisaManufacturer && (
                        <div className="col-span-2 bg-slate-50 dark:bg-slate-800/50 rounded-xl px-3 py-2.5 border border-slate-200 dark:border-slate-700">
                          <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-0.5">
                            Fabricante Legal{detailProduct.anvisaManufacturerCountry ? ` · ${detailProduct.anvisaManufacturerCountry}` : ''}
                          </p>
                          <p className="text-[12px] text-slate-700 dark:text-slate-300">{detailProduct.anvisaManufacturer}</p>
                        </div>
                      )}
                      {detailProduct.anvisaStatus && (
                        <div className={`rounded-xl px-3 py-2.5 border ${anvisaStatusColor}`}>
                          <p className="text-[10px] uppercase tracking-wider font-bold opacity-60 mb-0.5">Situação</p>
                          <p className="text-[12px] font-bold">{detailProduct.anvisaStatus}</p>
                        </div>
                      )}
                      {(detailProduct.anvisaExpiration || detailProduct.anvisaStatus) && (
                        <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl px-3 py-2.5 border border-slate-200 dark:border-slate-700">
                          <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-0.5">Vencimento</p>
                          <p className="text-[12px] font-semibold text-slate-700 dark:text-slate-300">
                            {detailProduct.anvisaExpiration ? formatDate(detailProduct.anvisaExpiration) : 'Vigente'}
                          </p>
                        </div>
                      )}
                      {detailProduct.anvisaProcess && (
                        <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl px-3 py-2.5 border border-slate-200 dark:border-slate-700">
                          <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-0.5">Processo</p>
                          <p className="text-[11px] font-mono text-slate-600 dark:text-slate-400">{detailProduct.anvisaProcess}</p>
                        </div>
                      )}
                      {detailProduct.anvisaRiskClass && (
                        <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl px-3 py-2.5 border border-slate-200 dark:border-slate-700">
                          <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-0.5">Classe de Risco</p>
                          <p className="text-[12px] font-semibold text-slate-600 dark:text-slate-300">{detailProduct.anvisaRiskClass}</p>
                        </div>
                      )}
                    </div>
                </SectionCard>

              </div>

              {/* ── Footer ── */}
              {canWrite && (
                <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-card-dark">
                  <button
                    onClick={() => setDetailProduct(null)}
                    className="px-4 py-2 text-sm font-medium text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
                  >
                    Fechar
                  </button>
                  <button
                    onClick={handleSaveDetail}
                    disabled={savingDetail || !detailDirty}
                    className="flex items-center gap-2 px-5 py-2 bg-primary hover:bg-primary-dark text-white rounded-xl text-sm font-bold transition-all shadow-sm shadow-primary/30 disabled:opacity-40 disabled:shadow-none"
                  >
                    {savingDetail ? (
                      <><span className="material-symbols-outlined text-[16px] animate-spin">sync</span>Salvando...</>
                    ) : (
                      <><span className="material-symbols-outlined text-[16px]">save</span>Salvar alterações</>
                    )}
                  </button>
                </div>
              )}
              {!canWrite && (
                <div className="flex justify-end px-6 py-4 border-t border-slate-200 dark:border-slate-700">
                  <button onClick={() => setDetailProduct(null)} className="px-4 py-2 text-sm font-medium text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 transition-colors">Fechar</button>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* History modal */}
      {historyProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setHistoryProduct(null)}>
          <div className="bg-slate-50 dark:bg-[#1a1e2e] rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-start justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-card-dark">
              <div className="flex items-start gap-3 min-w-0">
                <div className="mt-0.5 flex-shrink-0 w-10 h-10 rounded-xl bg-blue-500/10 dark:bg-blue-500/20 flex items-center justify-center">
                  <span className="material-symbols-outlined text-[22px] text-blue-500">history</span>
                </div>
                <div className="min-w-0">
                  <h3 className="text-[15px] font-bold text-slate-900 dark:text-white leading-tight">
                    {historyProduct.code && <><span className="font-mono text-blue-600 dark:text-blue-400">{historyProduct.code}</span><span className="text-slate-400 dark:text-slate-500 mx-1.5">-</span></>}
                    {historyProduct.description}
                  </h3>
                  {historyProduct.shortName && (
                    <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-0.5">{historyProduct.shortName}</p>
                  )}
                  {(historyProduct.productType || historyProduct.productSubtype) && (
                    <div className="flex items-center gap-1.5 mt-1">
                      {historyProduct.productType && (
                        <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-700 text-[10px] font-semibold text-slate-600 dark:text-slate-300">{historyProduct.productType}</span>
                      )}
                      {historyProduct.productSubtype && (
                        <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-700 text-[10px] font-semibold text-slate-500 dark:text-slate-400">{historyProduct.productSubtype}</span>
                      )}
                    </div>
                  )}
                </div>
              </div>
              <button onClick={() => setHistoryProduct(null)} className="flex-shrink-0 ml-3 p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            {/* Tabs + Content */}
            <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">
              {/* Helper: summary stats */}
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
                  return Array.from(map.entries()).sort((a, b) => b[1].length - a[1].length);
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
                  blue: { bg: 'bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800/40', icon: 'text-blue-500', text: 'text-blue-700 dark:text-blue-300', badge: 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400', btn: 'text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20' },
                  amber: { bg: 'bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40', icon: 'text-amber-500', text: 'text-amber-700 dark:text-amber-300', badge: 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400', btn: 'text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20' },
                  purple: { bg: 'bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800/40', icon: 'text-purple-500', text: 'text-purple-700 dark:text-purple-300', badge: 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400', btn: 'text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20' },
                };

                const SummaryCards = ({ stats, color }: { stats: ReturnType<typeof calcStats>; color: 'blue' | 'amber' | 'purple' }) => {
                  const cm = colorMap[color];
                  return (
                  <div className="grid grid-cols-5 gap-2 mb-3">
                    {[
                      { label: 'Total', value: formatValue(stats.totalValue), icon: 'payments' },
                      { label: 'Qtde Total', value: formatQuantity(stats.totalQty), icon: 'inventory_2' },
                      { label: 'Notas', value: String(stats.invoiceCount), icon: 'receipt_long' },
                      { label: 'Último Preço', value: formatValue(stats.lastPrice), icon: 'trending_up' },
                      { label: 'Preço Médio', value: formatValue(stats.avgPrice), icon: 'analytics' },
                    ].map(c => (
                      <div key={c.label} className={`rounded-lg px-2.5 py-2 ${cm.bg}`}>
                        <div className="flex items-center gap-1 mb-0.5">
                          <span className={`material-symbols-outlined text-[12px] ${cm.icon}`}>{c.icon}</span>
                          <span className="text-[9px] uppercase tracking-wider text-slate-500 dark:text-slate-400 font-bold">{c.label}</span>
                        </div>
                        <div className={`text-[13px] font-bold ${cm.text}`}>{c.value}</div>
                      </div>
                    ))}
                  </div>
                  );
                };

                const HistoryTable = ({ items, nameKey, groupKey, color }: { items: HistoryItem[]; nameKey: 'supplierName' | 'customerName'; groupKey: string; color: 'blue' | 'amber' | 'purple' }) => {
                  const cm = colorMap[color];
                  const groups = groupBy(items, nameKey);

                  return (
                    <div className="space-y-2">
                      {groups.map(([name, rows], gi) => {
                        const gk = `${groupKey}-${name}`;
                        const isOpen = expandedGroups.has(gk) || (gi === 0 && !expandedGroups.has(`${gk}-closed`));
                        const isRowsExpanded = expandedRows.has(gk);
                        const visibleRows = isRowsExpanded ? rows : rows.slice(0, 3);
                        const remaining = rows.length - 3;

                        return (
                          <div key={gk} className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                            <button
                              className={`w-full flex items-center justify-between px-3 py-2 text-left transition-colors ${isOpen ? 'bg-white dark:bg-slate-800/80' : 'bg-slate-50 dark:bg-slate-800/40 hover:bg-slate-100 dark:hover:bg-slate-800/60'}`}
                              onClick={() => {
                                if (gi === 0) {
                                  // For first group, track explicit close
                                  const closedKey = `${gk}-closed`;
                                  if (isOpen) {
                                    setExpandedGroups(prev => { const n = new Set(prev); n.delete(gk); n.add(closedKey); return n; });
                                  } else {
                                    setExpandedGroups(prev => { const n = new Set(prev); n.add(gk); n.delete(closedKey); return n; });
                                  }
                                } else {
                                  toggleGroup(gk);
                                }
                              }}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <span className={`material-symbols-outlined text-[16px] transition-transform ${isOpen ? 'rotate-90' : ''} ${cm.icon}`}>chevron_right</span>
                                <span className="text-[12px] font-semibold text-slate-800 dark:text-white truncate">{name}</span>
                                <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold ${cm.badge}`}>{rows.length}</span>
                              </div>
                              <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">{formatValue(rows.reduce((s, r) => s + r.totalValue, 0))}</span>
                            </button>
                            {isOpen && (
                              <div className="overflow-x-auto">
                                <table className="w-full text-[11px]">
                                  <thead>
                                    <tr className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                                      <th className="px-2 py-1.5 text-left font-bold">Data</th>
                                      <th className="px-2 py-1.5 text-left font-bold">NF-e</th>
                                      <th className="px-2 py-1.5 text-right font-bold">Qtde</th>
                                      <th className="px-2 py-1.5 text-right font-bold">Vlr Unit.</th>
                                      <th className="px-2 py-1.5 text-right font-bold">Total</th>
                                      <th className="px-2 py-1.5 text-left font-bold">Lote</th>
                                      <th className="px-2 py-1.5 text-left font-bold">Validade</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                    {visibleRows.map((h, i) => (
                                      <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                                        <td className="px-2 py-1.5 text-slate-700 dark:text-slate-300 whitespace-nowrap">{formatDate(h.issueDate)}</td>
                                        <td className="px-2 py-1.5">
                                          <button
                                            onClick={() => { setHistoryProduct(null); setInvoiceModalId(h.invoiceId); }}
                                            className="text-primary hover:text-primary-dark hover:underline font-mono transition-colors"
                                          >
                                            {h.invoiceNumber || '-'}
                                          </button>
                                        </td>
                                        <td className="px-2 py-1.5 text-right font-medium text-slate-800 dark:text-white">{formatQuantity(h.quantity)}</td>
                                        <td className="px-2 py-1.5 text-right text-slate-600 dark:text-slate-400">{formatValue(h.unitPrice)}</td>
                                        <td className="px-2 py-1.5 text-right font-medium text-slate-800 dark:text-white">{formatValue(h.totalValue)}</td>
                                        <td className="px-2 py-1.5 text-slate-600 dark:text-slate-400 font-mono">
                                          <TruncatedCell text={h.batch || '-'} id={`${gk}-batch-${i}`} />
                                        </td>
                                        <td className="px-2 py-1.5 text-slate-600 dark:text-slate-400 whitespace-nowrap">
                                          <TruncatedCell text={h.expiry ? formatDate(h.expiry) : '-'} id={`${gk}-expiry-${i}`} />
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                                {remaining > 0 && (
                                  <button
                                    onClick={() => toggleRows(gk)}
                                    className={`w-full py-1.5 text-[11px] font-medium transition-colors ${cm.btn}`}
                                  >
                                    {isRowsExpanded ? 'Mostrar menos' : `Ver mais ${remaining} registro${remaining > 1 ? 's' : ''}`}
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

                const SectionCard = ({ sectionKey, defaultOpen, icon, iconColor, label, count, totalValue, loading, empty, emptyMsg, children }: {
                  sectionKey: string; defaultOpen: boolean; icon: string; iconColor: string; label: string; count: number; totalValue: number; loading: boolean; empty: boolean; emptyMsg: string; children: React.ReactNode;
                }) => {
                  const isOpen = isSectionOpen(sectionKey, defaultOpen);
                  return (
                    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-card-dark overflow-hidden">
                      <button
                        onClick={() => toggleSection(sectionKey, defaultOpen)}
                        className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <span className={`material-symbols-outlined text-[16px] transition-transform ${isOpen ? 'rotate-90' : ''} ${iconColor}`}>chevron_right</span>
                          <span className={`material-symbols-outlined text-[16px] ${iconColor}`}>{icon}</span>
                          <h4 className="text-[12px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">{label}</h4>
                          {count > 0 && (
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              iconColor.includes('blue') ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' :
                              iconColor.includes('amber') ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400' :
                              'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400'
                            }`}>{count}</span>
                          )}
                        </div>
                        {!loading && count > 0 && (
                          <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">{formatValue(totalValue)}</span>
                        )}
                      </button>
                      {isOpen && (
                        <div className="px-4 py-3 border-t border-slate-100 dark:border-slate-800">
                          {loading ? (
                            <div className="flex items-center gap-2 py-2 text-slate-400 text-[12px]">
                              <span className="material-symbols-outlined text-[16px] animate-spin">sync</span>
                              Carregando...
                            </div>
                          ) : empty ? (
                            <p className="text-[12px] text-slate-400 py-1">{emptyMsg}</p>
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
                    <SectionCard sectionKey="compras" defaultOpen={true} icon="shopping_cart" iconColor="text-blue-500" label="Histórico de Compras" count={purchaseHistory.length} totalValue={purchaseHistory.reduce((s, h) => s + h.totalValue, 0)} loading={loadingHistory} empty={purchaseHistory.length === 0} emptyMsg="Nenhum registro de compra encontrado.">
                      <SummaryCards stats={calcStats(purchaseHistory)} color="blue" />
                      <HistoryTable items={purchaseHistory} nameKey="supplierName" groupKey="purchase" color="blue" />
                    </SectionCard>

                    <SectionCard sectionKey="vendas" defaultOpen={true} icon="storefront" iconColor="text-amber-500" label="Histórico de Vendas" count={salesHistory.length} totalValue={salesHistory.reduce((s, h) => s + h.totalValue, 0)} loading={loadingSalesHistory} empty={salesHistory.length === 0} emptyMsg="Nenhum registro de venda encontrado.">
                      <SummaryCards stats={calcStats(salesHistory)} color="amber" />
                      <HistoryTable items={salesHistory} nameKey="customerName" groupKey="sales" color="amber" />
                    </SectionCard>

                    <SectionCard sectionKey="consig" defaultOpen={false} icon="swap_horiz" iconColor="text-purple-500" label="Movimentações (Consignação)" count={consignmentHistory.length} totalValue={consignmentHistory.reduce((s, h) => s + h.totalValue, 0)} loading={loadingConsignment} empty={consignmentHistory.length === 0} emptyMsg="Nenhuma movimentação de consignação encontrada.">
                      <SummaryCards stats={calcStats(consignmentHistory)} color="purple" />
                      <HistoryTable items={consignmentHistory} nameKey="customerName" groupKey="consignment" color="purple" />
                    </SectionCard>
                  </>
                );
              })()}
            </div>

            {/* Footer */}
            <div className="flex justify-end px-6 py-3 border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-card-dark">
              <button onClick={() => setHistoryProduct(null)} className="px-4 py-2 text-sm font-medium text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 transition-colors">Fechar</button>
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
    </>
  );
}
