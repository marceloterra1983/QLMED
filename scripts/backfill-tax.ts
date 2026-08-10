/**
 * Standalone script to backfill tax data from existing invoices.
 * Run with: npx tsx scripts/backfill-tax.ts
 */

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { getCanonicalDatabaseUrl } from '../src/lib/database-config';
import { extractAllTaxData } from '../src/lib/parse-invoice-tax';

const prisma = new PrismaClient({
  adapter: new PrismaPg(getCanonicalDatabaseUrl()),
});
const BATCH_SIZE = 200;

async function upsertTotals(data: {
  invoiceId: string; companyId: string;
  vbc: number | null; vicms: number | null; vpis: number | null; vcofins: number | null;
  vipi: number | null; vfrete: number | null; vseg: number | null; vdesc: number | null;
  voutro: number | null; vtottrib: number | null; vfcp: number | null; vicmsSt: number | null;
}) {
  await prisma.$executeRawUnsafe(
    `INSERT INTO invoice_tax_totals (
      invoice_id, company_id, vbc, vicms, vpis, vcofins, vipi,
      vfrete, vseg, vdesc, voutro, vtottrib, vfcp, vicms_st, computed_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,NOW())
    ON CONFLICT (invoice_id) DO UPDATE SET
      vbc = EXCLUDED.vbc, vicms = EXCLUDED.vicms,
      vpis = EXCLUDED.vpis, vcofins = EXCLUDED.vcofins,
      vipi = EXCLUDED.vipi, vfrete = EXCLUDED.vfrete,
      vseg = EXCLUDED.vseg, vdesc = EXCLUDED.vdesc,
      voutro = EXCLUDED.voutro, vtottrib = EXCLUDED.vtottrib,
      vfcp = EXCLUDED.vfcp, vicms_st = EXCLUDED.vicms_st,
      computed_at = NOW()`,
    data.invoiceId, data.companyId,
    data.vbc, data.vicms, data.vpis, data.vcofins, data.vipi,
    data.vfrete, data.vseg, data.vdesc, data.voutro, data.vtottrib,
    data.vfcp, data.vicmsSt,
  );
}

async function upsertItems(invoiceId: string, companyId: string, items: any[]) {
  await prisma.$executeRawUnsafe(`DELETE FROM invoice_item_tax WHERE invoice_id = $1`, invoiceId);
  for (const item of items) {
    const id = crypto.randomUUID();
    await prisma.$executeRawUnsafe(
      `INSERT INTO invoice_item_tax (
        id, invoice_id, company_id, item_number, product_code, product_description,
        ncm, cfop, cest, origem, quantity, unit_price, total_value,
        cst_icms, base_icms, aliq_icms, valor_icms,
        cst_pis, aliq_pis, valor_pis,
        cst_cofins, aliq_cofins, valor_cofins,
        aliq_ipi, valor_ipi, valor_fcp
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26)`,
      id, invoiceId, companyId,
      item.itemNumber, item.productCode, item.productDescription,
      item.ncm, item.cfop, item.cest, item.origem,
      item.quantity, item.unitPrice, item.totalValue,
      item.cstIcms, item.baseIcms, item.aliqIcms, item.valorIcms,
      item.cstPis, item.aliqPis, item.valorPis,
      item.cstCofins, item.aliqCofins, item.valorCofins,
      item.aliqIpi, item.valorIpi, item.valorFcp,
    );
  }
}

async function main() {
  // Tables are schema-owned (Prisma migrations). No runtime DDL.
  let totalProcessed = 0;
  let totalErrors = 0;

  while (true) {
    const invoices = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `SELECT i.id
       FROM "Invoice" i
       LEFT JOIN invoice_tax_totals t ON t.invoice_id = i.id
       WHERE i.type = 'NFE'
         AND i."xmlContent" IS NOT NULL
         AND t.invoice_id IS NULL
       ORDER BY i."issueDate" DESC
       LIMIT $1`,
      BATCH_SIZE,
    );

    if (invoices.length === 0) break;

    let batchProcessed = 0;
    let batchErrors = 0;

    for (const inv of invoices) {
      try {
        const full = await prisma.invoice.findUnique({
          where: { id: inv.id },
          select: { id: true, xmlContent: true, companyId: true },
        });
        if (!full?.xmlContent) continue;

        const { totals, items } = await extractAllTaxData(full.xmlContent);

        if (totals) {
          await upsertTotals({ invoiceId: full.id, companyId: full.companyId, ...totals });
        }
        if (items.length > 0) {
          await upsertItems(full.id, full.companyId, items);
        }

        batchProcessed++;
      } catch (err) {
        console.error(`Error processing ${inv.id}:`, err);
        batchErrors++;
      }
    }

    totalProcessed += batchProcessed;
    totalErrors += batchErrors;

    const remaining = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
      `SELECT COUNT(*)::bigint as count
       FROM "Invoice" i
       LEFT JOIN invoice_tax_totals t ON t.invoice_id = i.id
       WHERE i.type = 'NFE'
         AND i."xmlContent" IS NOT NULL
         AND t.invoice_id IS NULL`,
    );
    const rem = Number(remaining[0]?.count ?? 0);
    console.log(`Batch done: +${batchProcessed} processed, +${batchErrors} errors | Total: ${totalProcessed} | Remaining: ${rem}`);
  }

  // Update product_registry fiscal fields from the latest invoice item tax data
  console.log('Updating product_registry fiscal fields...');
  const companies = await prisma.company.findMany({ select: { id: true } });
  for (const company of companies) {
    const result = await prisma.$executeRawUnsafe(
      `UPDATE product_registry pr SET
        fiscal_icms = sub.aliq_icms,
        fiscal_pis = sub.aliq_pis,
        fiscal_cofins = sub.aliq_cofins,
        fiscal_ipi = sub.aliq_ipi,
        fiscal_cfop_entrada = sub.cfop,
        updated_at = NOW()
      FROM (
        SELECT DISTINCT ON (it.product_code)
          it.product_code,
          it.aliq_icms,
          it.aliq_pis,
          it.aliq_cofins,
          it.aliq_ipi,
          it.cfop
        FROM invoice_item_tax it
        INNER JOIN "Invoice" i ON i.id = it.invoice_id
        WHERE it.company_id = $1
          AND it.product_code IS NOT NULL
        ORDER BY it.product_code, i."issueDate" DESC
      ) sub
      WHERE pr.company_id = $1
        AND UPPER(TRIM(pr.code)) = UPPER(TRIM(sub.product_code))`,
      company.id,
    );
    console.log(`Company ${company.id}: updated ${result} product fiscal fields`);
  }

  console.log(`\nDone! ${totalProcessed} invoices processed, ${totalErrors} errors.`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
