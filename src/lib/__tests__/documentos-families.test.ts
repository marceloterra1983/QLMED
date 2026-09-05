import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  DOCUMENTOS_FAMILIES,
  familyByCategory,
  kindConfig,
  kindExpires,
} from '@/lib/documentos/constants';
import { automacaoOf, kindStoresFilenameDate } from '@/lib/documentos/families';

describe('SPEC-042 L10 — tabela de famílias', () => {
  it('seis famílias; AFE não expira; limiares por família', () => {
    expect(DOCUMENTOS_FAMILIES.map((family) => family.category)).toEqual([
      'certidao',
      'sanitaria',
      'carta',
      'societario',
      'basicos',
      'balanco',
    ]);
    expect([...familyByCategory('certidao').thresholds]).toEqual([30, 15, 7, 3, 1, 0]);
    expect([...familyByCategory('sanitaria').thresholds]).toEqual([90, 60, 30, 15, 7, 0]);
    expect([...familyByCategory('carta').thresholds]).toEqual([60, 30, 15, 7]);
    expect(kindExpires('afe_anvisa')).toBe(false);
    expect(familyByCategory('carta').mode).toBe('open');
    expect(familyByCategory('certidao').mode).toBe('closed');
    expect(familyByCategory('sanitaria').mode).toBe('closed');
  });

  it('o motor itera DOCUMENTOS_FAMILIES — quarta família não pede ficheiro novo', () => {
    const ingest = readFileSync('src/lib/documentos/ingest.ts', 'utf8');
    const alerts = readFileSync('src/lib/documentos/alerts.ts', 'utf8');
    const list = readFileSync('src/lib/documentos/list.ts', 'utf8');
    expect(ingest).toMatch(/for \(const family of DOCUMENTOS_FAMILIES\)/);
    expect(alerts).toMatch(/for \(const family of DOCUMENTOS_FAMILIES\)/);
    expect(list).toMatch(/for \(const family of DOCUMENTOS_FAMILIES\)/);
    expect(ingest).not.toMatch(/if \(family\.category === 'sanitaria'\)/);
    expect(alerts).not.toMatch(/kind === 'afe_anvisa'/);
  });
});

describe('SPEC-042 L11 — societário, básicos, balanços', () => {
  it('documentos básicos não alertam', () => {
    const family = familyByCategory('basicos');
    expect(family.thresholds).toEqual([]);
    expect(family.archiveFolder).toBe('Vencidos');
    for (const kind of family.kinds) {
      expect(kindExpires(kind.kind), kind.kind).toBe(false);
    }
    expect(kindExpires('cartao_cnpj')).toBe(false);
  });

  it('contrato social e balanços também não alertam', () => {
    expect(familyByCategory('societario').thresholds).toEqual([]);
    expect(familyByCategory('balanco').thresholds).toEqual([]);
    expect(kindExpires('contrato_social_constituicao')).toBe(false);
    expect(kindExpires('balanco_anual')).toBe(false);
    expect(familyByCategory('balanco').scan).toBe('yearFolders');
    expect(familyByCategory('balanco').defaultOpen).toBe(false);
  });

  it('Cartão CNPJ grava a data do nome; AFE não', () => {
    expect(kindStoresFilenameDate('cartao_cnpj')).toBe(true);
    expect(kindStoresFilenameDate('afe_anvisa')).toBe(false);
    expect(kindExpires('cartao_cnpj')).toBe(false);
  });
});

describe('SPEC-042 L12 — tags de automação', () => {
  it('só o FGTS é automático; municipais assistidas; o resto que vence é manual', () => {
    const automaticas = DOCUMENTOS_FAMILIES.flatMap((family) => family.kinds)
      .filter((kind) => kind.automacao === 'automatica')
      .map((kind) => kind.kind);
    expect(automaticas, 'só o FGTS é automático').toEqual(['crf_fgts']);
    expect(kindConfig('cnd_municipal_mobiliario')?.automacao).toBe('assistida');
    expect(kindConfig('cnd_municipal_gerais')?.automacao).toBe('assistida');
    expect(kindConfig('cnd_federal')?.automacao).toBe('manual');
    expect(kindConfig('cndt')?.automacao).toBe('manual');
    expect(automacaoOf(kindConfig('afe_anvisa'))).toBeNull();
    expect(automacaoOf(kindConfig('cartao_cnpj'))).toBeNull();
    expect(automacaoOf(kindConfig('contrato_social_constituicao'))).toBeNull();
    expect(automacaoOf(kindConfig('balanco_anual'))).toBeNull();
  });
});
