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

const baseProps = {
  loading: false,
  isRebuilding: false,
  summary,
  sortBy: 'productType' as const,
  sortOrder: 'asc' as const,
  search: '',
  toggleGroup: () => {},
  selectionEnabled: false,
  setSelectionEnabled: () => {},
  selectedKeys: new Set<string>(),
  setSelectedKeys: () => {},
  toggleSelect: () => {},
  toggleSelectGroup: () => {},
  setCollapsedGroups: () => {},
  handleSort: () => {},
  openDetail: () => {},
  openHistory: () => {},
  canWrite: false,
  setSettingsOpen: () => {},
};

describe('ProductTable collapsed-by-default', () => {
  it('com line recolhida mostra cabeçalho e esconde produtos', () => {
    const products = [
      row({ key: 'a', codigo: 'SPICA-111', description: 'Stent Coronary A' }),
      row({ key: 'b', codigo: 'SPICA-222', description: 'Stent Coronary B' }),
    ];
    const collapsedGroups = new Set(['line:CARDIACA', 'group:CARDIACA|STENTS']);

    render(
      <ProductTable
        {...baseProps}
        products={products}
        collapsedGroups={collapsedGroups}
      />,
    );

    expect(screen.getAllByText(/CARDIACA/).length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText('SPICA-111')).toBeNull();
    expect(screen.queryByText('Stent Coronary A')).toBeNull();
  });

  it('com grupos expandidos mostra produtos', () => {
    const products = [
      row({ key: 'a', codigo: 'SPICA-111', description: 'Stent Coronary A' }),
      row({ key: 'b', codigo: 'SPICA-222', description: 'Stent Coronary B' }),
    ];

    render(
      <ProductTable
        {...baseProps}
        products={products}
        collapsedGroups={new Set()}
      />,
    );

    expect(screen.getAllByText('SPICA-111').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Stent Coronary A').length).toBeGreaterThanOrEqual(1);
  });

  it('badge de linha usa total do catálogo (hierarchyCounts), nao so a pagina', () => {
    const products = [
      row({ key: 'a', codigo: 'SPICA-111', description: 'Stent Coronary A' }),
      row({ key: 'b', codigo: 'SPICA-222', description: 'Stent Coronary B' }),
    ];
    const collapsedGroups = new Set(['line:CARDIACA', 'group:CARDIACA|STENTS']);

    render(
      <ProductTable
        {...baseProps}
        products={products}
        collapsedGroups={collapsedGroups}
        hierarchyCounts={{
          byLine: { 'line:CARDIACA': 826 },
          byGroup: { 'group:CARDIACA|STENTS': 40 },
          bySubgroup: { 'sub:CARDIACA|STENTS|ALEXIS': 12 },
        }}
      />,
    );

    // Página tem 2 produtos, mas o badge deve mostrar 826 (total filtrado).
    // Desktop + mobile renderizam o mesmo cabeçalho.
    expect(screen.getAllByTitle(/826 no cadastro/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('826').length).toBeGreaterThanOrEqual(1);
  });

  it('subgrupo recolhido mostra cabeçalho e esconde produtos', () => {
    const products = [
      row({
        key: 'a',
        codigo: 'SPICA-111',
        description: 'Alexis Retrator',
        productSubtype: 'CARDIACA',
        productSubgroup: 'ALEXIS',
      }),
      row({
        key: 'b',
        codigo: 'SPICA-222',
        description: 'Alexis Outro',
        productSubtype: 'CARDIACA',
        productSubgroup: 'ALEXIS',
      }),
    ];
    // Linha expandida, grupo=linha (sameLineGroup), subgrupo recolhido
    const collapsedGroups = new Set(['sub:CARDIACA|CARDIACA|ALEXIS']);

    render(
      <ProductTable
        {...baseProps}
        products={products}
        collapsedGroups={collapsedGroups}
      />,
    );

    expect(screen.getAllByText(/ALEXIS/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Clique para expandir/).length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText('SPICA-111')).toBeNull();
    expect(screen.queryByText('Alexis Retrator')).toBeNull();
  });
});
