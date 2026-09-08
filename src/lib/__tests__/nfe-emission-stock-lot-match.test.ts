import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  expandStockLotProductKeys,
  filterStockLotsForProduct,
} from '@/lib/nfe-emission/stock-lot-match';

describe('filterStockLotsForProduct', () => {
  const ledgerInternal = {
    productCodigo: 'INT-00971',
    lot: 'L-AA',
    lotExpiry: '2027-06-01',
    quantity: 4,
  };
  const other = {
    productCodigo: 'OTHER',
    lot: 'L-BB',
    lotExpiry: null,
    quantity: 9,
  };
  const zero = {
    productCodigo: 'INT-00971',
    lot: 'L-ZERO',
    lotExpiry: null,
    quantity: 0,
  };

  it('casa TP00971 (code) com ledger cujo productCodigo é codigo interno distinto', () => {
    const lots = filterStockLotsForProduct(
      [ledgerInternal, other, zero],
      'TP00971',
      { code: 'TP00971', codigo: 'INT-00971' },
    );
    expect(lots).toEqual([ledgerInternal]);
  });

  it('casa code e productCodigo case-insensitive', () => {
    const lots = filterStockLotsForProduct(
      [{ ...ledgerInternal, productCodigo: 'int-00971' }],
      'tp00971',
      { code: 'Tp00971', codigo: 'Int-00971' },
    );
    expect(lots).toHaveLength(1);
  });

  it('sem catálogo ainda casa productCodigo === query', () => {
    const lots = filterStockLotsForProduct(
      [{ productCodigo: 'TP00971', lot: 'L1', lotExpiry: null, quantity: 1 }, other],
      'TP00971',
    );
    expect(lots.map((l) => l.lot)).toEqual(['L1']);
  });

  it('query vazia sem aliases devolve vazio', () => {
    expect(filterStockLotsForProduct([ledgerInternal], '', null)).toEqual([]);
  });

  it('expandStockLotProductKeys une query + code + codigo', () => {
    expect(expandStockLotProductKeys('TP00971', { code: 'TP00971', codigo: 'INT-00971' }).sort()).toEqual([
      'int-00971',
      'tp00971',
    ]);
  });
});

describe('UI contrato lote na Nova NF-e', () => {
  it('empty state e linha com colSpan', () => {
    const fields = readFileSync(
      resolve(__dirname, '../../app/(painel)/fiscal/issued/nova/EmissionLotFields.tsx'),
      'utf8',
    );
    const page = readFileSync(
      resolve(__dirname, '../../app/(painel)/fiscal/issued/nova/page-client.tsx'),
      'utf8',
    );
    expect(fields).toContain('Nenhum lote no CD');
    expect(page).toContain('EmissionLotFields');
    expect(page).toMatch(/colSpan=\{8\}/);
    const productTd = page.slice(page.indexOf('<td className="py-2 pr-2">'), page.indexOf('NCM do item'));
    expect(productTd).not.toContain('EmissionLotFields');
  });
});
