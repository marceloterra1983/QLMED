import { PrismaClient } from '@prisma/client';
import { extractProductsFromXml } from '../src/lib/product-aggregation';

const p = new PrismaClient();

function normalizeCode(code: string): string {
  return code.toUpperCase().trim().replace(/\.+$/, '');
}
function stripNonAlnum(code: string): string {
  return code.replace(/[^A-Z0-9]/g, '');
}

async function main() {
  const company = await p.company.findFirst();
  if (!company) { console.log('No company'); process.exit(0); return; }

  // Load registry
  const allRows = await p.$queryRawUnsafe<any[]>(
    `SELECT id, codigo, code, description, short_name FROM product_registry WHERE company_id = $1 AND code IS NOT NULL AND code != ''`,
    company.id
  );
  const byCode = new Map<string, any>();
  const byAlnum = new Map<string, any>();
  for (const row of allRows) {
    const norm = normalizeCode(row.code || '');
    if (!norm) continue;
    const alnum = stripNonAlnum(norm);
    if (!byCode.has(norm) || (row.codigo && !byCode.get(norm)?.codigo)) byCode.set(norm, row);
    if (alnum && (!byAlnum.has(alnum) || (row.codigo && !byAlnum.get(alnum)?.codigo))) byAlnum.set(alnum, row);
  }
  console.log(`Registry: ${byCode.size} exact codes, ${byAlnum.size} alnum codes`);

  // Test on recent 50 invoices
  const invoices = await p.invoice.findMany({
    where: { type: 'NFE', direction: 'received' },
    select: { id: true, number: true, senderName: true, xmlContent: true },
    orderBy: { issueDate: 'desc' },
    take: 50
  });

  let totalAll = 0, matchedAll = 0, alnumRecovered = 0;
  const unmatchedSamples: string[] = [];

  for (const inv of invoices) {
    if (!inv.xmlContent) continue;
    const products = await extractProductsFromXml(inv.xmlContent);

    let matchedCount = 0;
    for (const prod of products) {
      const code = normalizeCode(prod.code || '');
      if (!code) continue;
      if (byCode.has(code)) { matchedCount++; continue; }
      const alnum = stripNonAlnum(code);
      if (alnum && byAlnum.has(alnum)) { matchedCount++; alnumRecovered++; continue; }
      if (unmatchedSamples.length < 20) {
        unmatchedSamples.push(`${inv.number}: ${prod.code} - ${(prod.description || '').substring(0,40)}`);
      }
    }
    totalAll += products.length;
    matchedAll += matchedCount;
  }

  console.log(`\n=== RESULT (50 NF-e) ===`);
  console.log(`Total items: ${totalAll}`);
  console.log(`Matched: ${matchedAll} (${totalAll > 0 ? Math.round(matchedAll/totalAll*100) : 0}%)`);
  console.log(`  - by alnum fallback: ${alnumRecovered}`);
  console.log(`Unmatched: ${totalAll - matchedAll}`);
  console.log(`\n=== Unmatched samples ===`);
  unmatchedSamples.forEach(s => console.log('  ', s));

  await p.$disconnect();
  process.exit(0);
}

main();
