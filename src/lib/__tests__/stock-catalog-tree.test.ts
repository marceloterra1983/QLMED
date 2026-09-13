import { describe, expect, it } from 'vitest';
import {
  buildStockProductTree,
  filterStockProducts,
  type StockCatalogProduct,
} from '@/lib/stock-catalog';

function product(partial: Partial<StockCatalogProduct> & Pick<StockCatalogProduct, 'productCodigo'>): StockCatalogProduct {
  return {
    code: partial.productCodigo,
    description: partial.productCodigo,
    productName: partial.productCodigo,
    productType: 'OUTROS',
    productSubtype: 'OUTROS',
    productSubgroup: null,
    manufacturer: null,
    qtyCd: 0,
    qtyCustomer: 0,
    qtyTotal: 0,
    worstValidity: null,
    lots: [],
    ...partial,
  };
}

describe('árvore de estoque', () => {
  it('coloca produtos sem grupo antes dos grupos nomeados', () => {
    const tree = buildStockProductTree([
      product({ productCodigo: 'G1', productSubtype: 'CATETER DE ACESSO', qtyCd: 1, qtyTotal: 1 }),
      product({ productCodigo: 'L1', productSubtype: 'OUTROS', qtyCd: 1, qtyTotal: 1 }),
    ]);
    expect(tree[0].groups.map((g) => g.name)).toEqual(['OUTROS', 'CATETER DE ACESSO']);
    expect(tree[0].groups[0].loose.map((p) => p.productCodigo)).toEqual(['L1']);
  });
});

describe('filtro de local', () => {
  it('CD esconde item só de consignado, mesmo sem quantidade mínima', () => {
    const rows = [
      product({ productCodigo: 'CD', qtyCd: 2, qtyTotal: 2 }),
      product({ productCodigo: 'CONS', qtyCustomer: 3, qtyTotal: 3 }),
    ];
    expect(filterStockProducts(rows, { locationType: 'CD' }).map((p) => p.productCodigo)).toEqual(['CD']);
    expect(filterStockProducts(rows, { locationType: 'CUSTOMER' }).map((p) => p.productCodigo)).toEqual(['CONS']);
  });
});
