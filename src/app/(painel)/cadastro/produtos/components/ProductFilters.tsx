'use client';

import React from 'react';
import Field from '@/components/ui/Field';
import { FILTER_INPUT_CLS, formatInt } from '@/lib/utils';
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
  /** Total do filtro atual (catálogo filtrado na árvore; servidor no flat). */
  catalogTotal: number;
  /** Quantos itens vieram nesta página. */
  pageSize: number;
}

export default function ProductFilters({
  search, setSearch, typeFilter, setTypeFilter, subtypeFilter, setSubtypeFilter,
  subgroupFilter, setSubgroupFilter, sortBy, setSortBy, sortOrder, setSortOrder,
  lineStatusFilter, setLineStatusFilter, setCollapsedGroups, hierOptions, catalogTotal, pageSize,
}: ProductFiltersProps) {
  const subgroups = subtypeFilter ? hierOptions.subgroupsFor(typeFilter, subtypeFilter) : [];

  return (
    <div className="mt-4 space-y-2">
      <div className="grid grid-cols-1 md:grid-cols-4 xl:grid-cols-6 gap-3 items-end">
        <Field label="Busca" className="md:col-span-2">
          <input
            type="text"
            placeholder="Código, nome, linha, NCM, ANVISA ou fornecedor"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={FILTER_INPUT_CLS}
            aria-label="Buscar produtos"
          />
        </Field>
        <Field label="Linha">
          <select
            value={typeFilter}
            onChange={(e) => { setTypeFilter(e.target.value); setSubtypeFilter(''); setSubgroupFilter(''); }}
            className={FILTER_INPUT_CLS}
            aria-label="Filtrar por linha"
          >
            <option value="">Todos</option>
            {hierOptions.lines.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </Field>
        {typeFilter ? (
          <Field label="Grupo">
            <select
              value={subtypeFilter}
              onChange={(e) => { setSubtypeFilter(e.target.value); setSubgroupFilter(''); }}
              className={FILTER_INPUT_CLS}
              aria-label="Filtrar por grupo"
            >
              <option value="">Todos</option>
              {hierOptions.groupsFor(typeFilter).map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
        ) : null}
        {subgroups.length > 0 ? (
          <Field label="Subgrupo">
            <select
              value={subgroupFilter}
              onChange={(e) => setSubgroupFilter(e.target.value)}
              className={FILTER_INPUT_CLS}
              aria-label="Filtrar por subgrupo"
            >
              <option value="">Todos</option>
              {subgroups.map((s) => <option key={s!} value={s!}>{s}</option>)}
            </select>
          </Field>
        ) : null}
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
              className={FILTER_INPUT_CLS}
              aria-label="Ordenar por"
            >
              <option value="codigo">Cod. Spica</option>
              <option value="productType">Linha</option>
              <option value="lastIssueDate">Ult. Compra</option>
              <option value="ncm">NCM</option>
              <option value="anvisa">ANVISA</option>
            </select>
            <button
              type="button"
              onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
              className={`${FILTER_INPUT_CLS} w-auto px-2`}
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
                type="button"
                onClick={() => setLineStatusFilter(val)}
                aria-pressed={lineStatusFilter === val}
                className={`px-3 py-2.5 text-sm font-medium transition-colors ${lineStatusFilter === val ? 'bg-primary text-white' : 'bg-slate-50 dark:bg-slate-900/50 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {(search || typeFilter || subtypeFilter || subgroupFilter) ? (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-slate-500">Filtros ativos:</span>
          {search ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary dark:text-blue-400 text-xs font-medium">
              &ldquo;{search}&rdquo;
              <button type="button" aria-label="Limpar busca" onClick={() => setSearch('')} className="hover:opacity-70">
                <span className="material-symbols-outlined text-[13px]">close</span>
              </button>
            </span>
          ) : null}
          {typeFilter ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 text-xs font-medium dark:bg-indigo-900/30 dark:text-indigo-400">
              {typeFilter}
              <button type="button" aria-label={`Remover filtro ${typeFilter}`} onClick={() => { setTypeFilter(''); setSubtypeFilter(''); setSubgroupFilter(''); }} className="hover:opacity-70">
                <span className="material-symbols-outlined text-[13px]">close</span>
              </button>
            </span>
          ) : null}
          {subtypeFilter ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs font-medium dark:bg-amber-900/30 dark:text-amber-400">
              {subtypeFilter}
              <button type="button" aria-label={`Remover filtro ${subtypeFilter}`} onClick={() => { setSubtypeFilter(''); setSubgroupFilter(''); }} className="hover:opacity-70">
                <span className="material-symbols-outlined text-[13px]">close</span>
              </button>
            </span>
          ) : null}
          {subgroupFilter ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-teal-100 text-teal-700 text-xs font-medium dark:bg-teal-900/30 dark:text-teal-400">
              {subgroupFilter}
              <button type="button" aria-label={`Remover filtro ${subgroupFilter}`} onClick={() => setSubgroupFilter('')} className="hover:opacity-70">
                <span className="material-symbols-outlined text-[13px]">close</span>
              </button>
            </span>
          ) : null}
          <span className="text-xs text-slate-500 dark:text-slate-400">{formatInt(catalogTotal)} no cadastro{catalogTotal !== pageSize && pageSize > 0 ? ` · ${formatInt(pageSize)} nesta página` : ''}</span>
        </div>
      ) : catalogTotal > 0 ? (
        <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
          {formatInt(catalogTotal)} produtos no cadastro
          {catalogTotal !== pageSize && pageSize > 0 ? ` · mostrando ${formatInt(pageSize)} nesta página` : ''}
        </p>
      ) : null}
    </div>
  );
}
