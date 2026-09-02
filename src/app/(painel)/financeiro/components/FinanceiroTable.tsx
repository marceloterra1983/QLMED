'use client';

import React from 'react';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Skeleton from '@/components/ui/Skeleton';
import SortableTh from '@/components/ui/SortableTh';
import { formatAmount, getDateGroupLabel } from '@/lib/utils';
import {
  type Duplicata,
  statusConfig,
  formatVencimento,
  formatParcela,
  getNick,
  getValorColor,
} from './financeiro-utils';

interface FinanceiroTableProps {
  duplicatas: Duplicata[];
  loading: boolean;
  total: number;
  search: string;
  statusFilter: string;
  sortBy: string;
  sortOrder: string;
  collapsedGroups: Set<string>;
  nicknames: Map<string, string>;
  /** 'pagar' | 'receber' — determines entity field and labels */
  direction: 'pagar' | 'receber';
  onSort: (col: string) => void;
  onToggleGroup: (group: string) => void;
  onOpenDetails: (dup: Duplicata) => void;
}


export default function FinanceiroTable({
  duplicatas,
  loading,
  total,
  search,
  statusFilter,
  sortBy,
  sortOrder,
  collapsedGroups,
  nicknames,
  direction,
  onSort,
  onToggleGroup,
  onOpenDetails,
}: FinanceiroTableProps) {
  const entityLabel = direction === 'pagar' ? 'Fornecedor' : 'Cliente';
  const valorColor = getValorColor(direction);
  const emptyIcon = 'payments';
  const emptyMsg = search || statusFilter
    ? 'Nenhuma duplicata encontrada com os filtros aplicados.'
    : `Nenhuma duplicata encontrada nas NF-e ${direction === 'pagar' ? 'recebidas' : 'emitidas'}.`;

  function getEntityCnpj(dup: Duplicata): string | undefined {
    return direction === 'pagar' ? dup.emitenteCnpj : dup.clienteCnpj;
  }
  function getEntityName(dup: Duplicata): string | undefined {
    return direction === 'pagar' ? dup.emitenteNome : dup.clienteNome;
  }

  return (
    <div className="bg-white dark:bg-card-dark rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
      {loading ? (
        <div className="p-6 space-y-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-12 rounded-lg" />
          ))}
        </div>
      ) : duplicatas.length === 0 ? (
        <div className="p-12 text-center">
          <span className="material-symbols-outlined text-[48px] text-slate-300 dark:text-slate-600">{emptyIcon}</span>
          <p className="mt-4 text-slate-500 dark:text-slate-400">{emptyMsg}</p>
        </div>
      ) : (
        <>
          {/* Desktop Table */}
          <div className="hidden lg:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800 text-xs uppercase text-slate-500 dark:text-slate-400 font-bold tracking-wider">
                  <SortableTh col="vencimento" sortBy={sortBy} sortOrder={sortOrder as 'asc' | 'desc'} onSort={onSort} className="w-px whitespace-nowrap">Data</SortableTh>
                  <SortableTh col="nfNumero" sortBy={sortBy} sortOrder={sortOrder as 'asc' | 'desc'} onSort={onSort} className="w-px whitespace-nowrap">NF-e</SortableTh>
                  <SortableTh col="valor" sortBy={sortBy} sortOrder={sortOrder as 'asc' | 'desc'} onSort={onSort} align="right" className="w-px whitespace-nowrap">Valor</SortableTh>
                  <th className="px-3 py-2.5 w-px whitespace-nowrap">Parcela</th>
                  <SortableTh col="emitente" sortBy={sortBy} sortOrder={sortOrder as 'asc' | 'desc'} onSort={onSort}>{entityLabel}</SortableTh>
                  <SortableTh col="status" sortBy={sortBy} sortOrder={sortOrder as 'asc' | 'desc'} onSort={onSort}>Status</SortableTh>
                  <th className="px-3 py-2.5 text-center">Ações</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  let lastGroup = '';
                  return duplicatas.map((dup, idx) => {
                    const group = getDateGroupLabel(dup.dupVencimento + 'T00:00:00');
                    const showDivider = group !== lastGroup;
                    lastGroup = group;
                    const cfg = statusConfig[dup.status];
                    const n = getNick(getEntityCnpj(dup), getEntityName(dup), nicknames);
                    return (
                      <React.Fragment key={`${dup.invoiceId}-${dup.dupNumero}-${idx}`}>
                        {showDivider && (
                          <tr className="cursor-pointer select-none" onClick={() => onToggleGroup(group)}>
                            <td colSpan={7} className="px-4 py-3 bg-slate-100/80 dark:bg-slate-800/60 border-y border-slate-200 dark:border-slate-700">
                              <div className="flex items-center gap-2">
                                <span className="material-symbols-outlined text-[16px] text-slate-500 dark:text-slate-400 transition-transform" style={{ transform: collapsedGroups.has(group) ? 'rotate(-90deg)' : 'rotate(0deg)' }}>expand_more</span>
                                <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{group}</span>
                              </div>
                            </td>
                          </tr>
                        )}
                        {!collapsedGroups.has(group) && (
                          <tr
                            className={`group transition-colors cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40 ${dup.status === 'overdue' ? 'bg-red-50/30 dark:bg-red-900/5' : ''}`}
                            onClick={() => onOpenDetails(dup)}
                          >
                            <td className="px-3 py-3 tabular-nums whitespace-nowrap">
                              <div className={`text-sm font-medium ${dup.status === 'overdue' ? 'text-red-600 dark:text-red-400' : 'text-slate-700 dark:text-slate-300'}`}>{formatVencimento(dup.dupVencimento)}</div>
                              {dup.status === 'overdue' && <div className="text-xs text-red-500">{dup.diasAtraso}d atraso</div>}
                              {dup.status === 'due_soon' && <div className="text-xs text-orange-500">em {dup.diasParaVencer}d</div>}
                            </td>
                            <td className="px-3 py-3 tabular-nums whitespace-nowrap">
                              <span className="text-sm font-mono text-slate-700 dark:text-slate-300">{dup.nfNumero}</span>
                            </td>
                            <td className="px-3 py-3 text-right tabular-nums whitespace-nowrap">
                              <span className={`text-sm font-bold font-mono ${valorColor}`}>{formatAmount(dup.dupValor)}</span>
                            </td>
                            <td className="px-3 py-3 tabular-nums whitespace-nowrap">
                              <span className="text-sm font-mono text-slate-600 dark:text-slate-400">{formatParcela(dup)}</span>
                            </td>
                            <td className="px-3 py-3">
                              <span className="text-sm font-medium text-slate-900 dark:text-white truncate block max-w-[200px]" title={n.display}>{n.display}</span>
                            </td>
                            <td className="px-3 py-3">
                              <Badge tone={cfg.tone}>{cfg.label}</Badge>
                            </td>
                            <td className="px-3 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                              <button onClick={() => onOpenDetails(dup)} className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-slate-500 hover:text-primary dark:hover:text-blue-400 hover:bg-primary/10 transition-colors" title="Visualizar e editar" aria-label="Visualizar e editar">
                                <span className="material-symbols-outlined text-[18px]">search</span>
                              </button>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  });
                })()}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <div className="lg:hidden space-y-2 px-1">
            {(() => {
              const groupTotals = new Map<string, number>();
              for (const d of duplicatas) {
                const g = getDateGroupLabel(d.dupVencimento + 'T00:00:00');
                groupTotals.set(g, (groupTotals.get(g) || 0) + d.dupValor);
              }
              let lastGroup = '';
              return duplicatas.map((dup, idx) => {
                const group = getDateGroupLabel(dup.dupVencimento + 'T00:00:00');
                const showDivider = group !== lastGroup;
                lastGroup = group;
                const isOverdue = dup.status === 'overdue';
                const parcelaLabel = formatParcela(dup);
                const n = getNick(getEntityCnpj(dup), getEntityName(dup), nicknames);
                return (
                  <React.Fragment key={`m-${dup.invoiceId}-${dup.dupNumero}-${idx}`}>
                    {showDivider && group && (
                      <div className="cursor-pointer select-none" onClick={() => onToggleGroup(group)}>
                        <div className="flex items-center gap-2.5 px-2 py-2 bg-gradient-to-r from-slate-100 via-slate-100/70 to-transparent dark:from-slate-800/70 dark:via-slate-800/40 dark:to-transparent rounded-lg">
                          <span className="material-symbols-outlined text-[16px] text-slate-500 dark:text-slate-400 transition-transform duration-200" style={{ transform: collapsedGroups.has(group) ? 'rotate(-90deg)' : 'rotate(0deg)' }}>expand_more</span>
                          <span className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">{group}</span>
                          <span className={`text-xs font-bold ml-auto ${valorColor}`}>{formatAmount(groupTotals.get(group) || 0)}</span>
                        </div>
                      </div>
                    )}
                    {!collapsedGroups.has(group) && (
                      <div
                        className={`border rounded-xl p-3 cursor-pointer ${
                          isOverdue
                            ? 'bg-red-50/70 border-red-200 dark:bg-red-950/25 dark:border-red-900/60'
                            : 'bg-white dark:bg-card-dark border-slate-200 dark:border-slate-800'
                        }`}
                        onClick={() => onOpenDetails(dup)}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-bold text-slate-900 dark:text-white">{dup.nfNumero}</span>
                          <span className={`text-xs font-bold ${isOverdue ? 'text-red-500' : 'text-slate-900 dark:text-white'}`}>{formatVencimento(dup.dupVencimento)}</span>
                        </div>
                        <p className="text-xs font-bold text-slate-900 dark:text-white truncate">{n.display}</p>
                        <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                          <div className="flex items-center gap-2">
                            <span className={`text-sm font-bold font-mono ${valorColor}`}>{formatAmount(dup.dupValor)}</span>
                            <span className="text-xs font-mono text-slate-500 dark:text-slate-400">{parcelaLabel}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            {isOverdue && (
                              <span className="text-xs text-red-500 font-medium">{dup.diasAtraso}d atraso</span>
                            )}
                            <Button
                              onClick={(e) => { e.stopPropagation(); onOpenDetails(dup); }}
                              variant="secondary"
                              size="xs"
                              icon="search"
                            >
                              Detalhes
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}
                  </React.Fragment>
                );
              });
            })()}
          </div>

          {/* Total count */}
          <div className="flex items-center justify-center px-3 py-2 border-t border-slate-100 dark:border-slate-800 bg-slate-50/30 dark:bg-slate-800/20">
            <span className="text-xs text-slate-500 dark:text-slate-400">{total} registros</span>
          </div>
        </>
      )}
    </div>
  );
}
