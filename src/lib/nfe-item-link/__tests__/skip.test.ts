import { describe, expect, it } from 'vitest';
import { classifyOutOfScope, isSkippedStrategy } from '../skip';
import { buildRegistryIndex, matchItem } from '../match';

describe('classifyOutOfScope', () => {
  it('RCA Saúde → SKIPPED_LEGACY', () => {
    expect(classifyOutOfScope({ supplierCnpj: '11352270000188', supplierName: 'RCA SAUDE' })).toBe('SKIPPED_LEGACY');
  });

  it('não-médicos por CNPJ → SKIPPED_NON_MEDICAL', () => {
    expect(classifyOutOfScope({ supplierCnpj: '03583836000154', supplierName: 'Kampai Motors' })).toBe('SKIPPED_NON_MEDICAL');
    expect(classifyOutOfScope({ supplierCnpj: '01869728000117', supplierName: 'CASA DAS CORES' })).toBe('SKIPPED_NON_MEDICAL');
  });

  it('DOC MED NÃO é skip (8 NFs, não uma única)', () => {
    expect(classifyOutOfScope({ supplierCnpj: '66877184000180', supplierName: 'DOC MED COMERCIO' })).toBeNull();
  });

  it('LABCOR NÃO é skip', () => {
    expect(classifyOutOfScope({ supplierCnpj: '19336924000191', supplierName: 'LABCOR LABORATORIOS LTDA' })).toBeNull();
  });
});

describe('matchItem + skip', () => {
  const index = buildRegistryIndex([]);

  it('RCA retorna SKIPPED_LEGACY sem produto', () => {
    const d = matchItem({
      supplierCnpj: '11352270000188',
      supplierName: 'RCA SAUDE COM. E REPRES. EIRELI-ME',
      supplierCode: '14136',
      description: 'PARAFUSO NAO BLOQUEADO',
      ean: null,
      anvisa: null,
      ncm: '90211020',
    }, index);
    expect(d).toMatchObject({ strategy: 'SKIPPED_LEGACY', productId: null, confidence: 1 });
    expect(isSkippedStrategy(d!.strategy)).toBe(true);
  });
});
