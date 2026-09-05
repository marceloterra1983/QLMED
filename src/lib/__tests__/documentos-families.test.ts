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
  it('em documentos básicos só a Inscrição Municipal vence — e por isso a família tem limiar', () => {
    const family = familyByCategory('basicos');
    expect(family.archiveFolder).toBe('Vencidos');

    // O limiar existe por causa de UM tipo. Sem ele, o contador apareceria na
    // tela e nenhum alerta dispararia — silêncio falso.
    expect(family.thresholds).toEqual([60, 30, 15, 7, 0]);

    const vencem = family.kinds.filter((kind) => kindExpires(kind.kind)).map((kind) => kind.kind);
    expect(vencem).toEqual(['inscricao_municipal']);
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

describe('SPEC-042 L13 — cards recolhidos, descrição e órgão', () => {
  it('todos os cards recolhidos', () => {
    for (const family of DOCUMENTOS_FAMILIES) {
      expect(family.defaultOpen, family.category).toBe(false);
    }
  });

  it('todos os tipos têm descricao e orgao', () => {
    for (const family of DOCUMENTOS_FAMILIES) {
      for (const kind of family.kinds) {
        expect(kind.descricao.length, kind.kind).toBeGreaterThan(20);
        expect(kind.orgao.length, kind.kind).toBeGreaterThan(2);
      }
    }
    expect(kindConfig('cnd_federal')?.descricao).toMatch(/Receita Federal/);
    expect(kindConfig('cnd_federal')?.orgao).toBe('Receita Federal do Brasil');
    expect(kindConfig('afe_anvisa')?.orgao).toBe('ANVISA');
    expect(kindConfig('afe_anvisa')?.emissaoUrl).toMatch(/consultas\.anvisa\.gov\.br/);
  });
});

describe('Inscrição Municipal vence — o papel diz', () => {
  /**
   * Marquei este tipo como `expira: false` deduzindo do NOME do ficheiro, que
   * não tem data. Abri o PDF depois: `INSCRICAO MUNICIPAL.pdf` traz
   * "ESTE CARTÃO É VÁLIDO ATÉ 18/02/2027". Sem isto o sistema nunca avisaria —
   * silêncio falso, que é o defeito que esta página existe para eliminar.
   *
   * Os irmãos foram conferidos da mesma forma, abrindo o PDF: Inscrição
   * Estadual e SISCOMEX RADAR são consultas de cadastro ("SITUAÇÃO CADASTRAL:
   * ATIVA", "Habilitação: DEFERIDA"), sem campo de validade — esses continuam
   * a não vencer, e é correto.
   */
  it('inscricao_municipal expira; inscricao_estadual e siscomex_radar não', () => {
    expect(kindConfig('inscricao_municipal')?.expira).toBe(true);
    expect(kindConfig('inscricao_estadual')?.expira).toBe(false);
    expect(kindConfig('siscomex_radar')?.expira).toBe(false);
  });
});
