'use client';

import React from 'react';
import Field from '@/components/ui/Field';
import { formatInt } from '@/lib/utils';
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
  /** Total do filtro atual no servidor (não o tamanho da página). */
  catalogTotal: number;
  /** Quantos itens vieram nesta página. */
  pageSize: number;
}

export default function ProductFilters({
  search, setSearch, typeFilter, setTypeFilter, subtypeFilter, setSubtypeFilter,
  subgroupFilter, setSubgroupFilter, sortBy, setSortBy, sortOrder, setSortOrder,
  lineStatusFilter, setLineStatusFilter, setCollapsedGroups, hierOptions, catalogTotal, pageSize,
}: ProductFiltersProps) {
  return (
    <MobileFilterWrapper activeFilterCount={[search, typeFilter, subtypeFilter, subgroupFilter, lineStatusFilter !== 'all' ? lineStatusFilter : ''].filter(Boolean).length} title="Filtros" icon="inventory_2">
      <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-end">
        <Field label="Buscar por codigo, descricao, NCM, ANVISA ou fornecedor" className="w-full md:flex-1">
          <div className="relative">
            <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-[18px] text-slate-500 dark:text-slate-400">search</span>
            <input
              type="text"
              placeholder="ex: 7891234567890 ou dipirona"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="block w-full pl-9 pr-8 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-900/50 text-slate-900 dark:text-white placeholder-slate-400 text-sm transition-all"
            />
            {search && (
              <button onClick={() => setSearch('')} aria-label="Limpar busca" className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400 hover:text-slate-600">
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            )}
          </div>
        </Field>
        <div className="grid grid-cols-2 gap-3 md:contents">
          <Field label="Linha">
            <select
              value={typeFilter}
              onChange={(e) => { setTypeFilter(e.target.value); setSubtypeFilter(''); setSubgroupFilter(''); }}
              className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-900/50 text-sm text-slate-700 dark:text-slate-200"
            >
              <option value="">Todos</option>
              {hierOptions.lines.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
          {typeFilter && (
            <Field label="Grupo">
              <select
                value={subtypeFilter}
                onChange={(e) => { setSubtypeFilter(e.target.value); setSubgroupFilter(''); }}
                className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-900/50 text-sm text-slate-700 dark:text-slate-200"
              >
                <option value="">Todos</option>
                {hierOptions.groupsFor(typeFilter).map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
          )}
          {subtypeFilter && (() => {
            const subgroups = hierOptions.subgroupsFor(typeFilter, subtypeFilter);
            return subgroups.length > 0 ? (
              <Field label="Subgrupo">
                <select
                  value={subgroupFilter}
                  onChange={(e) => setSubgroupFilter(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-900/50 text-sm text-slate-700 dark:text-slate-200"
                >
                  <option value="">Todos</option>
                  {subgroups.map((s) => <option key={s!} value={s!}>{s}</option>)}
                </select>
              </Field>
            ) : null;
          })()}
          <Field label="Ordenar por">
            <div className="flex gap-1">
              <select
                value={sortBy}
                onChange={(e) => {
                  const f = e.target.value as SortField;
                  setSortBy(f);
                  setSortOrder(['description', 'code', 'codigo', 'ncm', 'anvisa', 'supplier', 'productType'].includes(f) ? 'asc' : 'desc');
                  setCollapsedGroups(new Set());
                }}
                className="px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-900/50 text-sm text-slate-700 dark:text-slate-200"
              >
                <option value="codigo">Cod. Spica</option>
                <option value="productType">Linha</option>
                <option value="lastIssueDate">Ult. Compra</option>
                <option value="ncm">NCM</option>
                <option value="anvisa">ANVISA</option>
              </select>
              <button
                onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                className="px-2 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-900/50 text-slate-500 hover:text-primary dark:hover:text-blue-400 hover:bg-primary/5 transition-colors"
                title={sortOrder === 'asc' ? 'Crescente' : 'Decrescente'}
                aria-label={sortOrder === 'asc' ? 'Crescente' : 'Decrescente'}
              >
                <span className="material-symbols-outlined text-[18px]">{sortOrder === 'asc' ? 'arrow_upward' : 'arrow_downward'}</span>
              </button>
            </div>
          </Field>
          <div>
            <span id="filtro-status" className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">Status</span>
            <div role="group" aria-labelledby="filtro-status" className="flex rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
              {([['all', 'Todos'], ['active', 'Em Linha'], ['outOfLine', 'Fora de Linha']] as const).map(([val, label]) => (
                <button
                  key={val}
                  onClick={() => setLineStatusFilter(val)}
                  aria-pressed={lineStatusFilter === val}
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
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary dark:text-blue-400 text-xs font-medium">
              &ldquo;{search}&rdquo;
              <button aria-label="Limpar busca" onClick={() => setSearch('')} className="hover:opacity-70">
                <span className="material-symbols-outlined text-[13px]">close</span>
              </button>
            </span>
          )}
          {typeFilter && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 text-xs font-medium dark:bg-indigo-900/30 dark:text-indigo-400">
              {typeFilter}
              <button aria-label={`Remover filtro ${typeFilter}`} onClick={() => { setTypeFilter(''); setSubtypeFilter(''); setSubgroupFilter(''); }} className="hover:opacity-70">
                <span className="material-symbols-outlined text-[13px]">close</span>
              </button>
            </span>
          )}
          {subtypeFilter && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs font-medium dark:bg-amber-900/30 dark:text-amber-400">
              {subtypeFilter}
              <button aria-label={`Remover filtro ${subtypeFilter}`} onClick={() => { setSubtypeFilter(''); setSubgroupFilter(''); }} className="hover:opacity-70">
                <span className="material-symbols-outlined text-[13px]">close</span>
              </button>
            </span>
          )}
          {subgroupFilter && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-teal-100 text-teal-700 text-xs font-medium dark:bg-teal-900/30 dark:text-teal-400">
              {subgroupFilter}
              <button aria-label={`Remover filtro ${subgroupFilter}`} onClick={() => setSubgroupFilter('')} className="hover:opacity-70">
                <span className="material-symbols-outlined text-[13px]">close</span>
              </button>
            </span>
          )}
          <span className="text-xs text-slate-500 dark:text-slate-400">{formatInt(catalogTotal)} no cadastro{catalogTotal !== pageSize && pageSize > 0 ? ` · ${formatInt(pageSize)} nesta página` : ''}</span>
        </div>
      )}
      {!(search || typeFilter || subtypeFilter || subgroupFilter) && catalogTotal > 0 && (
        <p className="mt-2 text-xs font-medium text-slate-500 dark:text-slate-400">
          {formatInt(catalogTotal)} produtos no cadastro
          {catalogTotal !== pageSize && pageSize > 0 ? ` · mostrando ${formatInt(pageSize)} nesta página` : ''}
        </p>
      )}
    </MobileFilterWrapper>
  );
}
