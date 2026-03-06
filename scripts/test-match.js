const { PrismaClient } = require('@prisma/client');
const { extractProductsFromXml, buildProductKey } = require('../src/lib/product-aggregation');
const p = new PrismaClient();
(async () => {
  // Testar com 3 NF-e recentes
  const invoices = await p.invoice.findMany({
    where: { type: 'NFE', direction: 'received' },
    select: { id: true, number: true, senderName: true, xmlContent: true },
    orderBy: { issueDate: 'desc' },
    take: 3
  });
  
  const companyRows = await p.$queryRawUnsafe("SELECT id FROM companies LIMIT 1");
  const companyId = companyRows[0].id;
  
  for (const inv of invoices) {
    if (!inv.xmlContent) { console.log('NF-e', inv.number, '- Sem XML'); continue; }
    
    const products = await extractProductsFromXml(inv.xmlContent);
    const keys = products.map(pr => buildProductKey(pr));
    
    const rows = await p.$queryRawUnsafe(
      "SELECT product_key, codigo, description, short_name FROM product_registry WHERE company_id = $1 AND product_key = ANY($2::text[])",
      companyId, keys
    );
    const regMap = new Map(rows.map(r => [r.product_key, r]));
    
    const matchedCount = keys.filter(k => regMap.has(k)).length;
    console.log('\n=== NF-e', inv.number, '-', (inv.senderName || '').substring(0,35), '===');
    console.log('Match:', matchedCount, '/', products.length);
    
    products.forEach((prod, i) => {
      const key = keys[i];
      const reg = regMap.get(key);
      const status = reg ? 'OK' : 'XX';
      const codInterno = reg ? reg.codigo : '';
      console.log(
        status.padEnd(3),
        (prod.code || '-').padEnd(14),
        (prod.description || '').substring(0,45).padEnd(46),
        'KEY:', key.substring(0,55),
        codInterno ? '-> ' + codInterno : ''
      );
    });
  }
  
  await p.$disconnect();
})();
