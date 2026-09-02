'use client';

import { useEffect, useMemo, useState } from 'react';
import EmptyState from '@/components/ui/EmptyState';
import Button from '@/components/ui/Button';
import { toast } from 'sonner';
import Modal from '@/components/ui/Modal';
import Skeleton from '@/components/ui/Skeleton';
import { formatCnpj, formatDate } from '@/lib/utils';
import { formatPrice } from '@/lib/modal-helpers';
import { CONTACT_KINDS, type ContactKind } from '@/components/contact-details/contact-kinds';
import type { ContactRef } from '@/components/contact-details/contact-detail-types';

interface ContactHead {
  name: string;
  cnpj: string;
  fantasyName?: string | null;
}

interface PriceRow {
  code: string;
  description: string;
  shortName?: string | null;
  unit: string;
  lastPrice: number;
  lastIssueDate: string | null;
}

interface PriceTableResponse {
  customer?: ContactHead;
  supplier?: ContactHead;
  priceTable: PriceRow[];
  meta: { totalPriceRows: number; priceRowsLimited: boolean };
}

interface ProductRegistryData {
  lastPrice: number;
  fiscalIcms: number | null;
  fiscalPis: number | null;
  fiscalCofins: number | null;
  fiscalIpi: number | null;
  fiscalFcp: number | null;
}

type PriceSortKey = 'description' | 'code' | 'lastPrice' | 'lastIssueDate';
type SortDirection = 'asc' | 'desc';

interface ContactPriceTableModalProps {
  kind: ContactKind;
  isOpen: boolean;
  onClose: () => void;
  contact: ContactRef | null;
}

/**
 * Painel de detalhe do fornecedor: unidade, último preço e data de compra.
 */
function SupplierRowDetail({ row, priceLabel, dateLabel }: { row: PriceRow; priceLabel: string; dateLabel: string }) {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 divide-y divide-slate-200 dark:divide-slate-800">
      <div className="px-4 py-3">
        <p className="text-xs font-mono text-slate-500 dark:text-slate-400 mb-0.5">{row.code}</p>
        <p className="text-sm font-semibold text-slate-900 dark:text-white leading-snug">{row.shortName || row.description}</p>
        {row.shortName && <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{row.description}</p>}
      </div>
      <div className="px-4 py-3 grid grid-cols-2 gap-x-6 gap-y-2">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400 font-medium">Unidade</p>
          <p className="text-sm font-semibold text-slate-900 dark:text-white">{row.unit || '-'}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400 font-medium">{priceLabel}</p>
          <p className="text-sm font-bold text-slate-900 dark:text-white">{formatPrice(row.lastPrice)}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400 font-medium">{dateLabel}</p>
          <p className="text-sm font-semibold text-slate-900 dark:text-white">{row.lastIssueDate ? formatDate(row.lastIssueDate) : '-'}</p>
        </div>
      </div>
    </div>
  );
}

/**
 * Painel de detalhe do cliente: cruza o preço de venda com o custo cadastrado
 * do produto e as alíquotas para mostrar lucro bruto e líquido.
 */
