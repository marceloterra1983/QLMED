import { describe, expect, it } from 'vitest';
import {
  buildFileName,
  extractCliqueAquiUrl,
  extractProcessIdFromSubject,
  isUnimedCgFaturamentoSubject,
  parseAuthorizationPageHtml,
  shouldUpgrade,
} from '@/lib/unimed-cg/parse-page';

const UNIMED_CG_PAGE_FIXTURE = `
<html><body>
<p>Processo: 75576</p>
<p>GIH: 0</p>
<p>Autorização: 260291512</p>
<p>Tipo de procedimento: Eletivo</p>
<p>Data prevista do Procedimento: 06/08/2026</p>
<p>Local: UNIMED CAMPO GRANDE MS COOP TRAB MED</p>
<p>Valor total: R$ 5.289,00</p>
</body></html>
`;

const SUBJECT = '[ID 75576] [OPME] autorização de faturamento do processo';

describe('unimed-cg parse-page', () => {
  it('extrai processId do assunto canônico', () => {
    expect(isUnimedCgFaturamentoSubject(SUBJECT)).toBe(true);
    expect(extractProcessIdFromSubject(SUBJECT)).toBe('75576');
  });

  it('ignora assunto de outro tipo OPME', () => {
    expect(isUnimedCgFaturamentoSubject('[ID 1] [OPME] pré-solicitação')).toBe(false);
  });

  it('parseia HTML fixture sem segredos', () => {
    const parsed = parseAuthorizationPageHtml(UNIMED_CG_PAGE_FIXTURE, '75576');
    expect(parsed.processId).toBe('75576');
    expect(parsed.authorizationNumber).toBe('260291512');
    expect(parsed.location).toContain('UNIMED CAMPO GRANDE');
    expect(parsed.totalCents).toBe(528900);
    expect(parsed.procedureDate?.toISOString().startsWith('2026-08-06')).toBe(true);
    expect(parsed.parseStatus).toBe('ok');
  });

  it('prefers subject processId quando HTML diverge', () => {
    const html = UNIMED_CG_PAGE_FIXTURE.replace('Processo: 75576', 'Processo: 99999');
    const parsed = parseAuthorizationPageHtml(html, '75576');
    expect(parsed.processId).toBe('75576');
  });

  it('extrai Clique aqui só de host allowlisted', () => {
    const html = `
      <a href="https://unimedcg.opmes.com.br/gestao/www/visualiza-email-processo.php?id=75576">Clique aqui</a>
    `;
    expect(extractCliqueAquiUrl(html)).toContain('unimedcg.opmes.com.br');
    expect(
      extractCliqueAquiUrl('<a href="https://evil.example/x">Clique aqui</a>'),
    ).toBeNull();
  });

  it('buildFileName e shouldUpgrade', () => {
    expect(buildFileName('75576')).toBe('UNIMED-CG 75576.pdf');
    expect(shouldUpgrade('parcial', 'ok')).toBe(true);
    expect(shouldUpgrade('ok', 'parcial')).toBe(false);
  });
});
