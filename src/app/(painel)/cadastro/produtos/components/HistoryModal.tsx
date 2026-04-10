'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { formatAmount } from '@/lib/utils';
import { useModalBackButton } from '@/hooks/useModalBackButton';
import type { ProductRow } from '../types';
import { formatQuantity, formatDate } from './product-utils';

interface HistoryItem {
  invoiceId: string;
  invoiceNumber: string | null;
  issueDate: string | null;
  supplierName: string | null;
  customerName: string | null;
  quantity: number;
  unitPrice: number;
  totalValue: number;
  batch: string | null;
  expiry: string | null;
  fabrication: string | null;
}

interface HistoryModalProps {
  product: ProductRow;
  onClose: () => void;
  onOpenInvoice: (id: string) => void;
}

const colorMap = {
  blue: {
    iconBg: 'bg-blue-500/10 dark:bg-blue-500/20 ring-blue-500/20 dark:ring-blue-500/30',
    statBg: 'bg-blue-50/80 dark:bg-blue-900/15', statRing: 'ring-1 ring-blue-200/60 dark:ring-blue-800/30',
    statIconBg: 'bg-blue-500/10 ring-blue-500/20', icon: 'text-blue-500',
    text: 'text-blue-700 dark:text-blue-300',
    badge: 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 ring-1 ring-blue-200/50 dark:ring-blue-800/30',
    btn: 'text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20',
    groupHover: 'hover:bg-blue-50/50 dark:hover:bg-blue-900/10',
  },
  amber: {
    iconBg: 'bg-amber-500/10 dark:bg-amber-500/20 ring-amber-500/20 dark:ring-amber-500/30',
    statBg: 'bg-amber-50/80 dark:bg-amber-900/15', statRing: 'ring-1 ring-amber-200/60 dark:ring-amber-800/30',
    statIconBg: 'bg-amber-500/10 ring-amber-500/20', icon: 'text-amber-500',
    text: 'text-amber-700 dark:text-amber-300',
    badge: 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 ring-1 ring-amber-200/50 dark:ring-amber-800/30',
    btn: 'text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20',
    groupHover: 'hover:bg-amber-50/50 dark:hover:bg-amber-900/10',
  },
  purple: {
    iconBg: 'bg-purple-500/10 dark:bg-purple-500/20 ring-purple-500/20 dark:ring-purple-500/30',
    statBg: 'bg-purple-50/80 dark:bg-purple-900/15', statRing: 'ring-1 ring-purple-200/60 dark:ring-purple-800/30',
    statIconBg: 'bg-purple-500/10 ring-purple-500/20', icon: 'text-purple-500',
    text: 'text-purple-700 dark:text-purple-300',
    badge: 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 ring-1 ring-purple-200/50 dark:ring-purple-800/30',
    btn: 'text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20',
    groupHover: 'hover:bg-purple-50/50 dark:hover:bg-purple-900/10',
  },
};

