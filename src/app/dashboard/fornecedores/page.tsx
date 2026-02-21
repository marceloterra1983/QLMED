'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import Skeleton from '@/components/ui/Skeleton';
import SupplierDetailsModal from '@/components/SupplierDetailsModal';
import SupplierPriceTableModal from '@/components/SupplierPriceTableModal';
import { formatCnpj, formatDate } from '@/lib/utils';

interface Supplier {
  cnpj: string;
  name: string;
  lastIssueDate: string | null;
}

interface SupplierPriceMetaResponse {
  meta?: {
    totalPriceRows?: number;
  };
}

function formatDocument(document: string) {
  const digits = (document || '').replace(/\D/g, '');
  if (digits.length === 14) return formatCnpj(digits);
  if (digits.length === 11) {
    return digits
      .replace(/^(\d{3})(\d)/, '$1.$2')
      .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/\.(\d{3})(\d)/, '.$1-$2');
  }
  return document || 'Sem documento';
}

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [limit, setLimit] = useState(20);
  const [sortBy, setSortBy] = useState('lastIssue');
  const [sortOrder, setSortOrder] = useState('desc');
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [selectedPriceSupplier, setSelectedPriceSupplier] = useState<Supplier | null>(null);
  const [isPriceTableOpen, setIsPriceTableOpen] = useState(false);
  const [priceItemsCountMap, setPriceItemsCountMap] = useState<Record<string, number | null>>({});
  const [priceItemsLoadingMap, setPriceItemsLoadingMap] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    loadSuppliers();
  }, [page, limit, search, sortBy, sortOrder]);

  const getSupplierKey = (supplier: Supplier) => `${(supplier.cnpj || '').replace(/\D/g, '')}::${supplier.name}`;

  const fetchSupplierPriceItemsCount = async (supplier: Supplier): Promise<number | null> => {
    const params = new URLSearchParams();
    if (supplier.cnpj) params.set('cnpj', supplier.cnpj);
    if (supplier.name) params.set('name', supplier.name);
    params.set('metaOnly', '1');

    const res = await fetch(`/api/suppliers/details?${params.toString()}`);
    if (!res.ok) return null;

    const data = (await res.json()) as SupplierPriceMetaResponse;
    return typeof data?.meta?.totalPriceRows === 'number' ? data.meta.totalPriceRows : null;
  };

  useEffect(() => {
    if (suppliers.length === 0) return;

    const missingSuppliers = suppliers.filter((supplier) => {
      const key = getSupplierKey(supplier);
      return priceItemsCountMap[key] === undefined && !priceItemsLoadingMap[key];
    });

    if (missingSuppliers.length === 0) return;

    let cancelled = false;

    setPriceItemsLoadingMap((prev) => {
      const next = { ...prev };
      for (const supplier of missingSuppliers) {
        next[getSupplierKey(supplier)] = true;
      }
      return next;
    });

    const loadCounts = async () => {
      await Promise.all(
        missingSuppliers.map(async (supplier) => {
          const key = getSupplierKey(supplier);
          let count: number | null = null;

          try {
            count = await fetchSupplierPriceItemsCount(supplier);
          } catch {
            count = null;
          }

          if (cancelled) return;

          setPriceItemsCountMap((prev) => ({ ...prev, [key]: count }));
          setPriceItemsLoadingMap((prev) => ({ ...prev, [key]: false }));
        }),
      );
    };

    loadCounts();

    return () => {
      cancelled = true;
    };
  }, [suppliers, priceItemsCountMap, priceItemsLoadingMap]);

  const loadSuppliers = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
        sort: sortBy,
        order: sortOrder,
      });
      if (search) params.set('search', search);

      const res = await fetch(`/api/suppliers?${params}`);
      if (!res.ok) {
        throw new Error('Falha ao carregar fornecedores');
      }

      const data = await res.json();
      setSuppliers(data.suppliers || []);
      setTotalPages(data.pagination?.pages || 1);
      setTotal(data.pagination?.total || 0);
      if (data.pagination?.page && data.pagination.page !== page) {
        setPage(data.pagination.page);
      }
    } catch {
      toast.error('Erro ao carregar cadastro de fornecedores');
    } finally {
      setLoading(false);
    }
  };

  const handleSort = (field: string) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
      return;
    }

    setSortBy(field);
    if (field === 'name') {
      setSortOrder('asc');
    } else {
      setSortOrder('desc');
    }
  };

  const getSortIcon = (field: string) => {
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
    if (suppliers.length === 0) return;

    const headers = ['Fornecedor', 'CNPJ/CPF', 'Última NF-e'];
    const rows = suppliers.map((supplier) => [
      supplier.name,
      formatDocument(supplier.cnpj),
      supplier.lastIssueDate ? formatDate(supplier.lastIssueDate) : '-',
    ]);

    const csvContent = '\uFEFF' + [headers.join(';'), ...rows.map((row) => row.join(';'))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `fornecedores-nfe-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success('Cadastro exportado com sucesso');
  };

  const buildSupplierDetailsUrl = (supplier: Supplier) => {
    const params = new URLSearchParams();
    if (supplier.cnpj) params.set('cnpj', supplier.cnpj);
    if (supplier.name) params.set('name', supplier.name);
    return `/dashboard/fornecedores/detalhes?${params.toString()}`;
  };

  const openSupplierInNewTab = (supplier: Supplier) => {
    const url = buildSupplierDetailsUrl(supplier);
    const newTab = window.open(url, '_blank', 'noopener,noreferrer');

    if (!newTab) {
      toast.error('Não foi possível abrir nova aba. Verifique se o navegador bloqueou pop-ups.');
    }
  };

  return (
    <>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-[28px] text-primary">storefront</span>
          <div>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
              Fornecedores
            </h2>
            <p className="text-slate-500 dark:text-slate-400 text-xs font-medium">
              Captura automática dos fornecedores que enviaram NF-e para sua empresa
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={loadSuppliers}
            className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-primary to-primary-dark hover:from-primary-dark hover:to-primary text-white rounded-lg text-sm font-bold transition-all shadow-md shadow-primary/30"
          >
            <span className="material-symbols-outlined text-[20px]">sync</span>
            Atualizar
          </button>
          <button
            onClick={handleExport}
            disabled={suppliers.length === 0}
            className="flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-card-dark border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 transition-colors shadow-sm disabled:opacity-40"
          >
            <span className="material-symbols-outlined text-[20px]">download</span>
            Exportar
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-card-dark border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
          <div className="md:col-span-3">
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
              Buscar por CNPJ/CPF ou Nome do Fornecedor
            </label>
            <input
              type="text"
              placeholder="ex: 00.000.000/0001-91"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="block w-full px-3 py-2.5 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-900/50 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary text-sm transition-all"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
              Ordenar por
            </label>
            <select
              value={sortBy}
              onChange={(e) => {
                const next = e.target.value;
                setSortBy(next);
                setSortOrder(next === 'name' ? 'asc' : 'desc');
                setPage(1);
              }}
              className="block w-full px-3 py-2.5 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-900/50 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary text-sm transition-all"
            >
              <option value="name">Nome</option>
              <option value="lastIssue">Última NF-e</option>
            </select>
          </div>

          <button
            onClick={clearFilters}
            className="flex items-center justify-center gap-2 px-4 py-2.5 bg-white dark:bg-card-dark border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 transition-colors shadow-sm"
          >
            <span className="material-symbols-outlined text-[18px]">filter_alt_off</span>
            Limpar
          </button>
        </div>
      </div>

      <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl px-4 py-3">
        <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
          As informações dos fornecedores são exibidas a partir de 2021.
        </p>
      </div>

      <div className="bg-white dark:bg-card-dark border border-slate-200 dark:border-slate-800 rounded-xl shadow-lg shadow-slate-200/50 dark:shadow-none overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[840px]">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800 text-xs uppercase text-slate-500 dark:text-slate-400 font-bold tracking-wider">
                <th
                  className="px-4 py-3 cursor-pointer group hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  onClick={() => handleSort('name')}
                >
                  <div className="flex items-center gap-1">Fornecedor {getSortIcon('name')}</div>
                </th>
                <th
                  className="px-4 py-3 cursor-pointer group hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  onClick={() => handleSort('lastIssue')}
                >
                  <div className="flex items-center gap-1">Última NF-e {getSortIcon('lastIssue')}</div>
                </th>
                <th className="px-4 py-3 text-center">Tabela de Preço</th>
                <th className="px-4 py-3 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {loading ? (
                Array.from({ length: limit }).map((_, index) => (
                  <tr key={index}>
                    <td className="px-4 py-2.5"><Skeleton className="h-4 w-56" /></td>
                    <td className="px-4 py-2.5"><Skeleton className="h-4 w-24" /></td>
                    <td className="px-4 py-2.5"><Skeleton className="h-4 w-28 mx-auto" /></td>
                    <td className="px-4 py-2.5"><Skeleton className="h-4 w-16 mx-auto" /></td>
                  </tr>
                ))
              ) : suppliers.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-slate-400">
                    <span className="material-symbols-outlined text-[48px] opacity-30">storefront</span>
                    <p className="mt-2 text-sm font-medium">Nenhum fornecedor encontrado</p>
                    <p className="text-xs mt-1">
                      Os fornecedores aparecem automaticamente quando houver NF-e recebidas.
                    </p>
                  </td>
                </tr>
              ) : (
                suppliers.map((supplier) => (
                  <tr key={`${supplier.cnpj}-${supplier.name}`} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                    {(() => {
                      const supplierKey = getSupplierKey(supplier);
                      const itemCount = priceItemsCountMap[supplierKey];
                      const isItemCountLoading = priceItemsLoadingMap[supplierKey];

                      return (
                        <>
                          <td className="px-4 py-2.5">
                            <div className="text-[13px] font-bold leading-tight text-slate-900 dark:text-white">{supplier.name}</div>
                            <div className="text-[11px] font-mono leading-tight text-slate-500 dark:text-slate-400">
                              {formatDocument(supplier.cnpj)}
                            </div>
                          </td>
                          <td className="px-4 py-2.5">
                            <span className="text-[13px] font-medium text-slate-700 dark:text-slate-300">
                              {supplier.lastIssueDate ? formatDate(supplier.lastIssueDate) : '-'}
                            </span>
                          </td>
                          <td className="px-4 py-2.5">
                            <div className="flex items-center justify-center gap-2">
                              <span className="text-[12px] font-bold text-slate-800 dark:text-slate-200">
                                {isItemCountLoading
                                  ? '...'
                                  : itemCount === null || itemCount === undefined
                                    ? '-'
                                    : `${itemCount.toLocaleString('pt-BR')} itens`}
                              </span>
                              <button
                                onClick={() => {
                                  setSelectedPriceSupplier(supplier);
                                  setIsPriceTableOpen(true);
                                }}
                                className="p-2 rounded-lg text-slate-500 hover:text-primary hover:bg-primary/10 transition-colors"
                                title="Visualizar itens da tabela de preço"
                                aria-label="Visualizar itens da tabela de preço"
                              >
                                <span className="material-symbols-outlined text-[20px]">table_view</span>
                              </button>
                            </div>
                          </td>
                          <td className="px-4 py-2.5">
                            <div className="flex items-center justify-center gap-1">
                              <button
                                onClick={() => {
                                  setSelectedSupplier(supplier);
                                  setIsDetailsOpen(true);
                                }}
                                className="p-2 rounded-lg text-slate-500 hover:text-primary hover:bg-primary/10 transition-colors"
                                title="Visualizar cadastro do fornecedor"
                                aria-label="Visualizar cadastro do fornecedor"
                              >
                                <span className="material-symbols-outlined text-[20px]">visibility</span>
                              </button>
                              <button
                                onClick={() => openSupplierInNewTab(supplier)}
                                className="p-2 rounded-lg text-slate-500 hover:text-primary hover:bg-primary/10 transition-colors"
                                title="Abrir detalhes em nova aba"
                                aria-label="Abrir detalhes em nova aba"
                              >
                                <span className="material-symbols-outlined text-[20px]">open_in_new</span>
                              </button>
                            </div>
                          </td>
                        </>
                      );
                    })()}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/30 dark:bg-slate-800/20">
          <div className="flex items-center gap-3">
            <span className="text-sm text-slate-500">Mostrando {suppliers.length} de {total} resultados</span>
            <select
              value={limit}
              onChange={(e) => {
                setLimit(Number(e.target.value));
                setPage(1);
              }}
              className="px-2 py-1 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-sm text-slate-600 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              <option value={20}>20 / página</option>
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

              for (let index = start; index <= end; index++) pages.push(index);

              return pages.map((pageNumber) => (
                <button
                  key={pageNumber}
                  onClick={() => setPage(pageNumber)}
                  className={`w-9 h-9 flex items-center justify-center rounded-lg text-sm font-bold transition-colors ${
                    pageNumber === page
                      ? 'bg-primary text-white shadow-md shadow-primary/30'
                      : 'border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700'
                  }`}
                >
                  {pageNumber}
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
      <SupplierDetailsModal
        isOpen={isDetailsOpen}
        onClose={() => setIsDetailsOpen(false)}
        supplier={selectedSupplier ? { cnpj: selectedSupplier.cnpj, name: selectedSupplier.name } : null}
      />
      <SupplierPriceTableModal
        isOpen={isPriceTableOpen}
        onClose={() => setIsPriceTableOpen(false)}
        supplier={selectedPriceSupplier ? { cnpj: selectedPriceSupplier.cnpj, name: selectedPriceSupplier.name } : null}
      />
    </>
  );
}
