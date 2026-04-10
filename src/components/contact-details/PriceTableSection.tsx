'use client';

import { useMemo, useState } from 'react';
import { formatDate } from '@/lib/utils';
import { formatQuantity, formatPrice } from '@/lib/modal-helpers';
import { thCls, tdCls } from './contact-detail-utils';
import type { ContactPriceRow, ContactMeta, PriceSortKey, SortDirection } from './contact-detail-types';

interface PriceTableSectionProps {
  priceTable: ContactPriceRow[];
  meta: ContactMeta;
  /** Accent color for the active sort indicator */
  sortAccentColor?: string;
}

export default function PriceTableSection({ priceTable, meta, sortAccentColor = 'text-orange-500' }: PriceTableSectionProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortKey, setSortKey] = useState<PriceSortKey>('totalQuantity');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const filteredAndSorted = useMemo(() => {
    const searchValue = searchTerm.trim().toLowerCase();
    const filteredRows = searchValue
      ? priceTable.filter((row) =>
        row.description.toLowerCase().includes(searchValue) || row.code.toLowerCase().includes(searchValue))
      : priceTable;

    return [...filteredRows].sort((a, b) => {
      let compareValue = 0;

      if (sortKey === 'description') {
        compareValue = a.description.localeCompare(b.description, 'pt-BR', { sensitivity: 'base' });
      } else if (sortKey === 'code') {
        compareValue = a.code.localeCompare(b.code, 'pt-BR', { sensitivity: 'base' });
      } else if (sortKey === 'totalQuantity') {
        compareValue = a.totalQuantity - b.totalQuantity;
      } else if (sortKey === 'lastPrice') {
        compareValue = a.lastPrice - b.lastPrice;
      } else {
        const aDate = a.lastIssueDate ? new Date(a.lastIssueDate).getTime() : 0;
        const bDate = b.lastIssueDate ? new Date(b.lastIssueDate).getTime() : 0;
        compareValue = aDate - bDate;
      }

      return sortDirection === 'asc' ? compareValue : -compareValue;
    });
  }, [priceTable, searchTerm, sortDirection, sortKey]);

  const toggleSort = (key: PriceSortKey) => {
    if (sortKey === key) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(key);
    setSortDirection(key === 'description' || key === 'code' ? 'asc' : 'desc');
  };

  const getSortIcon = (key: PriceSortKey) => {
    if (sortKey !== key) return 'unfold_more';
    return sortDirection === 'asc' ? 'arrow_upward' : 'arrow_downward';
  };

  const SortableHeader = ({ label, sk, align = 'left' }: { label: string; sk: PriceSortKey; align?: 'left' | 'right' }) => (
    <th className={`${thCls} ${align === 'right' ? 'text-right' : ''}`}>
      <button
        type="button"
        onClick={() => toggleSort(sk)}
        className={`${align === 'right' ? 'ml-auto ' : ''}inline-flex items-center gap-1 hover:text-slate-600 dark:hover:text-slate-300 transition-colors whitespace-nowrap`}
      >
        {label}
        <span className={`material-symbols-outlined text-[13px] ${sortKey === sk ? sortAccentColor : ''}`}>{getSortIcon(sk)}</span>
      </button>
    </th>
  );

  if (priceTable.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 gap-2">
        <span className="material-symbols-outlined text-[36px] text-slate-300 dark:text-slate-600">table_rows</span>
        <span className="text-[13px] text-slate-400">Sem itens para compor tabela de preco</span>
      </div>
    );
  }

  return (
    <>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="relative w-full max-w-md">
          <span className="material-symbols-outlined text-[16px] text-slate-400 absolute left-3 top-1/2 -translate-y-1/2">
            search
          </span>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Filtrar por nome ou código"
            className="w-full h-9 pl-9 pr-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/30 text-sm text-slate-700 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500 transition-all"
          />
        </div>
        <span className="text-[11px] font-medium text-slate-400 dark:text-slate-500 whitespace-nowrap tabular-nums">
          {filteredAndSorted.length.toLocaleString('pt-BR')} itens
        </span>
      </div>

      {filteredAndSorted.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 gap-2">
          <span className="material-symbols-outlined text-[32px] text-slate-300 dark:text-slate-600">search_off</span>
          <span className="text-[13px] text-slate-400">Nenhum produto encontrado</span>
        </div>
      ) : (
        <>
          <div className="sm:hidden space-y-1.5">
            {filteredAndSorted.map((row) => (
              <div key={`m-${row.code}-${row.description}-${row.unit}`} className="rounded-lg border border-slate-200 dark:border-slate-800 p-2.5">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <div className="min-w-0">
                    <span className="text-[10px] font-mono text-slate-400">{row.code}</span>
                    <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">{row.description}</p>
                  </div>
                  <span className="text-xs font-bold text-slate-900 dark:text-white whitespace-nowrap">{formatPrice(row.lastPrice)}</span>
                </div>
                <div className="flex items-center gap-3 text-[10px] text-slate-500 dark:text-slate-400">
                  <span>Qtd: {formatQuantity(row.totalQuantity)}</span>
                  <span>{row.lastInvoiceNumber || '-'} {row.lastIssueDate ? formatDate(row.lastIssueDate) : ''}</span>
                </div>
              </div>
            ))}
          </div>
          <div className="hidden sm:block overflow-x-auto max-h-[320px] rounded-xl ring-1 ring-slate-200/50 dark:ring-slate-800/50">
            <table className="w-full text-left border-collapse min-w-[760px]">
              <thead className="sticky top-0 z-10">
                <tr className="bg-slate-50 dark:bg-slate-900/70 border-b border-slate-200 dark:border-slate-800">
                  <SortableHeader label="Referência" sk="code" />
                  <SortableHeader label="Produto" sk="description" />
                  <SortableHeader label="Qtd." sk="totalQuantity" align="right" />
                  <SortableHeader label="Último Preço" sk="lastPrice" align="right" />
                  <SortableHeader label="Última NF-e" sk="lastIssueDate" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {filteredAndSorted.map((row) => (
                  <tr key={`${row.code}-${row.description}-${row.unit}`} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30 transition-colors">
                    <td className={`${tdCls} text-xs font-mono text-slate-500 dark:text-slate-400`}>{row.code}</td>
                    <td className={tdCls}>
                      <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">{row.description}</div>
                    </td>
                    <td className={`${tdCls} text-right text-xs font-medium tabular-nums text-slate-600 dark:text-slate-300`}>
                      {formatQuantity(row.totalQuantity)}
                    </td>
                    <td className={`${tdCls} text-right text-xs font-bold tabular-nums text-slate-900 dark:text-white`}>
                      {formatPrice(row.lastPrice)}
                    </td>
                    <td className={tdCls}>
                      <div className="text-xs text-slate-600 dark:text-slate-300">
                        {row.lastInvoiceNumber || '-'}
                      </div>
                      <div className="text-[10px] text-slate-400 dark:text-slate-500">
                        {row.lastIssueDate ? formatDate(row.lastIssueDate) : '-'}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {meta.priceRowsLimited && (
        <div className="mt-3 flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-50 dark:bg-amber-900/20 ring-1 ring-amber-500/20 dark:ring-amber-500/30 text-xs text-amber-700 dark:text-amber-400">
          <span className="material-symbols-outlined text-[14px]">info</span>
          Exibindo {priceTable.length} de {meta.totalPriceRows} itens para preservar desempenho.
        </div>
      )}
    </>
  );
}
