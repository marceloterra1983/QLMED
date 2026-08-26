import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const CONFIG_ROUTE = join(ROOT, 'src/app/api/integrations/n8n/config/route.ts');
const STATUS_ROUTE = join(ROOT, 'src/app/api/integrations/n8n/status/route.ts');
const CLIENT = join(ROOT, 'src/lib/n8n-client.ts');

const read = (p: string) => readFileSync(p, 'utf8');

/**
 * Estes testes leem o FONTE, não o comportamento em runtime, porque exercitar
 * as rotas exigiria banco e sessão. São uma rede grossa contra a regressão que
 * mais importa aqui — credencial escapando — e não substituem o teste de
 * contrato, que entra quando houver ambiente com banco.
 */
describe('segredo da integração n8n (FR-008, Princípio V)', () => {
  it('a rota de config devolve o token mascarado, e nunca o decrypt cru', () => {
    const src = read(CONFIG_ROUTE);
    expect(src).toContain('maskToken(');
    // Se algum dia alguém devolver decrypt() direto na resposta, isto pega:
    expect(src).not.toMatch(/apiToken:\s*decrypt\(/);
  });

  it('a rota de config cifra antes de gravar', () => {
    expect(read(CONFIG_ROUTE)).toMatch(/encrypt\(/);
  });

  it('a rota de status NÃO devolve a credencial na resposta', () => {
    const src = read(STATUS_ROUTE);
    expect(src).not.toMatch(/NextResponse\.json\([^)]*apiToken/);
  });

  it('o cliente não registra a credencial em log', () => {
    const src = read(CLIENT);
    // O log de falha só pode carregar o NOME do erro e o status HTTP.
    const logLines = src.split('\n').filter((l) => l.includes('log.'));
    expect(logLines.length).toBeGreaterThan(0);
    for (const line of logLines) {
      expect(line).not.toMatch(/apiToken|X-N8N-API-KEY|connection\.apiToken/);
    }
  });

  it('a chave viaja só no cabeçalho, nunca na URL (ficaria em log de proxy)', () => {
    const src = read(CLIENT);
    expect(src).not.toMatch(/[?&]api[_-]?key=/i);
    expect(src).toContain("'X-N8N-API-KEY'");
  });
});

describe('autorização das rotas de integração (Princípio II)', () => {
  it('status exige papel no servidor, não visibilidade de tela', () => {
    expect(read(STATUS_ROUTE)).toMatch(/requireSessionRole\(/);
  });

  it('gravar credencial exige admin', () => {
    expect(read(CONFIG_ROUTE)).toMatch(/requireAdmin\(/);
  });

  it('status não usa requireAuth — chave de API não deve ler estado operacional', () => {
    const src = read(STATUS_ROUTE);
    expect(src).not.toMatch(/requireAuth\(/);
  });
});
