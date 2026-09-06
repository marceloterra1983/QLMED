'use client';

import React from 'react';
import { dateGroupItemsVisible } from '@/lib/list-collapse';
import type { DatedItem, RelativeMonthSplit } from '@/lib/nfe-groups';

type RelativeMonthGroupBodyProps<T extends DatedItem> = {
  split: RelativeMonthSplit<T>;
  collapsed: ReadonlySet<string>;
  includeHoje?: boolean;
  renderDivider: (key: string, label: string, count: number, total: number) => React.ReactNode;
  renderItem: (item: T) => React.ReactNode;
};

/**
 * Mês atual no topo (colapsável) com Hoje / Esta semana / resto do mês dentro.
 * Dias da semana que caem no mês anterior ficam fora do shell.
 */
export default function RelativeMonthGroupBody<T extends DatedItem>({
  split,
  collapsed,
  includeHoje = true,
  renderDivider,
  renderItem,
}: RelativeMonthGroupBodyProps<T>) {
  const innerOpen = split.currentMonth
    ? dateGroupItemsVisible(split.currentMonth.key, collapsed)
    : true;

  return (
    <>
      {split.currentMonth ? (
        <>
          {renderDivider(
            split.currentMonth.key,
            split.currentMonth.label,
            split.currentMonth.count,
            split.currentMonth.total,
          )}
          {innerOpen && (
            <>
              {includeHoje && split.innerHoje.length > 0 && (
                <>
                  {renderDivider('hoje', 'Hoje', split.innerHoje.length, split.innerHojeTotal)}
                  {split.innerHoje.map(renderItem)}
                </>
              )}
              {split.innerEstaSemana.length > 0 && (
                <>
                  {renderDivider('esta_semana', 'Esta semana', split.innerEstaSemana.length, split.innerEstaSemanaTotal)}
                  {split.innerEstaSemana.map(renderItem)}
                </>
              )}
              {split.innerSemanaPassada.length > 0 && (
                <>
                  {renderDivider('semana_passada', 'Semana passada', split.innerSemanaPassada.length, split.innerSemanaPassadaTotal)}
                  {split.innerSemanaPassada.map(renderItem)}
                </>
              )}
              {split.innerRemainder.map(renderItem)}
            </>
          )}
        </>
      ) : (
        <>
          {includeHoje && renderDivider('hoje', 'Hoje', 0, 0)}
          {split.outerEstaSemana.length === 0 && renderDivider('esta_semana', 'Esta semana', 0, 0)}
        </>
      )}
      {split.outerEstaSemana.length > 0 && (
        <>
          {renderDivider('esta_semana', 'Esta semana', split.outerEstaSemana.length, split.outerEstaSemanaTotal)}
          {split.outerEstaSemana.map(renderItem)}
        </>
      )}
      {split.outerSemanaPassada.length > 0 && (
        <>
          {renderDivider('semana_passada', 'Semana passada', split.outerSemanaPassada.length, split.outerSemanaPassadaTotal)}
          {split.outerSemanaPassada.map(renderItem)}
        </>
      )}
      {split.otherMonths.map((mg) => (
        <React.Fragment key={mg.key}>
          {renderDivider(mg.key, mg.label, mg.count, mg.total)}
          {dateGroupItemsVisible(mg.key, collapsed) && mg.items.map(renderItem)}
        </React.Fragment>
      ))}
    </>
  );
}
