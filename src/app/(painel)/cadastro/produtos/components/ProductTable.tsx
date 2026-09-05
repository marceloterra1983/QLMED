'use client';

import React from 'react';
import Badge from '@/components/ui/Badge';
import EmptyState from '@/components/ui/EmptyState';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Spinner from '@/components/ui/Spinner';
import Skeleton from '@/components/ui/Skeleton';
import SortableTh from '@/components/ui/SortableTh';
import { formatAmount, formatInt } from '@/lib/utils';
import type { ProductRow, ProductsSummary, SortField } from '../types';
import { formatDate, getAnvisaExpirationBadge, highlightMatch } from './product-utils';
import {
  productGroupKey,
  productLineKey,
  safeCollapseKeys,
} from './product-group-visibility';

interface ProductTableProps {
  products: ProductRow[];
  loading: boolean;
  isRebuilding: boolean;
  summary: ProductsSummary;
  sortBy: SortField;
  sortOrder: 'asc' | 'desc';
  search: string;
  collapsedGroups: Set<string>;
  toggleGroup: (g: string) => void;
  selectionEnabled: boolean;
  setSelectionEnabled: (fn: (v: boolean) => boolean) => void;
  selectedKeys: Set<string>;
  setSelectedKeys: (fn: (prev: Set<string>) => Set<string>) => void;
  toggleSelect: (key: string) => void;
  toggleSelectGroup: (matchFn: (p: ProductRow) => boolean) => void;
  setCollapsedGroups: (v: Set<string>) => void;
  handleSort: (field: SortField) => void;
  openDetail: (product: ProductRow, initialSections?: string[]) => void;
  openHistory: (product: ProductRow) => void;
  canWrite: boolean;
  setSettingsOpen: (v: boolean) => void;
}

const getGroupLabel = (product: ProductRow, sortBy: SortField): string => productGroupKey(product, sortBy);

const getLineLabel = (product: ProductRow): string => productLineKey(product);

const TABLE_DATA_COLS = 8; // Cod. Spica, Referencia, Produto, ANVISA, Fabricante, Ult. Compra, Ult. Preco, Acoes

/** Ordenações sem agrupamento hierárquico — lista flat linha a linha. */
const FLAT_SORTS = new Set<SortField>(['codigo']);

