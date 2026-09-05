/**
 * SPEC-047 — varredura de vínculo item NF-e recebida → produto Spica.
 *
 *   npx tsx scripts/nfe-item-link-sweep.ts [--dry-run] [--diagnostic] [--force] [--since=2021-01-01]
 *
 * Escreve um CSV de backup em tmp/nfe-item-links-<timestamp>.csv (gitignored).
 * Requer DATABASE_URL canônica no ambiente.
 */
import * as fs from 'fs';
import * as path from 'path';
import prisma from '../src/lib/prisma';
import { runNfeItemLinkSweep } from '../src/lib/nfe-item-link/sweep';

function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}
function option(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((a) => a.startsWith(prefix))?.slice(prefix.length);
}
function csv(value: unknown): string {
  const s = value == null ? '' : String(value);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

async function main() {
  const companies = await prisma.company.findMany({ select: { id: true, razaoSocial: true } });
  const since = option('since') ? new Date(option('since')!) : undefined;
  const dryRun = flag('dry-run');
  const diagnosticOnly = flag('diagnostic');
  const force = flag('force');

  fs.mkdirSync(path.join(process.cwd(), 'tmp'), { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const csvPath = path.join(process.cwd(), 'tmp', `nfe-item-links-${stamp}${dryRun || diagnosticOnly ? '-dryrun' : ''}.csv`);
  const out = fs.createWriteStream(csvPath);
  out.write('company_id,invoice_id,invoice_number,issue_date,supplier_cnpj,supplier_code,description,ean,anvisa,ncm,item_number,product_id,codigo,strategy,confidence\n');

  const pendingByCode = new Map<string, { supplierCnpj: string; supplierCode: string; description: string | null; items: number; invoices: Set<string> }>();

  for (const company of companies) {
    const result = await runNfeItemLinkSweep({
      companyId: company.id,
      since,
      dryRun,
      force,
      diagnosticOnly,
      onRow: (row) => {
        out.write([
          company.id, row.invoiceId, row.invoiceNumber, row.issueDate?.toISOString() ?? '', row.supplierCnpj, row.supplierCode,
          row.description, row.ean, row.anvisa, row.ncm, row.itemNumber,
          row.decision?.productId ?? '', row.decision?.codigo ?? '', row.decision?.strategy ?? 'PENDING', row.decision?.confidence ?? '',
        ].map(csv).join(',') + '\n');
        if (!row.decision) {
          const key = `${row.supplierCnpj}::${row.supplierCode.toUpperCase()}`;
          const g = pendingByCode.get(key) ?? { supplierCnpj: row.supplierCnpj, supplierCode: row.supplierCode, description: row.description, items: 0, invoices: new Set<string>() };
          g.items++; g.invoices.add(row.invoiceId);
          pendingByCode.set(key, g);
        }
      },
    });
    if (!result) {
      console.log(JSON.stringify({ company: company.razaoSocial, skipped: 'lock held by another sweep' }));
      continue;
    }
    console.log(JSON.stringify({ company: company.razaoSocial, ...result }, null, 2));
  }
  out.end();

  const top = [...pendingByCode.values()].sort((a, b) => b.items - a.items).slice(0, 25);
  console.log('\nPENDENTES (top 25 por itens):');
  for (const g of top) console.log(`${g.items}\t${g.invoices.size} notas\t${g.supplierCnpj}\t${g.supplierCode}\t${(g.description || '').slice(0, 60)}`);
  console.log(`\nCSV: ${csvPath}`);
}

main()
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
