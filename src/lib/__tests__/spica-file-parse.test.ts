import { describe, expect, it } from 'vitest';
import { parseSpicaRelCsv, mapSpicaHeader, parseCsvLine } from '@/lib/spica/file-parse';

describe('spica/file-parse', () => {
  it('detecta separador ponto-e-virgula', () => {
    const csv = [
      'Código;Referência;Nome do Produto;Tipo;SubTipo;Fabricante;Fornecedor;Instrumental;RVS;NCM;Situação Tributária;Nome da Tributação;%ICMS;%PIS;%COFINS;%IPI Entr.;%IPI Saída;Obs. Fiscal',
      '1;REF-A;Prod A;1 - CARDIACA;SUB;FAB;;Não;;90189099;000;TRIB;17,00;0,65;3,00;0,00;0,00;',
    ].join('\n');
    const rows = parseSpicaRelCsv(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0].referencia).toBe('REF-A');
    expect(rows[0].icms).toBe('17,00');
  });

  it('parseCsvLine respeita aspas com virgula interna', () => {
    expect(parseCsvLine('"a","b,c","d"', ',')).toEqual(['a', 'b,c', 'd']);
  });

  it('mapSpicaHeader rejeita sem colunas obrigatorias', () => {
    expect(mapSpicaHeader(['Tipo', 'SubTipo'])).toBeNull();
  });

  it('fallback posicional quando cabeçalho desconhecido', () => {
    const quoted = [
      'a,b,c,d,e,f,g,h,i,j,k,l,m,n,o,p,q,r',
      '"42","REF-X","Nome X","1 - CARDIACA","S","F","","Sim","80071910005","90189099","000","T","17,00","0,65","3,00","0,00","0,00",""',
    ].join('\n');
    const rows = parseSpicaRelCsv(quoted);
    expect(rows[0].codigo).toBe('42');
    expect(rows[0].referencia).toBe('REF-X');
    expect(rows[0].icms).toBe('17,00');
  });
});
