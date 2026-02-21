'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import Modal from '@/components/ui/Modal';
import Skeleton from '@/components/ui/Skeleton';
import { formatCnpj, formatDate } from '@/lib/utils';

interface CustomerRef {
  cnpj: string;
  name: string;
}

interface CustomerDetails {
  name: string;
  cnpj: string;
}

interface CustomerPriceRow {
  code: string;
  description: string;
  unit: string;
  quantity2025: number;
  quantity2026: number;
  lastPrice: number;
  lastIssueDate: string | null;
}

interface CustomerMeta {
  totalPriceRows: number;
  priceRowsLimited: boolean;
}

interface CustomerDetailsResponse {
  customer: CustomerDetails;
  priceTable: CustomerPriceRow[];
  meta: CustomerMeta;
}

interface CustomerPriceTableModalProps {
  isOpen: boolean;
  onClose: () => void;
  customer: CustomerRef | null;
}

type PriceSortKey = 'description' | 'code' | 'quantity2025' | 'quantity2026' | 'lastPrice' | 'lastIssueDate';
type SortDirection = 'asc' | 'desc';

function formatQuantity(value: number) {
  return value.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
}

function formatPrice(value: number) {
  return value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

async function fetchCustomerDetails(targetCustomer: CustomerRef): Promise<CustomerDetailsResponse> {
  const params = new URLSearchParams();
  if (targetCustomer.cnpj) params.set('cnpj', targetCustomer.cnpj);
  if (targetCustomer.name) params.set('name', targetCustomer.name);

  const res = await fetch(`/api/customers/details?${params}`);
  if (!res.ok) {
    throw new Error('Falha ao carregar tabela de preço do cliente');
  }

  return res.json();
}

export default function CustomerPriceTableModal({ isOpen, onClose, customer }: CustomerPriceTableModalProps) {
  const [loading, setLoading] = useState(false);
  const [details, setDetails] = useState<CustomerDetailsResponse | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortKey, setSortKey] = useState<PriceSortKey>('lastIssueDate');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  useEffect(() => {
    if (isOpen) {
      setSearchTerm('');
      setSortKey('lastIssueDate');
      setSortDirection('desc');
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !customer) return;

    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setDetails(null);
      try {
        const data = await fetchCustomerDetails(customer);
        if (!cancelled) {
          setDetails(data);
        }
      } catch {
        if (!cancelled) {
          toast.error('Erro ao carregar tabela de preço');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [isOpen, customer]);

  const filteredAndSortedRows = useMemo(() => {
    if (!details) return [];

    const searchValue = searchTerm.trim().toLowerCase();
    const filteredRows = searchValue
      ? details.priceTable.filter((row) =>
        row.description.toLowerCase().includes(searchValue) || row.code.toLowerCase().includes(searchValue))
      : details.priceTable;

    return [...filteredRows].sort((a, b) => {
      let compareValue = 0;

      if (sortKey === 'description') {
        compareValue = a.description.localeCompare(b.description, 'pt-BR', { sensitivity: 'base' });
      } else if (sortKey === 'code') {
        compareValue = a.code.localeCompare(b.code, 'pt-BR', { sensitivity: 'base' });
      } else if (sortKey === 'quantity2025') {
        compareValue = a.quantity2025 - b.quantity2025;
      } else if (sortKey === 'quantity2026') {
        compareValue = a.quantity2026 - b.quantity2026;
      } else if (sortKey === 'lastPrice') {
        compareValue = a.lastPrice - b.lastPrice;
      } else {
        const aDate = a.lastIssueDate ? new Date(a.lastIssueDate).getTime() : 0;
        const bDate = b.lastIssueDate ? new Date(b.lastIssueDate).getTime() : 0;
        compareValue = aDate - bDate;
      }

      return sortDirection === 'asc' ? compareValue : -compareValue;
    });
  }, [details, searchTerm, sortDirection, sortKey]);

  const toggleSort = (key: PriceSortKey) => {
    if (sortKey === key) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      return;
    }

    setSortKey(key);
    setSortDirection(key === 'description' || key === 'code' ? 'asc' : 'desc');
  };

  const getSortIcon = (key: PriceSortKey) => {
    if (sortKey !== key) return null;
    return sortDirection === 'asc' ? 'arrow_upward' : 'arrow_downward';
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={details ? `TABELA DE PREÇO (${details.meta.totalPriceRows.toLocaleString('pt-BR')} ITENS)` : 'TABELA DE PREÇO'}
      width="max-w-6xl"
    >
      {loading && (
        <div className="space-y-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      )}

      {!loading && details && (
        <div className="space-y-3">
          <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/30 px-3 py-2">
            <p className="text-sm font-semibold text-slate-900 dark:text-white">{details.customer.name}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {formatCnpj((details.customer.cnpj || '').replace(/\D/g, '')) || details.customer.cnpj}
            </p>
          </div>

          {details.priceTable.length === 0 ? (
            <div className="px-4 py-10 text-center text-slate-400 text-sm">
              Sem itens para compor tabela de preço.
            </div>
          ) : (
            <>
              <div className="mb-1 flex items-center justify-between gap-3">
                <div className="relative w-full max-w-md">
                  <span className="material-symbols-outlined text-[16px] text-slate-400 absolute left-3 top-1/2 -translate-y-1/2">
                    search
                  </span>
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Filtrar por nome ou código"
                    className="w-full h-9 pl-9 pr-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/30 text-sm text-slate-700 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                </div>
                <div className="text-right">
                  <p className="text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
                    {filteredAndSortedRows.length} item(ns)
                  </p>
                  <p className="text-[11px] text-slate-400 dark:text-slate-500 whitespace-nowrap">
                    2026 = de 01/01/2026 até hoje
                  </p>
                </div>
              </div>

              {filteredAndSortedRows.length === 0 ? (
                <div className="px-4 py-8 text-center text-slate-400 text-sm">
                  Nenhum produto encontrado para o filtro informado.
                </div>
              ) : (
                <div className="overflow-x-auto max-h-[420px] rounded-xl border border-slate-200 dark:border-slate-800">
                  <table className="w-full text-left border-collapse min-w-[820px]">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800 text-[11px] uppercase text-slate-500 dark:text-slate-400 font-bold tracking-wider">
                        <th rowSpan={2} className="px-3 py-2 align-middle">
                          <button type="button" onClick={() => toggleSort('code')} className="inline-flex items-center gap-1 hover:text-slate-700 dark:hover:text-slate-200 transition-colors whitespace-nowrap">
                            Código
                            {getSortIcon('code') && (
                              <span className="material-symbols-outlined text-[14px]">{getSortIcon('code')}</span>
                            )}
                          </button>
                        </th>
                        <th rowSpan={2} className="px-3 py-2 align-middle">
                          <button type="button" onClick={() => toggleSort('description')} className="inline-flex items-center gap-1 hover:text-slate-700 dark:hover:text-slate-200 transition-colors whitespace-nowrap">
                            Produto
                            {getSortIcon('description') && (
                              <span className="material-symbols-outlined text-[14px]">{getSortIcon('description')}</span>
                            )}
                          </button>
                        </th>
                        <th colSpan={2} className="px-3 py-2 text-center">
                          Qtde. Vendida
                        </th>
                        <th rowSpan={2} className="px-3 py-2 text-right align-middle">
                          <button type="button" onClick={() => toggleSort('lastPrice')} className="ml-auto inline-flex items-center gap-1 hover:text-slate-700 dark:hover:text-slate-200 transition-colors whitespace-nowrap">
                            Último Preço
                            {getSortIcon('lastPrice') && (
                              <span className="material-symbols-outlined text-[14px]">{getSortIcon('lastPrice')}</span>
                            )}
                          </button>
                        </th>
                        <th rowSpan={2} className="px-3 py-2 align-middle">
                          <button type="button" onClick={() => toggleSort('lastIssueDate')} className="inline-flex items-center gap-1 hover:text-slate-700 dark:hover:text-slate-200 transition-colors whitespace-nowrap">
                            Última Venda
                            {getSortIcon('lastIssueDate') && (
                              <span className="material-symbols-outlined text-[14px]">{getSortIcon('lastIssueDate')}</span>
                            )}
                          </button>
                        </th>
                      </tr>
                      <tr className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800 text-[11px] uppercase text-slate-500 dark:text-slate-400 font-bold tracking-wider">
                        <th className="px-3 py-2 text-right">
                          <button type="button" onClick={() => toggleSort('quantity2025')} className="ml-auto inline-flex items-center gap-1 hover:text-slate-700 dark:hover:text-slate-200 transition-colors whitespace-nowrap">
                            2025
                            {getSortIcon('quantity2025') && (
                              <span className="material-symbols-outlined text-[14px]">{getSortIcon('quantity2025')}</span>
                            )}
                          </button>
                        </th>
                        <th className="px-3 py-2 text-right">
                          <button type="button" onClick={() => toggleSort('quantity2026')} className="ml-auto inline-flex items-center gap-1 hover:text-slate-700 dark:hover:text-slate-200 transition-colors whitespace-nowrap">
                            2026
                            {getSortIcon('quantity2026') && (
                              <span className="material-symbols-outlined text-[14px]">{getSortIcon('quantity2026')}</span>
                            )}
                          </button>
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                      {filteredAndSortedRows.map((row) => (
                        <tr key={`${row.code}-${row.description}-${row.unit}`} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                          <td className="px-3 py-1.5 text-xs font-mono text-slate-700 dark:text-slate-300">{row.code}</td>
                          <td className="px-3 py-1.5">
                            <div className="text-xs font-semibold text-slate-900 dark:text-white">{row.description}</div>
                          </td>
                          <td className="px-3 py-1.5 text-right text-xs font-medium text-slate-700 dark:text-slate-300">
                            {formatQuantity(row.quantity2025)}
                          </td>
                          <td className="px-3 py-1.5 text-right text-xs font-medium text-slate-700 dark:text-slate-300">
                            {formatQuantity(row.quantity2026)}
                          </td>
                          <td className="px-3 py-1.5 text-right text-xs font-bold text-slate-900 dark:text-white">
                            {formatPrice(row.lastPrice)}
                          </td>
                          <td className="px-3 py-1.5 text-xs text-slate-700 dark:text-slate-300">
                            {row.lastIssueDate ? formatDate(row.lastIssueDate) : '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {details.meta.priceRowsLimited && (
            <div className="px-4 py-2 border border-slate-200 dark:border-slate-800 rounded-lg text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20">
              Exibindo {details.priceTable.length} de {details.meta.totalPriceRows} itens para preservar desempenho.
            </div>
          )}
        </div>
      )}

      {!loading && !details && (
        <div className="py-10 text-center text-slate-400">
          <span className="material-symbols-outlined text-[44px] opacity-40">group</span>
          <p className="mt-2 text-sm font-medium">Sem dados para este cliente</p>
        </div>
      )}
    </Modal>
  );
}
