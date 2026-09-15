import { describe, expect, it } from 'vitest';
import { resolveUniqueLotExpiryFromXml } from '@/lib/e509/lot-expiry';

describe('resolveUniqueLotExpiryFromXml', () => {
  it('lê dVal do rastro com o mesmo lote', () => {
    const xml = `<det><prod><rastro><nLote>ABC123</nLote><dVal>2028-04-15</dVal></rastro></prod></det>`;
    expect(resolveUniqueLotExpiryFromXml(xml, 'ABC123')).toBe('2028-04-15');
  });

  it('lê Validade: no infAdProd junto do lote', () => {
    const xml = `<infAdProd>| Lote: 010830503 - Validade: 26/01/2028 |</infAdProd>`;
    expect(resolveUniqueLotExpiryFromXml(xml, '010830503')).toBe('2028-01-26');
  });

  it('não inventa data quando o lote não aparece', () => {
    const xml = `<rastro><nLote>OUTRO</nLote><dVal>2028-01-01</dVal></rastro>`;
    expect(resolveUniqueLotExpiryFromXml(xml, '010830503')).toBeNull();
  });

  it('não inventa data quando há duas datas distintas para o mesmo lote', () => {
    const xml = `
      <rastro><nLote>L1</nLote><dVal>2028-01-01</dVal></rastro>
      <rastro><nLote>L1</nLote><dVal>2029-01-01</dVal></rastro>
    `;
    expect(resolveUniqueLotExpiryFromXml(xml, 'L1')).toBeNull();
  });
});
