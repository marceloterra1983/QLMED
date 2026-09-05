import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  DOCUMENTOS_FAMILIES,
  familyByCategory,
  kindExpires,
} from '@/lib/documentos/constants';

describe('SPEC-042 L10 — tabela de famílias', () => {
  it('três famílias; AFE não expira; limiares por família', () => {
    expect(DOCUMENTOS_FAMILIES.map((family) => family.category)).toEqual([
      'certidao',
      'sanitaria',
      'carta',
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
