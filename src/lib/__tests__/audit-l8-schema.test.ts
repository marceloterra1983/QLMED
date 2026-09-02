/**
 * Auditoria b177b07, folha L8 (integridade de dados) — contratos de schema.
 *
 * QLMED-DATA-001: satélite com invoiceId/companyId tem FK declarada.
 * QLMED-INFO-002: Company.userId é Restrict, não Cascade.
 * QLMED-DATA-013: nada em scripts/ faz CRUD com SQL cru interpolado.
 *
 * Estes testes leem os arquivos de verdade — schema.prisma, as migrações e
 * scripts/ — em vez de mockar. É o único jeito de a suíte pegar a regressão:
 * apagar um `@relation` compila e passa em todo teste de rota.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '../../..');
const schema = readFileSync(path.join(repoRoot, 'prisma/schema.prisma'), 'utf8');

function modelBlock(name: string): string {
  const start = schema.indexOf(`model ${name} {`);
  expect(start, `model ${name} não existe em schema.prisma`).toBeGreaterThanOrEqual(0);
  const end = schema.indexOf('\n}', start);
  return schema.slice(start, end);
}

/**
 * As 9 satélites com coluna de tenant ou de nota. ncm_cache e cnpj_cache ficam
 * de fora de propósito: são caches globais, sem companyId nem invoiceId.
 */
const SATELLITE_RELATIONS: Array<{
  model: string;
  field: string;
  references: string;
  onDelete: 'Cascade' | 'SetNull';
}> = [
  { model: 'InvoiceTaxTotals', field: 'invoiceId', references: 'Invoice', onDelete: 'Cascade' },
  { model: 'InvoiceTaxTotals', field: 'companyId', references: 'Company', onDelete: 'Cascade' },
  { model: 'InvoiceItemTax', field: 'invoiceId', references: 'Invoice', onDelete: 'Cascade' },
  { model: 'InvoiceItemTax', field: 'companyId', references: 'Company', onDelete: 'Cascade' },
  { model: 'InvoiceDuplicata', field: 'invoiceId', references: 'Invoice', onDelete: 'Cascade' },
  { model: 'InvoiceDuplicata', field: 'companyId', references: 'Company', onDelete: 'Cascade' },
  { model: 'StockEntry', field: 'invoiceId', references: 'Invoice', onDelete: 'Cascade' },
  { model: 'StockEntry', field: 'companyId', references: 'Company', onDelete: 'Cascade' },
  { model: 'NfeEntryItem', field: 'invoiceId', references: 'Invoice', onDelete: 'Cascade' },
  { model: 'NfeEntryItem', field: 'companyId', references: 'Company', onDelete: 'Cascade' },
  { model: 'NfeEntryItem', field: 'stockEntryId', references: 'StockEntry', onDelete: 'Cascade' },
  { model: 'ContactFiscal', field: 'companyId', references: 'Company', onDelete: 'Cascade' },
  { model: 'ContactFiscal', field: 'sourceInvoiceId', references: 'Invoice', onDelete: 'SetNull' },
  { model: 'ProductRegistry', field: 'companyId', references: 'Company', onDelete: 'Cascade' },
  { model: 'ProductSettingsCatalog', field: 'companyId', references: 'Company', onDelete: 'Cascade' },
  { model: 'CnpjMonitoring', field: 'companyId', references: 'Company', onDelete: 'Cascade' },
];

describe('QLMED-DATA-001 — satélites têm FK para Invoice/Company', () => {
  it.each(SATELLITE_RELATIONS)(
    '$model . $field referencia $references com onDelete: $onDelete',
    ({ model, field, references, onDelete }) => {
      const block = modelBlock(model);
      const relation = new RegExp(
        `${references}\\??\\s+@relation\\(fields:\\s*\\[${field}\\],\\s*references:\\s*\\[id\\],\\s*onDelete:\\s*${onDelete}\\)`,
      );
      expect(block).toMatch(relation);
    },
  );

  it('nenhuma satélite ficou com invoiceId ou companyId sem @relation', () => {
    const modelsComTenant = [...new Set(SATELLITE_RELATIONS.map((r) => r.model))];
    const semRelacao: string[] = [];
    for (const model of modelsComTenant) {
      const block = modelBlock(model);
      for (const field of ['invoiceId', 'companyId', 'sourceInvoiceId', 'stockEntryId']) {
        if (!new RegExp(`\\b${field}\\s+String`).test(block)) continue;
        if (!new RegExp(`@relation\\(fields:\\s*\\[${field}\\]`).test(block)) {
          semRelacao.push(`${model}.${field}`);
        }
      }
    }
    expect(semRelacao).toEqual([]);
  });

  it('a migração das FKs traz a query de pré-checagem de órfãos no cabeçalho', () => {
    const sql = readFileSync(
      path.join(repoRoot, 'prisma/migrations/20260902100000_satellite_foreign_keys/migration.sql'),
      'utf8',
    );
    // O cabeçalho tem de mostrar como contar órfão ANTES do deploy: a FK falha
    // em cima de dado existente, e falhar sem a query é falhar às cegas.
    expect(sql).toContain('LEFT JOIN "Invoice"');
    expect(sql).toContain('LEFT JOIN "Company"');
    expect(sql).toContain('WHERE i.id IS NULL');
    // Toda FK declarada no schema aparece no arquivo com a ação de delete explícita.
    expect((sql.match(/ADD CONSTRAINT/g) || []).length).toBe(SATELLITE_RELATIONS.length);
    expect(sql).toContain('ON DELETE SET NULL');
  });
});

describe('QLMED-INFO-002 — apagar usuário não apaga o universo fiscal', () => {
  it('Company.userId é onDelete: Restrict', () => {
    expect(modelBlock('Company')).toMatch(
      /user\s+User\s+@relation\(fields:\s*\[userId\],\s*references:\s*\[id\],\s*onDelete:\s*Restrict\)/,
    );
  });

  it('Company.userId não voltou a Cascade', () => {
    expect(modelBlock('Company')).not.toMatch(
      /@relation\(fields:\s*\[userId\],\s*references:\s*\[id\],\s*onDelete:\s*Cascade\)/,
    );
  });

  it('a migração recria a FK com RESTRICT', () => {
    const sql = readFileSync(
      path.join(repoRoot, 'prisma/migrations/20260902110000_company_user_restrict/migration.sql'),
      'utf8',
    );
    expect(sql).toContain('DROP CONSTRAINT "Company_userId_fkey"');
    expect(sql).toContain('ON DELETE RESTRICT');
  });
});

describe('QLMED-DATA-013 — CRUD satélite não volta a SQL cru em scripts/', () => {
  function listFiles(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir)) {
      if (entry === '__pycache__' || entry === 'node_modules') continue;
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) out.push(...listFiles(full));
      else out.push(full);
    }
    return out;
  }

  it('nenhum arquivo em scripts/ usa $executeRawUnsafe ou $queryRawUnsafe', () => {
    // ADR-0006: Prisma Client é a interface canônica para CRUD satélite. O
    // backfill vive na rota /api/invoices/backfill-tax, que faz o mesmo por
    // Prisma; scripts/backfill-tax.ts era a cópia legada em SQL interpolado.
    const offenders = listFiles(path.join(repoRoot, 'scripts'))
      .filter((f) => /\.(ts|js|mjs|cjs)$/.test(f))
      .filter((f) => /\$(execute|query)RawUnsafe/.test(readFileSync(f, 'utf8')))
      .map((f) => path.relative(repoRoot, f));
    expect(offenders).toEqual([]);
  });
});
