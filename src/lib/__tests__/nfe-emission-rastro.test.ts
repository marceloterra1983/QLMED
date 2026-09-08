import { describe, expect, it } from 'vitest';
import {
  assertConsignacaoLots,
  buildRastroXml,
  inferLotFab,
  isRemessaConsignacaoCfop,
  preferredLotsFromItems,
} from '@/lib/nfe-emission/rastro';

describe('SPEC-063 rastro / consignação', () => {
  it('5917 e 6917 são remessa em consignação', () => {
    expect(isRemessaConsignacaoCfop('5917')).toBe(true);
    expect(isRemessaConsignacaoCfop('6917')).toBe(true);
    expect(isRemessaConsignacaoCfop('5102')).toBe(false);
  });

  it('assertConsignacaoLots falha em 5917 sem lote', () => {
    expect(() => assertConsignacaoLots('5917', [{ lot: '' }])).toThrow(/lote/);
    expect(() => assertConsignacaoLots('5917', [{ lot: 'ABC' }])).not.toThrow();
    expect(() => assertConsignacaoLots('5102', [{ lot: '' }])).not.toThrow();
  });

  it('inferLotFab lê YYMMDD do lote', () => {
    expect(inferLotFab('2402120084', '2027-02-11')).toBe('2024-02-12');
  });

  it('inferLotFab recua 3 anos da validade se o lote não datar', () => {
    expect(inferLotFab('LOTE-X', '2027-02-11')).toBe('2024-02-11');
  });

  it('buildRastroXml omite grupo incompleto e monta XSD quando dá', () => {
    expect(buildRastroXml({ qCom: '4', lot: '1021' })).toBe('');
    expect(buildRastroXml({
      lot: '2402120084',
      lotExpiry: '2027-02-11',
      qCom: '4',
    })).toBe('<rastro><nLote>2402120084</nLote><qLote>4.000</qLote><dFab>2024-02-12</dFab><dVal>2027-02-11</dVal></rastro>');
  });

  it('preferredLotsFromItems ignora linha sem lote', () => {
    expect(preferredLotsFromItems([
      { cProd: 'A', qCom: '2', lot: 'L1', lotExpiry: '2027-01-01' },
      { cProd: 'B', qCom: '1' },
    ])).toEqual([
      { cProd: 'A', lot: 'L1', lotExpiry: '2027-01-01', quantity: 2 },
    ]);
  });
});
