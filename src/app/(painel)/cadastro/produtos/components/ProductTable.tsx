'use client';

import React from 'react';
import Skeleton from '@/components/ui/Skeleton';
import { formatAmount } from '@/lib/utils';
import type { ProductRow, ProductsSummary, SortField } from '../types';
import { formatQuantity, formatDate, getAnvisaExpirationBadge, highlightMatch } from './product-utils';

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

const getGroupLabel = (product: ProductRow, sortBy: SortField): string => {
  switch (sortBy) {
    case 'supplier': return product.lastSupplierName || 'Sem fabricante';
    case 'productType': return `group:${product.productType || 'Sem linha'}|${product.productSubtype || 'Sem grupo'}`;
    case 'ncm': return product.ncm ? product.ncm.slice(0, 4) + '.xx.xx' : 'Sem NCM';
    case 'anvisa': return product.anvisa ? 'Com ANVISA' : 'Sem ANVISA';
    case 'lastIssueDate': {
      if (!product.lastIssueDate) return 'Sem data';
      const d = new Date(product.lastIssueDate);
      return `${d.toLocaleString('pt-BR', { month: 'long' })} / ${d.getFullYear()}`;
    }
    case 'description': return (product.description?.[0] || '#').toUpperCase();
    case 'code': return product.code ? product.code[0].toUpperCase() : '#';
    default: return '';
  }
};

const getLineLabel = (product: ProductRow): string => `line:${product.productType || 'Sem linha'}`;

