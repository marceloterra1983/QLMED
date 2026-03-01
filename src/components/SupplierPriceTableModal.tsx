'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import Modal from '@/components/ui/Modal';
import Skeleton from '@/components/ui/Skeleton';
import { formatCnpj, formatDate } from '@/lib/utils';
import { formatPrice } from '@/lib/modal-helpers';

interface SupplierRef {
  cnpj: string;
  name: string;
}

interface SupplierDetails {
  name: string;
  cnpj: string;
}

interface SupplierPriceRow {
  code: string;
  description: string;
  shortName?: string | null;
  unit: string;
  lastPrice: number;
  lastIssueDate: string | null;
}

interface SupplierMeta {
  totalPriceRows: number;
  priceRowsLimited: boolean;
}

interface SupplierDetailsResponse {
  supplier: SupplierDetails;
  priceTable: SupplierPriceRow[];
  meta: SupplierMeta;
}

interface SupplierPriceTableModalProps {
  isOpen: boolean;
  onClose: () => void;
  supplier: SupplierRef | null;
}

type PriceSortKey = 'description' | 'code' | 'lastPrice' | 'lastIssueDate';
type SortDirection = 'asc' | 'desc';

async function fetchSupplierDetails(targetSupplier: SupplierRef): Promise<SupplierDetailsResponse> {
  const params = new URLSearchParams();
  if (targetSupplier.cnpj) params.set('cnpj', targetSupplier.cnpj);
  if (targetSupplier.name) params.set('name', targetSupplier.name);

  const res = await fetch(`/api/suppliers/details?${params}`);
  if (!res.ok) throw new Error('Falha ao carregar tabela de preço do fornecedor');
  return res.json();
}

