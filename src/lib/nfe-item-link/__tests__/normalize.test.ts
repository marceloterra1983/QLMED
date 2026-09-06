import { describe, expect, it } from 'vitest';
import {
  extractEmbeddedRefs,
  normalizeDescription,
  normalizeEan,
  normalizeSupplierCode,
  normalizeSupplierName,
  numericPrefixVariants,
  ocrLetterOToZero,
  stripLeadingCatalogFromDescription,
  stripLeadingZeros,
  trigramSimilarity,
} from '../normalize';

describe('normalizeSupplierCode', () => {
  it('upper, trim e remove separadores', () => {
    expect(normalizeSupplierCode(' icv-1332 ')).toBe('ICV1332');
    expect(normalizeSupplierCode('10302.00.')).toBe('1030200');
    expect(normalizeSupplierCode('114-20120 XL')).toBe('11420120XL');
    expect(normalizeSupplierCode(null)).toBe('');
  });

  it('zeros à esquerda', () => {
    expect(stripLeadingZeros('0005079')).toBe('5079');
    expect(stripLeadingZeros('000')).toBe('');
    expect(stripLeadingZeros('ICV1332')).toBe('ICV1332');
  });

  it('variantes de prefixo numérico só enquanto o resto tem >= 4 chars', () => {
    expect(numericPrefixVariants('001MOZ25014')).toEqual(['01MOZ25014', '1MOZ25014', 'MOZ25014']);
    expect(numericPrefixVariants('MOZ25014')).toEqual([]);
    expect(numericPrefixVariants('12345')).toEqual(['2345']);
  });
});

describe('normalizeEan', () => {
  it('aceita GTIN 8/12/13/14 e rejeita SEM GTIN, zeros e lixo', () => {
    expect(normalizeEan('7891234567895')).toBe('7891234567895');
    expect(normalizeEan('12345678')).toBe('12345678');
    expect(normalizeEan('SEM GTIN')).toBeNull();
    expect(normalizeEan('0000000000000')).toBeNull();
    expect(normalizeEan('ABC123')).toBeNull();
    expect(normalizeEan('123')).toBeNull();
    expect(normalizeEan('')).toBeNull();
  });
});

describe('normalizeDescription', () => {
  it('remove acentos, ruído de lote/validade e "Posicao: 000"', () => {
    expect(normalizeDescription('Posicao: 000 BIOPROTESE  CARDIACA PERICÁRDIO BOVINO'))
      .toBe('bioprotese cardiaca pericardio bovino');
    expect(normalizeDescription('MARTELO DE BORRACHA-LT:30 -VAL:31/12/2099-FAB:01/01/2020'))
      .toBe('martelo de borracha');
  });
});

describe('trigramSimilarity (semântica pg_trgm)', () => {
  it('idênticas = 1, disjuntas = 0', () => {
    expect(trigramSimilarity('stent coronario', 'stent coronario')).toBe(1);
    expect(trigramSimilarity('abc', 'xyz')).toBe(0);
    expect(trigramSimilarity('', 'abc')).toBe(0);
  });
  it('variação de tamanho fica abaixo de 0,85 quando a descrição é curta', () => {
    const a = normalizeDescription('BALÃO MOZEC 2.25 x 09');
    const b = normalizeDescription('BALÃO MOZEC 2.25 x 17');
    expect(trigramSimilarity(a, b)).toBeLessThan(0.85);
  });
});

describe('normalizeSupplierName', () => {
  it('remove sufixos societários e palavras genéricas', () => {
    expect(normalizeSupplierName('DOC MED COMERCIO IMPORTACAO E EXPORTACAO LTDA')).toBe('doc med');
    expect(normalizeSupplierName('LABCOR LABORATORIOS LTDA')).toBe('labcor laboratorios');
  });
});


describe('normalize S5b/S7 helpers', () => {
  it('extractEmbeddedRefs: DOKIMOS / P-2010 / INSTAR / TIV', () => {
    expect(extractEmbeddedRefs('LABCOR DOKIMOS PLUS-A 25 Codigo MS: x')).toContain('DOKIMOSPLUSA25A');
    expect(extractEmbeddedRefs('LABCOR P-2010 23A')).toContain('P201023A');
    expect(extractEmbeddedRefs('INSTAR 21 AORTICO')).toContain('INSTAR21');
    expect(extractEmbeddedRefs('EAIVPE TIV 23')).toContain('EAIVPETIV23');
    expect(extractEmbeddedRefs('BT 712 TOP (04051)')).toContain('04051');
    expect(extractEmbeddedRefs('BABYGRAFT-L 100/3 AR-10003 Codigo MS: x')).toContain('AR10003');
  });

  it('ocrLetterOToZero só troca O por 0', () => {
    expect(ocrLetterOToZero('BBX800ORK')).toBe('BBX8000RK');
    expect(ocrLetterOToZero('MOZ25014')).toBeNull();
  });

  it('stripLeadingCatalogFromDescription remove prefixo TI', () => {
    const d = normalizeDescription('TI002.4112.004 - PARAFUSO NAO BLOQUEADO AUTOPERFURANTE 01,2 X 04 MM');
    expect(stripLeadingCatalogFromDescription(d)).toBe('parafuso nao bloqueado autoperfurante 01 2 x 04 mm');
  });
});
