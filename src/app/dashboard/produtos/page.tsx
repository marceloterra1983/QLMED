'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import Skeleton from '@/components/ui/Skeleton';
import { formatValue } from '@/lib/utils';
import { useRole } from '@/hooks/useRole';

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
  lastPrice: number;
  lastIssueDate: string | null;
  lastSaleDate: string | null;
  lastSalePrice: number | null;
  lastSupplierName?: string | null;
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

type SortField = 'description' | 'code' | 'ncm' | 'anvisa' | 'lastPrice' | 'lastIssueDate' | 'lastSaleDate' | 'supplier' | 'productType';

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
  const xlsInputRef = useRef<HTMLInputElement>(null);
  const openDataInputRef = useRef<HTMLInputElement>(null);
  const typesInputRef = useRef<HTMLInputElement>(null);

  // --- group collapsing ---
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const toggleGroup = (g: string) => setCollapsedGroups((prev) => { const n = new Set(prev); n.has(g) ? n.delete(g) : n.add(g); return n; });

  // --- product detail modal ---
  const [detailProduct, setDetailProduct] = useState<ProductRow | null>(null);
  const [detailAnvisa, setDetailAnvisa] = useState('');
  const [savingDetail, setSavingDetail] = useState(false);
  const [syncingRegistry, setSyncingRegistry] = useState(false);

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
    const ok = await saveAnvisa(detailProduct, detailAnvisa);
    setSavingDetail(false);
    if (ok) setDetailProduct(null);
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

      {/* ANVISA stats */}
      {!loading && meta?.anvisaStats && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-card-dark px-4 py-3 shadow-sm">
          <p className="text-[11px] uppercase tracking-wider text-slate-500 font-bold mb-2.5">Origem dos códigos ANVISA</p>
          <div className="flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-green-50 text-green-700 border border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800">
              <span className="material-symbols-outlined text-[14px]">description</span>
              XML da NF-e: {meta.anvisaStats.xml.toLocaleString('pt-BR')}
            </span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800">
              <span className="material-symbols-outlined text-[14px]">receipt_long</span>
              NF-e de saída: {meta.anvisaStats.issuedNfe.toLocaleString('pt-BR')}
            </span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-purple-50 text-purple-700 border border-purple-200 dark:bg-purple-900/20 dark:text-purple-400 dark:border-purple-800">
              <span className="material-symbols-outlined text-[14px]">auto_awesome</span>
              Catálogo ANVISA: {meta.anvisaStats.catalog.toLocaleString('pt-BR')}
            </span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800">
              <span className="material-symbols-outlined text-[14px]">edit</span>
              Manual: {meta.anvisaStats.manual.toLocaleString('pt-BR')}
            </span>
            <button
              onClick={() => { setOnlyMissing((v) => !v); }}
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
                onlyMissing
                  ? 'bg-red-600 text-white border-red-600'
                  : 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800 hover:bg-red-100'
              }`}
              title={onlyMissing ? 'Clique para remover filtro' : 'Clique para filtrar somente sem ANVISA'}
            >
              <span className="material-symbols-outlined text-[14px]">warning</span>
              Sem ANVISA: {meta.anvisaStats.missing.toLocaleString('pt-BR')}
              {!onlyMissing && <span className="material-symbols-outlined text-[12px] opacity-60">filter_alt</span>}
              {onlyMissing && <span className="material-symbols-outlined text-[12px]">filter_alt_off</span>}
            </button>
          </div>
        </div>
      )}

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
                <option value="supplier">Fornecedor</option>
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
          <table className="w-full text-left border-collapse min-w-[1140px]">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800 text-xs uppercase text-slate-500 dark:text-slate-400 font-bold tracking-wider">
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
                <th className="px-3 py-1.5 cursor-pointer group hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" onClick={() => handleSort('supplier')}>
                  <div className="flex items-center gap-1">Fornecedor <SortIcon field="supplier" /></div>
                </th>
                <th className="px-3 py-1.5 cursor-pointer group hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" onClick={() => handleSort('productType')}>
                  <div className="flex items-center gap-1">Tipo <SortIcon field="productType" /></div>
                </th>
                <th className="px-3 py-1.5 text-right cursor-pointer group hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" onClick={() => handleSort('lastIssueDate')}>
                  <div className="flex items-center justify-end gap-1">Última Compra <SortIcon field="lastIssueDate" /></div>
                </th>
                <th className="px-3 py-1.5 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {loading ? (
                Array.from({ length: 20 }).map((_, i) => (
                  <tr key={i}>
                    <td className="px-3 py-2"><Skeleton className="h-4 w-16" /></td>
                    <td className="px-3 py-2"><Skeleton className="h-4 w-52" /></td>
                    <td className="px-3 py-2"><Skeleton className="h-4 w-20" /></td>
                    <td className="px-3 py-2"><Skeleton className="h-4 w-24" /></td>
                    <td className="px-3 py-2"><Skeleton className="h-4 w-28" /></td>
                    <td className="px-3 py-2"><Skeleton className="h-4 w-20" /></td>
                    <td className="px-3 py-2"><Skeleton className="h-4 w-24 ml-auto" /></td>
                    <td className="px-3 py-2"><Skeleton className="h-4 w-8 mx-auto" /></td>
                  </tr>
                ))
              ) : visible.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-slate-400">
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
                            <td colSpan={8} className="px-3 py-1 bg-slate-100/80 dark:bg-slate-800/60 border-y border-slate-200 dark:border-slate-700">
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
                  <tr key={product.key} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors border-b border-slate-100 dark:border-slate-800/50">
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
                      <span className="text-[12px] text-slate-600 dark:text-slate-400">{product.lastSupplierName || '-'}</span>
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
                      <span className="text-[12px] font-medium text-slate-700 dark:text-slate-300">{formatDate(product.lastIssueDate)}</span>
                    </td>
                    <td className="px-3 py-1 text-center">
                      <button
                        onClick={() => { setDetailProduct(product); setDetailAnvisa(product.anvisa || ''); }}
                        className="p-1 rounded-lg text-slate-500 hover:text-primary hover:bg-primary/10 transition-colors"
                        title="Ver detalhes do produto"
                      >
                        <span className="material-symbols-outlined text-[18px]">visibility</span>
                      </button>
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

      {/* Product detail modal */}
      {detailProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={() => setDetailProduct(null)}>
          <div className="bg-white dark:bg-card-dark rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-start justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white leading-tight">{detailProduct.description}</h3>
                <p className="text-[11px] font-mono text-slate-400 mt-0.5">{detailProduct.code || 'Sem código'}</p>
              </div>
              <button onClick={() => setDetailProduct(null)} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            {/* Body */}
            <div className="px-6 py-4 space-y-4 overflow-y-auto flex-1">
              {/* Info grid */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg px-3 py-2.5">
                  <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-0.5">Unidade</p>
                  <p className="text-[13px] font-semibold text-slate-800 dark:text-white">{detailProduct.unit || '-'}</p>
                </div>
                <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg px-3 py-2.5">
                  <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-0.5">NCM</p>
                  <p className="text-[13px] font-mono font-semibold text-slate-800 dark:text-white">{detailProduct.ncm || '-'}</p>
                </div>
                <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg px-3 py-2.5">
                  <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-0.5">EAN</p>
                  <p className="text-[13px] font-mono font-semibold text-slate-800 dark:text-white">{detailProduct.ean || '-'}</p>
                </div>
                <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg px-3 py-2.5">
                  <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-0.5">Último Preço</p>
                  <p className="text-[13px] font-semibold text-slate-800 dark:text-white">{formatValue(detailProduct.lastPrice)}</p>
                </div>
                <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg px-3 py-2.5">
                  <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-0.5">Último Fornecedor</p>
                  <p className="text-[13px] font-semibold text-slate-800 dark:text-white">{detailProduct.lastSupplierName || '-'}</p>
                </div>
                {detailProduct.productType && (
                  <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg px-3 py-2.5">
                    <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-0.5">Tipo</p>
                    <p className="text-[13px] font-semibold text-slate-800 dark:text-white">{detailProduct.productType}</p>
                  </div>
                )}
                {detailProduct.productSubtype && (
                  <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg px-3 py-2.5">
                    <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-0.5">Subtipo</p>
                    <p className="text-[13px] font-semibold text-slate-800 dark:text-white">{detailProduct.productSubtype}</p>
                  </div>
                )}
                <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg px-3 py-2.5">
                  <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-0.5">Última Compra</p>
                  <p className="text-[13px] font-semibold text-slate-800 dark:text-white">{formatDate(detailProduct.lastIssueDate)}</p>
                </div>
                {detailProduct.anvisaMatchedProductName && (
                  <div className="col-span-2 bg-slate-50 dark:bg-slate-800/50 rounded-lg px-3 py-2.5">
                    <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-0.5">Produto ANVISA</p>
                    <p className="text-[12px] text-slate-700 dark:text-slate-300">{detailProduct.anvisaMatchedProductName}</p>
                  </div>
                )}
                {detailProduct.anvisaHolder && (
                  <div className="col-span-2 bg-slate-50 dark:bg-slate-800/50 rounded-lg px-3 py-2.5">
                    <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-0.5">Detentor do Registro</p>
                    <p className="text-[12px] text-slate-700 dark:text-slate-300">{detailProduct.anvisaHolder}</p>
                  </div>
                )}
                {detailProduct.anvisaManufacturer && (
                  <div className="col-span-2 bg-slate-50 dark:bg-slate-800/50 rounded-lg px-3 py-2.5">
                    <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-0.5">
                      Fabricante Legal{detailProduct.anvisaManufacturerCountry ? ` · ${detailProduct.anvisaManufacturerCountry}` : ''}
                    </p>
                    <p className="text-[12px] text-slate-700 dark:text-slate-300">{detailProduct.anvisaManufacturer}</p>
                  </div>
                )}
                {detailProduct.anvisaProcess && (
                  <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg px-3 py-2.5">
                    <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-0.5">Processo</p>
                    <p className="text-[12px] font-mono text-slate-700 dark:text-slate-300">{detailProduct.anvisaProcess}</p>
                  </div>
                )}
                {detailProduct.anvisaStatus && (
                  <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg px-3 py-2.5">
                    <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-0.5">Situação</p>
                    <p className={`text-[12px] font-semibold ${
                      detailProduct.anvisaStatus?.toLowerCase().includes('válid') ? 'text-green-600 dark:text-green-400' :
                      detailProduct.anvisaStatus?.toLowerCase().includes('vencid') ? 'text-red-600 dark:text-red-400' :
                      detailProduct.anvisaStatus?.toLowerCase().includes('cancel') ? 'text-red-600 dark:text-red-400' :
                      'text-slate-700 dark:text-slate-300'
                    }`}>{detailProduct.anvisaStatus}</p>
                  </div>
                )}
                {(detailProduct.anvisaExpiration || detailProduct.anvisaStatus) && (
                  <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg px-3 py-2.5">
                    <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-0.5">Vencimento</p>
                    <p className="text-[12px] font-semibold text-slate-700 dark:text-slate-300">
                      {detailProduct.anvisaExpiration ? formatDate(detailProduct.anvisaExpiration) : 'Vigente'}
                    </p>
                  </div>
                )}
                {detailProduct.anvisaRiskClass && (
                  <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg px-3 py-2.5">
                    <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-0.5">Classe de Risco</p>
                    <p className="text-[12px] font-semibold text-slate-700 dark:text-slate-300">{detailProduct.anvisaRiskClass}</p>
                  </div>
                )}
              </div>

              {/* ANVISA registry sync */}
              {detailProduct.anvisa && (
                <button
                  onClick={() => handleSyncRegistry(detailProduct)}
                  disabled={syncingRegistry}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 border border-teal-200 dark:border-teal-800 rounded-lg text-sm font-medium text-teal-700 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-900/20 transition-colors disabled:opacity-60"
                >
                  <span className={`material-symbols-outlined text-[18px] ${syncingRegistry ? 'animate-spin' : ''}`}>
                    {syncingRegistry ? 'sync' : 'verified'}
                  </span>
                  {syncingRegistry ? 'Consultando ANVISA...' : 'Buscar dados do registro na ANVISA'}
                </button>
              )}

              {/* ANVISA edit */}
              {canWrite && (
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                    Código ANVISA
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={detailAnvisa}
                      onChange={(e) => setDetailAnvisa(e.target.value)}
                      maxLength={13}
                      placeholder="11 dígitos numéricos"
                      className="flex-1 px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-900/50 text-slate-900 dark:text-white font-mono text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
                    />
                    <button
                      onClick={handleSaveDetail}
                      disabled={savingDetail || detailAnvisa === (detailProduct.anvisa || '')}
                      className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-bold hover:bg-primary-dark transition-colors disabled:opacity-40"
                    >
                      {savingDetail ? 'Salvando...' : 'Salvar'}
                    </button>
                    {detailAnvisa && (
                      <button
                        onClick={() => setDetailAnvisa('')}
                        className="px-3 py-2 border border-red-200 dark:border-red-800 text-red-500 rounded-lg text-sm hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                        title="Remover código ANVISA"
                      >
                        <span className="material-symbols-outlined text-[18px]">delete</span>
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
