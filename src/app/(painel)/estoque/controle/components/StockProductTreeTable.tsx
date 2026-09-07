'use client';

import type { ReactNode } from 'react';
import Badge from '@/components/ui/Badge';
import EmptyState from '@/components/ui/EmptyState';
import Button from '@/components/ui/Button';
import { formatInt } from '@/lib/utils';
import {
  allStockCollapseKeys,
  buildStockProductTree,
  expandStockCollapseKeys,
  isStockGroupSameAsLine,
  type StockCatalogProduct,
  type StockGroupNode,
  type StockLineNode,
  type StockSubgroupNode,
} from '@/lib/stock-catalog';
import type { ValidityBand } from '@/lib/stock-ledger';
import type { BadgeTone } from '@/components/ui/Badge';

const VALIDITY_LABEL: Record<ValidityBand, string> = {
  vencido: 'Vencido',
  d30: '≤ 30d',
  d90: '≤ 90d',
  ok: 'OK',
  sem_validade: '—',
};

const VALIDITY_TONE: Record<ValidityBand, BadgeTone> = {
  vencido: 'danger',
  d30: 'warning',
  d90: 'info',
  ok: 'success',
  sem_validade: 'neutral',
};

interface StockProductTreeTableProps {
  products: StockCatalogProduct[];
  collapsed: Set<string>;
  onToggle: (key: string) => void;
  onCollapseAll: () => void;
  onExpandAll: () => void;
  onOpenProduct: (product: StockCatalogProduct) => void;
  expandedCodigo?: string | null;
  renderExpanded?: (product: StockCatalogProduct) => ReactNode;
  emptyHint?: string;
}

export function collapseAllStock(products: StockCatalogProduct[]): Set<string> {
  return allStockCollapseKeys(products);
}

export function expandAllStock(products: StockCatalogProduct[]): Set<string> {
  return expandStockCollapseKeys(products);
}

