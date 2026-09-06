import { describe, expect, it } from 'vitest';
import {
  buildInvoiceDeadlineFileName,
  buildPreSolicitationFileName,
  buildReversalFileName,
  classifyUnimedCgSubject,
  extractPatientNameFromSubject,
  extractProcessIdFromPrazoNfSubject,
  extractProcessIdFromReversaoSubject,
  isUnimedCgPrazoNfSubject,
  isUnimedCgPreSolicitacaoSubject,
  isUnimedCgReversaoSubject,
  parseInvoiceDeadlineEmailHtml,
  parsePreSolicitationEmailHtml,
  parseReversalEmailHtml,
} from '@/lib/unimed-cg/parse-email-kinds';

const REVERSAO_SUBJECT = '[ID 75576] [OPME] Reversão de Processo';
const PRE_SUBJECT = '[OPME] solicitação para completar dados da pré-solicitação [Eletivo]';
const PRAZO_SUBJECT =
  '[ID 74080] [OPME] Atenção! O prazo para lançamento da Nota Fiscal está se encerrando!';

const REVERSAO_HTML = `
<html><body>
<p>Processo: 75576 GIH: 0 Autorização: 260291512 Tipo de procedimento: Eletivo Data prevista do Procedimento: 06/08/2026 Local: UNIMED CAMPO GRANDE MS COOP TRAB MED</p>
<p>Foi REVERTIDO</p>
</body></html>
`;

const PRE_HTML = `
<html><body>
<p>A Pré-Solicitação 77602 está aguardando sua participação</p>
<p>Tipo do procedimento: Eletivo</p>
<p>Prazo para a cotação: 3 dias.</p>
</body></html>
`;

const PRAZO_HTML = `
<html><body>
<p>Nº ID (Solicitação): 74080</p>
<p>Número da Solicitação: 74080</p>
<p>ATENÇÃO! O PRAZO PARA LANÇAMENTO DA NOTA FISCAL</p>
</body></html>
`;

describe('unimed-cg email kinds parse', () => {
  it('classifica assuntos', () => {
    expect(classifyUnimedCgSubject(REVERSAO_SUBJECT)).toBe('reversao');
    expect(classifyUnimedCgSubject(PRE_SUBJECT)).toBe('pre_solicitacao');
    expect(classifyUnimedCgSubject(PRAZO_SUBJECT)).toBe('prazo_nf');
    expect(classifyUnimedCgSubject('[ID 1] [OPME] outra coisa')).toBe('skip');
  });

  it('reconhece matchers e extrai IDs', () => {
    expect(isUnimedCgReversaoSubject(REVERSAO_SUBJECT)).toBe(true);
    expect(extractProcessIdFromReversaoSubject(REVERSAO_SUBJECT)).toBe('75576');
    expect(isUnimedCgPreSolicitacaoSubject(PRE_SUBJECT)).toBe(true);
    expect(isUnimedCgPrazoNfSubject(PRAZO_SUBJECT)).toBe(true);
    expect(extractProcessIdFromPrazoNfSubject(PRAZO_SUBJECT)).toBe('74080');
  });

  it('parseia reversão do HTML do e-mail', () => {
    const parsed = parseReversalEmailHtml(REVERSAO_HTML, '75576');
    expect(parsed.processId).toBe('75576');
    expect(parsed.authorizationNumber).toBe('260291512');
    expect(parsed.procedureType).toContain('Eletivo');
    expect(parsed.location).toContain('UNIMED');
    expect(parsed.parseStatus).toBe('ok');
  });

  it('parseia pré-solicitação', () => {
    const parsed = parsePreSolicitationEmailHtml(PRE_HTML, 'Eletivo');
    expect(parsed.preSolicitationId).toBe('77602');
    expect(parsed.procedureType).toBe('Eletivo');
    expect(parsed.quoteDeadlineDays).toBe(3);
    expect(parsed.parseStatus).toBe('ok');
  });

  it('parseia prazo NF', () => {
    const parsed = parseInvoiceDeadlineEmailHtml(PRAZO_HTML, '74080', null);
    expect(parsed.processId).toBe('74080');
    expect(parsed.parseStatus).toBe('ok');
  });

  it('extrai Pac. do subject quando presente', () => {
    expect(extractPatientNameFromSubject('[ID 1] [OPME] Pac. JOAO SILVA prazo')).toContain('JOAO');
  });

  it('filenames', () => {
    expect(buildReversalFileName('75576')).toBe('UNIMED-CG-REVERSAO 75576.pdf');
    expect(buildPreSolicitationFileName('77602')).toBe('UNIMED-CG-PRE-SOLICITACAO 77602.pdf');
    expect(buildInvoiceDeadlineFileName('74080')).toBe('UNIMED-CG-PRAZO-NF 74080.pdf');
  });
});
