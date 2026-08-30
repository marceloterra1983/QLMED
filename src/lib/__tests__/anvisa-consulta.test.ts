import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ANVISA_PRODUTOS_SAUDE_URL } from '../anvisa-consulta';

describe('consulta ANVISA a partir de Produtos', () => {
  it('aponta para o portal oficial de Produtos para Saúde', () => {
    expect(ANVISA_PRODUTOS_SAUDE_URL).toBe('https://consultas.anvisa.gov.br/#/saude/');
  });

  it('não coloca ANVISA na barra lateral', () => {
    const sidebar = readFileSync(resolve(__dirname, '../../components/SidebarNav.tsx'), 'utf8');
    expect(sidebar).not.toMatch(/href:\s*['"]\/cadastro\/anvisa['"]/);
  });

  it('o cabeçalho de Produtos abre o site oficial em nova aba', () => {
    const page = readFileSync(
      resolve(__dirname, '../../app/(painel)/cadastro/produtos/page-client.tsx'),
      'utf8',
    );
    expect(page).toContain('ANVISA_PRODUTOS_SAUDE_URL');
    expect(page).toContain('Consulta ANVISA');
    expect(page).toContain('target="_blank"');
    expect(page).toContain('rel="noopener noreferrer"');
    expect(page).not.toContain('href="/cadastro/anvisa"');
  });
});
