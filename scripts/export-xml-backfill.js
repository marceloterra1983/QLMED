const { PrismaClient } = require('@prisma/client');
const fs = require('fs').promises;
const path = require('path');

const prisma = new PrismaClient();
const XML_BACKUP_DIR = path.join(process.cwd(), 'xml_backup');
const TYPE_SUFFIX = { NFE: 'nfe', CTE: 'cte', NFSE: 'nfse' };

function getMonthFolder(issueDate) {
  if (!issueDate) return 'unknown';
  const d = new Date(issueDate);
  if (isNaN(d.getTime())) return 'unknown';
  return d.getFullYear() + '_' + String(d.getMonth() + 1).padStart(2, '0');
}

async function main() {
  const yearsBack = Number(process.argv[2]) || 5;
  const since = new Date();
  since.setFullYear(since.getFullYear() - yearsBack);

  const count = await prisma.invoice.count({
    where: { issueDate: { gte: since }, xmlContent: { not: '' } },
  });
  console.log(`Exportando XMLs dos ultimos ${yearsBack} anos (desde ${since.toISOString().split('T')[0]})`);
  console.log(`Total de notas: ${count}`);

  let exported = 0;
  let skipped = 0;
  let errors = 0;
  let cursor;

  while (true) {
    const batch = await prisma.invoice.findMany({
      where: { issueDate: { gte: since }, xmlContent: { not: '' } },
      select: { id: true, accessKey: true, type: true, issueDate: true, xmlContent: true },
      orderBy: { id: 'asc' },
      take: 500,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
    if (batch.length === 0) break;

    for (const inv of batch) {
      const folder = getMonthFolder(inv.issueDate);
      const dir = path.join(XML_BACKUP_DIR, folder);
      const suffix = TYPE_SUFFIX[inv.type] || inv.type.toLowerCase();
      const file = path.join(dir, inv.accessKey + '-' + suffix + '.xml');

      try {
        const stats = await fs.stat(file).catch(() => null);
        if (stats && stats.size >= inv.xmlContent.length) {
          skipped++;
          continue;
        }
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(file, inv.xmlContent, 'utf-8');
        exported++;
      } catch (e) {
        errors++;
        console.error('Erro:', inv.accessKey, e.message);
      }
    }

    cursor = batch[batch.length - 1].id;
    const total = exported + skipped + errors;
    const pct = Math.round((total / count) * 100);
    process.stdout.write(`\r  Progresso: ${total}/${count} (${pct}%) | novos: ${exported} | existentes: ${skipped} | erros: ${errors}`);
  }

  console.log(`\n\nExportacao completa!`);
  console.log(`  Novos arquivos: ${exported}`);
  console.log(`  Ja existiam:    ${skipped}`);
  console.log(`  Erros:          ${errors}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
