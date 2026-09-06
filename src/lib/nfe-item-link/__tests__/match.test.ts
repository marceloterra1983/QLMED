import { describe, expect, it } from 'vitest';
import { buildRegistryIndex, matchItem, memoryKey, type LinkItemInput, type RegistryProduct } from '../match';

// Casos reais (anonimizados nos ids) tirados do banco em 2026-09-05.
const registry: RegistryProduct[] = [
  { id: 'p-icv', codigo: '005079', code: 'ICV1332', productRefs: ['ICV1332'], ean: null, anvisaCode: '80000000001', ncm: '90183929', description: 'INTRODUTOR CV 1332', defaultSupplier: 'ANGIOMED PRODUTOS MEDICOS LTDA', manufacturerShortName: 'ANGIOMED' },
  { id: 'p-moz', codigo: '004733', code: 'MOZ25014', productRefs: ['MOZ25014'], ean: null, anvisaCode: null, ncm: '90183929', description: 'BALÃO MOZEC 2.50 x 14', defaultSupplier: 'DOC MED COMERCIO IMPORTACAO E EXPORTACAO LTDA', manufacturerShortName: 'MERIL' },
  { id: 'p-moz2', codigo: '004734', code: 'MOZ25017', productRefs: ['MOZ25017'], ean: null, anvisaCode: null, ncm: '90183929', description: 'BALÃO MOZEC 2.50 x 17', defaultSupplier: 'DOC MED COMERCIO IMPORTACAO E EXPORTACAO LTDA', manufacturerShortName: 'MERIL' },
  { id: 'p-ean', codigo: '006358', code: 'ARISTA1G', productRefs: [], ean: '7891234567895', anvisaCode: '80689090153', ncm: '30069010', description: 'HEMOSTATICO ARISTA 1G', defaultSupplier: null, manufacturerShortName: 'BARD' },
  // Dois produtos com o mesmo registro ANVISA (tamanhos diferentes): S4 ambíguo.
  { id: 'p-magis30', codigo: '004928', code: 'AAVLM30', productRefs: ['AAVLM30'], ean: null, anvisaCode: '10171259001', ncm: '90213999', description: 'ANEL MAGIS 30 MITRAL', defaultSupplier: 'LABCOR LABORATORIOS', manufacturerShortName: 'LABCOR' },
  { id: 'p-magis32', codigo: '004929', code: 'AAVLM32', productRefs: ['AAVLM32'], ean: null, anvisaCode: '10171259001', ncm: '90213999', description: 'ANEL MAGIS 32 MITRAL', defaultSupplier: 'LABCOR LABORATORIOS', manufacturerShortName: 'LABCOR' },
  // Referência compartilhada (PROCAT) → S2 ambíguo.
  { id: 'p-procat-a', codigo: '001000', code: 'PROCAT', productRefs: ['PROCAT'], ean: null, anvisaCode: null, ncm: null, description: 'PROCAT A', defaultSupplier: null, manufacturerShortName: null },
  { id: 'p-procat-b', codigo: '001001', code: 'PROCAT', productRefs: ['PROCAT'], ean: null, anvisaCode: null, ncm: null, description: 'PROCAT B', defaultSupplier: null, manufacturerShortName: null },
  // Ref que é uma palavra ("CATETER"): não pode casar pela descrição.
  { id: 'p-word', codigo: '000380', code: 'CATETER', productRefs: ['CATETER'], ean: null, anvisaCode: null, ncm: '90183919', description: 'CATETER MIKAELSON 5 FR', defaultSupplier: null, manufacturerShortName: null },
  { id: 'p-ha60', codigo: '007954', code: 'HA60', productRefs: ['HA60'], ean: null, anvisaCode: '80102512865', ncm: '84212919', description: 'CARTUCHO PARA HEMOPERFUSAO DESCARTAVEL 65±20 ML', defaultSupplier: null, manufacturerShortName: 'JAFRON' },
  { id: 'p-at01', codigo: '007955', code: 'AT-01', productRefs: ['AT-01'], ean: null, anvisaCode: null, ncm: '90189099', description: 'SISTEMA DE TUBULACAO PARA TERAPIA', defaultSupplier: null, manufacturerShortName: null },
  { id: 'p-desc', codigo: '007948', code: 'VM060001', productRefs: [], ean: null, anvisaCode: null, ncm: '90189099', description: 'EQUIPO PARA GERADOR ULTRASSONICO VIA MEDICAL', defaultSupplier: 'VIA MEDICAL PRODUTOS LTDA', manufacturerShortName: 'VIA MEDICAL' },
  { id: 'p-zero', codigo: '000777', code: '0004521', productRefs: [], ean: null, anvisaCode: null, ncm: null, description: 'PRODUTO COM ZEROS', defaultSupplier: null, manufacturerShortName: null },
  // LABCOR: cProd interno; modelo Spica no xProd.
  { id: 'p-dok25', codigo: '004463', code: 'DOKIMOS PLUS -A 25A', productRefs: ['DOKIMOS PLUS -A 25A'], ean: null, anvisaCode: null, ncm: '90213919', description: 'BIOPROTESE CARDIACA AORTICA - DOKIMOS PLUS- 25A', defaultSupplier: 'LABCOR LABORATORIOS', manufacturerShortName: 'LABCOR' },
  { id: 'p-p201023', codigo: '004957', code: 'P-201023A', productRefs: ['P-201023A'], ean: null, anvisaCode: null, ncm: '90213919', description: 'BIOPROTESE CARDIACA AORTICA P-2010 - 23A', defaultSupplier: 'LABCOR LABORATORIOS', manufacturerShortName: 'LABCOR' },
  { id: 'p-bbx8', codigo: '007549', code: 'BBX8000-RK', productRefs: ['BBX8000-RK'], ean: null, anvisaCode: null, ncm: '90189099', description: '1 UN TIBIAL OFFSET GUIDE PLATE SIZE 8', defaultSupplier: 'DOC MED', manufacturerShortName: null },
  { id: 'p-paraf12', codigo: '006895', code: 'TI002.4112.004', productRefs: ['TI002.4112.004'], ean: null, anvisaCode: null, ncm: '90211020', description: 'TI002.4112.004 - PARAFUSO NAO BLOQUEADO AUTOPERFURANTE 01,2 X 04 MM', defaultSupplier: 'RCA SAUDE', manufacturerShortName: 'TECHIMPORT' },
  { id: 'p-paraf12b', codigo: '006896', code: 'TI002.4112.005', productRefs: ['TI002.4112.005'], ean: null, anvisaCode: null, ncm: '90211020', description: 'TI002.4112.005 - PARAFUSO NAO BLOQUEADO AUTOPERFURANTE 01,2 X 05 MM', defaultSupplier: 'RCA SAUDE', manufacturerShortName: 'TECHIMPORT' },
  { id: 'p-baby', codigo: '007501', code: 'AR-10003', productRefs: ['AR-10003'], ean: null, anvisaCode: null, ncm: '90213930', description: 'ENXERTO ARTERIAL LD-HYDRO LABCOR BABYGRAFT-L 100/3', defaultSupplier: 'LABCOR LABORATORIOS', manufacturerShortName: 'LABCOR' },
];
const index = buildRegistryIndex(registry);

