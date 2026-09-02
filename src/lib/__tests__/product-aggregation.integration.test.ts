import { afterAll, describe, expect, it } from 'vitest';
import prisma from '@/lib/prisma';
import { aggregateProductsFromInvoices, buildProductKey } from '@/lib/product-aggregation';

const integrationDescribe = process.env.RUN_DB_INTEGRATION_TESTS === '1' ? describe : describe.skip;
const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const userEmail = `aggregation-${suffix}@qlmed.test`;

const xml = `
<nfeProc>
  <NFe>
    <infNFe>
      <det>
        <prod>
          <cProd>PAGE-TEST</cProd>
          <xProd>Produto de paginação</xProd>
          <NCM>00000000</NCM>
          <uCom>UN</uCom>
          <qCom>1</qCom>
          <vUnCom>1</vUnCom>
          <vProd>1</vProd>
        </prod>
      </det>
    </infNFe>
  </NFe>
</nfeProc>`;

integrationDescribe('product aggregate keyset pagination', () => {
  afterAll(async () => {
    // `Company.userId` é RESTRICT desde a correção do INFO-002: apagar o
    // utilizador já não arrasta a empresa. A limpeza tem de descer a árvore
    // explicitamente — que é exatamente a propriedade que a correção garante.
    const owner = await prisma.user.findUnique({ where: { email: userEmail }, select: { id: true } });
    if (owner) {
      await prisma.company.deleteMany({ where: { userId: owner.id } });
      await prisma.user.deleteMany({ where: { id: owner.id } });
    }
    await prisma.$disconnect();
  });

  it('reads every page exactly once and respects the immutable cutoff', async () => {
    const user = await prisma.user.create({
      data: {
        email: userEmail,
        passwordHash: 'test',
        name: 'Aggregation Test',
        role: 'admin',
        status: 'inactive',
      },
    });
    const company = await prisma.company.create({
      data: {
        cnpj: `88${Date.now().toString().slice(-12)}`,
        razaoSocial: 'Aggregation Test',
        userId: user.id,
      },
    });

    await prisma.invoice.createMany({
      data: Array.from({ length: 101 }, (_, index) => ({
        accessKey: `agg-${suffix}-${index}`,
        type: 'NFE',
        direction: 'received',
        number: String(index),
        issueDate: new Date('2026-01-01T00:00:00.000Z'),
        senderCnpj: '00000000000000',
        senderName: 'Fornecedor',
        recipientCnpj: company.cnpj,
        recipientName: company.razaoSocial,
        totalValue: 1,
        xmlContent: xml,
        companyId: company.id,
      })),
    });
    const [{ cutoff }] = await prisma.$queryRaw<{ cutoff: Date }[]>`SELECT CURRENT_TIMESTAMP AS cutoff`;
    await prisma.invoice.create({
      data: {
        accessKey: `agg-${suffix}-after-cutoff`,
        type: 'NFE',
        direction: 'received',
        number: 'after',
        issueDate: new Date('2026-01-01T00:00:00.000Z'),
        senderCnpj: '00000000000000',
        senderName: 'Fornecedor',
        recipientCnpj: company.cnpj,
        recipientName: company.razaoSocial,
        totalValue: 1,
        xmlContent: xml,
        companyId: company.id,
      },
    });

    const result = await aggregateProductsFromInvoices(company.id, {
      createdAtLte: cutoff,
      strictXml: true,
    });
    const key = buildProductKey({
      code: 'PAGE-TEST',
      description: 'Produto de paginação',
      ncm: '00000000',
      unit: 'UN',
      anvisa: null,
      ean: null,
      quantity: 1,
      unitPrice: 1,
      totalValue: 1,
      cfop: null,
      batches: [],
    });
    const product = result.get(key);

    expect(product?.invoiceCount).toBe(101);
    expect(product?.totalQuantity).toBe(101);
    expect(product?.totalValue).toBe(101);
  });
});