export default function SupplierPriceTableModal({ isOpen, onClose, supplier }: SupplierPriceTableModalProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [details, setDetails] = useState<SupplierDetailsResponse | null>(null);
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
    if (!isOpen || !supplier) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setDetails(null);
      try {
        const data = await fetchSupplierDetails(supplier);
        if (!cancelled) setDetails(data);
      } catch {
        if (!cancelled) toast.error('Erro ao carregar tabela de preço');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [isOpen, supplier]);

  const filteredAndSortedRows = useMemo(() => {
    if (!details) return [];
    const searchValue = searchTerm.trim().toLowerCase();
    const filteredRows = searchValue
      ? details.priceTable.filter((row) =>
          row.description.toLowerCase().includes(searchValue) ||
          row.code.toLowerCase().includes(searchValue) ||
          (row.shortName && row.shortName.toLowerCase().includes(searchValue)),
        )
      : details.priceTable;

    return [...filteredRows].sort((a, b) => {
      let compareValue = 0;
      if (sortKey === 'description') {
        compareValue = a.description.localeCompare(b.description, 'pt-BR', { sensitivity: 'base' });
      } else if (sortKey === 'code') {
        compareValue = a.code.localeCompare(b.code, 'pt-BR', { sensitivity: 'base' });
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

  const openProductDetail = (code: string) => {
    router.push(`/cadastro/produtos?search=${encodeURIComponent(code)}`);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={details ? `TABELA DE PREÇO (${details.meta.totalPriceRows.toLocaleString('pt-BR')} ITENS)` : 'TABELA DE PREÇO'}
      width="max-w-4xl"
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
            <p className="text-sm font-semibold text-slate-900 dark:text-white">{details.supplier.name}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {formatCnpj((details.supplier.cnpj || '').replace(/\D/g, '')) || details.supplier.cnpj}
            </p>
          </div>

          {details.priceTable.length === 0 ? (
            <div className="px-4 py-10 text-center text-slate-400 text-sm">Sem itens para compor tabela de preço.</div>
          ) : (
            <>
              <div className="mb-1 flex items-center justify-between gap-3">
                <div className="relative w-full max-w-md">
                  <span className="material-symbols-outlined text-[16px] text-slate-400 absolute left-3 top-1/2 -translate-y-1/2">search</span>
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Filtrar por nome ou código"
                    className="w-full h-9 pl-9 pr-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/30 text-sm text-slate-700 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap shrink-0">
                  {filteredAndSortedRows.length.toLocaleString('pt-BR')} itens
                </p>
              </div>

              {filteredAndSortedRows.length === 0 ? (
                <div className="px-4 py-8 text-center text-slate-400 text-sm">
                  Nenhum produto encontrado para o filtro informado.
                </div>
              ) : (
                <>
                  {/* Mobile Cards */}
                  <div className="sm:hidden space-y-1.5 max-h-[420px] overflow-y-auto">
                    {filteredAndSortedRows.map((row) => (
                      <div key={`m-${row.code}-${row.description}-${row.unit}`} className="rounded-lg border border-slate-200 dark:border-slate-800 p-2.5">
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <div className="min-w-0">
                            <span className="text-[10px] font-mono text-slate-400">{row.code}</span>
                            <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">{row.shortName || row.description}</p>
                          </div>
                          <span className="text-xs font-bold text-slate-900 dark:text-white whitespace-nowrap">{formatPrice(row.lastPrice)}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] text-slate-400">{row.lastIssueDate ? formatDate(row.lastIssueDate) : '-'}</span>
                          <button
                            onClick={() => openProductDetail(row.code)}
                            className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:text-primary hover:border-primary/30 hover:bg-primary/5 transition-colors"
                          >
                            <span className="material-symbols-outlined text-[13px]">visibility</span>
                            Detalhes
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Desktop Table */}
                  <div className="hidden sm:block overflow-x-auto max-h-[420px] rounded-xl border border-slate-200 dark:border-slate-800">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800 text-[11px] uppercase text-slate-500 dark:text-slate-400 font-bold tracking-wider">
                          <th className="px-3 py-2">
                            <button type="button" onClick={() => toggleSort('code')} className="inline-flex items-center gap-1 hover:text-slate-700 dark:hover:text-slate-200 transition-colors whitespace-nowrap">
                              Referência
                              {getSortIcon('code') && <span className="material-symbols-outlined text-[14px]">{getSortIcon('code')}</span>}
                            </button>
                          </th>
                          <th className="px-3 py-2">
                            <button type="button" onClick={() => toggleSort('description')} className="inline-flex items-center gap-1 hover:text-slate-700 dark:hover:text-slate-200 transition-colors whitespace-nowrap">
                              Produto
                              {getSortIcon('description') && <span className="material-symbols-outlined text-[14px]">{getSortIcon('description')}</span>}
                            </button>
                          </th>
                          <th className="px-3 py-2 text-right">
                            <button type="button" onClick={() => toggleSort('lastPrice')} className="ml-auto inline-flex items-center gap-1 hover:text-slate-700 dark:hover:text-slate-200 transition-colors whitespace-nowrap">
                              Último Preço
                              {getSortIcon('lastPrice') && <span className="material-symbols-outlined text-[14px]">{getSortIcon('lastPrice')}</span>}
                            </button>
                          </th>
                          <th className="px-3 py-2">
                            <button type="button" onClick={() => toggleSort('lastIssueDate')} className="inline-flex items-center gap-1 hover:text-slate-700 dark:hover:text-slate-200 transition-colors whitespace-nowrap">
                              Última Compra
                              {getSortIcon('lastIssueDate') && <span className="material-symbols-outlined text-[14px]">{getSortIcon('lastIssueDate')}</span>}
                            </button>
                          </th>
                          <th className="px-3 py-2 text-center">Ações</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                        {filteredAndSortedRows.map((row) => (
                          <tr key={`${row.code}-${row.description}-${row.unit}`} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                            <td className="px-3 py-1.5 text-xs font-mono text-slate-700 dark:text-slate-300">{row.code}</td>
                            <td className="px-3 py-1.5">
                              <div className="text-xs font-semibold text-slate-900 dark:text-white">{row.shortName || row.description}</div>
                            </td>
                            <td className="px-3 py-1.5 text-right text-xs font-bold text-slate-900 dark:text-white whitespace-nowrap">
                              {formatPrice(row.lastPrice)}
                            </td>
                            <td className="px-3 py-1.5 text-xs text-slate-700 dark:text-slate-300 whitespace-nowrap">
                              {row.lastIssueDate ? formatDate(row.lastIssueDate) : '-'}
                            </td>
                            <td className="px-3 py-1.5 text-center">
                              <button
                                onClick={() => openProductDetail(row.code)}
                                className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:text-primary hover:border-primary/30 hover:bg-primary/5 transition-colors"
                              >
                                <span className="material-symbols-outlined text-[13px]">visibility</span>
                                Detalhes
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
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
          <span className="material-symbols-outlined text-[44px] opacity-40">storefront</span>
          <p className="mt-2 text-sm font-medium">Sem dados para este fornecedor</p>
        </div>
      )}
    </Modal>
  );
}
