import type { CompanyDocumentKind } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { cartaLabelFromFileName, classifyDocument } from '@/lib/documentos/classify';
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
    kind: 'cnd_estadual_mt',
    validUntil: '2026-08-13',
  },
  {
    folder: 'Estaduais',
    file: 'CERTIDÃO ESTADUAL DO MATO GROSSO 06.07.26.pdf',
    kind: 'cnd_estadual_mt',
    validUntil: '2026-07-06',
  },
  {
    folder: 'Estaduais',
    file: 'CERTIDÃO ESTADUAL DO MATO GROSSO 04.06.26.pdf',
    kind: 'cnd_estadual_mt',
    validUntil: '2026-06-04',
  },
  {
    folder: 'Estaduais',
    file: 'CERTIDÃO ESTADUAL DO MATO GROSSO 08.02.26.pdf',
    kind: 'cnd_estadual_mt',
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
    expect(classifyDocument('Estaduais', 'CERTIDÃO ESTADUAL DO MATO GROSSO DO SUL 12.10.26.pdf')).toBe(
      'cnd_estadual_ms',
    );
  });
});

const SANITARIA_FIXTURE: { file: string; kind: CompanyDocumentKind }[] = [
  { file: 'AFE - EMITIDO EM 06.01.2026.pdf', kind: 'afe_anvisa' },
  { file: 'AFE - AUTORIZAÇÃO DE FUNCIONAMENTO ANVISA.pdf', kind: 'afe_anvisa' },
  { file: 'ALVARÁ LICENÇA SANITÁRIA 20.10.2026 QL MED.pdf', kind: 'licenca_sanitaria' },
  { file: 'CRF 28.11.2026.pdf', kind: 'crf_conselho' },
  { file: 'CRF 03.06.26.pdf', kind: 'crf_conselho' },
  { file: 'CRF 02.09.2026.pdf', kind: 'crf_conselho' },
  { file: 'ALVARA DE FUNCIONAMENTO PREFEITURA 04.10.26.pdf', kind: 'alvara_funcionamento' },
  { file: 'ALVARA DE FUNCIONAMENTO PREFEITURA 15.02.2026.pdf', kind: 'alvara_funcionamento' },
  { file: 'ALVARA DE FUNCIONAMENTO PREFEITURA 23.09.26.pdf', kind: 'alvara_funcionamento' },
  { file: 'Licença Sanitária Veiculo 17.10.2025.pdf', kind: 'licenca_sanitaria_veiculo' },
  { file: 'CONTROLE DE PRAGAS - QL MED 05.08.2026.pdf', kind: 'controle_pragas' },
  { file: 'CONTROLE DE PRAGAS - QL MED.pdf', kind: 'controle_pragas' },
  { file: 'PROTOCOLO RENOVAÇAO VIGILANCIA 2025.pdf', kind: 'outro' },
  { file: 'protocolo renovação Vigilancia 2024.pdf', kind: 'outro' },
  { file: 'PUBLICAÇÃO DIARIO OFICIAL AFE.pdf', kind: 'outro' },
  { file: 'PUBLICAÇÃO DIARIO OFICIAL COMPLEMENTO AFE.pdf', kind: 'outro' },
  { file: 'CERTIFICADO CRF.pdf', kind: 'crf_conselho' },
  { file: 'DispensaCVCBM (2) bombeiro protocolo 04.02.2023.pdf', kind: 'outro' },
];

describe('SPEC-042 L10 — classify sanitária / carta', () => {
  it.each(SANITARIA_FIXTURE)('$file → $kind', ({ file, kind }) => {
    expect(classifyDocument('1 - AUTORIZAÇÃO RELACIONADO A SAUDE', file, 'sanitaria')).toBe(kind);
  });

  it('PUBLICAÇÃO DIARIO OFICIAL AFE não vira afe_anvisa (é trâmite)', () => {
    expect(classifyDocument('', 'PUBLICAÇÃO DIARIO OFICIAL AFE.pdf', 'sanitaria')).toBe('outro');
  });

  it('carta na pasta aberta é sempre carta_comercializacao', () => {
    expect(classifyDocument('', 'Carta Comercialização TECHIMPORT.pdf', 'carta')).toBe(
      'carta_comercializacao',
    );
  });

  it('fabricante sai do nome da carta, sem inventar data', () => {
    expect(cartaLabelFromFileName('Carta Comercialização TECHIMPORT.pdf')).toBe('TECHIMPORT');
    expect(cartaLabelFromFileName('Carta Comercialização LIVA NOVA.pdf')).toBe('LIVA NOVA');
    expect(cartaLabelFromFileName('Carta de Autorização Comercialização OSTEOMED QL 15.08.24.pdf')).toBe(
      'OSTEOMED',
    );
    expect(
      cartaLabelFromFileName('Carta de  Comercialização QL Med_26fev26_Assin - CARDIOVENT.pdf'),
    ).toBe('CARDIOVENT');
    expect(extractValidUntil('Carta Comercialização TECHIMPORT.pdf')).toBeNull();
  });
});

describe('SPEC-042 L11 — classify societário / básicos', () => {
  it('CONTRATO SOCIAL- CONSTITUIÇÃO + ULTIMA ALTERAÇÃO é consolidado, não constituição', () => {
    expect(
      classifyDocument(
        '3 - CONTRATO SOCIAL',
        'CONTRATO SOCIAL- CONSTITUIÇÃO + ULTIMA ALTERAÇÃO.pdf',
        'societario',
      ),
    ).toBe('contrato_social_consolidado');
  });

  it.each([
    {
      file: 'CONTRATO SOCIAL- CONSTITUIÇÃO.pdf',
      kind: 'contrato_social_constituicao' as const,
    },
    {
      file: 'CONTRATO SOCIAL ALTERAÇÃO 2014 - ULTIMA ALTERAÇÃO.pdf',
      kind: 'contrato_social_alteracao' as const,
    },
    {
      file: 'CONTRATO SOCIAL- CONSTITUIÇÃO + ULTIMA ALTERAÇÃO.pdf',
      kind: 'contrato_social_consolidado' as const,
    },
  ])('$file → $kind', ({ file, kind }) => {
    expect(classifyDocument('3 - CONTRATO SOCIAL', file, 'societario')).toBe(kind);
  });

  it.each([
    { file: 'CARTÃO CNPJ 31.08.26.pdf', kind: 'cartao_cnpj' as const },
    { file: 'INSCRICAO MUNICIPAL.pdf', kind: 'inscricao_municipal' as const },
    { file: 'INSCRIÇÃO ESTADUAL.pdf', kind: 'inscricao_estadual' as const },
    { file: 'SISCOMEX RADAR.pdf', kind: 'siscomex_radar' as const },
    { file: 'CADASTRO E-CJUR.pdf', kind: 'cadastro_ecjur' as const },
    { file: 'DADOS CADASTRAIS QL MED.pdf', kind: 'dados_cadastrais' as const },
    { file: 'DADOS CADASTRAIS QL MED.docx', kind: 'dados_cadastrais' as const },
  ])('$file → $kind', ({ file, kind }) => {
    expect(classifyDocument('0 - DOCUMENTOS BÁSICOS', file, 'basicos')).toBe(kind);
  });
});
