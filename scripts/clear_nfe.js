const { PrismaClient } = require('@prisma/client');

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
