/**
 * One-time backfill script to populate the `cfop` column on existing invoices.
 * Extracts the first CFOP from each invoice's xmlContent using a regex.
 *
 * Safe to re-run: only processes invoices where cfop IS NULL and xmlContent IS NOT NULL.
 *
 * Run with:
 *   npx tsx scripts/backfill-cfop.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const BATCH_SIZE = 100;

function extractFirstCfop(xmlContent: string): string | null {
  const match = xmlContent.match(/<CFOP>\s*(\d{4})\s*<\/CFOP>/i);
  return match?.[1] || null;
}

async function main() {
  // Count total invoices to backfill
  const [{ count: totalCount }] = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
    `SELECT COUNT(*)::bigint AS count
     FROM "Invoice"
     WHERE cfop IS NULL
       AND "xmlContent" IS NOT NULL`,
  );
  const total = Number(totalCount);

  if (total === 0) {
    console.log('No invoices need CFOP backfill. All done.');
    await prisma.$disconnect();
    return;
  }

  console.log(`Found ${total} invoices with cfop IS NULL and xmlContent IS NOT NULL.`);

  let totalProcessed = 0;
  let totalUpdated = 0;
  let totalSkipped = 0;
  let totalErrors = 0;

  while (true) {
    const invoices = await prisma.$queryRawUnsafe<{ id: string; xmlContent: string }[]>(
      `SELECT id, "xmlContent"
       FROM "Invoice"
       WHERE cfop IS NULL
         AND "xmlContent" IS NOT NULL
       LIMIT $1`,
      BATCH_SIZE,
    );

    if (invoices.length === 0) break;

    for (const inv of invoices) {
      try {
        const cfop = extractFirstCfop(inv.xmlContent);

        if (cfop) {
          await prisma.$executeRawUnsafe(
            `UPDATE "Invoice" SET cfop = $1 WHERE id = $2 AND cfop IS NULL`,
            cfop,
            inv.id,
          );
          totalUpdated++;
        } else {
          // No CFOP found in XML — set to empty string so we don't re-process
          await prisma.$executeRawUnsafe(
            `UPDATE "Invoice" SET cfop = '' WHERE id = $1 AND cfop IS NULL`,
            inv.id,
          );
          totalSkipped++;
        }

        totalProcessed++;
      } catch (err) {
        console.error(`Error processing invoice ${inv.id}:`, err);
        totalErrors++;
        totalProcessed++;
      }
    }

    console.log(
      `Progress: ${totalProcessed} of ${total} processed ` +
      `(${totalUpdated} updated, ${totalSkipped} no CFOP in XML, ${totalErrors} errors)`,
    );
  }

  console.log(
    `\nDone! ${totalProcessed} invoices processed: ` +
    `${totalUpdated} updated, ${totalSkipped} had no CFOP in XML, ${totalErrors} errors.`,
  );
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
