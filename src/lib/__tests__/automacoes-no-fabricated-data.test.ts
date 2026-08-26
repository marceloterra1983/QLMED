import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const PAGE = join(process.cwd(), 'src/app/(painel)/sistema/automacoes/page-client.tsx');
const src = readFileSync(PAGE, 'utf8');

/**
 * Prova mecânica de SC-003 da SPEC-011: nenhum dado de workflow na tela vem de
 * literal do código.
 *
 * Lê o fonte em vez de renderizar porque o que se afirma é uma propriedade do
 * ARQUIVO — "estas strings não existem aqui" —, não um comportamento em tempo
 * de execução. Um teste de renderização passaria mesmo com a lista fixa
 * presente e apenas não exibida.
 */
describe('Automações — sem dado fabricado (SC-003)', () => {
  const NOMES_DA_LISTA_FIXA = [
    'Sync NF-e/CT-e',
    'Alertas Financeiros',
    'Captura de Email',
    'Notificações',
  ];

  it.each(NOMES_DA_LISTA_FIXA)('não contém o nome fixo %s', (nome) => {
    expect(src).not.toContain(nome);
  });

  it('não contém as descrições inventadas que acompanhavam a lista', () => {
    expect(src).not.toContain('cron a cada 6h');
    expect(src).not.toContain('próximos 7 dias');
    expect(src).not.toMatch(/anexos XML para importação automática/);
  });

  it('consome a rota de status em vez de declarar workflows', () => {
    expect(src).toContain('/api/integrations/n8n/status');
  });
});

/**
 * D5: derivar o destino a partir do host da requisição é padrão de SSRF. A
 * inferência que trocava `app.` por `n8n.` saiu; o servidor usa só o endereço
 * configurado.
 */
describe('Automações — sem inferência de endereço (D5)', () => {
  it('não infere o host do n8n a partir do host atual', () => {
    expect(src).not.toMatch(/replace\(\s*\/\^app\\?\./);
    expect(src).not.toContain("'n8n.'");
    expect(src).not.toContain('window.location.host');
  });

  it('não embute endereço de instância no código', () => {
    expect(src).not.toContain('n8n.qlmed.com.br');
  });
});

/**
 * O coração da User Story 2: quando a fonte cai, a tela DIZ isso. O caminho
 * infeliz não pode renderizar cartão de workflow.
 */
describe('Automações — os três estados são distintos', () => {
  it('trata os três estados do cliente', () => {
    expect(src).toContain("'not_configured'");
    expect(src).toContain("'unavailable'");
    expect(src).toContain("'ok'");
  });

  it('só renderiza a lista dentro do ramo ok', () => {
    const okIndex = src.indexOf("status?.state === 'ok'");
    const mapIndex = src.indexOf('status.workflows.map');
    expect(okIndex).toBeGreaterThan(-1);
    expect(mapIndex).toBeGreaterThan(okIndex);
  });

  it('declara truncamento em vez de mostrar recorte silencioso', () => {
    expect(src).toContain('status.truncated');
    expect(src).toContain('Lista incompleta');
  });

  it('distingue "nunca executado" de sucesso e de falha', () => {
    expect(src).toContain('Nunca executado');
  });
});