export default function HistoryModal({ product, onClose, onOpenInvoice }: HistoryModalProps) {
  const [purchaseHistory, setPurchaseHistory] = useState<HistoryItem[]>([]);
  const [salesHistory, setSalesHistory] = useState<HistoryItem[]>([]);
  const [consignmentHistory, setConsignmentHistory] = useState<HistoryItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [loadingSalesHistory, setLoadingSalesHistory] = useState(false);
  const [loadingConsignment, setLoadingConsignment] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [expandedBatch, setExpandedBatch] = useState<Set<string>>(new Set());

  const handleClose = useCallback(() => onClose(), [onClose]);
  useModalBackButton(true, handleClose);

  useEffect(() => {
    if (!product.code) return;
    const params = new URLSearchParams({ code: product.code });
    if (product.unit) params.set('unit', product.unit);
    setLoadingHistory(true);
    fetch(`/api/products/history?${params}`).then(r => r.json()).then(d => setPurchaseHistory(d.history || [])).catch(() => {}).finally(() => setLoadingHistory(false));
    const salesParams = new URLSearchParams({ code: product.code, direction: 'issued', description: product.description });
    if (product.unit) salesParams.set('unit', product.unit);
    setLoadingSalesHistory(true);
    fetch(`/api/products/history?${salesParams}`).then(r => r.json()).then(d => setSalesHistory(d.history || [])).catch(() => {}).finally(() => setLoadingSalesHistory(false));
    const consigParams = new URLSearchParams({ code: product.code, direction: 'issued', description: product.description, filter: 'consignment' });
    if (product.unit) consigParams.set('unit', product.unit);
    setLoadingConsignment(true);
    fetch(`/api/products/history?${consigParams}`).then(r => r.json()).then(d => setConsignmentHistory(d.history || [])).catch(() => {}).finally(() => setLoadingConsignment(false));
  }, [product.code, product.unit, product.description]);

  const calcStats = (items: HistoryItem[]) => {
    const totalValue = items.reduce((s, h) => s + h.totalValue, 0);
    const totalQty = items.reduce((s, h) => s + h.quantity, 0);
    const invoiceCount = new Set(items.map(h => h.invoiceId)).size;
    const sorted = [...items].sort((a, b) => (b.issueDate || '').localeCompare(a.issueDate || ''));
    const lastPrice = sorted.length > 0 ? sorted[0].unitPrice : 0;
    const avgPrice = totalQty > 0 ? totalValue / totalQty : 0;
    return { totalValue, totalQty, invoiceCount, lastPrice, avgPrice };
  };

  const groupBy = (items: HistoryItem[], key: 'supplierName' | 'customerName') => {
    const map = new Map<string, HistoryItem[]>();
    for (const h of items) { const name = h[key] || 'Nao identificado'; if (!map.has(name)) map.set(name, []); map.get(name)!.push(h); }
    return Array.from(map.entries()).sort((a, b) => {
      const latestA = a[1].reduce((max, h) => h.issueDate && h.issueDate > max ? h.issueDate : max, '');
      const latestB = b[1].reduce((max, h) => h.issueDate && h.issueDate > max ? h.issueDate : max, '');
      return latestB.localeCompare(latestA);
    });
  };

  const toggleGrp = (key: string) => setExpandedGroups(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  const toggleRow = (key: string) => setExpandedRows(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  const toggleBatch = (key: string) => setExpandedBatch(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });

  const TruncatedCell = ({ text, id }: { text: string | null; id: string }) => {
    if (!text || text === '-') return <span>-</span>;
    if (text.length <= 20) return <span>{text}</span>;
    return <span className="cursor-pointer hover:text-blue-500 transition-colors" title={text} onClick={() => toggleBatch(id)}>{expandedBatch.has(id) ? text : text.slice(0, 18) + '...'}</span>;
  };

  const SummaryCards = ({ stats, color }: { stats: ReturnType<typeof calcStats>; color: 'blue' | 'amber' | 'purple' }) => {
    const cm = colorMap[color];
    return (
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-4">
        {[
          { label: 'Total', value: formatAmount(stats.totalValue), icon: 'payments' },
          { label: 'Qtde Total', value: formatQuantity(stats.totalQty), icon: 'inventory_2' },
          { label: 'Notas', value: String(stats.invoiceCount), icon: 'receipt_long' },
          { label: 'Ultimo Preco', value: formatAmount(stats.lastPrice), icon: 'trending_up' },
          { label: 'Preco Medio', value: formatAmount(stats.avgPrice), icon: 'monitoring' },
        ].map(c => (
          <div key={c.label} className={`flex items-center gap-2 rounded-xl px-2.5 py-2 ${cm.statBg} ${cm.statRing}`}>
            <div className={`w-6 h-6 rounded-md flex items-center justify-center ring-1 shrink-0 ${cm.statIconBg}`}><span className={`material-symbols-outlined text-[13px] ${cm.icon}`}>{c.icon}</span></div>
            <div className="min-w-0"><p className="text-[9px] uppercase tracking-wider text-slate-500 dark:text-slate-400 font-bold">{c.label}</p><p className={`text-[13px] font-extrabold ${cm.text} truncate`}>{c.value}</p></div>
          </div>
        ))}
      </div>
    );
  };

  const HistoryTable = ({ items, nameKey, groupKey, color }: { items: HistoryItem[]; nameKey: 'supplierName' | 'customerName'; groupKey: string; color: 'blue' | 'amber' | 'purple' }) => {
    const cm = colorMap[color];
    const groups = groupBy(items, nameKey);
    return (
      <div className="space-y-2.5">
        {groups.map(([name, rows]) => {
          const gk = `${groupKey}-${name}`;
          const isOpen = expandedGroups.has(gk);
          const isRowsExpanded = expandedRows.has(gk);
          const visibleRows = isRowsExpanded ? rows : rows.slice(0, 3);
          const remaining = rows.length - 3;
          const grpTotal = rows.reduce((s, r) => s + r.totalValue, 0);
          return (
            <div key={gk} className={`rounded-xl overflow-hidden transition-colors ring-1 ${isOpen ? 'ring-slate-200 dark:ring-slate-700 bg-white dark:bg-card-dark shadow-sm' : `ring-slate-200/50 dark:ring-slate-700/40 ${cm.groupHover}`}`}>
              <button className={`w-full flex items-center justify-between px-4 py-2.5 text-left transition-colors ${isOpen ? '' : 'bg-white/60 dark:bg-slate-800/30'}`} onClick={() => toggleGrp(gk)}>
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className={`material-symbols-outlined text-[16px] transition-transform duration-200 ${isOpen ? 'rotate-90' : ''} ${cm.icon}`}>chevron_right</span>
                  <span className="text-[13px] font-semibold text-slate-800 dark:text-white truncate">{name}</span>
                  <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold ${cm.badge}`}>{rows.length}</span>
                </div>
                <span className={`text-[12px] font-bold tabular-nums ${cm.text}`}>{formatAmount(grpTotal)}</span>
              </button>
              {isOpen && (
                <div className="overflow-x-auto border-t border-slate-100 dark:border-slate-800/60">
                  <table className="w-full text-[11px]">
                    <thead><tr className="bg-slate-50 dark:bg-slate-900/70">
                      <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Data</th>
                      <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">NF-e</th>
                      <th className="px-3 py-2 text-right text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Qtde</th>
                      <th className="px-3 py-2 text-right text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Vlr Unit.</th>
                      <th className="px-3 py-2 text-right text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Total</th>
                      <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Lote</th>
                      <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Validade</th>
                    </tr></thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
                      {visibleRows.map((h, i) => (
                        <tr key={i} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/20 transition-colors">
                          <td className="px-3 py-2 text-slate-700 dark:text-slate-300 whitespace-nowrap">{formatDate(h.issueDate)}</td>
                          <td className="px-3 py-2"><button onClick={() => onOpenInvoice(h.invoiceId)} className="text-primary hover:text-primary-dark hover:underline font-mono font-medium transition-colors">{h.invoiceNumber || '-'}</button></td>
                          <td className="px-3 py-2 text-right font-semibold text-slate-800 dark:text-white tabular-nums">{formatQuantity(h.quantity)}</td>
                          <td className="px-3 py-2 text-right text-slate-600 dark:text-slate-400 tabular-nums">{formatAmount(h.unitPrice)}</td>
                          <td className="px-3 py-2 text-right font-semibold text-slate-800 dark:text-white tabular-nums">{formatAmount(h.totalValue)}</td>
                          <td className="px-3 py-2 text-slate-600 dark:text-slate-400 font-mono"><TruncatedCell text={h.batch || '-'} id={`${gk}-batch-${i}`} /></td>
                          <td className="px-3 py-2 text-slate-600 dark:text-slate-400 whitespace-nowrap"><TruncatedCell text={h.expiry ? formatDate(h.expiry) : '-'} id={`${gk}-expiry-${i}`} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {remaining > 0 && (
                    <button onClick={() => toggleRow(gk)} className={`w-full py-2.5 text-[11px] font-semibold transition-colors border-t border-slate-100 dark:border-slate-800/50 ${cm.btn}`}>
                      {isRowsExpanded ? <><span className="material-symbols-outlined text-[13px] align-middle mr-1">expand_less</span>Mostrar menos</> : <><span className="material-symbols-outlined text-[13px] align-middle mr-1">expand_more</span>Ver mais {remaining} registro{remaining > 1 ? 's' : ''}</>}
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  const isSectionOpen = (key: string, defaultOpen: boolean) => defaultOpen ? !expandedGroups.has(`__${key}_closed__`) : expandedGroups.has(`__${key}_open__`);
  const toggleSection = (key: string, defaultOpen: boolean) => {
    setExpandedGroups(prev => { const n = new Set(prev); if (defaultOpen) { const k = `__${key}_closed__`; n.has(k) ? n.delete(k) : n.add(k); } else { const k = `__${key}_open__`; n.has(k) ? n.delete(k) : n.add(k); } return n; });
  };

  const HistSectionCard = ({ sectionKey, defaultOpen, icon, iconColor, label, count, totalValue, sectionLoading, empty, emptyMsg, color, children }: {
    sectionKey: string; defaultOpen: boolean; icon: string; iconColor: string; label: string; count: number; totalValue: number; sectionLoading: boolean; empty: boolean; emptyMsg: string; color: 'blue' | 'amber' | 'purple'; children: React.ReactNode;
  }) => {
    const isOpen = isSectionOpen(sectionKey, defaultOpen);
    const cm = colorMap[color];
    return (
      <div className="bg-white dark:bg-card-dark rounded-2xl ring-1 ring-slate-200/60 dark:ring-slate-800/50 overflow-hidden">
        <button onClick={() => toggleSection(sectionKey, defaultOpen)} className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50/80 dark:hover:bg-slate-800/30 transition-colors">
          <div className="flex items-center gap-2.5">
            <div className={`w-7 h-7 rounded-lg flex items-center justify-center ring-1 shrink-0 ${cm.iconBg}`}><span className={`material-symbols-outlined text-[15px] ${iconColor}`}>{icon}</span></div>
            <h4 className="text-[13px] font-bold text-slate-900 dark:text-white">{label}</h4>
            {count > 0 && <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${cm.badge}`}>{count}</span>}
          </div>
          <div className="flex items-center gap-3">
            {!sectionLoading && count > 0 && <span className={`text-[13px] font-bold tabular-nums ${cm.text}`}>{formatAmount(totalValue)}</span>}
            <span className="material-symbols-outlined text-[16px] text-slate-400 transition-transform duration-200" style={{ transform: isOpen ? 'rotate(0deg)' : 'rotate(-90deg)' }}>expand_more</span>
          </div>
        </button>
        {isOpen && (
          <div className="px-4 py-4 border-t border-slate-100 dark:border-slate-800/60">
            {sectionLoading ? (
              <div className="flex flex-col items-center justify-center gap-2 py-8">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ring-1 ${cm.iconBg}`}><span className={`material-symbols-outlined text-[20px] ${cm.icon} animate-spin`}>progress_activity</span></div>
                <p className="text-[13px] font-medium text-slate-400">Carregando historico...</p>
              </div>
            ) : empty ? (
              <div className="flex flex-col items-center py-8">
                <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center ring-1 ring-slate-200/50 dark:ring-slate-700/50 mb-2"><span className="material-symbols-outlined text-[24px] text-slate-300 dark:text-slate-600">inbox</span></div>
                <p className="text-[13px] text-slate-400 dark:text-slate-500">{emptyMsg}</p>
              </div>
            ) : <>{children}</>}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 !mt-0 sm:flex sm:items-center sm:justify-center sm:p-4 sm:bg-black/60 sm:backdrop-blur-sm" onClick={onClose}>
      <div className="absolute inset-0 sm:relative sm:inset-auto bg-slate-50 dark:bg-[#1a1e2e] sm:rounded-2xl w-full sm:max-w-4xl sm:h-auto sm:max-h-[92vh] flex flex-col overflow-hidden sm:shadow-2xl sm:ring-1 ring-black/5 dark:ring-white/5" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="px-4 sm:px-6 py-4 bg-white dark:bg-card-dark border-b border-slate-200 dark:border-slate-700 shrink-0 shadow-[0_2px_8px_rgba(0,0,0,0.08)] sm:shadow-none">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500/20 to-blue-500/5 dark:from-blue-500/30 dark:to-blue-500/10 flex items-center justify-center ring-1 ring-blue-500/20 dark:ring-blue-500/30">
              <span className="material-symbols-outlined text-[22px] text-blue-500">history</span>
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-[15px] font-bold text-slate-900 dark:text-white leading-snug">
                {product.code && <><span className="font-mono text-blue-600 dark:text-blue-400">{product.code}</span><span className="text-slate-300 dark:text-slate-600 mx-1.5">/</span></>}
                {product.description}
              </h3>
              {product.shortName && <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-0.5">{product.shortName}</p>}
              <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                {product.productType && <span className="px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200/60 dark:border-indigo-800/40 text-[10px] font-bold text-indigo-600 dark:text-indigo-400">{product.productType}</span>}
                {product.productSubtype && <span className="px-2 py-0.5 rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-200/60 dark:border-amber-800/40 text-[10px] font-bold text-amber-600 dark:text-amber-400">{product.productSubtype}</span>}
                {product.outOfLine && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-[10px] font-bold text-red-600 dark:text-red-400"><span className="material-symbols-outlined text-[11px]">block</span>Fora de Linha</span>}
              </div>
            </div>
            <button onClick={onClose} className="flex-shrink-0 p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"><span className="material-symbols-outlined text-[20px]">close</span></button>
          </div>
        </div>

        {/* Content */}
        <div className="overflow-y-auto flex-1 p-4 sm:p-5 space-y-4">
          <HistSectionCard sectionKey="compras" defaultOpen={true} icon="shopping_cart" iconColor="text-blue-500" label="Historico de Compras" count={purchaseHistory.length} totalValue={purchaseHistory.reduce((s, h) => s + h.totalValue, 0)} sectionLoading={loadingHistory} empty={purchaseHistory.length === 0} emptyMsg="Nenhum registro de compra encontrado." color="blue">
            <SummaryCards stats={calcStats(purchaseHistory)} color="blue" />
            <HistoryTable items={purchaseHistory} nameKey="supplierName" groupKey="purchase" color="blue" />
          </HistSectionCard>
          <HistSectionCard sectionKey="vendas" defaultOpen={true} icon="storefront" iconColor="text-amber-500" label="Historico de Vendas" count={salesHistory.length} totalValue={salesHistory.reduce((s, h) => s + h.totalValue, 0)} sectionLoading={loadingSalesHistory} empty={salesHistory.length === 0} emptyMsg="Nenhum registro de venda encontrado." color="amber">
            <SummaryCards stats={calcStats(salesHistory)} color="amber" />
            <HistoryTable items={salesHistory} nameKey="customerName" groupKey="sales" color="amber" />
          </HistSectionCard>
          <HistSectionCard sectionKey="consig" defaultOpen={false} icon="swap_horiz" iconColor="text-purple-500" label="Movimentacoes (Consignacao)" count={consignmentHistory.length} totalValue={consignmentHistory.reduce((s, h) => s + h.totalValue, 0)} sectionLoading={loadingConsignment} empty={consignmentHistory.length === 0} emptyMsg="Nenhuma movimentacao de consignacao encontrada." color="purple">
            <SummaryCards stats={calcStats(consignmentHistory)} color="purple" />
            <HistoryTable items={consignmentHistory} nameKey="customerName" groupKey="consignment" color="purple" />
          </HistSectionCard>
        </div>

        {/* Footer */}
        <div className="px-4 sm:px-6 py-3.5 border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-card-dark shrink-0 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] sm:shadow-none">
          <div className="sm:hidden"><button onClick={onClose} className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-primary text-white font-bold text-base active:bg-primary-dark transition-colors shadow-sm"><span className="material-symbols-outlined text-[18px]">arrow_back</span>Voltar</button></div>
          <div className="hidden sm:flex justify-end"><button onClick={onClose} className="px-4 py-2.5 text-sm font-medium text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">Fechar</button></div>
        </div>
      </div>
    </div>
  );
}
