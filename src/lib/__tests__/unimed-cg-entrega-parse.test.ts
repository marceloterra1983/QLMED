import { describe, expect, it } from 'vitest';
import {
  buildDeliveryFileName,
  extractCliqueAquiUrl,
  extractProcessIdFromSubject,
  isUnimedCgEntregaSubject,
  isUnimedCgFaturamentoSubject,
  parseDeliveryPageHtml,
} from '@/lib/unimed-cg/parse-page';

const ENTREGA_SUBJECT = '[ID 81234] [OPME] etapa de autorização concluída';

const ENTREGA_PAGE_FIXTURE = `
<html><body>
<p>Solicitação: 81234</p>
<p>Autorização Principal: 260312345</p>
<p>Situação: Autorizado</p>
<p>Data de Autorização: 12/08/2026</p>
<p>Fornecedores: QL MED COMERCIO DE PRODUTOS HOSPITALARES LTDA</p>
</body></html>
`;

describe('unimed-cg entrega parse', () => {
  it('reconhece assunto de entrega e extrai processId', () => {
    expect(isUnimedCgEntregaSubject(ENTREGA_SUBJECT)).toBe(true);
    expect(isUnimedCgFaturamentoSubject(ENTREGA_SUBJECT)).toBe(false);
    expect(extractProcessIdFromSubject(ENTREGA_SUBJECT)).toBe('81234');
  });

  it('parseia HTML fixture de entrega sem segredos', () => {
    const parsed = parseDeliveryPageHtml(ENTREGA_PAGE_FIXTURE, '81234');
    expect(parsed.processId).toBe('81234');
    expect(parsed.principalAuthorization).toBe('260312345');
    expect(parsed.status).toBe('Autorizado');
    expect(parsed.supplier).toContain('QL MED');
    expect(parsed.authorizedAt?.toISOString().startsWith('2026-08-12')).toBe(true);
    expect(parsed.parseStatus).toBe('ok');
  });

  it('prefers subject processId quando HTML diverge', () => {
    const html = ENTREGA_PAGE_FIXTURE.replace('Solicitação: 81234', 'Solicitação: 99999');
    const parsed = parseDeliveryPageHtml(html, '81234');
    expect(parsed.processId).toBe('81234');
  });

  it('extrai CLIQUE AQUI em maiúsculas', () => {
    const html = `
      <a href="https://unimedcg.opmes.com.br/gestao/www/visualiza-email-processo.php?id=81234"><b>CLIQUE AQUI</b></a>
    `;
    expect(extractCliqueAquiUrl(html)).toContain('unimedcg.opmes.com.br');
  });

  it('buildDeliveryFileName', () => {
    expect(buildDeliveryFileName('81234')).toBe('UNIMED-CG-ENTREGA 81234.pdf');
  });
});
