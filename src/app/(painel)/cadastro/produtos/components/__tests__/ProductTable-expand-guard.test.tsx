/** @vitest-environment jsdom */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import ProductTable from '../ProductTable';
import type { ProductRow, ProductsSummary } from '../../types';

vi.mock('@/components/ui/Button', () => ({
  default: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => (
    <button type="button" {...props}>{children}</button>
  ),
}));

function row(partial: Partial<ProductRow> & { key: string; codigo: string; description: string }): ProductRow {
  return {
    code: partial.code || 'REF-' + partial.codigo,
    productType: 'CARDIACA',
    productSubtype: 'STENTS',
    anvisa: null,
    lastPrice: 10,
    lastIssueDate: '2026-01-01',
    outOfLine: false,
    ...partial,
  } as ProductRow;
}

const summary: ProductsSummary = { totalProducts: 2, productsWithAnvisa: 0, totalQuantity: 0 };

describe('ProductTable blank-page guard', () => {
  it('mostra linhas de produto mesmo com line:CARDIACA no collapsedGroups', () => {
    const products = [
      row({ key: 'a', codigo: 'SPICA-111', description: 'Stent Coronary A' }),
      row({ key: 'b', codigo: 'SPICA-222', description: 'Stent Coronary B' }),
    ];
    const collapsedGroups = new Set(['line:CARDIACA']);

    render(
      <ProductTable
        products={products}
        loading={false}
        isRebuilding={false}
        summary={summary}
        sortBy="productType"
        sortOrder="asc"
        search=""
        collapsedGroups={collapsedGroups}
        toggleGroup={() => {}}
        selectionEnabled={false}
        setSelectionEnabled={() => {}}
        selectedKeys={new Set()}
        setSelectedKeys={() => {}}
        toggleSelect={() => {}}
        toggleSelectGroup={() => {}}
        setCollapsedGroups={() => {}}
        handleSort={() => {}}
        openDetail={() => {}}
        openHistory={() => {}}
        canWrite={false}
        setSettingsOpen={() => {}}
      />,
    );

    // Desktop + mobile renderizam os mesmos produtos — pelo menos 1 ocorrência cada.
    expect(screen.getAllByText('SPICA-111').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('SPICA-222').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Stent Coronary A').length).toBeGreaterThanOrEqual(1);
    // Não deve mostrar o hint de colapso da linha (effective expand)
    expect(screen.queryByText('Clique para expandir')).toBeNull();
  });
});
