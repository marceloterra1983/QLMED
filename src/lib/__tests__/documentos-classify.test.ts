import type { CompanyDocumentKind } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { classifyDocument } from '@/lib/documentos/classify';
import { extractValidUntil } from '@/lib/documentos/validity';

type FixtureRow = {
  folder: string;
  file: string;
  kind: CompanyDocumentKind;
  validUntil: string | null;
};

/** 24 nomes reais da pasta OneDrive em 04/09/2026 (PLAN.md). */
const FIXTURE: FixtureRow[] = [
  {
    folder: 'Federais',
    file: 'CERTIDAO RECEITA FEDERAL 12.12.26 - QL MED.pdf',
    kind: 'cnd_federal',
    validUntil: '2026-12-12',
  },
  {
    folder: 'Federais',
    file: 'CERTIDAO RECEITA FEDERAL 06.07.26- QL MED.pdf',
    kind: 'cnd_federal',
    validUntil: '2026-07-06',
  },
  {
    folder: 'Federais',
    file: 'CERTIDÃO RECEITA FEDERAL 13.05.26 - QL MED.pdf',
    kind: 'cnd_federal',
    validUntil: '2026-05-13',
  },
  {
    folder: 'Federais',
    file: 'CERTIDÃO Tribunal Regional Federal da 3ª Região.pdf',
    kind: 'outro',
    validUntil: null,
  },
  {
    folder: 'FGTS',
    file: 'CERTIDÃO FGTS 29.09.26 QL MED.pdf',
    kind: 'crf_fgts',
    validUntil: '2026-09-29',
  },
  {
    folder: 'FGTS',
    file: 'CERTIDÃO FGTS 03.09.26 QL MED.pdf',
    kind: 'crf_fgts',
    validUntil: '2026-09-03',
  },
  {
    folder: 'FGTS',
    file: 'CERTIDÃO FGTS 09.08.26 QL MED.pdf',
    kind: 'crf_fgts',
    validUntil: '2026-08-09',
  },
  {
    folder: 'FGTS',
    file: 'CERTIDÃO FGTS 16.07.26 QL MED.pdf',
    kind: 'crf_fgts',
    validUntil: '2026-07-16',
  },
  {
    folder: 'Débitos Trabalhistas',
    file: 'CERTIDÃO DEBITOS TRABALHISTA 03.10.26.pdf',
    kind: 'cndt',
    validUntil: '2026-10-03',
  },
  {
    folder: 'Débitos Trabalhistas',
    file: 'CERTIDÃO DEBITOS TRABALHISTA 15.04.26.pdf',
    kind: 'cndt',
    validUntil: '2026-04-15',
  },
  {
    folder: 'Estaduais',
    file: 'CERTIDAO ESTADUAL 12.10.26 QL MED.pdf',
    kind: 'cnd_estadual_ms',
    validUntil: '2026-10-12',
  },
  {
    folder: 'Estaduais',
    file: 'CERTIDAO ESTADUAL 20.09.26 QL MED.pdf',
    kind: 'cnd_estadual_ms',
    validUntil: '2026-09-20',
  },
  {
    folder: 'Estaduais',
    file: 'CERTIDAO ESTADUAL 01.08.26 QL MED.pdf',
    kind: 'cnd_estadual_ms',
    validUntil: '2026-08-01',
  },
  {
    folder: 'Estaduais',
    file: 'CERTIDAO ESTADUAL 26.06.26 QL MED.pdf',
    kind: 'cnd_estadual_ms',
    validUntil: '2026-06-26',
  },
  {
    folder: 'Estaduais',
    file: 'CERTIDÃO ESTADUAL 18.05.26 QL MED.pdf',
    kind: 'cnd_estadual_ms',
    validUntil: '2026-05-18',
  },
  {
    folder: 'Estaduais',
    file: 'CERTIDÃO ESTADUAL 12.04.26 QL MED.pdf',
    kind: 'cnd_estadual_ms',
    validUntil: '2026-04-12',
  },
  {
    folder: 'Estaduais',
    file: 'CERTIDÃO ESTADUAL DO MATO GROSSO 13.08.26.pdf',
    kind: 'outro',
    validUntil: '2026-08-13',
  },
  {
    folder: 'Estaduais',
    file: 'CERTIDÃO ESTADUAL DO MATO GROSSO 06.07.26.pdf',
    kind: 'outro',
    validUntil: '2026-07-06',
  },
  {
    folder: 'Estaduais',
    file: 'CERTIDÃO ESTADUAL DO MATO GROSSO 04.06.26.pdf',
    kind: 'outro',
    validUntil: '2026-06-04',
  },
  {
    folder: 'Estaduais',
    file: 'CERTIDÃO ESTADUAL DO MATO GROSSO 08.02.26.pdf',
    kind: 'outro',
    validUntil: '2026-02-08',
  },
  {
    folder: 'Municipais',
    file: 'certidão débitos gerais val. 01-10-2026.pdf',
    kind: 'cnd_municipal_gerais',
    validUntil: '2026-10-01',
  },
  {
    folder: 'Municipais',
    file: 'CERTIDAO NEGATIVA DE DEBITOS MOBILIARIO 30.09.26.pdf',
    kind: 'cnd_municipal_mobiliario',
    validUntil: '2026-09-30',
  },
  {
    folder: 'Municipais',
    file: 'CERTIDAO NEGATIVA DE DEBITOS MOBILIARIO 02.09.26.pdf',
    kind: 'cnd_municipal_mobiliario',
    validUntil: '2026-09-02',
  },
  {
    folder: 'Municipais',
    file: 'CERTIDAO NEGATIVA DE DEBITOS MOBILIARIO 05.04.pdf',
    kind: 'cnd_municipal_mobiliario',
    validUntil: null,
  },
];

