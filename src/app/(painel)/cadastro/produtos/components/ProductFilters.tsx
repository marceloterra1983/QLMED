'use client';

import React from 'react';
import MobileFilterWrapper from '@/components/ui/MobileFilterWrapper';
import type { SortField } from '../types';
import type { HierOptions } from './product-utils';

interface ProductFiltersProps {
  search: string;
  setSearch: (v: string) => void;
  typeFilter: string;
  setTypeFilter: (v: string) => void;
  subtypeFilter: string;
  setSubtypeFilter: (v: string) => void;
  subgroupFilter: string;
  setSubgroupFilter: (v: string) => void;
  sortBy: SortField;
  setSortBy: (v: SortField) => void;
  sortOrder: 'asc' | 'desc';
  setSortOrder: (v: 'asc' | 'desc') => void;
  lineStatusFilter: 'active' | 'outOfLine' | 'all';
  setLineStatusFilter: (v: 'active' | 'outOfLine' | 'all') => void;
  setCollapsedGroups: (v: Set<string>) => void;
  hierOptions: HierOptions;
  filteredCount: number;
}

export default function ProductFilters({
  search, setSearch, typeFilter, setTypeFilter, subtypeFilter, setSubtypeFilter,
  subgroupFilter, setSubgroupFilter, sortBy, setSortBy, sortOrder, setSortOrder,
  lineStatusFilter, setLineStatusFilter, setCollapsedGroups, hierOptions, filteredCount,
}: ProductFiltersProps) {
  return (
    <MobileFilterWrapper activeFilterCount={[search, typeFilter, subtypeFilter, subgroupFilter, lineStatusFilter !== 'all' ? lineStatusFilter : ''].filter(Boolean).length} title="Filtros" icon="inventory_2">
      <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-end">
        <div className="w-full md:flex-1">
          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
            Buscar por codigo, descricao, NCM, ANVISA ou fornecedor
          </label>
          <div className="relative">
            <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-[18px] text-slate-400">search</span>
            <input
              type="text"
              placeholder="ex: 7891234567890 ou dipirona"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="block w-full pl-9 pr-8 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-900/50 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary text-sm transition-all"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            )}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 md:contents">
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Linha</label>
            <select
              value={typeFilter}
              onChange={(e) => { setTypeFilter(e.target.value); setSubtypeFilter(''); setSubgroupFilter(''); }}
              className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-900/50 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
            >
              <option value="">Todos</option>
              {hierOptions.lines.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          {typeFilter && (
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Grupo</label>
              <select
                value={subtypeFilter}
                onChange={(e) => { setSubtypeFilter(e.target.value); setSubgroupFilter(''); }}
                className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-900/50 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
              >
                <option value="">Todos</option>
                {hierOptions.groupsFor(typeFilter).map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          )}
          {subtypeFilter && (() => {
            const subgroups = hierOptions.subgroupsFor(typeFilter, subtypeFilter);
            return subgroups.length > 0 ? (
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Subgrupo</label>
                <select
                  value={subgroupFilter}
                  onChange={(e) => setSubgroupFilter(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-900/50 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
                >
                  <option value="">Todos</option>
                  {subgroups.map((s) => <option key={s!} value={s!}>{s}</option>)}
                </select>
              </div>
            ) : null;
          })()}
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Ordenar por</label>
            <div className="flex gap-1">
              <select
                value={sortBy}
                onChange={(e) => {
                  const f = e.target.value as SortField;
                  setSortBy(f);
                  setSortOrder(['description', 'code', 'ncm', 'anvisa', 'supplier', 'productType'].includes(f) ? 'asc' : 'desc');
                  setCollapsedGroups(new Set());
                }}
                className="px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-900/50 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
              >
                <option value="productType">Linha</option>
                <option value="lastIssueDate">Ult. Compra</option>
                <option value="ncm">NCM</option>
                <option value="anvisa">ANVISA</option>
              </select>
              <button
                onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                className="px-2 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-900/50 text-slate-500 hover:text-primary hover:bg-primary/5 transition-colors"
                title={sortOrder === 'asc' ? 'Crescente' : 'Decrescente'}
              >
                <span className="material-symbols-outlined text-[18px]">{sortOrder === 'asc' ? 'arrow_upward' : 'arrow_downward'}</span>
              </button>
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Status</label>
            <div className="flex rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
              {([['all', 'Todos'], ['active', 'Em Linha'], ['outOfLine', 'Fora de Linha']] as const).map(([val, label]) => (
                <button
                  key={val}
                  onClick={() => setLineStatusFilter(val)}
                  className={`px-3 py-2 text-sm font-medium transition-colors ${lineStatusFilter === val ? 'bg-primary text-white' : 'bg-slate-50 dark:bg-slate-900/50 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Active filter indicators */}
      {(search || typeFilter || subtypeFilter || subgroupFilter) && (
        <div className="flex items-center gap-2 mt-2.5 flex-wrap">
          <span className="text-xs text-slate-500">Filtros ativos:</span>
          {search && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-medium">
              &ldquo;{search}&rdquo;
              <button onClick={() => setSearch('')} className="hover:opacity-70">
                <span className="material-symbols-outlined text-[13px]">close</span>
              </button>
            </span>
          )}
          {typeFilter && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 text-xs font-medium dark:bg-indigo-900/30 dark:text-indigo-400">
              {typeFilter}
              <button onClick={() => { setTypeFilter(''); setSubtypeFilter(''); setSubgroupFilter(''); }} className="hover:opacity-70">
                <span className="material-symbols-outlined text-[13px]">close</span>
              </button>
            </span>
          )}
          {subtypeFilter && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs font-medium dark:bg-amber-900/30 dark:text-amber-400">
              {subtypeFilter}
              <button onClick={() => { setSubtypeFilter(''); setSubgroupFilter(''); }} className="hover:opacity-70">
                <span className="material-symbols-outlined text-[13px]">close</span>
              </button>
            </span>
          )}
          {subgroupFilter && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-teal-100 text-teal-700 text-xs font-medium dark:bg-teal-900/30 dark:text-teal-400">
              {subgroupFilter}
              <button onClick={() => setSubgroupFilter('')} className="hover:opacity-70">
                <span className="material-symbols-outlined text-[13px]">close</span>
              </button>
            </span>
          )}
          <span className="text-xs text-slate-400">{filteredCount.toLocaleString('pt-BR')} resultado{filteredCount !== 1 ? 's' : ''}</span>
        </div>
      )}
    </MobileFilterWrapper>
  );
}
