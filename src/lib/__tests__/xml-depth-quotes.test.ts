import { describe, expect, it } from 'vitest';
import { getMaxXmlDepth, parseXmlSafe } from '@/lib/safe-xml-parser';
describe('REAUD-B-04 — profundidade com aspas', () => {
  it('atributo legal b="/>" não esconde o aninhamento', () => {

    const deep = '<a b="/>">'.repeat(500) + '</a>'.repeat(500);
    expect(getMaxXmlDepth(deep)).toBe(500);
  });
  it('XML fundo demais é recusado', async () => {
    const deep = '<a b="/>">'.repeat(5000) + '</a>'.repeat(5000);
    await expect(parseXmlSafe(deep)).rejects.toThrow(/profundidade/);
  });
  it('self-closing de verdade continua a não contar', () => {
    expect(getMaxXmlDepth('<r>' + '<x/>'.repeat(100) + '</r>')).toBe(1);
  });
  it('XML fiscal normal não regride', () => {
    expect(getMaxXmlDepth('<nfeProc><NFe><infNFe><det><prod><xProd>a</xProd></prod></det></infNFe></NFe></nfeProc>')).toBe(6);
  });
});
