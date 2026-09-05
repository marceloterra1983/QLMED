import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('n8n settings UI contract (SPEC-045 retired)', () => {
  it('Configurações não expõe formulário Integração n8n', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/app/(painel)/sistema/settings/components/IntegrationsSection.tsx'),
      'utf8',
    );
    expect(source).not.toMatch(/Integração n8n/);
    expect(source).not.toMatch(/\/api\/integrations\/n8n\/config/);
    expect(source).not.toMatch(/n8nBaseUrl/);
    expect(source).not.toMatch(/n8nApiToken/);
  });

  it('Automações aponta para Rotinas em vez do status n8n', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/app/(painel)/sistema/automacoes/page-client.tsx'),
      'utf8',
    );
    expect(source).toMatch(/\/sistema\/rotinas/);
    expect(source).not.toMatch(/\/api\/integrations\/n8n\/status/);
  });
});
