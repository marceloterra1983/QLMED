const { PrismaClient } = require('@prisma/client');

async function main() {
  const p = new PrismaClient();
  
  // Get company CNPJ
  const company = await p.company.findFirst();
  console.log('Company CNPJ:', company.cnpj);
  const cnpjClean = company.cnpj.replace(/\D/g, '');
  
  // Find invoices where senderCnpj matches company CNPJ (considering formatted or unformatted)
  const allInvoices = await p.invoice.findMany({ 
    where: { companyId: company.id },
    select: { id: true, senderCnpj: true, senderName: true, direction: true, type: true, number: true }
  });

  let updated = 0;
  for (const inv of allInvoices) {
    const senderClean = inv.senderCnpj.replace(/\D/g, '');
    if (senderClean === cnpjClean && inv.direction !== 'issued') {
      await p.invoice.update({
        where: { id: inv.id },
        data: { direction: 'issued' }
      });
      updated++;
      console.log(`  → Marked as ISSUED: ${inv.type} #${inv.number} (sender: ${inv.senderName})`);
    }
  }

  console.log(`\nUpdated ${updated} invoices to 'issued'.`);
  
  const received = await p.invoice.count({ where: { direction: 'received' } });
  const issued = await p.invoice.count({ where: { direction: 'issued' } });
  console.log(`Final: ${received} received, ${issued} issued, ${received + issued} total`);
  
  await p.$disconnect();
}

main();
