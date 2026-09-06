'use client';

import type { ReactNode } from 'react';
import { isCollapsibleDateGroup } from '@/lib/list-collapse';

type DateGroupHeaderProps = {
  groupKey: string;
  label: string;
  count?: number;
  countNoun?: { singular: string; plural: string };
  extra?: ReactNode;
  variant: 'table' | 'mobile';
  colSpan?: number;
  collapsed: ReadonlySet<string>;
  onToggle: (key: string) => void;
};

/**
 * Cabeçalho de grupo por data nas listas.
 *
 * Hoje é divisória estática (SPEC-053). Semanas relativas foram removidas.
 * Meses (e grupos que não são bucket relativo) continuam colapsáveis.
 */
export default function DateGroupHeader({
  groupKey,
  label,
  count,
  countNoun = { singular: 'item', plural: 'itens' },
  extra,
  variant,
  colSpan = 6,
  collapsed,
  onToggle,
}: DateGroupHeaderProps) {
  const collapsible = isCollapsibleDateGroup(groupKey) && isCollapsibleDateGroup(label);
  const isCollapsed = collapsible && collapsed.has(groupKey);

  const chevron = collapsible ? (
    <span
      className="material-symbols-outlined text-[16px] text-slate-500 dark:text-slate-400 transition-transform duration-200"
      style={{ transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}
      aria-hidden
    >expand_more</span>
  ) : null;

  const labelEl = (
    <span
      className={`text-xs font-bold uppercase tracking-wider ${
        variant === 'table' ? 'text-slate-500 dark:text-slate-400' : 'text-slate-600 dark:text-slate-300'
      }`}
    >
      {label}
    </span>
  );

  const countEl =
    count == null ? null : (
      <span className={`text-xs text-slate-500 dark:text-slate-400${variant === 'mobile' ? ' ml-1' : ''}`}>
        · {count} {count === 1 ? countNoun.singular : countNoun.plural}
      </span>
    );

  const rowClass = collapsible ? 'cursor-pointer select-none' : 'select-none';
  const onClick = collapsible ? () => onToggle(groupKey) : undefined;

  if (variant === 'table') {
    return (
      <tr
        className={rowClass}
        onClick={onClick}
        aria-expanded={collapsible ? !isCollapsed : undefined}
      >
        <td
          colSpan={colSpan}
          className="px-4 py-3 border-y bg-slate-100/80 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700"
        >
          <div className="flex items-center gap-2">
            {chevron}
            {labelEl}
            {countEl}
            {extra}
          </div>
        </td>
      </tr>
    );
  }

  return (
    <div
      className={rowClass}
      onClick={onClick}
      aria-expanded={collapsible ? !isCollapsed : undefined}
    >
      <div className="flex items-center gap-2.5 px-2 py-2 rounded-lg bg-gradient-to-r from-slate-100 via-slate-100/70 to-transparent dark:from-slate-800/70 dark:via-slate-800/40 dark:to-transparent">
        {chevron}
        {labelEl}
        {countEl}
        {extra}
      </div>
    </div>
  );
}