describe('SPEC-042 L3 — classifyDocument / extractValidUntil', () => {
  it('a fixture tem 24 nomes; sem data só o Tribunal (sem padrão) e o 05.04 (sem ano)', () => {
    expect(FIXTURE).toHaveLength(24);
    const withDate = FIXTURE.filter((row) => extractValidUntil(row.file) != null).map((row) => row.file);
    const withoutDate = FIXTURE.filter((row) => extractValidUntil(row.file) == null).map((row) => row.file);
    expect(withDate).toHaveLength(22);
    expect(withoutDate).toHaveLength(2);
    expect(withoutDate.some((name) => name.includes('Tribunal'))).toBe(true);
    expect(withoutDate.some((name) => name.endsWith('05.04.pdf'))).toBe(true);
  });

  it.each(FIXTURE)('$folder/$file → $kind $validUntil', ({ folder, file, kind, validUntil }) => {
    expect(classifyDocument(folder, file)).toBe(kind);
    expect(extractValidUntil(file)).toEqual(validUntil ? { date: validUntil } : null);
  });

  it('nome em NFD classifica e data igual ao NFC', () => {
    const nfc = 'certidão débitos gerais val. 01-10-2026.pdf';
    const nfd = nfc.normalize('NFD');
    expect(nfd).not.toBe(nfc);
    expect(classifyDocument('Municipais', nfd)).toBe('cnd_municipal_gerais');
    expect(extractValidUntil(nfd)).toEqual({ date: '2026-10-01' });
    expect(classifyDocument('Débitos Trabalhistas'.normalize('NFD'), 'CERTIDÃO DEBITOS TRABALHISTA 03.10.26.pdf')).toBe(
      'cndt',
    );
  });

  it('extrai a última data quando o nome tem duas', () => {
    expect(extractValidUntil('CERTIDAO RECEITA FEDERAL 12.12.25 renovada 12.12.26.pdf')).toEqual({
      date: '2026-12-12',
    });
  });

  it('data civil inválida ou pasta desconhecida → null / outro', () => {
    expect(extractValidUntil('arquivo 32.13.26.pdf')).toBeNull();
    expect(extractValidUntil('arquivo 31.02.26.pdf')).toBeNull();
    expect(extractValidUntil('arquivo 01.10.2026.pdf')).toEqual({ date: '2026-10-01' });
    expect(classifyDocument('Outros', 'qualquer.pdf')).toBe('outro');
    expect(classifyDocument('Municipais', 'alvara 12.12.26.pdf')).toBe('outro');
  });
});
