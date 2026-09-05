import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('n8n settings UI contract', () => {
  it('Configurações expõe formulário GET/PUT da integração n8n', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/app/(painel)/sistema/settings/components/IntegrationsSection.tsx'),
      'utf8',
    );
    expect(source).toMatch(/Integração n8n/);
    expect(source).toMatch(/\/api\/integrations\/n8n\/config/);
    expect(source).toMatch(/method:\s*'PUT'/);
    expect(source).toMatch(/n8nBaseUrl/);
    expect(source).toMatch(/n8nApiToken/);
  });

  it('Automações aponta para a seção Integração n8n em Configurações', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/app/(painel)/sistema/automacoes/page-client.tsx'),
      'utf8',
    );
    expect(source).toMatch(/Integração n8n/);
    expect(source).toMatch(/not_configured/);
  });
});
