import { describe, expect, it } from 'vitest';
import {
  STOCK_LEDGER_CUTOFF,
  classifyReceivedStockCfop,
  isOnOrAfterStockCutoff,
  resolveReceivedProductCodigo,
  computeImpliedOpenings,
} from '@/lib/stock-ledger-cutoff';
import {
  buildStockProductTree,
  filterStockProducts,
  mergeCatalogWithBalances,
  stockLineKey,
} from '@/lib/stock-catalog';
import type { StockBalanceRow } from '@/lib/stock-ledger';

describe('SPEC-058 corte temporal', () => {
  it('cutoff é 01/01/2021 UTC', () => {
    expect(STOCK_LEDGER_CUTOFF.toISOString()).toBe('2021-01-01T00:00:00.000Z');
  });

  it('rejeita notas anteriores a 2021', () => {
    expect(isOnOrAfterStockCutoff(new Date('2020-12-31T23:59:59.000Z'))).toBe(false);
    expect(isOnOrAfterStockCutoff('2010-05-01')).toBe(false);
    expect(isOnOrAfterStockCutoff(null)).toBe(false);
  });

  it('aceita notas a partir de 01/01/2021', () => {
    expect(isOnOrAfterStockCutoff(new Date('2021-01-01T00:00:00.000Z'))).toBe(true);
    expect(isOnOrAfterStockCutoff('2021-01-02')).toBe(true);
    expect(isOnOrAfterStockCutoff(new Date('2026-09-07'))).toBe(true);
  });
});

describe('resolveReceivedProductCodigo', () => {
  const linkByItem = new Map([[1, '001993']]);
  const linkBySupplier = new Map([['FORN-99', '001993']]);
  const registryByCode = new Map([['REF-X', '002014'], ['002014', '002014']]);

  it('prioriza nfe_item_product_link por item', () => {
    expect(
      resolveReceivedProductCodigo({
        supplierCode: 'FORN-99',
        itemNumber: 1,
        linkByItem,
        linkBySupplier,
        registryByCode,
      }),
    ).toBe('001993');
  });

  it('cai no código do fornecedor no link', () => {
    expect(
      resolveReceivedProductCodigo({
        supplierCode: 'FORN-99',
        itemNumber: 9,
        linkByItem,
        linkBySupplier,
        registryByCode,
      }),
    ).toBe('001993');
  });

  it('cai no cadastro por referência', () => {
    expect(
      resolveReceivedProductCodigo({
        supplierCode: 'REF-X',
        itemNumber: 3,
        linkByItem,
        linkBySupplier,
        registryByCode,
      }),
    ).toBe('002014');
  });

  it('mantém o código do XML se não houver match', () => {
    expect(
      resolveReceivedProductCodigo({
        supplierCode: 'SEM-MATCH',
        itemNumber: 8,
        linkByItem,
        linkBySupplier,
        registryByCode,
      }),
    ).toBe('SEM-MATCH');
  });
});

describe('classifyReceivedStockCfop', () => {
  it('compra → ENTRADA_NFE', () => {
    expect(classifyReceivedStockCfop('6102')).toEqual({ kind: 'ENTRADA_NFE', isReturn: false });
    expect(classifyReceivedStockCfop('5102')).toEqual({ kind: 'ENTRADA_NFE', isReturn: false });
  });

  it('retorno consignação recebido', () => {
    expect(classifyReceivedStockCfop('1918')).toEqual({ kind: 'RETORNO_CONSIG', isReturn: true });
    expect(classifyReceivedStockCfop('6916')).toEqual({ kind: 'RETORNO_CONSIG', isReturn: true });
  });
});

function lot(
  codigo: string,
  qty: number,
  loc: 'CD' | 'CUSTOMER' = 'CD',
  band: StockBalanceRow['validityBand'] = 'ok',
): StockBalanceRow {
  return {
    productCodigo: codigo,
    productName: codigo,
    lot: 'L1',
    lotExpiry: '2027-01-01',
    locationType: loc,
    locationCnpj: loc === 'CUSTOMER' ? '123' : null,
    locationName: loc === 'CUSTOMER' ? 'Hospital' : null,
    quantity: qty,
    validityBand: band,
    daysToExpiry: 100,
  };
}

