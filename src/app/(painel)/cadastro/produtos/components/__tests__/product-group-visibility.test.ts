import { describe, expect, it } from 'vitest';
import type { ProductRow } from '../../types';
import {
  anyProductRowVisible,
  effectiveCollapsedGroups,
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
  ];

  it('effectiveCollapsedGroups força expandido quando a linha única está recolhida', () => {
    const collapsed = new Set([productLineKey(page[0])]);
    expect(anyProductRowVisible(page, 'productType', collapsed)).toBe(false);
    const effective = effectiveCollapsedGroups(page, 'productType', collapsed);
    expect(effective.size).toBe(0);
    expect(anyProductRowVisible(page, 'productType', effective)).toBe(true);
  });

  it('safeCollapseKeys com uma linha não esconde todos os produtos', () => {
    const keys = safeCollapseKeys(page, 'productType');
    expect(keys.has('line:CARDIACA')).toBe(false);
    expect(anyProductRowVisible(page, 'productType', keys)).toBe(true);
  });

  it('mantém colapso parcial quando ainda há itens visíveis', () => {
    const collapsed = new Set(['group:CARDIACA|STENTS']);
    expect(anyProductRowVisible(page, 'productType', collapsed)).toBe(true);
    const effective = effectiveCollapsedGroups(page, 'productType', collapsed);
    expect(effective.has('group:CARDIACA|STENTS')).toBe(true);
  });
});
