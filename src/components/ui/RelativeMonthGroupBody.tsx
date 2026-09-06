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
 * Mês atual no topo (colapsável) com Hoje (divisória estática) e resto do mês dentro.
 * Divisorias de semana relativa foram removidas (SPEC-053).
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
              {split.innerRemainder.map(renderItem)}
            </>
          )}
        </>
      ) : (
        includeHoje && split.innerHoje.length > 0 ? (
          <>
            {renderDivider('hoje', 'Hoje', split.innerHoje.length, split.innerHojeTotal)}
            {split.innerHoje.map(renderItem)}
          </>
        ) : null
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
