import { describe, expect, it } from 'vitest';
import type { ProductRow } from '../../types';
import {
  allCollapseKeys,
  anyProductRowVisible,
  productLineKey,
  safeCollapseKeys,
} from '../product-group-visibility';

function row(partial: Partial<ProductRow> & { key: string }): ProductRow {
  return {
    description: partial.description || 'Produto',
    code: partial.code || 'REF',
    productType: partial.productType ?? 'CARDIACA',
    productSubtype: partial.productSubtype ?? 'STENTS',
    ...partial,
  } as ProductRow;
}

describe('product-group-visibility', () => {
  const page = [
    row({ key: '1', productType: 'CARDIACA', productSubtype: 'STENTS', codigo: '100' }),
    row({ key: '2', productType: 'CARDIACA', productSubtype: 'STENTS', codigo: '101' }),
    row({ key: '3', productType: 'CARDIACA', productSubtype: 'BALOES', codigo: '102' }),
    row({ key: '4', productType: 'ORTOPEDIA', productSubtype: 'PLACAS', codigo: '200' }),
  ];

  it('allCollapseKeys recolhe linhas e grupos (tudo fechado)', () => {
    const keys = allCollapseKeys(page, 'productType');
    expect(keys.has('line:CARDIACA')).toBe(true);
    expect(keys.has('line:ORTOPEDIA')).toBe(true);
    expect(keys.has('group:CARDIACA|STENTS')).toBe(true);
    expect(keys.has('group:CARDIACA|BALOES')).toBe(true);
    expect(anyProductRowVisible(page, 'productType', keys)).toBe(false);
  });

  it('safeCollapseKeys = allCollapseKeys (Recolher fecha tudo)', () => {
    const keys = safeCollapseKeys(page, 'productType');
    expect(keys).toEqual(allCollapseKeys(page, 'productType'));
    expect(keys.has(productLineKey(page[0]))).toBe(true);
  });

  it('colapso parcial ainda deixa outros grupos visíveis', () => {
    const collapsed = new Set(['group:CARDIACA|STENTS']);
    expect(anyProductRowVisible(page, 'productType', collapsed)).toBe(true);
  });
});
