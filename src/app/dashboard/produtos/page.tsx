'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import Skeleton from '@/components/ui/Skeleton';
import { formatCnpj, formatDate, formatValue } from '@/lib/utils';

interface ProductRow {
  key: string;
  code: string;
  description: string;
  unit: string;
  anvisa: string | null;
  totalQuantity: number;
  invoiceCount: number;
  lastIssueDate: string | null;
  lastPrice: number;
  lastSupplierName: string | null;
  lastSupplierCnpj: string | null;
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
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
  meta?: {
    invoicesLimited?: boolean;
    maxInvoices?: number;
  };
}

type ProductSortField =
  | 'lastIssue'
  | 'description'
  | 'code'
  | 'anvisa'
  | 'unit'
  | 'quantity'
  | 'invoices'
  | 'lastPrice'
  | 'supplier';

function formatQuantity(value: number) {
  return value.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 4 });
}

function formatDocument(document: string | null) {
  const digits = (document || '').replace(/\D/g, '');
  if (digits.length === 14) return formatCnpj(digits);
  return document || '-';
}

export default function ProdutosPage() {
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [summary, setSummary] = useState<ProductsSummary>({
    totalProducts: 0,
    productsWithAnvisa: 0,
    totalQuantity: 0,
    invoicesProcessed: 0,
  });
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [limit, setLimit] = useState(50);
  const [sortBy, setSortBy] = useState<ProductSortField>('lastIssue');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [meta, setMeta] = useState<{ invoicesLimited?: boolean; maxInvoices?: number } | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    loadProducts();
  }, [page, limit, search, sortBy, sortOrder]);

  const loadProducts = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
        sort: sortBy,
        order: sortOrder,
      });
      if (search) params.set('search', search);

      const res = await fetch(`/api/products?${params.toString()}`);
      if (!res.ok) {
        throw new Error('Falha ao carregar produtos');
      }

      const data = (await res.json()) as ProductsResponse;
      setProducts(data.products || []);
      setSummary(
        data.summary || {
          totalProducts: 0,
          productsWithAnvisa: 0,
          totalQuantity: 0,
          invoicesProcessed: 0,
        },
      );
      setTotalPages(data.pagination?.pages || 1);
      setTotal(data.pagination?.total || 0);
      setMeta(data.meta || null);

      if (data.pagination?.page && data.pagination.page !== page) {
        setPage(data.pagination.page);
      }
    } catch {
      toast.error('Erro ao carregar produtos');
    } finally {
      setLoading(false);
    }
  };

  const handleSort = (field: ProductSortField) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
      return;
    }

    setSortBy(field);
    if (field === 'description' || field === 'code' || field === 'anvisa' || field === 'unit' || field === 'supplier') {
      setSortOrder('asc');
    } else {
      setSortOrder('desc');
    }
  };

  const getSortIcon = (field: ProductSortField) => {
    if (sortBy !== field) {
      return (
        <span className="material-symbols-outlined text-[16px] text-slate-300 opacity-0 group-hover:opacity-50">
          unfold_more
        </span>
      );
    }

    return (
      <span className="material-symbols-outlined text-[16px] text-primary">
        {sortOrder === 'asc' ? 'expand_less' : 'expand_more'}
      </span>
    );
  };

  const clearFilters = () => {
    setSearchInput('');
    setSearch('');
    setSortBy('lastIssue');
    setSortOrder('desc');
    setPage(1);
  };

  const handleExport = () => {
    if (products.length === 0) return;

    const headers = [
      'Codigo',
      'Produto',
      'ANVISA',
      'Unidade',
      'Qtde Comprada',
      'Qtde NF-e',
      'Ultimo Preco',
      'Ultima NF-e',
      'Ultimo Fornecedor',
    ];
    const rows = products.map((product) => [
      product.code,
      product.description,
      product.anvisa || '',
      product.unit,
      formatQuantity(product.totalQuantity),
      product.invoiceCount.toLocaleString('pt-BR'),
      formatValue(product.lastPrice),
      product.lastIssueDate ? formatDate(product.lastIssueDate) : '',
      product.lastSupplierName || '',
    ]);

    const csvContent = '\uFEFF' + [headers.join(';'), ...rows.map((row) => row.join(';'))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `produtos-entrada-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success('Lista exportada com sucesso');
  };

  return (
    <>
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

        <div className="flex items-center gap-3">
          <button
            onClick={loadProducts}
            className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-primary to-primary-dark hover:from-primary-dark hover:to-primary text-white rounded-lg text-sm font-bold transition-all shadow-md shadow-primary/30"
          >
            <span className="material-symbols-outlined text-[20px]">sync</span>
            Atualizar
          </button>
          <button
            onClick={handleExport}
            disabled={products.length === 0}
            className="flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-card-dark border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 transition-colors shadow-sm disabled:opacity-40"
          >
            <span className="material-symbols-outlined text-[20px]">download</span>
            Exportar
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-card-dark px-4 py-3">
          <p className="text-[11px] uppercase tracking-wider text-slate-500">Produtos únicos</p>
          <p className="text-lg font-bold text-slate-900 dark:text-white">{summary.totalProducts.toLocaleString('pt-BR')}</p>
        </div>
        <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-card-dark px-4 py-3">
          <p className="text-[11px] uppercase tracking-wider text-slate-500">Com ANVISA</p>
          <p className="text-lg font-bold text-slate-900 dark:text-white">{summary.productsWithAnvisa.toLocaleString('pt-BR')}</p>
        </div>
        <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-card-dark px-4 py-3">
          <p className="text-[11px] uppercase tracking-wider text-slate-500">Qtde comprada</p>
          <p className="text-lg font-bold text-slate-900 dark:text-white">{formatQuantity(summary.totalQuantity)}</p>
        </div>
        <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-card-dark px-4 py-3">
          <p className="text-[11px] uppercase tracking-wider text-slate-500">NF-e processadas</p>
          <p className="text-lg font-bold text-slate-900 dark:text-white">{summary.invoicesProcessed.toLocaleString('pt-BR')}</p>
        </div>
      </div>

      <div className="bg-white dark:bg-card-dark border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
          <div className="md:col-span-4">
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
              Buscar por código, descrição ou ANVISA
            </label>
            <input
              type="text"
              placeholder="ex: 7891234567890 ou dipirona"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="block w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-900/50 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary text-sm transition-all"
            />
          </div>

          <button
            onClick={clearFilters}
            className="flex items-center justify-center gap-2 px-4 py-2 bg-white dark:bg-card-dark border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 transition-colors shadow-sm"
          >
            <span className="material-symbols-outlined text-[18px]">filter_alt_off</span>
            Limpar
          </button>
        </div>
      </div>

      {meta?.invoicesLimited && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-700 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
          A listagem está limitada às {meta.maxInvoices?.toLocaleString('pt-BR') || 3000} NF-e de entrada mais recentes para manter desempenho.
        </div>
      )}

      <div className="bg-white dark:bg-card-dark border border-slate-200 dark:border-slate-800 rounded-xl shadow-lg shadow-slate-200/50 dark:shadow-none overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[1200px]">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800 text-xs uppercase text-slate-500 dark:text-slate-400 font-bold tracking-wider">
                <th className="px-3 py-2.5 cursor-pointer group hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" onClick={() => handleSort('lastIssue')}>
                  <div className="flex items-center gap-1">Última NF-e {getSortIcon('lastIssue')}</div>
                </th>
                <th className="px-3 py-2.5 cursor-pointer group hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" onClick={() => handleSort('code')}>
                  <div className="flex items-center gap-1">Código {getSortIcon('code')}</div>
                </th>
                <th className="px-3 py-2.5 cursor-pointer group hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" onClick={() => handleSort('description')}>
                  <div className="flex items-center gap-1">Produto {getSortIcon('description')}</div>
                </th>
                <th className="px-3 py-2.5 cursor-pointer group hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" onClick={() => handleSort('anvisa')}>
                  <div className="flex items-center gap-1">ANVISA {getSortIcon('anvisa')}</div>
                </th>
                <th className="px-3 py-2.5 cursor-pointer group hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" onClick={() => handleSort('unit')}>
                  <div className="flex items-center gap-1">Unidade {getSortIcon('unit')}</div>
                </th>
                <th className="px-3 py-2.5 text-right cursor-pointer group hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" onClick={() => handleSort('quantity')}>
                  <div className="flex items-center justify-end gap-1">Qtde. Comprada {getSortIcon('quantity')}</div>
                </th>
                <th className="px-3 py-2.5 text-right cursor-pointer group hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" onClick={() => handleSort('invoices')}>
                  <div className="flex items-center justify-end gap-1">Qtde. NF-e {getSortIcon('invoices')}</div>
                </th>
                <th className="px-3 py-2.5 text-right cursor-pointer group hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" onClick={() => handleSort('lastPrice')}>
                  <div className="flex items-center justify-end gap-1">Último Preço {getSortIcon('lastPrice')}</div>
                </th>
                <th className="px-3 py-2.5 cursor-pointer group hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" onClick={() => handleSort('supplier')}>
                  <div className="flex items-center gap-1">Último Fornecedor {getSortIcon('supplier')}</div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {loading ? (
                Array.from({ length: limit }).map((_, index) => (
                  <tr key={index}>
                    <td className="px-3 py-2"><Skeleton className="h-4 w-20" /></td>
                    <td className="px-3 py-2"><Skeleton className="h-4 w-16" /></td>
                    <td className="px-3 py-2"><Skeleton className="h-4 w-52" /></td>
                    <td className="px-3 py-2"><Skeleton className="h-4 w-24" /></td>
                    <td className="px-3 py-2"><Skeleton className="h-4 w-12" /></td>
                    <td className="px-3 py-2"><Skeleton className="h-4 w-20 ml-auto" /></td>
                    <td className="px-3 py-2"><Skeleton className="h-4 w-20 ml-auto" /></td>
                    <td className="px-3 py-2"><Skeleton className="h-4 w-20 ml-auto" /></td>
                    <td className="px-3 py-2"><Skeleton className="h-4 w-40" /></td>
                  </tr>
                ))
              ) : products.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-6 py-12 text-center text-slate-400">
                    <span className="material-symbols-outlined text-[48px] opacity-30">inventory_2</span>
                    <p className="mt-2 text-sm font-medium">Nenhum produto encontrado</p>
                    <p className="text-xs mt-1">A lista é montada automaticamente a partir das NF-e de entrada.</p>
                  </td>
                </tr>
              ) : (
                products.map((product) => (
                  <tr key={product.key} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="px-3 py-2">
                      <span className="text-[13px] font-medium text-slate-700 dark:text-slate-300">
                        {product.lastIssueDate ? formatDate(product.lastIssueDate) : '-'}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span className="text-[12px] font-mono font-semibold text-slate-900 dark:text-white">{product.code || '-'}</span>
                    </td>
                    <td className="px-3 py-2">
                      <span className="text-[13px] font-semibold text-slate-900 dark:text-white">{product.description}</span>
                    </td>
                    <td className="px-3 py-2">
                      <span className="text-[12px] font-mono text-slate-700 dark:text-slate-300">{product.anvisa || '-'}</span>
                    </td>
                    <td className="px-3 py-2">
                      <span className="text-[12px] font-medium text-slate-700 dark:text-slate-300">{product.unit || '-'}</span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <span className="text-[13px] font-bold text-slate-900 dark:text-white">{formatQuantity(product.totalQuantity)}</span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <span className="text-[13px] font-bold text-slate-900 dark:text-white">{product.invoiceCount.toLocaleString('pt-BR')}</span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <span className="text-[13px] font-bold font-mono text-slate-900 dark:text-white">{formatValue(product.lastPrice)}</span>
                    </td>
                    <td className="px-3 py-2">
                      <div className="text-[13px] font-semibold text-slate-900 dark:text-white">{product.lastSupplierName || '-'}</div>
                      <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400">{formatDocument(product.lastSupplierCnpj)}</div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/30 dark:bg-slate-800/20">
          <div className="flex items-center gap-3">
            <span className="text-sm text-slate-500">Mostrando {products.length} de {total} resultados</span>
            <select
              value={limit}
              onChange={(e) => {
                setLimit(Number(e.target.value));
                setPage(1);
              }}
              className="px-2 py-1 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-sm text-slate-600 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              <option value={25}>25 / página</option>
              <option value={50}>50 / página</option>
              <option value={100}>100 / página</option>
            </select>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(1)}
              disabled={page === 1}
              className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-40"
              title="Primeira página"
              aria-label="Primeira página"
            >
              <span className="material-symbols-outlined text-[20px]">first_page</span>
            </button>
            <button
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page === 1}
              className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-40"
              aria-label="Página anterior"
            >
              <span className="material-symbols-outlined text-[20px]">chevron_left</span>
            </button>

            {(() => {
              const pages: number[] = [];
              let start = Math.max(1, page - 2);
              let end = Math.min(totalPages, start + 4);
              start = Math.max(1, end - 4);
              for (let i = start; i <= end; i++) pages.push(i);
              return pages.map((p) => (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={`w-9 h-9 flex items-center justify-center rounded-lg text-sm font-bold transition-colors ${
                    p === page
                      ? 'bg-primary text-white shadow-md shadow-primary/30'
                      : 'border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700'
                  }`}
                >
                  {p}
                </button>
              ));
            })()}

            <button
              onClick={() => setPage(Math.min(totalPages, page + 1))}
              disabled={page === totalPages}
              className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-40"
              aria-label="Próxima página"
            >
              <span className="material-symbols-outlined text-[20px]">chevron_right</span>
            </button>
            <button
              onClick={() => setPage(totalPages)}
              disabled={page === totalPages}
              className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-40"
              title="Última página"
              aria-label="Última página"
            >
              <span className="material-symbols-outlined text-[20px]">last_page</span>
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
