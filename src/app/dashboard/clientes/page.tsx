'use client';

import React, { useEffect, useState, useRef } from 'react';
import { toast } from 'sonner';
import Skeleton from '@/components/ui/Skeleton';
import CustomerDetailsModal from '@/components/CustomerDetailsModal';
import CustomerPriceTableModal from '@/components/CustomerPriceTableModal';
import { formatCnpj, formatDate, getDateGroupLabel } from '@/lib/utils';

interface Customer {
  cnpj: string;
  name: string;
  lastIssueDate: string | null;
}

interface CustomerPriceMetaResponse {
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

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [limit, setLimit] = useState(50);
  const [sortBy, setSortBy] = useState('lastIssue');
  const [sortOrder, setSortOrder] = useState('desc');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [selectedPriceCustomer, setSelectedPriceCustomer] = useState<Customer | null>(null);
  const [isPriceTableOpen, setIsPriceTableOpen] = useState(false);
  const [priceItemsCountMap, setPriceItemsCountMap] = useState<Record<string, number | null>>({});
  const [priceItemsLoadingMap, setPriceItemsLoadingMap] = useState<Record<string, boolean>>({});
  const priceItemsInFlightRef = useRef<Set<string>>(new Set());
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  const toggleGroup = (group: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    loadCustomers();
  }, [page, limit, search, sortBy, sortOrder]);

  const getCustomerKey = (customer: Customer) => `${(customer.cnpj || '').replace(/\D/g, '')}::${customer.name}`;

  const fetchCustomerPriceItemsCount = async (customer: Customer): Promise<number | null> => {
    const params = new URLSearchParams();
    if (customer.cnpj) params.set('cnpj', customer.cnpj);
    if (customer.name) params.set('name', customer.name);
    params.set('metaOnly', '1');

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120000);

    try {
      const res = await fetch(`/api/customers/details?${params.toString()}`, {
        signal: controller.signal,
        cache: 'no-store',
      });
      if (!res.ok) return null;

      const data = (await res.json()) as CustomerPriceMetaResponse;
      if (typeof data?.meta?.totalPriceRows === 'number') return data.meta.totalPriceRows;
      return null;
    } catch {
      return null;
    } finally {
      clearTimeout(timeoutId);
    }
  };

  useEffect(() => {
    if (customers.length === 0) return;

    const missingCustomers = customers.filter((customer) => {
      const key = getCustomerKey(customer);
      return priceItemsCountMap[key] === undefined && !priceItemsInFlightRef.current.has(key);
    });

    if (missingCustomers.length === 0) return;

    for (const customer of missingCustomers) {
      priceItemsInFlightRef.current.add(getCustomerKey(customer));
    }

    setPriceItemsLoadingMap((prev) => {
      const next = { ...prev };
      for (const customer of missingCustomers) {
        next[getCustomerKey(customer)] = true;
      }
      return next;
    });

    const loadCounts = async () => {
      const CONCURRENCY = 3;

      for (let index = 0; index < missingCustomers.length; index += CONCURRENCY) {
        const batch = missingCustomers.slice(index, index + CONCURRENCY);
        const countsUpdate: Record<string, number | null> = {};
        const loadingUpdate: Record<string, boolean> = {};

        await Promise.all(
          batch.map(async (customer) => {
            const key = getCustomerKey(customer);
            let count: number | null = null;

            try {
              count = await fetchCustomerPriceItemsCount(customer);
            } catch {
              count = null;
            }

            countsUpdate[key] = count;
            loadingUpdate[key] = false;
            priceItemsInFlightRef.current.delete(key);
          }),
        );

        setPriceItemsCountMap((prev) => ({ ...prev, ...countsUpdate }));
        setPriceItemsLoadingMap((prev) => ({ ...prev, ...loadingUpdate }));
      }
    };

    loadCounts();
  }, [customers]);

  const loadCustomers = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
        sort: sortBy,
        order: sortOrder,
      });
      if (search) params.set('search', search);

      const res = await fetch(`/api/customers?${params}`);
      if (!res.ok) {
        throw new Error('Falha ao carregar clientes');
      }

      const data = await res.json();
      setCustomers(data.customers || []);
      setTotalPages(data.pagination?.pages || 1);
      setTotal(data.pagination?.total || 0);
      if (data.pagination?.page && data.pagination.page !== page) {
        setPage(data.pagination.page);
      }
    } catch {
      toast.error('Erro ao carregar cadastro de clientes');
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
    if (customers.length === 0) return;

    const headers = ['Cliente', 'CNPJ/CPF', 'Última NF-e'];
    const rows = customers.map((customer) => [
      customer.name,
      formatDocument(customer.cnpj),
      customer.lastIssueDate ? formatDate(customer.lastIssueDate) : '-',
    ]);

    const csvContent = '\uFEFF' + [headers.join(';'), ...rows.map((row) => row.join(';'))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `clientes-nfe-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success('Cadastro exportado com sucesso');
  };

  const buildCustomerDetailsUrl = (customer: Customer) => {
    const params = new URLSearchParams();
    if (customer.cnpj) params.set('cnpj', customer.cnpj);
    if (customer.name) params.set('name', customer.name);
    return `/dashboard/clientes/detalhes?${params.toString()}`;
  };

  const openCustomerInNewTab = (customer: Customer) => {
    const url = buildCustomerDetailsUrl(customer);
    const newTab = window.open(url, '_blank', 'noopener,noreferrer');

    if (!newTab) {
      toast.error('Não foi possível abrir nova aba. Verifique se o navegador bloqueou pop-ups.');
    }
  };

  return (
    <>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-[28px] text-primary">group</span>
          <div>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
              Clientes
            </h2>
            <p className="text-slate-500 dark:text-slate-400 text-xs font-medium">
              Captura automática dos clientes que receberam NF-e emitidas pela sua empresa
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={loadCustomers}
            className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-primary to-primary-dark hover:from-primary-dark hover:to-primary text-white rounded-lg text-sm font-bold transition-all shadow-md shadow-primary/30"
          >
            <span className="material-symbols-outlined text-[20px]">sync</span>
            Atualizar
          </button>
          <button
            onClick={handleExport}
            disabled={customers.length === 0}
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
              Buscar por CNPJ/CPF ou Nome do Cliente
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

      <div className="bg-white dark:bg-card-dark border border-slate-200 dark:border-slate-800 rounded-xl shadow-lg shadow-slate-200/50 dark:shadow-none overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[840px]">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800 text-xs uppercase text-slate-500 dark:text-slate-400 font-bold tracking-wider">
                <th
                  className="px-4 py-3 cursor-pointer group hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  onClick={() => handleSort('lastIssue')}
                >
                  <div className="flex items-center gap-1">Última NF-e {getSortIcon('lastIssue')}</div>
                </th>
                <th
                  className="px-4 py-3 cursor-pointer group hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  onClick={() => handleSort('name')}
                >
                  <div className="flex items-center gap-1">Cliente {getSortIcon('name')}</div>
                </th>
                <th className="px-4 py-3 text-center">
                  <div className="flex flex-col items-center leading-tight">
                    <span>Tabela de Preço</span>
                    <span className="text-[10px] normal-case tracking-normal text-slate-400 dark:text-slate-500">
                      (itens)
                    </span>
                  </div>
                </th>
                <th className="px-4 py-3 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {loading ? (
                Array.from({ length: limit }).map((_, index) => (
                  <tr key={index}>
                    <td className="px-4 py-2.5"><Skeleton className="h-4 w-24" /></td>
                    <td className="px-4 py-2.5"><Skeleton className="h-4 w-56" /></td>
                    <td className="px-4 py-2.5"><Skeleton className="h-4 w-28 mx-auto" /></td>
                    <td className="px-4 py-2.5"><Skeleton className="h-4 w-16 mx-auto" /></td>
                  </tr>
                ))
              ) : customers.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-slate-400">
                    <span className="material-symbols-outlined text-[48px] opacity-30">group</span>
                    <p className="mt-2 text-sm font-medium">Nenhum cliente encontrado</p>
                    <p className="text-xs mt-1">
                      Os clientes aparecem automaticamente quando houver NF-e emitidas.
                    </p>
                  </td>
                </tr>
              ) : (
                (() => {
                  let lastGroup = '';
                  return customers.map((customer) => {
                    const group = customer.lastIssueDate
                      ? getDateGroupLabel(customer.lastIssueDate)
                      : 'Sem data';
                    const showDivider = group !== lastGroup;
                    lastGroup = group;
                    const customerKey = getCustomerKey(customer);
                    const itemCount = priceItemsCountMap[customerKey];
                    const isItemCountLoading = priceItemsLoadingMap[customerKey];

                    return (
                      <React.Fragment key={`${customer.cnpj}-${customer.name}`}>
                        {showDivider && (
                          <tr className="cursor-pointer select-none" onClick={() => toggleGroup(group)}>
                            <td colSpan={4} className="px-4 py-2 bg-slate-100/80 dark:bg-slate-800/60 border-y border-slate-200 dark:border-slate-700">
                              <div className="flex items-center gap-2">
                                <span className="material-symbols-outlined text-[16px] text-slate-400 transition-transform" style={{ transform: collapsedGroups.has(group) ? 'rotate(-90deg)' : 'rotate(0deg)' }}>expand_more</span>
                                <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{group}</span>
                              </div>
                            </td>
                          </tr>
                        )}
                        {!collapsedGroups.has(group) && (
                          <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                            <td className="px-4 py-2.5">
                              <span className="text-[13px] font-medium text-slate-700 dark:text-slate-300">
                                {customer.lastIssueDate ? formatDate(customer.lastIssueDate) : '-'}
                              </span>
                            </td>
                            <td className="px-4 py-2.5">
                              <div className="text-[13px] font-bold leading-tight text-slate-900 dark:text-white">{customer.name}</div>
                              <div className="text-[11px] font-mono leading-tight text-slate-500 dark:text-slate-400">
                                {formatDocument(customer.cnpj)}
                              </div>
                            </td>
                            <td className="px-4 py-2.5">
                              <div className="flex items-center justify-center gap-2">
                                <span className="text-[12px] font-bold text-slate-800 dark:text-slate-200">
                                  {isItemCountLoading
                                    ? '...'
                                    : itemCount === null || itemCount === undefined
                                      ? '-'
                                      : itemCount.toLocaleString('pt-BR')}
                                </span>
                                <button
                                  onClick={() => {
                                    setSelectedPriceCustomer(customer);
                                    setIsPriceTableOpen(true);
                                  }}
                                  className="p-2 rounded-lg text-slate-500 hover:text-primary hover:bg-primary/10 transition-colors"
                                  title="Visualizar tabela de preço"
                                  aria-label="Visualizar tabela de preço"
                                >
                                  <span className="material-symbols-outlined text-[20px]">table_view</span>
                                </button>
                              </div>
                            </td>
                            <td className="px-4 py-2.5">
                              <div className="flex items-center justify-center gap-1">
                                <button
                                  onClick={() => {
                                    setSelectedCustomer(customer);
                                    setIsDetailsOpen(true);
                                  }}
                                  className="p-2 rounded-lg text-slate-500 hover:text-primary hover:bg-primary/10 transition-colors"
                                  title="Visualizar cadastro do cliente"
                                  aria-label="Visualizar cadastro do cliente"
                                >
                                  <span className="material-symbols-outlined text-[20px]">visibility</span>
                                </button>
                                <button
                                  onClick={() => openCustomerInNewTab(customer)}
                                  className="p-2 rounded-lg text-slate-500 hover:text-primary hover:bg-primary/10 transition-colors"
                                  title="Abrir detalhes em nova aba"
                                  aria-label="Abrir detalhes em nova aba"
                                >
                                  <span className="material-symbols-outlined text-[20px]">open_in_new</span>
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

        <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/30 dark:bg-slate-800/20">
          <div className="flex items-center gap-3">
            <span className="text-sm text-slate-500">Mostrando {customers.length} de {total} resultados</span>
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
      <CustomerDetailsModal
        isOpen={isDetailsOpen}
        onClose={() => setIsDetailsOpen(false)}
        customer={selectedCustomer ? { cnpj: selectedCustomer.cnpj, name: selectedCustomer.name } : null}
      />
      <CustomerPriceTableModal
        isOpen={isPriceTableOpen}
        onClose={() => setIsPriceTableOpen(false)}
        customer={selectedPriceCustomer ? { cnpj: selectedPriceCustomer.cnpj, name: selectedPriceCustomer.name } : null}
      />
    </>
  );
}
