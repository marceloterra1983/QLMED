/**
 * Auditoria b177b07, QLMED-DATA-001 — prova medida do cascade.
 *
 * O teste de contrato em audit-l8-schema.test.ts lê o schema; este aqui apaga
 * uma Invoice de verdade num Postgres de verdade e conta as satélites. É a
 * diferença entre "o `@relation` está escrito" e "a FK existe e dispara".
 *
 * Gated por RUN_DB_INTEGRATION_TESTS=1, como os demais testes de integração.
 * NUNCA aponte DATABASE_URL para o banco canônico ao rodar isto: ele cria e
 * apaga linhas.
 */
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import prisma from '@/lib/prisma';

const integrationDescribe = process.env.RUN_DB_INTEGRATION_TESTS === '1' ? describe : describe.skip;

const suffix = Date.now().toString().slice(-10);
const USER_ID = `l8-user-${suffix}`;
const COMPANY_ID = `l8-company-${suffix}`;
const INVOICE_ID = `l8-invoice-${suffix}`;
const STOCK_ID = `l8-stock-${suffix}`;

async function seed() {
  await prisma.user.create({
    data: {
      id: USER_ID,
      email: `l8-${suffix}@example.test`,
      name: 'L8 cascade',
      passwordHash: 'x',
    },
  });
  await prisma.company.create({
    data: { id: COMPANY_ID, cnpj: `99${suffix}000`, razaoSocial: 'L8 LTDA', userId: USER_ID },
  });
  await prisma.invoice.create({
    data: {
      id: INVOICE_ID,
      accessKey: `l8${suffix}`.padEnd(44, '0'),
      type: 'NFE',
      number: '1',
      issueDate: new Date('2026-08-01T00:00:00.000Z'),
      senderCnpj: '11111111000111',
      senderName: 'Fornecedor',
      totalValue: '10.00',
      xmlContent: '<nfe/>',
      companyId: COMPANY_ID,
    },
  });

  await prisma.invoiceTaxTotals.create({
    data: { invoiceId: INVOICE_ID, companyId: COMPANY_ID, vbc: 1, itemCount: 1 },
  });
  await prisma.invoiceItemTax.create({
    data: { id: `l8-item-${suffix}`, invoiceId: INVOICE_ID, companyId: COMPANY_ID, itemNumber: 1 },
  });
  await prisma.invoiceDuplicata.create({
    data: {
      id: `l8-dup-${suffix}`,
      invoiceId: INVOICE_ID,
      companyId: COMPANY_ID,
      dupVencimento: '2026-09-10',
      dupValor: 10,
    },
  });
  await prisma.stockEntry.create({
    data: { id: STOCK_ID, companyId: COMPANY_ID, invoiceId: INVOICE_ID },
  });
  await prisma.nfeEntryItem.create({
    data: {
      stockEntryId: STOCK_ID,
      companyId: COMPANY_ID,
      invoiceId: INVOICE_ID,
      itemNumber: 1,
    },
  });
  await prisma.contactFiscal.create({
    data: {
      id: `l8-cf-${suffix}`,
      companyId: COMPANY_ID,
      cnpj: '11111111000111',
      sourceInvoiceId: INVOICE_ID,
    },
  });
}

async function cleanup() {
  await prisma.contactFiscal.deleteMany({ where: { companyId: COMPANY_ID } });
  await prisma.nfeEntryItem.deleteMany({ where: { companyId: COMPANY_ID } });
  await prisma.stockEntry.deleteMany({ where: { companyId: COMPANY_ID } });
  await prisma.invoiceDuplicata.deleteMany({ where: { companyId: COMPANY_ID } });
  await prisma.invoiceItemTax.deleteMany({ where: { companyId: COMPANY_ID } });
  await prisma.invoiceTaxTotals.deleteMany({ where: { companyId: COMPANY_ID } });
  await prisma.invoice.deleteMany({ where: { companyId: COMPANY_ID } });
  await prisma.company.deleteMany({ where: { id: COMPANY_ID } });
  await prisma.user.deleteMany({ where: { id: USER_ID } });
}

integrationDescribe('QLMED-DATA-001 — apagar Invoice não deixa satélite órfã', () => {
  beforeEach(async () => {
    await cleanup();
    await seed();
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it('DELETE de invoice remove tax_totals, item_tax, duplicata, stock_entry e nfe_entry_item', async () => {
    // Antes: as cinco satélites existem.
    expect(await prisma.invoiceTaxTotals.count({ where: { invoiceId: INVOICE_ID } })).toBe(1);
    expect(await prisma.invoiceItemTax.count({ where: { invoiceId: INVOICE_ID } })).toBe(1);
    expect(await prisma.invoiceDuplicata.count({ where: { invoiceId: INVOICE_ID } })).toBe(1);
    expect(await prisma.stockEntry.count({ where: { invoiceId: INVOICE_ID } })).toBe(1);
    expect(await prisma.nfeEntryItem.count({ where: { invoiceId: INVOICE_ID } })).toBe(1);

    // A rota apaga só a linha de Invoice. É o banco que tem de limpar o resto.
    await prisma.invoice.delete({ where: { id: INVOICE_ID } });

    expect(await prisma.invoiceTaxTotals.count({ where: { invoiceId: INVOICE_ID } })).toBe(0);
    expect(await prisma.invoiceItemTax.count({ where: { invoiceId: INVOICE_ID } })).toBe(0);
    expect(await prisma.invoiceDuplicata.count({ where: { invoiceId: INVOICE_ID } })).toBe(0);
    expect(await prisma.stockEntry.count({ where: { invoiceId: INVOICE_ID } })).toBe(0);
    expect(await prisma.nfeEntryItem.count({ where: { invoiceId: INVOICE_ID } })).toBe(0);
  });

  it('a ficha fiscal do contato sobrevive, com a procedência anulada', async () => {
    await prisma.invoice.delete({ where: { id: INVOICE_ID } });

    const contato = await prisma.contactFiscal.findFirst({ where: { companyId: COMPANY_ID } });
    expect(contato).not.toBeNull();
    expect(contato?.sourceInvoiceId).toBeNull();
  });

  it('apagar stock_entry leva os nfe_entry_item junto', async () => {
    await prisma.stockEntry.delete({ where: { id: STOCK_ID } });
    expect(await prisma.nfeEntryItem.count({ where: { stockEntryId: STOCK_ID } })).toBe(0);
  });

  it('QLMED-INFO-002: apagar usuário com empresa é recusado pelo banco', async () => {
    await expect(prisma.user.delete({ where: { id: USER_ID } })).rejects.toThrow();
    // E a empresa continua lá — RESTRICT recusou a operação inteira.
    expect(await prisma.company.count({ where: { id: COMPANY_ID } })).toBe(1);
  });

  it('apagar a empresa leva as satélites de tenant junto', async () => {
    await prisma.invoice.deleteMany({ where: { companyId: COMPANY_ID } });
    await prisma.company.delete({ where: { id: COMPANY_ID } });

    expect(await prisma.contactFiscal.count({ where: { companyId: COMPANY_ID } })).toBe(0);
    expect(await prisma.stockEntry.count({ where: { companyId: COMPANY_ID } })).toBe(0);
  });
});
