const { PrismaClient } = require('@prisma/client');

if (process.env.ALLOW_DESTRUCTIVE_INVOICE_DELETE !== 'clear-nfe') {
  throw new Error('Set ALLOW_DESTRUCTIVE_INVOICE_DELETE=clear-nfe to run this destructive maintenance script.');
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const result = await prisma.invoice.deleteMany({
      where: { type: 'NFE' }
    });
    console.log(`Deleted ${result.count} NF-e records.`);
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();
