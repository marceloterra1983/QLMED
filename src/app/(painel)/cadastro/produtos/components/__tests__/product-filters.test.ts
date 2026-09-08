import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { filterProductRows } from '../product-utils';
import type { ProductRow } from '../../types';

const row = (partial: Partial<ProductRow>): ProductRow => ({
  key: partial.key ?? 'k',
  code: partial.code ?? '',
  description: partial.description ?? '',
  ncm: partial.ncm ?? null,
  unit: partial.unit ?? 'UN',
  anvisa: partial.anvisa ?? null,
  totalQuantity: partial.totalQuantity ?? 0,
  invoiceCount: partial.invoiceCount ?? 0,
  lastPrice: partial.lastPrice ?? 0,
  lastIssueDate: partial.lastIssueDate ?? null,
  lastSaleDate: partial.lastSaleDate ?? null,
  lastSalePrice: partial.lastSalePrice ?? null,
  ...partial,
});

describe('filterProductRows', () => {
  const catalog = [
    row({
      key: 'a',
      codigo: '003884',
      description: 'ALEXIS RETRATOR DE INCISAO 256CM S',
      productType: 'CARDIACA',
      productSubtype: 'ALEXIS',
    }),
    row({
      key: 'b',
      codigo: '007950',
      code: 'SDTS001',
      description: 'ESTABILIZADOR DE TECIDO DESCARTAVEL LEPU',
      productType: 'CARDIACA',
      productSubtype: 'ALEXIS',
    }),
    row({
      key: 'c',
      codigo: '000001',
      description: 'STENT CORONARIO',
      productType: 'HEMODINAMICA',
      productSubtype: 'CORONARIA - ABBOTT',
    }),
  ];

  it('keeps a product whose group name matches even if description does not', () => {
    const found = filterProductRows(catalog, { search: 'alexis' });
    expect(found.map((p) => p.codigo)).toEqual(['003884', '007950']);
  });

  it('filters by line without dropping hierarchy matches', () => {
    const found = filterProductRows(catalog, { search: 'alexis', typeFilter: 'CARDIACA' });
    expect(found).toHaveLength(2);
    const empty = filterProductRows(catalog, { search: 'alexis', typeFilter: 'ORTOPEDIA' });
    expect(empty).toHaveLength(0);
  });

  it('respects out-of-line status', () => {
    const withStatus = [
      ...catalog,
      row({ key: 'd', description: 'ALEXIS FORA', productType: 'CARDIACA', productSubtype: 'ALEXIS', outOfLine: true }),
    ];
    expect(filterProductRows(withStatus, { search: 'alexis', lineStatus: 'active' })).toHaveLength(2);
    expect(filterProductRows(withStatus, { search: 'alexis', lineStatus: 'outOfLine' })).toHaveLength(1);
  });
});

describe('ProductFilters listing chrome', () => {
  it('uses FILTER_INPUT_CLS and does not wrap in MobileFilterWrapper', () => {
    const src = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '..', 'ProductFilters.tsx'),
      'utf8',
    );
    expect(src).toContain('FILTER_INPUT_CLS');
    expect(src).not.toContain('MobileFilterWrapper');
  });
});