export default function ProductTable({
  products, loading, isRebuilding, summary, sortBy, sortOrder, search,
  collapsedGroups, toggleGroup, selectionEnabled, setSelectionEnabled,
  selectedKeys, setSelectedKeys, toggleSelect, toggleSelectGroup,
  setCollapsedGroups, handleSort, openDetail, openHistory, canWrite, setSettingsOpen,
}: ProductTableProps) {
  const visible = products;

  // visible keys for select-all
  const visibleKeys = React.useMemo(() => {
    const keys: string[] = [];
    let lastGroup = '';
    for (const p of products) {
      const g = getGroupLabel(p, sortBy);
      if (g !== lastGroup) lastGroup = g;
      const lineKey = sortBy === 'productType' ? getLineLabel(p) : '';
      if (collapsedGroups.has(g)) continue;
      if (sortBy === 'productType' && collapsedGroups.has(lineKey)) continue;
      keys.push(p.key);
    }
    return keys;
  }, [products, collapsedGroups, sortBy]);

  const allVisibleSelected = visibleKeys.length > 0 && visibleKeys.every((k) => selectedKeys.has(k));
  const someVisibleSelected = visibleKeys.some((k) => selectedKeys.has(k));
  const toggleSelectAll = () => {
    if (allVisibleSelected) {
      setSelectedKeys((prev) => { const n = new Set(prev); visibleKeys.forEach((k) => n.delete(k)); return n; });
    } else {
      setSelectedKeys((prev) => { const n = new Set(prev); visibleKeys.forEach((k) => n.add(k)); return n; });
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortBy !== field) return <span className="material-symbols-outlined text-[16px] text-slate-300 opacity-0 group-hover:opacity-50">unfold_more</span>;
    return <span className="material-symbols-outlined text-[16px] text-primary">{sortOrder === 'asc' ? 'expand_less' : 'expand_more'}</span>;
  };

  const allGroups = Array.from(new Set(visible.map((p) => getGroupLabel(p, sortBy))));
  const allLines = sortBy === 'productType' ? Array.from(new Set(visible.map(getLineLabel))) : [];
  const hasMultipleGroups = allGroups.length > 1;

  const renderProductRow = (product: ProductRow, inTable: boolean) => {
    if (inTable) {
      return (
        <tr key={product.key} className={`hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors border-b border-slate-100 dark:border-slate-800/50 ${selectionEnabled && selectedKeys.has(product.key) ? 'bg-primary/5 dark:bg-primary/10' : ''} ${product.outOfLine ? 'italic' : ''}`}>
          {selectionEnabled && (
            <td className="px-3 py-1 w-8" onClick={(e) => e.stopPropagation()}>
              <input type="checkbox" checked={selectedKeys.has(product.key)} onChange={() => toggleSelect(product.key)} className="w-4 h-4 rounded border-slate-300 text-primary cursor-pointer" />
            </td>
          )}
          <td className="px-3 py-1 cursor-pointer" onClick={() => openDetail(product)}>
            <div className="flex items-center gap-1">
              {product.outOfLine && <span className="material-symbols-outlined text-[14px] text-slate-400 dark:text-slate-500 shrink-0 not-italic" title="Fora de linha">block</span>}
              <span className={`text-[12px] font-mono font-semibold hover:text-primary transition-colors ${product.outOfLine ? 'text-slate-400 dark:text-slate-500' : 'text-slate-900 dark:text-white'}`}>
                {product.codigo ? <><span className="text-emerald-600 dark:text-emerald-400">{search ? highlightMatch(product.codigo, search) : product.codigo}</span><span className="text-slate-300 dark:text-slate-600 mx-0.5">/</span></> : null}
                {search ? highlightMatch(product.code || '-', search) : (product.code || '-')}
              </span>
            </div>
          </td>
          <td className="px-3 py-1 cursor-pointer" onClick={() => openDetail(product)}>
            <div className="hover:text-primary transition-colors">
              {product.shortName ? (
                <><span className={`text-[12px] font-semibold block leading-tight ${product.outOfLine ? 'text-slate-400 dark:text-slate-500' : 'text-slate-900 dark:text-white'}`}>{search ? highlightMatch(product.shortName, search) : product.shortName}</span><span className={`text-[10px] block leading-tight ${product.outOfLine ? 'text-slate-300 dark:text-slate-600' : 'text-slate-400 dark:text-slate-500'}`}>{search ? highlightMatch(product.description, search) : product.description}</span></>
              ) : (
                <span className={`text-[12px] font-semibold ${product.outOfLine ? 'text-slate-400 dark:text-slate-500' : 'text-slate-900 dark:text-white'}`}>{search ? highlightMatch(product.description, search) : product.description}</span>
              )}
            </div>
          </td>
          <td className="px-3 py-1 cursor-pointer" onClick={() => openDetail(product, ['anvisa'])}>
            <span className={`text-[12px] font-mono hover:text-teal-600 dark:hover:text-teal-400 transition-colors ${product.outOfLine ? 'text-slate-400 dark:text-slate-500' : product.anvisa ? 'text-slate-700 dark:text-slate-300' : 'text-red-400 dark:text-red-500'}`}>{search ? highlightMatch(product.anvisa || '\u2014', search) : (product.anvisa || '\u2014')}</span>
            {(() => { const badge = getAnvisaExpirationBadge(product.anvisaExpiration); return badge ? <span className={`ml-1.5 inline-block px-1.5 py-0.5 rounded text-[9px] font-bold border ${badge.className}`}>{badge.label}</span> : null; })()}
          </td>
          <td className="px-3 py-1"><span className={`text-[12px] ${product.outOfLine ? 'text-slate-400 dark:text-slate-500' : 'text-slate-600 dark:text-slate-400'}`} title={product.anvisaManufacturer || ''}>{search ? highlightMatch(product.manufacturerShortName || product.anvisaManufacturer || '-', search) : (product.manufacturerShortName || product.anvisaManufacturer || '-')}</span></td>
          <td className="px-3 py-1 text-right"><span className={`text-[12px] font-medium ${product.outOfLine ? 'text-slate-400 dark:text-slate-500' : 'text-slate-700 dark:text-slate-300'}`}>{formatDate(product.lastIssueDate)}</span></td>
          <td className="px-3 py-1 text-right"><span className={`text-[12px] font-medium ${product.outOfLine ? 'text-slate-400 dark:text-slate-500' : 'text-slate-700 dark:text-slate-300'}`}>{formatAmount(product.lastPrice)}</span></td>
          <td className="px-3 py-1 text-center">
            <div className="flex items-center justify-center gap-0.5">
              <button onClick={() => openDetail(product)} className="p-1 rounded-lg text-slate-500 hover:text-primary hover:bg-primary/10 transition-colors not-italic" title="Ver detalhes"><span className="material-symbols-outlined text-[18px]">search</span></button>
              <button onClick={() => openHistory(product)} className="p-1 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors not-italic" title="Historico"><span className="material-symbols-outlined text-[18px]">history</span></button>
            </div>
          </td>
        </tr>
      );
    }
    // Mobile card
    return (
      <div key={product.key} className={`py-2 px-3 ${selectionEnabled && selectedKeys.has(product.key) ? 'bg-primary/5 dark:bg-primary/10' : ''} ${product.outOfLine ? 'opacity-60' : ''}`} onClick={() => openDetail(product)}>
        <div className="flex items-center gap-2.5">
          {selectionEnabled && <input type="checkbox" checked={selectedKeys.has(product.key)} onChange={(e) => { e.stopPropagation(); toggleSelect(product.key); }} onClick={(e) => e.stopPropagation()} className="w-4 h-4 rounded border-slate-300 text-primary cursor-pointer shrink-0" />}
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-1.5 mb-0.5">
              <p className="text-[10px] font-mono text-slate-400 dark:text-slate-500 shrink-0">
                {product.codigo ? <><span className="text-emerald-600 dark:text-emerald-400">{product.codigo}</span><span className="text-slate-300 dark:text-slate-600 mx-0.5">/</span></> : null}
                {product.code || '-'}
              </p>
              {product.outOfLine && <span className="px-1.5 py-0 rounded text-[9px] font-bold bg-red-50 dark:bg-red-900/20 border border-red-200/60 dark:border-red-800/40 text-red-600 dark:text-red-400 shrink-0">Fora de Linha</span>}
            </div>
            <p className="font-bold text-[13px] text-slate-900 dark:text-white truncate leading-tight">{product.shortName || product.description}</p>
            {product.shortName && <p className="text-[10px] text-slate-400 dark:text-slate-500 truncate">{product.description}</p>}
            <div className="flex items-center justify-between mt-1" onClick={(e) => e.stopPropagation()}>
              <span className="text-[10px] text-slate-400">{formatDate(product.lastIssueDate)} {'\u00B7'} <span className="font-medium text-slate-600 dark:text-slate-300">{formatAmount(product.lastPrice)}</span></span>
              <button onClick={() => openDetail(product)} className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded-md border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:text-primary hover:border-primary/30 hover:bg-primary/5 transition-colors">
                <span className="material-symbols-outlined text-[14px]">search</span>
                Detalhes
              </button>
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
          {selectionEnabled && <input type="checkbox" checked={visible.filter((p) => getLineLabel(p) === lineKey).every((p) => selectedKeys.has(p.key))} onChange={(e) => { e.stopPropagation(); toggleSelectGroup((p) => getLineLabel(p) === lineKey); }} onClick={(e) => e.stopPropagation()} className="w-4 h-4 rounded border-slate-300 text-primary cursor-pointer shrink-0" />}
          <span className="material-symbols-outlined text-[18px] text-indigo-400 dark:text-indigo-500 transition-transform duration-200" style={{ transform: lineCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}>expand_more</span>
          <div className="w-1 h-4 rounded-full bg-indigo-400 dark:bg-indigo-500" />
          <span className="text-[13px] font-extrabold uppercase tracking-wider text-indigo-700 dark:text-indigo-300">{lineName}</span>
          <span className="text-[11px] font-bold text-indigo-500/80 dark:text-indigo-400/80 bg-indigo-100 dark:bg-indigo-900/40 px-2 py-0.5 rounded-full min-w-[28px] text-center">{lineCountMap.get(lineKey)}</span>
        </div>
      );
      elements.push(inTable ? <tr key={`line-${lineKey}`} className="cursor-pointer select-none" onClick={() => toggleGroup(lineKey)}><td colSpan={9} className="px-0 py-0">{lineContent}</td></tr> : <div key={`line-${lineKey}`} className="cursor-pointer select-none" onClick={() => toggleGroup(lineKey)}>{lineContent}</div>);
    }

    if (!lineCollapsed && showGrp) {
      const grpContent = (
        <div className="flex items-center gap-2 pl-8 pr-4 py-1.5 bg-gradient-to-r from-amber-50/90 to-transparent dark:from-amber-950/25 dark:to-transparent border-b border-amber-200/50 dark:border-amber-800/25">
          {selectionEnabled && <input type="checkbox" checked={visible.filter((p) => getGroupLabel(p, sortBy) === grpKey).every((p) => selectedKeys.has(p.key))} onChange={(e) => { e.stopPropagation(); toggleSelectGroup((p) => getGroupLabel(p, sortBy) === grpKey); }} onClick={(e) => e.stopPropagation()} className="w-3.5 h-3.5 rounded border-slate-300 text-primary cursor-pointer shrink-0" />}
          <span className="material-symbols-outlined text-[15px] text-amber-400 dark:text-amber-600 transition-transform duration-200" style={{ transform: grpCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}>expand_more</span>
          <div className="w-0.5 h-3 rounded-full bg-amber-400 dark:bg-amber-600" />
          <span className="text-xs font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">{grpName}</span>
          <span className="text-[10px] font-bold text-amber-500/80 dark:text-amber-500/70 bg-amber-100 dark:bg-amber-900/30 px-1.5 py-0.5 rounded-full min-w-[24px] text-center">{groupCountMap.get(grpKey)}</span>
        </div>
      );
      elements.push(inTable ? <tr key={`grp-${grpKey}`} className="cursor-pointer select-none" onClick={() => toggleGroup(grpKey)}><td colSpan={9} className="px-0 py-0">{grpContent}</td></tr> : <div key={`grp-${grpKey}`} className="cursor-pointer select-none" onClick={() => toggleGroup(grpKey)}>{grpContent}</div>);
    }

    if (!lineCollapsed && !grpCollapsed && showSubgroup && subgroupName) {
      const subContent = (
        <div className="flex items-center gap-1.5 pl-14 pr-4 py-1 bg-gradient-to-r from-teal-50/60 to-transparent dark:from-teal-950/15 dark:to-transparent border-b border-teal-200/40 dark:border-teal-800/20">
          <div className="w-0.5 h-2.5 rounded-full bg-teal-400 dark:bg-teal-600" />
          <span className="text-[11px] font-bold uppercase tracking-wider text-teal-600 dark:text-teal-400">{subgroupName}</span>
        </div>
      );
      elements.push(inTable ? <tr key={`sub-${grpKey}-${subgroupName}`}><td colSpan={9} className="px-0 py-0">{subContent}</td></tr> : <div key={`sub-${grpKey}-${subgroupName}`}>{subContent}</div>);
    }

    return elements;
  };

  const renderProducts = (inTable: boolean) => {
    if (isRebuilding) {
      const content = (
        <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Indexando produtos...</p>
          {inTable && <p className="text-xs text-slate-400">Primeira carga &#x2014; processando NF-e para montar a lista.</p>}
        </div>
      );
      return inTable ? <tr><td colSpan={9}>{content}</td></tr> : content;
    }
    if (loading) {
      if (inTable) return Array.from({ length: 20 }).map((_, i) => (
        <tr key={i}>{Array.from({ length: 8 }).map((_, j) => <td key={j} className="px-3 py-2"><Skeleton className="h-4 w-16" /></td>)}</tr>
      ));
      return <div className="divide-y divide-slate-100 dark:divide-slate-800">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="p-4 space-y-2"><Skeleton className="h-4 w-48" /><Skeleton className="h-3 w-64" /><Skeleton className="h-3 w-32" /></div>)}</div>;
    }
    if (visible.length === 0) {
      const content = (
        <div className="px-6 py-12 text-center text-slate-400">
          <span className="material-symbols-outlined text-[48px] opacity-30">inventory_2</span>
          <p className="mt-2 text-sm font-medium">Nenhum produto encontrado</p>
          <p className="text-xs mt-1">{summary.totalProducts > 0 ? 'Tente ajustar os filtros de busca.' : 'A lista e montada automaticamente a partir das NF-e de entrada.'}</p>
        </div>
      );
      return inTable ? <tr><td colSpan={9}>{content}</td></tr> : content;
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
        const showLine = lineKey !== lastLine;
        const showGrp = grpKey !== lastGrp;
        const showSubgroup = !!(product.productSubgroup && subgroupKey !== lastSubgroup);
        if (showLine) { lastGrp = ''; lastSubgroup = ''; }
        if (showGrp) lastSubgroup = '';
        lastLine = lineKey; lastGrp = grpKey;
        if (product.productSubgroup) lastSubgroup = subgroupKey;
        const lineCollapsed = collapsedGroups.has(lineKey);
        const grpCollapsed = collapsedGroups.has(grpKey);
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
                {selectionEnabled && <input type="checkbox" checked={visible.filter((p) => getGroupLabel(p, sortBy) === group).every((p) => selectedKeys.has(p.key))} onChange={(e) => { e.stopPropagation(); toggleSelectGroup((p) => getGroupLabel(p, sortBy) === group); }} onClick={(e) => e.stopPropagation()} className="w-4 h-4 rounded border-slate-300 text-primary cursor-pointer shrink-0" />}
                <span className="material-symbols-outlined text-[16px] text-slate-400 dark:text-slate-500 transition-transform duration-200" style={{ transform: collapsedGroups.has(group) ? 'rotate(-90deg)' : 'rotate(0deg)' }}>expand_more</span>
                <div className="w-0.5 h-3.5 rounded-full bg-slate-400 dark:bg-slate-500" />
                <span className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">{group}</span>
                <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 bg-slate-200 dark:bg-slate-700 px-1.5 py-0.5 rounded-full min-w-[24px] text-center">{groupCountMap.get(group)}</span>
              </div>
            );
            return inTable ? <tr className="cursor-pointer select-none" onClick={() => toggleGroup(group)}><td colSpan={9} className="px-0 py-0">{divContent}</td></tr> : <div className="cursor-pointer select-none" onClick={() => toggleGroup(group)}>{divContent}</div>;
          })()}
          {!collapsedGroups.has(group) && renderProductRow(product, inTable)}
        </React.Fragment>
      );
    });
  };

  return (
    <div className="bg-white dark:bg-card-dark border border-slate-200 dark:border-slate-800 rounded-xl shadow-lg shadow-slate-200/50 dark:shadow-none overflow-hidden">
      {/* Toolbar */}
      <div className="flex justify-start gap-2 px-3 py-2 border-b border-slate-100 dark:border-slate-800">
        {hasMultipleGroups && (
          <>
            <button onClick={() => setCollapsedGroups(new Set(sortBy === 'productType' ? allLines : allGroups))} className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-600 transition-all"><span className="material-symbols-outlined text-[14px]">unfold_less</span>Recolher</button>
            <button onClick={() => setCollapsedGroups(new Set())} className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-600 transition-all"><span className="material-symbols-outlined text-[14px]">unfold_more</span>Expandir</button>
          </>
        )}
        <button onClick={() => { setSelectionEnabled((v) => { if (v) setSelectedKeys(() => new Set()); return !v; }); }} className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg border transition-all ${selectionEnabled ? 'text-primary border-primary/40 bg-primary/10 hover:bg-primary/20' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-600'}`}><span className="material-symbols-outlined text-[14px]">checklist</span>Selecionar</button>
        {canWrite && <button onClick={() => setSettingsOpen(true)} className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-600 transition-all" title="Linhas, fabricantes, dados fiscais"><span className="material-symbols-outlined text-[14px]">settings</span>Parametros</button>}
      </div>

      {/* Desktop Table */}
      <div className="hidden lg:block overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800 text-xs uppercase text-slate-500 dark:text-slate-400 font-bold tracking-wider">
              {selectionEnabled && <th className="px-3 py-1.5 w-8"><input type="checkbox" checked={allVisibleSelected} ref={(el) => { if (el) el.indeterminate = someVisibleSelected && !allVisibleSelected; }} onChange={toggleSelectAll} className="w-4 h-4 rounded border-slate-300 text-primary cursor-pointer" title="Selecionar todos visiveis" /></th>}
              <th className="px-3 py-1.5 cursor-pointer group hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" onClick={() => handleSort('code')}><div className="flex items-center gap-1">Referencia <SortIcon field="code" /></div></th>
              <th className="px-3 py-1.5 cursor-pointer group hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" onClick={() => handleSort('description')}><div className="flex items-center gap-1">Produto <SortIcon field="description" /></div></th>
              <th className="px-3 py-1.5 cursor-pointer group hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" onClick={() => handleSort('anvisa')}><div className="flex items-center gap-1">ANVISA <SortIcon field="anvisa" /></div></th>
              <th className="px-3 py-1.5"><div className="flex items-center gap-1">Fabricante</div></th>
              <th className="px-3 py-1.5 text-right cursor-pointer group hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" onClick={() => handleSort('lastIssueDate')}><div className="flex items-center justify-end gap-1">Ult. Compra <SortIcon field="lastIssueDate" /></div></th>
              <th className="px-3 py-1.5 text-right cursor-pointer group hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" onClick={() => handleSort('lastPrice')}><div className="flex items-center justify-end gap-1">Ult. Preco <SortIcon field="lastPrice" /></div></th>
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
          <span className="text-sm text-slate-500">{products.length.toLocaleString('pt-BR')} produto{products.length !== 1 ? 's' : ''}</span>
        </div>
      )}
    </div>
  );
}
