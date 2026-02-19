const { PrismaClient } = require('@prisma/client');
async function main() {
  const p = new PrismaClient();
  // Check the most recent invoices
  const recent = await p.invoice.findMany({
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: { number: true, senderName: true, direction: true, type: true, createdAt: true, issueDate: true }
  });
  console.log('10 most recent invoices:');
  recent.forEach(inv => {
    console.log(`  #${inv.number} | ${inv.type} | direction: ${inv.direction} | sender: ${inv.senderName} | issued: ${inv.issueDate}`);
  });
  await p.$disconnect();
}
main();
