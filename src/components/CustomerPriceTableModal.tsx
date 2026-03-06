'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import Modal from '@/components/ui/Modal';
import Skeleton from '@/components/ui/Skeleton';
import { formatCnpj, formatDate } from '@/lib/utils';
import { formatPrice } from '@/lib/modal-helpers';

interface CustomerRef {
  cnpj: string;
  name: string;
}

interface CustomerDetails {
  name: string;
  cnpj: string;
  fantasyName?: string | null;
}

interface CustomerPriceRow {
  code: string;
  description: string;
  shortName?: string | null;
  unit: string;
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

type PriceSortKey = 'description' | 'code' | 'lastPrice' | 'lastIssueDate';
type SortDirection = 'asc' | 'desc';

interface ProductRegistryData {
  lastPrice: number;
  fiscalIcms: number | null;
  fiscalPis: number | null;
  fiscalCofins: number | null;
  fiscalIpi: number | null;
  fiscalFcp: number | null;
}

async function fetchCustomerDetails(targetCustomer: CustomerRef): Promise<CustomerDetailsResponse> {
  const params = new URLSearchParams();
  if (targetCustomer.cnpj) params.set('cnpj', targetCustomer.cnpj);
  if (targetCustomer.name) params.set('name', targetCustomer.name);

  const res = await fetch(`/api/customers/details?${params}`);
  if (!res.ok) throw new Error('Falha ao carregar tabela de preço do cliente');
  return res.json();
}

export default function CustomerPriceTableModal({ isOpen, onClose, customer }: CustomerPriceTableModalProps) {
  const [loading, setLoading] = useState(false);
  const [details, setDetails] = useState<CustomerDetailsResponse | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortKey, setSortKey] = useState<PriceSortKey>('lastIssueDate');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [detailRow, setDetailRow] = useState<CustomerPriceRow | null>(null);
  const [productRegistry, setProductRegistry] = useState<ProductRegistryData | null>(null);
  const [loadingRegistry, setLoadingRegistry] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setSearchTerm('');
      setSortKey('lastIssueDate');
      setSortDirection('desc');
      setDetailRow(null);
      setProductRegistry(null);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!detailRow) { setProductRegistry(null); return; }
    let cancelled = false;
    const fetch_ = async () => {
      setLoadingRegistry(true);
      setProductRegistry(null);
      try {
        const res = await fetch(`/api/products/details?code=${encodeURIComponent(detailRow.code)}`);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setProductRegistry({
          lastPrice: data.lastPrice ?? 0,
          fiscalIcms: data.fiscalIcms,
          fiscalPis: data.fiscalPis,
          fiscalCofins: data.fiscalCofins,
          fiscalIpi: data.fiscalIpi,
          fiscalFcp: data.fiscalFcp,
        });
      } catch { /* silently skip */ } finally {
        if (!cancelled) setLoadingRegistry(false);
      }
    };
    fetch_();
    return () => { cancelled = true; };
  }, [detailRow]);

  useEffect(() => {
    if (!isOpen || !customer) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setDetails(null);
      try {
        const data = await fetchCustomerDetails(customer);
        if (!cancelled) setDetails(data);
      } catch {
        if (!cancelled) toast.error('Erro ao carregar tabela de preço');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [isOpen, customer]);

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

  const customerDisplayName = details
    ? (details.customer.fantasyName || details.customer.name)
    : null;

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
            <p className="text-sm font-semibold text-slate-900 dark:text-white">{customerDisplayName}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {formatCnpj((details.customer.cnpj || '').replace(/\D/g, '')) || details.customer.cnpj}
            </p>
          </div>

          {/* Inline product detail view */}
          {detailRow ? (
            <div className="space-y-3">
              <button
                onClick={() => setDetailRow(null)}
                className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-primary transition-colors"
              >
                <span className="material-symbols-outlined text-[14px]">arrow_back</span>
                Voltar para lista
              </button>

              {/* Product identity */}
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 px-4 py-3">
                <p className="text-[10px] font-mono text-slate-400 mb-0.5">{detailRow.code} · {detailRow.unit}</p>
                <p className="text-sm font-semibold text-slate-900 dark:text-white leading-snug">
                  {detailRow.shortName || detailRow.description}
                </p>
                {detailRow.shortName && (
                  <p className="text-xs text-slate-400 mt-0.5">{detailRow.description}</p>
                )}
              </div>

              {/* Profit analysis */}
              {loadingRegistry ? (
                <Skeleton className="h-40 w-full" />
              ) : (() => {
                const salePrice = detailRow.lastPrice;
                const purchasePrice = productRegistry?.lastPrice ?? 0;
                const hasPurchase = purchasePrice > 0;

                const icms = (productRegistry?.fiscalIcms ?? 0);
                const pis = (productRegistry?.fiscalPis ?? 0);
                const cofins = (productRegistry?.fiscalCofins ?? 0);
                const ipi = (productRegistry?.fiscalIpi ?? 0);
                const fcp = (productRegistry?.fiscalFcp ?? 0);
                const totalTaxPct = icms + pis + cofins + ipi + fcp;

                const grossProfit = hasPurchase ? salePrice - purchasePrice : null;
                const grossMarginPct = grossProfit != null && salePrice > 0 ? (grossProfit / salePrice) * 100 : null;
                const taxOnSale = salePrice * (totalTaxPct / 100);
                const netProfit = grossProfit != null ? grossProfit - taxOnSale : null;
                const netMarginPct = netProfit != null && salePrice > 0 ? (netProfit / salePrice) * 100 : null;

                const pctLabel = (v: number | null) =>
                  v != null ? `${v >= 0 ? '+' : ''}${v.toFixed(1)}%` : '-';
                const colorClass = (v: number | null) =>
                  v == null ? 'text-slate-400' : v >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400';

                const taxParts: string[] = [];
                if (icms) taxParts.push(`ICMS ${icms}%`);
                if (pis) taxParts.push(`PIS ${pis}%`);
                if (cofins) taxParts.push(`COFINS ${cofins}%`);
                if (ipi) taxParts.push(`IPI ${ipi}%`);
                if (fcp) taxParts.push(`FCP ${fcp}%`);

                return (
                  <div className="rounded-xl border border-slate-200 dark:border-slate-800 divide-y divide-slate-200 dark:divide-slate-800 text-sm">
                    {/* Sale price row */}
                    <div className="flex items-center justify-between px-4 py-2.5">
                      <span className="text-xs text-slate-500 dark:text-slate-400">Preço de Venda</span>
                      <span className="text-xs font-bold text-slate-900 dark:text-white">{formatPrice(salePrice)}</span>
                    </div>
                    {/* Purchase price row */}
                    <div className="flex items-center justify-between px-4 py-2.5">
                      <span className="text-xs text-slate-500 dark:text-slate-400">Valor de Compra</span>
                      <span className="text-xs font-semibold text-slate-900 dark:text-white">
                        {hasPurchase ? formatPrice(purchasePrice) : <span className="text-slate-400 italic">não cadastrado</span>}
                      </span>
                    </div>
                    {/* Gross profit */}
                    <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50/60 dark:bg-slate-900/20">
                      <div>
                        <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">Lucro Bruto</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`text-xs font-medium ${colorClass(grossMarginPct)}`}>{pctLabel(grossMarginPct)}</span>
                        <span className={`text-xs font-bold ${colorClass(grossProfit)}`}>
                          {grossProfit != null ? formatPrice(grossProfit) : '-'}
                        </span>
                      </div>
                    </div>
                    {/* Taxes on sale */}
                    <div className="flex items-start justify-between px-4 py-2.5">
                      <div className="min-w-0">
                        <span className="text-xs text-slate-500 dark:text-slate-400">Impostos na Venda</span>
                        {taxParts.length > 0 && (
                          <p className="text-[10px] text-slate-400 mt-0.5">{taxParts.join(' + ')}</p>
                        )}
                        {taxParts.length === 0 && productRegistry && (
                          <p className="text-[10px] text-slate-400 italic mt-0.5">sem alíquotas cadastradas</p>
                        )}
                      </div>
                      <div className="flex items-center gap-3 shrink-0 ml-3">
                        <span className="text-xs text-slate-400">{totalTaxPct > 0 ? `${totalTaxPct.toFixed(2)}%` : '-'}</span>
                        <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                          {totalTaxPct > 0 ? formatPrice(taxOnSale) : '-'}
                        </span>
                      </div>
                    </div>
                    {/* Net profit */}
                    <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50/60 dark:bg-slate-900/20 rounded-b-xl">
                      <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">Lucro Líquido</span>
                      <div className="flex items-center gap-3">
                        <span className={`text-xs font-medium ${colorClass(netMarginPct)}`}>{pctLabel(netMarginPct)}</span>
                        <span className={`text-xs font-bold ${colorClass(netProfit)}`}>
                          {netProfit != null ? formatPrice(netProfit) : '-'}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Last sale info */}
              <p className="text-[10px] text-slate-400 text-right">
                Última venda: {detailRow.lastIssueDate ? formatDate(detailRow.lastIssueDate) : '-'}
              </p>
            </div>
          ) : (
            <>
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
                            <div className="flex items-start justify-between gap-2">
                              <p className="text-xs font-semibold text-slate-900 dark:text-white truncate min-w-0">
                                {row.shortName || row.description}
                              </p>
                              <span className="text-xs font-bold text-slate-900 dark:text-white whitespace-nowrap">{formatPrice(row.lastPrice)}</span>
                            </div>
                            <div className="flex items-center justify-between mt-1">
                              <span className="text-[10px] text-slate-400">{row.lastIssueDate ? formatDate(row.lastIssueDate) : '-'}</span>
                              <button
                                onClick={() => setDetailRow(row)}
                                className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:text-primary hover:border-primary/30 hover:bg-primary/5 transition-colors"
                              >
                                <span className="material-symbols-outlined text-[13px]">search</span>
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
                                  Última Venda
                                  {getSortIcon('lastIssueDate') && <span className="material-symbols-outlined text-[14px]">{getSortIcon('lastIssueDate')}</span>}
                                </button>
                              </th>
                              <th className="px-3 py-2 text-center">Ações</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                            {filteredAndSortedRows.map((row) => (
                              <tr key={`${row.code}-${row.description}-${row.unit}`} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                                <td className="px-3 py-1.5">
                                  <div className="text-xs font-semibold text-slate-900 dark:text-white">{row.shortName || row.description}</div>
                                  <div className="text-[10px] font-mono text-slate-400">{row.code}</div>
                                </td>
                                <td className="px-3 py-1.5 text-right text-xs font-bold text-slate-900 dark:text-white whitespace-nowrap">
                                  {formatPrice(row.lastPrice)}
                                </td>
                                <td className="px-3 py-1.5 text-xs text-slate-700 dark:text-slate-300 whitespace-nowrap">
                                  {row.lastIssueDate ? formatDate(row.lastIssueDate) : '-'}
                                </td>
                                <td className="px-3 py-1.5 text-center">
                                  <button
                                    onClick={() => setDetailRow(row)}
                                    className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:text-primary hover:border-primary/30 hover:bg-primary/5 transition-colors"
                                  >
                                    <span className="material-symbols-outlined text-[13px]">search</span>
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
            </>
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