describe('mergeCatalogWithBalances + árvore', () => {
  const catalog = [
    {
      codigo: 'A1',
      code: 'REF-A',
      description: 'Stent',
      productType: 'Cardio',
      productSubtype: 'Stents',
      productSubgroup: 'Coronário',
      manufacturerShortName: 'ACME',
      anvisaManufacturer: null,
      shortName: 'Stent Cor',
    },
    {
      codigo: 'B1',
      code: 'REF-B',
      description: 'Guia',
      productType: 'Cardio',
      productSubtype: 'Guias',
      productSubgroup: null,
      manufacturerShortName: null,
      anvisaManufacturer: 'GUIDE',
      shortName: null,
    },
  ];

  it('inclui produto sem saldo no Controle', () => {
    const rows = mergeCatalogWithBalances(catalog, [lot('A1', 3)], { includeZero: true });
    expect(rows).toHaveLength(2);
    const a = rows.find((r) => r.productCodigo === 'A1')!;
    expect(a.qtyCd).toBe(3);
    expect(a.qtyTotal).toBe(3);
    expect(a.manufacturer).toBe('ACME');
    const b = rows.find((r) => r.productCodigo === 'B1')!;
    expect(b.qtyTotal).toBe(0);
  });

  it('Saída Material omite saldo zero', () => {
    const rows = mergeCatalogWithBalances(catalog, [lot('A1', 3)], { includeZero: false });
    expect(rows.map((r) => r.productCodigo)).toEqual(['A1']);
  });

  it('soma CD e consignado', () => {
    const rows = mergeCatalogWithBalances(
      catalog,
      [lot('A1', 2, 'CD'), lot('A1', 5, 'CUSTOMER')],
      { includeZero: true },
    );
    const a = rows.find((r) => r.productCodigo === 'A1')!;
    expect(a.qtyCd).toBe(2);
    expect(a.qtyCustomer).toBe(5);
    expect(a.qtyTotal).toBe(7);
  });

  it('monta Linha > Grupo > Subgrupo', () => {
    const rows = mergeCatalogWithBalances(catalog, [lot('A1', 1)], { includeZero: true });
    const tree = buildStockProductTree(rows);
    expect(tree).toHaveLength(1);
    expect(tree[0].key).toBe(stockLineKey({ productType: 'Cardio' }));
    expect(tree[0].groups).toHaveLength(2);
    const stents = tree[0].groups.find((g) => g.name === 'Stents')!;
    expect(stents.subgroups[0].name).toBe('Coronário');
    expect(stents.subgroups[0].products[0].productCodigo).toBe('A1');
  });

  it('filtra validade e busca', () => {
    const rows = mergeCatalogWithBalances(
      catalog,
      [lot('A1', 2, 'CD', 'd30'), lot('B1', 1, 'CD', 'ok')],
      { includeZero: true },
    );
    const onlyD30 = filterStockProducts(rows, { validity: 'd30' });
    expect(onlyD30.map((p) => p.productCodigo)).toEqual(['A1']);
    const search = filterStockProducts(rows, { q: 'guia' });
    expect(search.map((p) => p.productCodigo)).toEqual(['B1']);
  });
});


describe('computeImpliedOpenings', () => {
  const t0 = new Date('2021-02-01T00:00:00.000Z');
  const t1 = new Date('2021-03-01T00:00:00.000Z');

  it('abre o déficit quando só há saída', () => {
    const rows = computeImpliedOpenings([
      { productCodigo: '002014', lot: 'L1', lotExpiry: null, locationType: 'CD', locationCnpj: null, signedQty: -92, occurredAt: t0 },
    ]);
    expect(rows).toEqual([
      { productCodigo: '002014', lot: 'L1', lotExpiry: null, locationType: 'CD', locationCnpj: null, quantity: 92 },
    ]);
  });

  it('não abre saldo se compra cobre a venda', () => {
    const rows = computeImpliedOpenings([
      { productCodigo: 'A', lot: '', lotExpiry: null, locationType: 'CD', locationCnpj: null, signedQty: 10, occurredAt: t0 },
      { productCodigo: 'A', lot: '', lotExpiry: null, locationType: 'CD', locationCnpj: null, signedQty: -8, occurredAt: t1 },
    ]);
    expect(rows).toEqual([]);
  });

  it('abre o pico de déficit mesmo quando o saldo final fica positivo (AC-001: pico ≠ saldo final)', () => {
    const rows = computeImpliedOpenings([
      { productCodigo: 'A', lot: '', lotExpiry: null, locationType: 'CD', locationCnpj: null, signedQty: -5, occurredAt: t0 },
      { productCodigo: 'A', lot: '', lotExpiry: null, locationType: 'CD', locationCnpj: null, signedQty: 20, occurredAt: t1 },
    ]);
    expect(rows).toEqual([
      { productCodigo: 'A', lot: '', lotExpiry: null, locationType: 'CD', locationCnpj: null, quantity: 5 },
    ]);
  });

  it('abre o pico acumulado, não só o primeiro movimento', () => {
    const rows = computeImpliedOpenings([
      { productCodigo: 'A', lot: '', lotExpiry: null, locationType: 'CD', locationCnpj: null, signedQty: -4, occurredAt: t0 },
      { productCodigo: 'A', lot: '', lotExpiry: null, locationType: 'CD', locationCnpj: null, signedQty: -3, occurredAt: t1 },
    ]);
    expect(rows).toEqual([
      { productCodigo: 'A', lot: '', lotExpiry: null, locationType: 'CD', locationCnpj: null, quantity: 7 },
    ]);
  });

  it('pico é o mínimo acumulado, não a soma dos déficits', () => {
    const rows = computeImpliedOpenings([
      { productCodigo: 'A', lot: '', lotExpiry: null, locationType: 'CD', locationCnpj: null, signedQty: -5, occurredAt: t0 },
      { productCodigo: 'A', lot: '', lotExpiry: null, locationType: 'CD', locationCnpj: null, signedQty: 3, occurredAt: t1 },
      { productCodigo: 'A', lot: '', lotExpiry: null, locationType: 'CD', locationCnpj: null, signedQty: -4, occurredAt: t1 },
    ]);
    // acumulados: -5, -2, -6 → pico 6
    expect(rows).toEqual([
      { productCodigo: 'A', lot: '', lotExpiry: null, locationType: 'CD', locationCnpj: null, quantity: 6 },
    ]);
  });
});
