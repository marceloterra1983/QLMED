/** @vitest-environment jsdom */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import DateGroupHeader from '../DateGroupHeader';

function wrapTable(node: React.ReactNode) {
  return (
    <table>
      <tbody>{node}</tbody>
    </table>
  );
}

describe('DateGroupHeader', () => {
  it('Hoje é divisória estática: sem chevron e sem toggle', () => {
    const onToggle = vi.fn();
    render(wrapTable(
      <DateGroupHeader
        groupKey="hoje"
        label="Hoje"
        count={3}
        variant="table"
        collapsed={new Set(['hoje'])}
        onToggle={onToggle}
      />,
    ));
    expect(screen.getByText('Hoje')).toBeTruthy();
    expect(screen.queryByText('expand_more')).toBeNull();
    fireEvent.click(screen.getByText('Hoje'));
    expect(onToggle).not.toHaveBeenCalled();
  });

  it('mês continua colapsável: chevron e clique', () => {
    const onToggle = vi.fn();
    render(wrapTable(
      <DateGroupHeader
        groupKey="mes_2026-08"
        label="Agosto/2026"
        count={12}
        variant="table"
        collapsed={new Set()}
        onToggle={onToggle}
      />,
    ));
    expect(screen.getByText('expand_more')).toBeTruthy();
    fireEvent.click(screen.getByText('Agosto/2026'));
    expect(onToggle).toHaveBeenCalledWith('mes_2026-08');
  });

  it('Hoje no mobile também é estática', () => {
    const onToggle = vi.fn();
    render(
      <DateGroupHeader
        groupKey="hoje"
        label="Hoje"
        count={1}
        variant="mobile"
        collapsed={new Set(['hoje'])}
        onToggle={onToggle}
      />,
    );
    expect(screen.queryByText('expand_more')).toBeNull();
    fireEvent.click(screen.getByText('Hoje'));
    expect(onToggle).not.toHaveBeenCalled();
  });
});
