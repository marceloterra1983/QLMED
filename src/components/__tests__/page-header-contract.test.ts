import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

function read(rel: string) {
  return readFileSync(resolve(root, rel), 'utf8');
}

/** SPEC-029: listas longas do painel usam o chrome compartilhado. */
const LIST_PAGES = [
  'src/app/(painel)/fiscal/issued/page-client.tsx',
  'src/app/(painel)/fiscal/invoices/page-client.tsx',
  'src/app/(painel)/fiscal/cte/page-client.tsx',
  'src/app/(painel)/fiscal/nfse-recebidas/page-client.tsx',
  'src/app/(painel)/fiscal/dashboard/page-client.tsx',
  'src/app/(painel)/cadastro/produtos/page-client.tsx',
  'src/app/(painel)/cadastro/components/ContactListPageClient.tsx',
  'src/app/(painel)/cadastro/anvisa/page-client.tsx',
  'src/app/(painel)/estoque/entrada-nfe/page-client.tsx',
  'src/app/(painel)/financeiro/components/FinanceiroPageClient.tsx',
  'src/app/(painel)/gestao/impcg/page-client.tsx',
  'src/app/(painel)/gestao/cassems/page-client.tsx',
  'src/app/(painel)/relatorios/valvulas-importadas/page-client.tsx',
  'src/app/(painel)/sistema/usuarios/page-client.tsx',
  'src/app/(painel)/sistema/upload/page-client.tsx',
  'src/app/(painel)/sistema/settings/page-client.tsx',
  'src/app/(painel)/sistema/errors/page-client.tsx',
  'src/app/(painel)/sistema/companies/page-client.tsx',
  'src/app/(painel)/sistema/automacoes/page-client.tsx',
] as const;

describe('SPEC-029 page sticky header', () => {
  it('PageHeader keeps an opaque sticky chrome above the table', () => {
    const src = read('src/components/PageHeader.tsx');
    expect(src).toMatch(/sticky top-0/);
    expect(src).toMatch(/z-20/);
    expect(src).toMatch(/bg-background-light dark:bg-background-dark/);
    expect(src).toMatch(/data-page-header/);
  });

  it('layout scrolls the content pane, not the global nav', () => {
    const src = read('src/components/DashboardLayoutClient.tsx');
    expect(src).toMatch(/flex h-screen/);
    expect(src).toMatch(/overflow-y-auto/);
    expect(src).toMatch(/lg:hidden/);
  });

  it('financeiro root does not trap sticky with overflow-hidden', () => {
    const src = read('src/app/(painel)/financeiro/components/FinanceiroPageClient.tsx');
    expect(src).toMatch(/<PageHeader/);
    expect(src).not.toMatch(/className="w-full min-w-0 overflow-hidden"/);
  });

  it.each(LIST_PAGES)('imports PageHeader: %s', (rel) => {
    expect(read(rel)).toMatch(/from '@\/components\/PageHeader'/);
    expect(read(rel)).toMatch(/<PageHeader/);
  });

  it('issued page keeps the operator-facing title', () => {
    const src = read('src/app/(painel)/fiscal/issued/page-client.tsx');
    expect(src).toMatch(/title="NF-e Emitidas"/);
    expect(src).toMatch(/Notas fiscais emitidas pela empresa/);
  });
});
