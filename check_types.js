
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkTypes() {
  const nfeCount = await prisma.invoice.count({
    where: { type: 'NFE' }
  });
  const cteCount = await prisma.invoice.count({
    where: { type: 'CTE' }
  });
  const totalCount = await prisma.invoice.count();

  console.log('Total Invoices:', totalCount);
  console.log('NFE Count:', nfeCount);
  console.log('CTE Count:', cteCount);
  
  const recent = await prisma.invoice.findMany({
    take: 5,
    orderBy: { createdAt: 'desc' },
    select: { id: true, type: true, accessKey: true, createdAt: true }
  });
  console.log('Recent invoices:', recent);
}

checkTypes()
  .catch(e => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