function item(over: Partial<LinkItemInput>): LinkItemInput {
  return { supplierCnpj: '66877184000180', supplierName: 'DOC MED COMERCIO IMPORTACAO E EXPORTACAO LTDA', supplierCode: '', description: null, ean: null, anvisa: null, ncm: null, ...over };
}

describe('cascata S1..S7', () => {
  it('S1: cProd igual ao código Spica (devolução/nota emitida pela Spica)', () => {
    expect(matchItem(item({ supplierCode: '005079' }), index)).toMatchObject({ productId: 'p-icv', strategy: 'S1', confidence: 1, codigo: '005079' });
  });

  it('S2 exato normalizado: hífen/espaço/caixa não importam', () => {
    expect(matchItem(item({ supplierCode: 'icv-1332' }), index)).toMatchObject({ productId: 'p-icv', strategy: 'S2', confidence: 0.98 });
  });

  it('S2 sem zeros à esquerda', () => {
    expect(matchItem(item({ supplierCode: '4521' }), index)).toMatchObject({ productId: 'p-zero', strategy: 'S2', confidence: 0.95 });
  });

  it('S2 prefixo numérico do fornecedor (001MOZ25014 → MOZ25014)', () => {
    expect(matchItem(item({ supplierCode: '001MOZ25014' }), index)).toMatchObject({ productId: 'p-moz', strategy: 'S2', confidence: 0.9 });
  });

  it('S2 ambíguo (PROCAT em dois produtos) não vincula', () => {
    expect(matchItem(item({ supplierCode: 'PROCAT' }), index)).toBeNull();
  });

  it('S3 EAN válido e único', () => {
    expect(matchItem(item({ supplierCode: 'SM0005-USA', ean: '7891234567895' }), index)).toMatchObject({ productId: 'p-ean', strategy: 'S3', confidence: 0.95 });
    expect(matchItem(item({ supplierCode: 'SM0005-USA', ean: 'SEM GTIN' }), index)?.strategy).not.toBe('S3');
  });

  it('S4 ANVISA único vincula; ANVISA compartilhado entre tamanhos fica pendente', () => {
    expect(matchItem(item({ supplierCode: '16906', anvisa: '80689090153' }), index)).toMatchObject({ productId: 'p-ean', strategy: 'S4', confidence: 0.9 });
    expect(matchItem(item({ supplierCode: '207.01', anvisa: '10171259001', supplierName: 'LABCOR LABORATORIOS LTDA' }), index)).toBeNull();
  });

  it('S5 descrição começa pela referência Spica (HA60-CARTUCHO...)', () => {
    expect(matchItem(item({ supplierCode: '1206', description: 'HA60-CARTUCHO P/HEMOPERFUSAO DESCARTAVEL 65±20 ML-LT:2406070301-VAL:20/06/2026', ncm: '84212919' }), index))
      .toMatchObject({ productId: 'p-ha60', strategy: 'S5', confidence: 0.88 });
  });

  it('S5 não recua para prefixo mais curto quando o que cai é sufixo de variante (AT-01-S)', () => {
    expect(matchItem(item({ supplierCode: '1244', description: 'AT-01-SISTEMA DE TUBULACAO P/TERAPIA', ncm: '90189099' }), index)).toMatchObject({ productId: 'p-at01', strategy: 'S5' });
    expect(matchItem(item({ supplierCode: '1223', description: 'AT-01-S-SISTEMA DE TUBULACAO P/TERAPIA', ncm: '90189099' }), index)).toBeNull();
  });

  it('S5 nunca casa palavra pura da descrição com uma ref igual a palavra (CATETER)', () => {
    expect(matchItem(item({ supplierCode: '114-2580 XL', description: 'CATETER BALAO FREEWAY 014 2.5X80X150', ncm: '90183919' }), index)).toBeNull();
  });

  it('S5 similaridade: mesmo fornecedor + NCM + descrição >= 0,85', () => {
    expect(matchItem(item({ supplierCnpj: '31829074000169', supplierName: 'VIA MEDICAL PRODUTOS LTDA', supplierCode: 'VMED-7', description: 'EQUIPO PARA GERADOR ULTRASSONICO VIA MEDICAL', ncm: '90189099' }), index))
      .toMatchObject({ productId: 'p-desc', strategy: 'S5' });
    // descrição só parecida (não contida) + fornecedor errado → não casa por S5 nem S7
    expect(matchItem(item({ supplierCnpj: '1', supplierName: 'OUTRO LTDA', supplierCode: 'VMED-7', description: 'EQUIPO ULTRASSOM GENERICO HOSPITALAR MODELO Z', ncm: '90189099' }), index)).toBeNull();
  });

  it('S6 memória MANUAL vence qualquer estratégia automática', () => {
    const memory = new Map([[memoryKey('66877184000180', 'icv-1332'), { productId: 'p-moz', strategy: 'MANUAL' as const, confidence: 1 }]]);
    expect(matchItem(item({ supplierCode: 'ICV1332' }), index, memory)).toMatchObject({ productId: 'p-moz', strategy: 'S6', confidence: 1 });
  });

  it('S6 memória automática só no fim e só com confiança >= 0,9', () => {
    const strong = new Map([[memoryKey('66877184000180', 'XYZ'), { productId: 'p-icv', strategy: 'S3' as const, confidence: 0.95 }]]);
    expect(matchItem(item({ supplierCode: 'XYZ' }), index, strong)).toMatchObject({ productId: 'p-icv', strategy: 'S6', confidence: 0.9 });
    const weak = new Map([[memoryKey('66877184000180', 'XYZ'), { productId: 'p-icv', strategy: 'S5' as const, confidence: 0.86 }]]);
    expect(matchItem(item({ supplierCode: 'XYZ' }), index, weak)).toBeNull();
  });

  it('memória aponta para produto apagado → ignora', () => {
    const memory = new Map([[memoryKey('66877184000180', 'XYZ'), { productId: 'gone', strategy: 'MANUAL' as const, confidence: 1 }]]);
    expect(matchItem(item({ supplierCode: 'XYZ' }), index, memory)).toBeNull();
  });

  it('sem sinal nenhum → pendente', () => {
    expect(matchItem(item({ supplierCode: 'NAO-EXISTE', description: 'SERVICO DE MANUTENCAO' }), index)).toBeNull();
  });

  it('S2 OCR O→0: BBX800O-RK casa BBX8000-RK', () => {
    expect(matchItem(item({ supplierCode: 'BBX800O-RK' }), index)).toMatchObject({ productId: 'p-bbx8', strategy: 'S2', confidence: 0.94 });
  });

  it('S5 modelo embutido no xProd (LABCOR DOKIMOS / P-2010)', () => {
    expect(matchItem(item({
      supplierCnpj: '19336924000191',
      supplierName: 'LABCOR LABORATORIOS LTDA',
      supplierCode: '10304.00',
      description: 'Posicao: 000 BIOPROTESE CARDIACA DE PERICARDIO BOVINO AORTICA LABCOR DOKIMOS PLUS-A 25 Codigo MS: 10171250041',
      ncm: '90213919',
    }), index)).toMatchObject({ productId: 'p-dok25', strategy: 'S5', confidence: 0.92 });

    expect(matchItem(item({
      supplierCnpj: '19336924000191',
      supplierName: 'LABCOR LABORATORIOS LTDA',
      supplierCode: '207.01',
      description: 'Posicao: 000 BIOPROTESE  CARDIACA PERICARDIO BOVINO AORTICA LABCOR P-2010 23A',
      ncm: '90213919',
    }), index)).toMatchObject({ productId: 'p-p201023', strategy: 'S5', confidence: 0.92 });

    expect(matchItem(item({
      supplierCnpj: '19336924000191',
      supplierName: 'LABCOR LABORATORIOS LTDA',
      supplierCode: '10331.00',
      description: 'Posicao: 000 ENXERTO ARTERIAL LD-HYDRO LABCOR BABYGRAFT-L 100/3 AR-10003 Codigo MS: 10171250026',
      ncm: '90213930',
    }), index)).toMatchObject({ productId: 'p-baby', strategy: 'S5', confidence: 0.92 });
  });

  it('S7 contenção de descrição + NCM (distribuidor ortopédico); tamanho diferente não casa', () => {
    // RCA Saúde é SKIPPED_LEGACY — usa outro CNPJ médico para exercitar S7.
    expect(matchItem(item({
      supplierCnpj: '15524734000147',
      supplierName: 'TECHIMPORT TECNOLOGIA EM IMPLANTES ORTOPEDICOS LTDA',
      supplierCode: '14136',
      description: 'PARAFUSO NAO BLOQUEADO AUTOPERFURANTE 01,2 X 04 MM',
      ncm: '90211020',
    }), index)).toMatchObject({ productId: 'p-paraf12', strategy: 'S7', confidence: 0.93 });

    // 02,0 X 05 não pode cair em 01,2 X 04 nem 01,2 X 05 por fuzzy frouxo
    expect(matchItem(item({
      supplierCnpj: '15524734000147',
      supplierName: 'TECHIMPORT TECNOLOGIA EM IMPLANTES ORTOPEDICOS LTDA',
      supplierCode: '14342',
      description: 'PARAFUSO NAO BLOQUEADO AR 02,0 X 05 MM',
      ncm: '90211020',
    }), index)).toBeNull();
  });

  it('S8 frouxo (207.01 ⊂ 2070) NÃO existe — evita LABCOR bioprótese → campo adesivo', () => {
    const evil: RegistryProduct = {
      id: 'p-evil-2070', codigo: '006128', code: '2070', productRefs: ['2070'], ean: null, anvisaCode: null,
      ncm: '90213919', description: 'CAMPO ADESIVO / IOBAM', defaultSupplier: null, manufacturerShortName: null,
    };
    const idx = buildRegistryIndex([...registry, evil]);
    expect(matchItem(item({
      supplierCnpj: '19336924000191',
      supplierName: 'LABCOR LABORATORIOS LTDA',
      supplierCode: '207.01',
      description: 'Posicao: 000 BIOPROTESE CARDIACA PERICARDIO BOVINO AORTICA LABCOR SEM MODELO',
      ncm: '90213919',
    }), idx)).toBeNull();
  });
});