function CustomerRowDetail({ row, registry, loadingRegistry }: { row: PriceRow; registry: ProductRegistryData | null; loadingRegistry: boolean }) {
  const salePrice = row.lastPrice;
  const purchasePrice = registry?.lastPrice ?? 0;
  const hasPurchase = purchasePrice > 0;

  const icms = registry?.fiscalIcms ?? 0;
  const pis = registry?.fiscalPis ?? 0;
  const cofins = registry?.fiscalCofins ?? 0;
  const ipi = registry?.fiscalIpi ?? 0;
  const fcp = registry?.fiscalFcp ?? 0;
  const totalTaxPct = icms + pis + cofins + ipi + fcp;

  const grossProfit = hasPurchase ? salePrice - purchasePrice : null;
  const grossMarginPct = grossProfit != null && salePrice > 0 ? (grossProfit / salePrice) * 100 : null;
  const taxOnSale = salePrice * (totalTaxPct / 100);
  const netProfit = grossProfit != null ? grossProfit - taxOnSale : null;
  const netMarginPct = netProfit != null && salePrice > 0 ? (netProfit / salePrice) * 100 : null;

  const pctLabel = (v: number | null) => (v != null ? `${v >= 0 ? '+' : ''}${v.toFixed(1)}%` : '-');
  const colorClass = (v: number | null) =>
    v == null ? 'text-slate-500 dark:text-slate-400' : v >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400';

  const taxParts: string[] = [];
  if (icms) taxParts.push(`ICMS ${icms}%`);
  if (pis) taxParts.push(`PIS ${pis}%`);
  if (cofins) taxParts.push(`COFINS ${cofins}%`);
  if (ipi) taxParts.push(`IPI ${ipi}%`);
  if (fcp) taxParts.push(`FCP ${fcp}%`);

  return (
    <>
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 px-4 py-3">
        <p className="text-xs font-mono text-slate-500 dark:text-slate-400 mb-0.5">{row.code} · {row.unit}</p>
        <p className="text-sm font-semibold text-slate-900 dark:text-white leading-snug">{row.shortName || row.description}</p>
        {row.shortName && <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{row.description}</p>}
      </div>

      {loadingRegistry ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 divide-y divide-slate-200 dark:divide-slate-800 text-sm">
          <div className="flex items-center justify-between px-4 py-2.5">
            <span className="text-xs text-slate-500 dark:text-slate-400">Preço de Venda</span>
            <span className="text-xs font-bold text-slate-900 dark:text-white">{formatPrice(salePrice)}</span>
          </div>
          <div className="flex items-center justify-between px-4 py-2.5">
            <span className="text-xs text-slate-500 dark:text-slate-400">Valor de Compra</span>
            <span className="text-xs font-semibold text-slate-900 dark:text-white">
              {hasPurchase ? formatPrice(purchasePrice) : <span className="text-slate-500 dark:text-slate-400 italic">não cadastrado</span>}
            </span>
          </div>
          <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50/60 dark:bg-slate-900/20">
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">Lucro Bruto</span>
            <div className="flex items-center gap-3">
              <span className={`text-xs font-medium ${colorClass(grossMarginPct)}`}>{pctLabel(grossMarginPct)}</span>
              <span className={`text-xs font-bold ${colorClass(grossProfit)}`}>{grossProfit != null ? formatPrice(grossProfit) : '-'}</span>
            </div>
          </div>
          <div className="flex items-start justify-between px-4 py-2.5">
            <div className="min-w-0">
              <span className="text-xs text-slate-500 dark:text-slate-400">Impostos na Venda</span>
              {taxParts.length > 0 && <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{taxParts.join(' + ')}</p>}
              {taxParts.length === 0 && registry && <p className="text-xs text-slate-500 dark:text-slate-400 italic mt-0.5">sem alíquotas cadastradas</p>}
            </div>
            <div className="flex items-center gap-3 shrink-0 ml-3">
              <span className="text-xs text-slate-500 dark:text-slate-400">{totalTaxPct > 0 ? `${totalTaxPct.toFixed(2)}%` : '-'}</span>
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">{totalTaxPct > 0 ? formatPrice(taxOnSale) : '-'}</span>
            </div>
          </div>
          <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50/60 dark:bg-slate-900/20 rounded-b-xl">
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">Lucro Líquido</span>
            <div className="flex items-center gap-3">
              <span className={`text-xs font-medium ${colorClass(netMarginPct)}`}>{pctLabel(netMarginPct)}</span>
              <span className={`text-xs font-bold ${colorClass(netProfit)}`}>{netProfit != null ? formatPrice(netProfit) : '-'}</span>
            </div>
          </div>
        </div>
      )}

      <p className="text-xs text-slate-500 dark:text-slate-400 text-right">
        Última venda: {row.lastIssueDate ? formatDate(row.lastIssueDate) : '-'}
      </p>
    </>
  );
}

