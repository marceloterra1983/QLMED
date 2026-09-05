import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const PAGE = join(process.cwd(), 'src/app/(painel)/sistema/automacoes/page-client.tsx');
const src = readFileSync(PAGE, 'utf8');

/**
 * SPEC-045: a tela Automações foi aposentada. Continua sem lista fabricada
 * e aponta para Rotinas.
 */
describe('Automações — página aposentada (SPEC-045)', () => {
  const NOMES_DA_LISTA_FIXA = [
    'Sync NF-e/CT-e',
    'Alertas Financeiros',
    'Captura de Email',
    'Notificações',
  ];

  it.each(NOMES_DA_LISTA_FIXA)('não contém o nome fixo %s', (nome) => {
    expect(src).not.toContain(nome);
  });

  it('não consome status n8n', () => {
    expect(src).not.toContain('/api/integrations/n8n/status');
  });

  it('aponta para Rotinas', () => {
    expect(src).toContain('/sistema/rotinas');
    expect(src).toMatch(/aposentad|Rotinas/i);
  });
});

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