export default function ProductTable({
  products, loading, isRebuilding, summary, sortBy, sortOrder, search,
  collapsedGroups, toggleGroup, selectionEnabled, setSelectionEnabled,
  selectedKeys, setSelectedKeys, toggleSelect, toggleSelectGroup,
  setCollapsedGroups, handleSort, openDetail, openHistory, canWrite, setSettingsOpen,
}: ProductTableProps) {
  const visible = products;

  const renderCollapsed = collapsedGroups;

  // visible keys for select-all
  const visibleKeys = React.useMemo(() => {
    if (FLAT_SORTS.has(sortBy)) return products.map((p) => p.key);
    const keys: string[] = [];
    let lastGroup = '';
    for (const p of products) {
      const g = getGroupLabel(p, sortBy);
      if (g !== lastGroup) lastGroup = g;
      const lineKey = sortBy === 'productType' ? getLineLabel(p) : '';
      if (g && renderCollapsed.has(g)) continue;
      if (sortBy === 'productType' && renderCollapsed.has(lineKey)) continue;
      keys.push(p.key);
    }
    return keys;
  }, [products, renderCollapsed, sortBy]);

  const allVisibleSelected = visibleKeys.length > 0 && visibleKeys.every((k) => selectedKeys.has(k));
  const someVisibleSelected = visibleKeys.some((k) => selectedKeys.has(k));
  const sortCol = (col: string) => handleSort(col as SortField);

  const toggleSelectAll = () => {
    if (allVisibleSelected) {
      setSelectedKeys((prev) => { const n = new Set(prev); visibleKeys.forEach((k) => n.delete(k)); return n; });
    } else {
      setSelectedKeys((prev) => { const n = new Set(prev); visibleKeys.forEach((k) => n.add(k)); return n; });
    }
  };

  const allGroups = Array.from(new Set(visible.map((p) => getGroupLabel(p, sortBy)).filter(Boolean)));
  const hasGroups = !FLAT_SORTS.has(sortBy) && allGroups.length > 0;
  const tableColSpan = TABLE_DATA_COLS + (selectionEnabled ? 1 : 0);

  const renderProductRow = (product: ProductRow, inTable: boolean) => {
    if (inTable) {
      return (
        <tr key={product.key} className={`hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors border-b border-slate-100 dark:border-slate-800/50 ${selectionEnabled && selectedKeys.has(product.key) ? 'bg-primary/5 dark:bg-primary/10' : ''} ${product.outOfLine ? 'italic' : ''}`}>
          {selectionEnabled && (
            <td className="px-3 py-3 w-8" onClick={(e) => e.stopPropagation()}>
              <input type="checkbox" checked={selectedKeys.has(product.key)} onChange={() => toggleSelect(product.key)} aria-label={`Selecionar ${product.shortName || product.description}`} className="w-4 h-4 rounded border-slate-200 text-primary dark:text-blue-400 cursor-pointer" />
            </td>
          )}
          <td className="px-3 py-3 cursor-pointer" onClick={() => openDetail(product)}>
            <span className={`text-xs font-mono font-bold ${product.outOfLine ? 'text-slate-500 dark:text-slate-400' : 'text-emerald-800 dark:text-emerald-300'}`}>
              {product.codigo ? (search ? highlightMatch(product.codigo, search) : product.codigo) : '\u2014'}
            </span>
          </td>
          <td className="px-3 py-3 cursor-pointer" onClick={() => openDetail(product)}>
            <div className="flex items-center gap-1">
              {product.outOfLine && <span className="material-symbols-outlined text-[14px] text-slate-500 dark:text-slate-400 shrink-0 not-italic" title="Fora de linha">block</span>}
              <span className={`text-xs font-mono font-semibold hover:text-primary dark:hover:text-blue-400 transition-colors ${product.outOfLine ? 'text-slate-500 dark:text-slate-400' : 'text-slate-900 dark:text-white'}`}>
                {search ? highlightMatch(product.code || '-', search) : (product.code || '-')}
              </span>
            </div>
          </td>
          <td className="px-3 py-3 cursor-pointer" onClick={() => openDetail(product)}>
            <div className="hover:text-primary dark:hover:text-blue-400 transition-colors">
              {product.shortName ? (
                <><span className={`text-xs font-semibold block leading-tight ${product.outOfLine ? 'text-slate-500 dark:text-slate-400' : 'text-slate-900 dark:text-white'}`}>{search ? highlightMatch(product.shortName, search) : product.shortName}</span><span className="text-xs block leading-tight text-slate-500 dark:text-slate-400">{search ? highlightMatch(product.description, search) : product.description}</span></>
              ) : (
                <span className={`text-xs font-semibold ${product.outOfLine ? 'text-slate-500 dark:text-slate-400' : 'text-slate-900 dark:text-white'}`}>{search ? highlightMatch(product.description, search) : product.description}</span>
              )}
            </div>
          </td>
          <td className="px-3 py-3 cursor-pointer" onClick={() => openDetail(product, ['anvisa'])}>
            <span className={`text-xs font-mono hover:text-teal-600 dark:hover:text-teal-400 transition-colors ${product.outOfLine ? 'text-slate-500 dark:text-slate-400' : product.anvisa ? 'text-slate-700 dark:text-slate-300' : 'text-red-400 dark:text-red-500'}`}>{search ? highlightMatch(product.anvisa || '\u2014', search) : (product.anvisa || '\u2014')}</span>
            {(() => { const badge = getAnvisaExpirationBadge(product.anvisaExpiration); return badge ? <span className={`ml-1.5 inline-block px-1.5 py-0.5 rounded text-xs font-bold border ${badge.className}`}>{badge.label}</span> : null; })()}
          </td>
          <td className="px-3 py-3"><span className={`text-xs ${product.outOfLine ? 'text-slate-500 dark:text-slate-400' : 'text-slate-600 dark:text-slate-400'}`} title={product.anvisaManufacturer || ''}>{search ? highlightMatch(product.manufacturerShortName || product.anvisaManufacturer || '-', search) : (product.manufacturerShortName || product.anvisaManufacturer || '-')}</span></td>
          <td className="px-3 py-3 text-right tabular-nums"><span className={`text-xs font-medium ${product.outOfLine ? 'text-slate-500 dark:text-slate-400' : 'text-slate-700 dark:text-slate-300'}`}>{formatDate(product.lastIssueDate)}</span></td>
          <td className="px-3 py-3 text-right tabular-nums"><span className={`text-xs font-medium ${product.outOfLine ? 'text-slate-500 dark:text-slate-400' : 'text-slate-700 dark:text-slate-300'}`}>{formatAmount(product.lastPrice)}</span></td>
          <td className="px-3 py-3 text-center">
            <div className="flex items-center justify-center gap-0.5">
              <button onClick={() => openDetail(product)} className="p-1 rounded-lg text-slate-700 dark:text-slate-200 hover:text-primary dark:hover:text-blue-400 transition-colors not-italic" title="Ver detalhes" aria-label="Ver detalhes"><span className="material-symbols-outlined text-[18px]">search</span></button>
              <button onClick={() => openHistory(product)} className="p-1 rounded-lg text-slate-700 dark:text-slate-200 hover:text-primary dark:hover:text-blue-400 transition-colors not-italic" title="Historico" aria-label="Historico"><span className="material-symbols-outlined text-[18px]">history</span></button>
            </div>
          </td>
        </tr>
      );
    }
    // Mobile card
    return (
      <div key={product.key} className={`py-2 px-3 ${selectionEnabled && selectedKeys.has(product.key) ? 'bg-primary/5 dark:bg-primary/10' : ''} ${product.outOfLine ? 'opacity-60' : ''}`} onClick={() => openDetail(product)}>
        <div className="flex items-center gap-2.5">
          {selectionEnabled && <input type="checkbox" checked={selectedKeys.has(product.key)} onChange={(e) => { e.stopPropagation(); toggleSelect(product.key); }} onClick={(e) => e.stopPropagation()} aria-label={`Selecionar ${product.shortName || product.description}`} className="w-4 h-4 rounded border-slate-200 text-primary dark:text-blue-400 cursor-pointer shrink-0" />}
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-1.5 mb-0.5">
              {product.codigo && (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-mono font-bold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-800/40 shrink-0">
                  {product.codigo}
                </span>
              )}
              <span className="text-xs font-mono text-slate-600 dark:text-slate-400 shrink-0">
                {product.code || '-'}
              </span>
              {product.outOfLine && <span className="px-1.5 py-0 rounded text-xs font-bold bg-red-50 dark:bg-red-900/20 border border-red-200/60 dark:border-red-800/40 text-red-600 dark:text-red-400 shrink-0">Fora de Linha</span>}
            </div>
            <p className="font-bold text-sm text-slate-900 dark:text-white truncate leading-tight">{product.shortName || product.description}</p>
            {product.shortName && <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{product.description}</p>}
            <div className="flex items-center justify-between mt-1" onClick={(e) => e.stopPropagation()}>
              <span className="text-xs text-slate-500 dark:text-slate-400">{formatDate(product.lastIssueDate)} {'\u00B7'} <span className="font-medium text-slate-600 dark:text-slate-300">{formatAmount(product.lastPrice)}</span></span>
              <Button onClick={() => openDetail(product)} variant="secondary" size="xs" icon="search">
                Detalhes
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderGroupHeaders = (product: ProductRow, showLine: boolean, showGrp: boolean, showSubgroup: boolean, lineKey: string, grpKey: string, lineCollapsed: boolean, grpCollapsed: boolean, lineCountMap: Map<string, number>, groupCountMap: Map<string, number>, inTable: boolean) => {
    const lineName = product.productType || 'Sem linha';
    const grpName = product.productSubtype || 'Sem grupo';
    const subgroupName = product.productSubgroup || '';
    const elements: React.ReactNode[] = [];

    if (showLine) {
      const lineContent = (
        <div className="flex items-center gap-2.5 px-4 py-2.5 bg-gradient-to-r from-indigo-50 via-indigo-50/80 to-transparent dark:from-indigo-950/50 dark:via-indigo-950/30 dark:to-transparent border-y border-indigo-200/80 dark:border-indigo-800/40">
          {selectionEnabled && <input type="checkbox" checked={visible.filter((p) => getLineLabel(p) === lineKey).every((p) => selectedKeys.has(p.key))} onChange={(e) => { e.stopPropagation(); toggleSelectGroup((p) => getLineLabel(p) === lineKey); }} onClick={(e) => e.stopPropagation()} aria-label={`Selecionar linha ${lineKey}`} className="w-4 h-4 rounded border-slate-200 text-primary dark:text-blue-400 cursor-pointer shrink-0" />}
          <span className="material-symbols-outlined text-[18px] text-indigo-400 dark:text-indigo-500 transition-transform duration-200" style={{ transform: lineCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}>expand_more</span>
          <div className="w-1 h-4 rounded-full bg-indigo-400 dark:bg-indigo-500" />
          <span className="text-sm font-extrabold uppercase tracking-wider text-indigo-700 dark:text-indigo-300">{lineName}</span>
          <Badge tone="info" dot={false}>{lineCountMap.get(lineKey)}</Badge>
          {lineCollapsed && (
            <span className="ml-auto text-xs font-medium text-indigo-500/90 dark:text-indigo-400/90">
              Clique para expandir
            </span>
          )}
        </div>
      );
      elements.push(inTable ? <tr key={`line-${lineKey}`} className="cursor-pointer select-none" onClick={() => toggleGroup(lineKey)}><td colSpan={tableColSpan} className="px-0 py-0">{lineContent}</td></tr> : <div key={`line-${lineKey}`} className="cursor-pointer select-none" onClick={() => toggleGroup(lineKey)}>{lineContent}</div>);
    }

    if (!lineCollapsed && showGrp) {
      const grpContent = (
        <div className="flex items-center gap-2 pl-8 pr-4 py-1.5 bg-gradient-to-r from-amber-50/90 to-transparent dark:from-amber-950/25 dark:to-transparent border-b border-amber-200/50 dark:border-amber-800/25">
          {selectionEnabled && <input type="checkbox" checked={visible.filter((p) => getGroupLabel(p, sortBy) === grpKey).every((p) => selectedKeys.has(p.key))} onChange={(e) => { e.stopPropagation(); toggleSelectGroup((p) => getGroupLabel(p, sortBy) === grpKey); }} onClick={(e) => e.stopPropagation()} aria-label={`Selecionar grupo ${grpKey}`} className="w-3.5 h-3.5 rounded border-slate-200 text-primary dark:text-blue-400 cursor-pointer shrink-0" />}
          <span className="material-symbols-outlined text-[15px] text-amber-400 dark:text-amber-600 transition-transform duration-200" style={{ transform: grpCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}>expand_more</span>
          <div className="w-0.5 h-3 rounded-full bg-amber-400 dark:bg-amber-600" />
          <span className="text-xs font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">{grpName}</span>
          <Badge tone="warning" dot={false}>{groupCountMap.get(grpKey)}</Badge>
          {grpCollapsed && (
            <span className="ml-auto text-xs font-medium text-amber-600/90 dark:text-amber-400/90">
              Clique para expandir
            </span>
          )}
        </div>
      );
      elements.push(inTable ? <tr key={`grp-${grpKey}`} className="cursor-pointer select-none" onClick={() => toggleGroup(grpKey)}><td colSpan={tableColSpan} className="px-0 py-0">{grpContent}</td></tr> : <div key={`grp-${grpKey}`} className="cursor-pointer select-none" onClick={() => toggleGroup(grpKey)}>{grpContent}</div>);
    }

    if (!lineCollapsed && !grpCollapsed && showSubgroup && subgroupName) {
      const subContent = (
        <div className="flex items-center gap-1.5 pl-14 pr-4 py-1 bg-gradient-to-r from-teal-50/60 to-transparent dark:from-teal-950/15 dark:to-transparent border-b border-teal-200/40 dark:border-teal-800/20">
          <div className="w-0.5 h-2.5 rounded-full bg-teal-400 dark:bg-teal-600" />
          <span className="text-xs font-bold uppercase tracking-wider text-teal-600 dark:text-teal-400">{subgroupName}</span>
        </div>
      );
      elements.push(inTable ? <tr key={`sub-${grpKey}-${subgroupName}`}><td colSpan={tableColSpan} className="px-0 py-0">{subContent}</td></tr> : <div key={`sub-${grpKey}-${subgroupName}`}>{subContent}</div>);
    }

    return elements;
  };

  const renderProducts = (inTable: boolean) => {
    if (isRebuilding) {
      const content = (
        <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
          <Spinner size="lg" label="Indexando produtos" />
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Indexando produtos...</p>
          {inTable && <p className="text-xs text-slate-500 dark:text-slate-400">Primeira carga &#x2014; processando NF-e para montar a lista.</p>}
        </div>
      );
      return inTable ? <tr><td colSpan={tableColSpan}>{content}</td></tr> : content;
    }
    if (loading) {
      if (inTable) return Array.from({ length: 20 }).map((_, i) => (
        <tr key={i}>{Array.from({ length: 9 }).map((_, j) => <td key={j} className="px-3 py-3"><Skeleton className="h-4 w-16" /></td>)}</tr>
      ));
      return <div className="divide-y divide-slate-100 dark:divide-slate-800">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="p-4 space-y-2"><Skeleton className="h-4 w-48" /><Skeleton className="h-3 w-64" /><Skeleton className="h-3 w-32" /></div>)}</div>;
    }
    if (visible.length === 0) {
      const content = (
        <EmptyState
          compact={inTable}
          icon="inventory_2"
          title="Nenhum produto encontrado"
          hint={summary.totalProducts > 0 ? 'Tente ajustar os filtros de busca.' : 'A lista e montada automaticamente a partir das NF-e de entrada.'}
        />
      );
      return inTable ? <tr><td colSpan={tableColSpan}>{content}</td></tr> : content;
    }

    if (FLAT_SORTS.has(sortBy)) {
      return visible.map((product) => (
        <React.Fragment key={inTable ? product.key : `m-${product.key}`}>
          {renderProductRow(product, inTable)}
        </React.Fragment>
      ));
    }

    if (sortBy === 'productType') {
      const lineCountMap = new Map<string, number>();
      const groupCountMap = new Map<string, number>();
      for (const p of visible) { lineCountMap.set(getLineLabel(p), (lineCountMap.get(getLineLabel(p)) || 0) + 1); groupCountMap.set(getGroupLabel(p, sortBy), (groupCountMap.get(getGroupLabel(p, sortBy)) || 0) + 1); }
      let lastLine = '', lastGrp = '', lastSubgroup = '';
      return visible.map((product) => {
        const lineKey = getLineLabel(product);
        const grpKey = getGroupLabel(product, sortBy);
        const subgroupKey = `${grpKey}|${product.productSubgroup || ''}`;
        // Quando Grupo == Linha (Tipo Spica nos dois), não duplica cabeçalho âmbar.
        const sameLineGroup =
          !!(product.productType && product.productSubtype) &&
          product.productType === product.productSubtype;
        const showLine = lineKey !== lastLine;
        const showGrp = !sameLineGroup && grpKey !== lastGrp;
        const showSubgroup = !!(product.productSubgroup && subgroupKey !== lastSubgroup);
        if (showLine) { lastGrp = ''; lastSubgroup = ''; }
        if (showGrp) lastSubgroup = '';
        lastLine = lineKey; lastGrp = grpKey;
        if (product.productSubgroup) lastSubgroup = subgroupKey;
        const lineCollapsed = renderCollapsed.has(lineKey);
        const grpCollapsed = !sameLineGroup && renderCollapsed.has(grpKey);
        return (
          <React.Fragment key={inTable ? product.key : `m-${product.key}`}>
            {renderGroupHeaders(product, showLine, showGrp, showSubgroup, lineKey, grpKey, lineCollapsed, grpCollapsed, lineCountMap, groupCountMap, inTable)}
            {!lineCollapsed && !grpCollapsed && renderProductRow(product, inTable)}
          </React.Fragment>
        );
      });
    }

    // Single-level grouping
    const groupCountMap = new Map<string, number>();
    for (const p of visible) { const g = getGroupLabel(p, sortBy); groupCountMap.set(g, (groupCountMap.get(g) || 0) + 1); }
    let lastGroup = '';
    return visible.map((product) => {
      const group = getGroupLabel(product, sortBy);
      const showDivider = group !== lastGroup;
      lastGroup = group;
      return (
        <React.Fragment key={inTable ? product.key : `m-${product.key}`}>
          {showDivider && group && (() => {
            const divContent = (
              <div className="flex items-center gap-2.5 px-4 py-2 bg-gradient-to-r from-slate-100 via-slate-100/70 to-transparent dark:from-slate-800/70 dark:via-slate-800/40 dark:to-transparent border-y border-slate-200/80 dark:border-slate-700/60">
                {selectionEnabled && <input type="checkbox" checked={visible.filter((p) => getGroupLabel(p, sortBy) === group).every((p) => selectedKeys.has(p.key))} onChange={(e) => { e.stopPropagation(); toggleSelectGroup((p) => getGroupLabel(p, sortBy) === group); }} onClick={(e) => e.stopPropagation()} aria-label={`Selecionar grupo ${group}`} className="w-4 h-4 rounded border-slate-200 text-primary dark:text-blue-400 cursor-pointer shrink-0" />}
                <span className="material-symbols-outlined text-[16px] text-slate-500 dark:text-slate-400 transition-transform duration-200" style={{ transform: renderCollapsed.has(group) ? 'rotate(-90deg)' : 'rotate(0deg)' }}>expand_more</span>
                <div className="w-0.5 h-3.5 rounded-full bg-slate-400 dark:bg-slate-500" />
                <span className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">{group}</span>
                <Badge dot={false}>{groupCountMap.get(group)}</Badge>
                {renderCollapsed.has(group) && (
                  <span className="ml-auto text-xs font-medium text-slate-500 dark:text-slate-400">
                    Clique para expandir
                  </span>
                )}
              </div>
            );
            return inTable ? <tr className="cursor-pointer select-none" onClick={() => toggleGroup(group)}><td colSpan={tableColSpan} className="px-0 py-0">{divContent}</td></tr> : <div className="cursor-pointer select-none" onClick={() => toggleGroup(group)}>{divContent}</div>;
          })()}
          {!renderCollapsed.has(group) && renderProductRow(product, inTable)}
        </React.Fragment>
      );
    });
  };

  return (
    <Card padding="none">
      {/* Toolbar */}
      <div className="flex justify-start gap-2 px-3 py-2 border-b border-slate-100 dark:border-slate-800">
        {hasGroups && (
          <>
            <button
              type="button"
              onClick={() => setCollapsedGroups(safeCollapseKeys(visible, sortBy))}
              className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-600 transition-all"
              aria-label="Recolher todos os grupos"
            >
              <span className="material-symbols-outlined text-[14px]">unfold_less</span>Recolher
            </button>
            <button
              type="button"
              onClick={() => setCollapsedGroups(new Set())}
              className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-600 transition-all"
              aria-label="Expandir todos os grupos"
            >
              <span className="material-symbols-outlined text-[14px]">unfold_more</span>Expandir
            </button>

          </>
        )}
        <button onClick={() => { setSelectionEnabled((v) => { if (v) setSelectedKeys(() => new Set()); return !v; }); }} aria-pressed={selectionEnabled} className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg border transition-all ${selectionEnabled ? 'text-primary dark:text-blue-400 border-primary/40 bg-primary/10 hover:bg-primary/20' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-600'}`}><span className="material-symbols-outlined text-[14px]">checklist</span>Selecionar</button>
        {canWrite && <button onClick={() => setSettingsOpen(true)} className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-600 transition-all" title="Linhas, fabricantes, dados fiscais"><span className="material-symbols-outlined text-[14px]">settings</span>Parametros</button>}
      </div>

      {/* Desktop Table */}
      <div className="hidden lg:block overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800 text-xs uppercase text-slate-500 dark:text-slate-400 font-bold tracking-wider">
              {selectionEnabled && <th className="px-3 py-1.5 w-8"><input type="checkbox" checked={allVisibleSelected} ref={(el) => { if (el) el.indeterminate = someVisibleSelected && !allVisibleSelected; }} onChange={toggleSelectAll} className="w-4 h-4 rounded border-slate-200 text-primary dark:text-blue-400 cursor-pointer" title="Selecionar todos visiveis" aria-label="Selecionar todos visiveis" /></th>}
              <SortableTh col="codigo" sortBy={sortBy} sortOrder={sortOrder} onSort={sortCol} className="w-[4.5rem]">Cod. Spica</SortableTh>
              <SortableTh col="code" sortBy={sortBy} sortOrder={sortOrder} onSort={sortCol}>Referencia</SortableTh>
              <SortableTh col="description" sortBy={sortBy} sortOrder={sortOrder} onSort={sortCol}>Produto</SortableTh>
              <SortableTh col="anvisa" sortBy={sortBy} sortOrder={sortOrder} onSort={sortCol}>ANVISA</SortableTh>
              <th className="px-3 py-1.5"><div className="flex items-center gap-1">Fabricante</div></th>
              <SortableTh col="lastIssueDate" sortBy={sortBy} sortOrder={sortOrder} onSort={sortCol} align="right">Ult. Compra</SortableTh>
              <SortableTh col="lastPrice" sortBy={sortBy} sortOrder={sortOrder} onSort={sortCol} align="right">Ult. Preco</SortableTh>
              <th className="px-3 py-1.5 text-center">Acoes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-800">{renderProducts(true)}</tbody>
        </table>
      </div>

      {/* Mobile Cards */}
      <div className="lg:hidden">
        <div className="divide-y divide-slate-100 dark:divide-slate-800">{renderProducts(false)}</div>
      </div>

      {/* Footer count */}
      {!loading && products.length > 0 && (
        <div className="px-6 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50/30 dark:bg-slate-800/20 flex items-center justify-between">
          <span className="text-sm text-slate-500">{formatInt(products.length)} produto{products.length !== 1 ? 's' : ''}</span>
        </div>
      )}
    </Card>
  );
}