export default function ContactPriceTableModal({ kind, isOpen, onClose, contact }: ContactPriceTableModalProps) {
  const cfg = CONTACT_KINDS[kind];
  const [loading, setLoading] = useState(false);
  const [details, setDetails] = useState<PriceTableResponse | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortKey, setSortKey] = useState<PriceSortKey>('lastIssueDate');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [detailRow, setDetailRow] = useState<PriceRow | null>(null);
  const [productRegistry, setProductRegistry] = useState<ProductRegistryData | null>(null);
  const [loadingRegistry, setLoadingRegistry] = useState(false);

  const head = details ? (details[cfg.responseKey] ?? null) : null;

  useEffect(() => {
    if (isOpen) {
      setSearchTerm('');
      setSortKey('lastIssueDate');
      setSortDirection('desc');
      setDetailRow(null);
      setProductRegistry(null);
    }
  }, [isOpen]);

  // O custo cadastrado só entra na análise de lucro do cliente.
  useEffect(() => {
    if (kind !== 'customer' || !detailRow) { setProductRegistry(null); return; }
    let cancelled = false;
    const load = async () => {
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
    load();
    return () => { cancelled = true; };
  }, [detailRow, kind]);

  useEffect(() => {
    if (!isOpen || !contact) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setDetails(null);
      try {
        const params = new URLSearchParams();
        if (contact.cnpj) params.set('cnpj', contact.cnpj);
        if (contact.name) params.set('name', contact.name);
        const res = await fetch(`${cfg.detailsPath}?${params}`);
        if (!res.ok) throw new Error(`Falha ao carregar tabela de preço do ${cfg.noun}`);
        const data = await res.json();
        if (!cancelled) setDetails(data);
      } catch {
        if (!cancelled) toast.error('Erro ao carregar tabela de preço');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [isOpen, contact, cfg.detailsPath, cfg.noun]);

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

      {!loading && details && head && (
        <div className="space-y-3">
          <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/30 px-3 py-2">
            <p className="text-sm font-semibold text-slate-900 dark:text-white">{head.fantasyName || head.name}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {formatCnpj((head.cnpj || '').replace(/\D/g, '')) || head.cnpj}
            </p>
          </div>

          {detailRow ? (
            <div className="space-y-3">
              <button
                onClick={() => setDetailRow(null)}
                className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-primary dark:hover:text-blue-400 transition-colors"
              >
                <span className="material-symbols-outlined text-[14px]">arrow_back</span>
                Voltar para lista
              </button>
              {kind === 'customer' ? (
                <CustomerRowDetail row={detailRow} registry={productRegistry} loadingRegistry={loadingRegistry} />
              ) : (
                <SupplierRowDetail row={detailRow} priceLabel={cfg.priceDetailPriceLabel} dateLabel={cfg.priceDetailDateLabel} />
              )}
            </div>
          ) : (
            <>
              {details.priceTable.length === 0 ? (
                <div className="px-4 py-10 text-center text-slate-500 dark:text-slate-400 text-sm">Sem itens para compor tabela de preço.</div>
              ) : (
                <>
                  <div className="mb-1 flex items-center justify-between gap-3">
                    <div className="relative w-full max-w-md">
                      <span className="material-symbols-outlined text-[16px] text-slate-500 dark:text-slate-400 absolute left-3 top-1/2 -translate-y-1/2">search</span>
                      <input
                        type="text"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Filtrar por nome ou código"
                        aria-label="Filtrar por nome ou código"
                        className="w-full h-9 pl-9 pr-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/30 text-sm text-slate-700 dark:text-slate-200 placeholder:text-slate-500 dark:placeholder:text-slate-400"
                      />
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap shrink-0">
                      {filteredAndSortedRows.length.toLocaleString('pt-BR')} itens
                    </p>
                  </div>

                  {filteredAndSortedRows.length === 0 ? (
                    <EmptyState compact icon="inbox" title="Nenhum produto encontrado para o filtro informado." />
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
                              <span className="text-xs text-slate-500 dark:text-slate-400">{row.lastIssueDate ? formatDate(row.lastIssueDate) : '-'}</span>
                              <Button onClick={() => setDetailRow(row)} variant="secondary" size="xs" icon="search">
                                Detalhes
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Desktop Table */}
                      <div className="hidden sm:block overflow-x-auto max-h-[420px] rounded-xl border border-slate-200 dark:border-slate-800">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800 text-xs uppercase text-slate-500 dark:text-slate-400 font-bold tracking-wider">
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
                                  {cfg.priceColumnDateLabel}
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
                                  <div className="text-xs font-mono text-slate-500 dark:text-slate-400">{row.code}</div>
                                </td>
                                <td className="px-3 py-1.5 text-right text-xs font-bold tabular-nums text-slate-900 dark:text-white whitespace-nowrap">
                                  {formatPrice(row.lastPrice)}
                                </td>
                                <td className="px-3 py-1.5 text-xs tabular-nums text-slate-700 dark:text-slate-300 whitespace-nowrap">
                                  {row.lastIssueDate ? formatDate(row.lastIssueDate) : '-'}
                                </td>
                                <td className="px-3 py-1.5 text-center">
                                  <Button onClick={() => setDetailRow(row)} variant="secondary" size="xs" icon="search">
                                    Detalhes
                                  </Button>
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

      {!loading && !head && (
        <div className="py-10 text-center text-slate-500 dark:text-slate-400">
          <span className="material-symbols-outlined text-[44px] opacity-40">{cfg.priceModalEmptyIcon}</span>
          <p className="mt-2 text-sm font-medium">Sem dados para este {cfg.noun}</p>
        </div>
      )}
    </Modal>
  );
}