export default function StockProductTreeTable({
  products,
  collapsed,
  onToggle,
  onCollapseAll,
  onExpandAll,
  onOpenProduct,
  expandedCodigo,
  renderExpanded,
  emptyHint = 'Ajuste os filtros ou rode o backfill',
}: StockProductTreeTableProps) {
  const tree = buildStockProductTree(products);

  if (products.length === 0) {
    return <EmptyState icon="warehouse" title="Nenhum produto encontrado" hint={emptyHint} />;
  }

  function qtyCell(n: number, danger = false) {
    const cls =
      n < 0
        ? 'text-red-600 dark:text-red-400'
        : danger && n === 0
          ? 'text-slate-500 dark:text-slate-400'
          : 'text-slate-900 dark:text-white';
    return <span className={`font-semibold tabular-nums ${cls}`}>{n}</span>;
  }

  const renderLine = (line: StockLineNode, isCollapsed: boolean) => (
    <div className="flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-primary/10 to-transparent dark:from-primary/20 dark:to-transparent border-b border-primary/20 dark:border-primary/30">
      <span
        className="material-symbols-outlined text-[16px] text-primary dark:text-blue-400 transition-transform"
        style={{ transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}
        aria-hidden="true"
      >
        expand_more
      </span>
      <span className="text-sm font-bold text-primary dark:text-blue-400">{line.name}</span>
      <Badge tone="info" dot={false}>{formatInt(line.products.length)}</Badge>
    </div>
  );

  const renderGroup = (group: StockGroupNode, isCollapsed: boolean) => (
    <div className="flex items-center gap-2 pl-8 pr-3 py-1.5 bg-gradient-to-r from-amber-50/90 to-transparent dark:from-amber-950/25 dark:to-transparent border-b border-amber-200/50 dark:border-amber-800/25">
      <span
        className="material-symbols-outlined text-[15px] text-amber-400 dark:text-amber-600 transition-transform"
        style={{ transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}
        aria-hidden="true"
      >
        expand_more
      </span>
      <div className="w-0.5 h-3 rounded-full bg-amber-400 dark:bg-amber-600" />
      <span className="text-xs font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">{group.name}</span>
      <Badge tone="warning" dot={false}>{formatInt(group.products.length)}</Badge>
    </div>
  );

  const renderSub = (sub: StockSubgroupNode, isCollapsed: boolean) => (
    <div className="flex items-center gap-2 pl-14 pr-3 py-1.5 bg-gradient-to-r from-teal-50/80 to-transparent dark:from-teal-950/20 dark:to-transparent border-b border-teal-200/40 dark:border-teal-800/25">
      <span
        className="material-symbols-outlined text-[14px] text-teal-500 dark:text-teal-400 transition-transform"
        style={{ transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}
        aria-hidden="true"
      >
        expand_more
      </span>
      <span className="text-xs font-semibold text-teal-800 dark:text-teal-300">{sub.name}</span>
      <Badge tone="success" dot={false}>{formatInt(sub.products.length)}</Badge>
    </div>
  );

  function productRow(p: StockCatalogProduct) {
    const open = expandedCodigo === p.productCodigo;
    return (
      <div key={p.productCodigo}>
        <button
          type="button"
          onClick={() => onOpenProduct(p)}
          className="w-full text-left grid grid-cols-[7rem_7rem_minmax(0,1fr)_8rem_5rem_5rem_5rem_5rem] gap-2 px-3 py-2 border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50"
        >
          <span className="font-mono text-xs text-slate-700 dark:text-slate-200">{p.productCodigo}</span>
          <span className="font-mono text-xs text-slate-500 dark:text-slate-400 truncate">{p.code || '—'}</span>
          <span className="text-sm text-slate-900 dark:text-white truncate">{p.productName}</span>
          <span className="text-xs text-slate-500 dark:text-slate-400 truncate">{p.manufacturer || '—'}</span>
          <span className="text-right">{qtyCell(p.qtyCd)}</span>
          <span className="text-right">{qtyCell(p.qtyCustomer)}</span>
          <span className="text-right">{qtyCell(p.qtyTotal)}</span>
          <span>
            {p.worstValidity ? (
              <Badge tone={VALIDITY_TONE[p.worstValidity]}>{VALIDITY_LABEL[p.worstValidity]}</Badge>
            ) : (
              <span className="text-xs text-slate-500 dark:text-slate-400">—</span>
            )}
          </span>
        </button>
        {open && renderExpanded ? (
          <div className="border-b border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-900/40 px-4 py-3">
            {renderExpanded(p)}
          </div>
        ) : null}
      </div>
    );
  }

  const rows: ReactNode[] = [];
  for (const line of tree) {
    const lineClosed = collapsed.has(line.key);
    rows.push(
      <button key={line.key} type="button" onClick={() => onToggle(line.key)} className="w-full text-left">
        {renderLine(line, lineClosed)}
      </button>,
    );
    if (lineClosed) continue;
    for (const group of line.groups) {
      const skipGroupHeader = group.sameAsLine || isStockGroupSameAsLine(group.products[0] ?? { productType: line.name, productSubtype: group.name });
      const groupClosed = !skipGroupHeader && collapsed.has(group.key);
      if (!skipGroupHeader) {
        rows.push(
          <button key={group.key} type="button" onClick={() => onToggle(group.key)} className="w-full text-left">
            {renderGroup(group, groupClosed)}
          </button>,
        );
      }
      if (groupClosed) continue;
      for (const sub of group.subgroups) {
        const subClosed = collapsed.has(sub.key);
        rows.push(
          <button key={sub.key} type="button" onClick={() => onToggle(sub.key)} className="w-full text-left">
            {renderSub(sub, subClosed)}
          </button>,
        );
        if (!subClosed) {
          for (const p of sub.products) rows.push(productRow(p));
        }
      }
      for (const p of group.loose) rows.push(productRow(p));
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden bg-white dark:bg-slate-900/40">
      <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
        <Button type="button" variant="secondary" size="sm" onClick={onCollapseAll} aria-label="Recolher todos os grupos">
          <span className="material-symbols-outlined text-[14px]">unfold_less</span>
          Recolher
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={onExpandAll} aria-label="Expandir todos os grupos">
          <span className="material-symbols-outlined text-[14px]">unfold_more</span>
          Expandir
        </Button>
        <span className="ml-auto text-xs text-slate-500 dark:text-slate-400">{formatInt(products.length)} produtos</span>
      </div>
      <div className="hidden md:grid grid-cols-[7rem_7rem_minmax(0,1fr)_8rem_5rem_5rem_5rem_5rem] gap-2 px-3 py-1.5 text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-800">
        <span>Cód. Spica</span>
        <span>Referência</span>
        <span>Produto</span>
        <span>Fabricante</span>
        <span className="text-right">CD</span>
        <span className="text-right">Consig.</span>
        <span className="text-right">Total</span>
        <span>Validade</span>
      </div>
      {rows}
    </div>
  );
}
