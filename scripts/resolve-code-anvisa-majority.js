#!/usr/bin/env node
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
function normalizeCode(value) {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').trim();
}
(async () => {
  try {
    const rows = await prisma.$queryRawUnsafe(`
      SELECT id, code, anvisa_code, anvisa_source
      FROM product_registry
      WHERE COALESCE(code,'')<>'' AND COALESCE(anvisa_code,'')<>''
    `);
    const byCode = new Map();
    for (const row of rows) {
      const key = normalizeCode(row.code);
      if (!key) continue;
      const grp = byCode.get(key) || [];
      grp.push(row);
      byCode.set(key, grp);
    }

    const updates = [];
    for (const [code, group] of byCode.entries()) {
      const counts = new Map();
      for (const item of group) {
        const value = String(item.anvisa_code).replace(/\D/g, '');
        if (!value) continue;
        counts.set(value, (counts.get(value) || 0) + 1);
      }
      if (counts.size <= 1) continue;
      let total = 0;
      let best = null;
      let bestCount = 0;
      for (const [value, count] of counts.entries()) {
        total += count;
        if (count > bestCount) {
          bestCount = count;
          best = value;
        }
      }
      if (!best || total < 2) continue;
      const ratio = bestCount / total;
      if (ratio < 0.7) continue;
      for (const item of group) {
        if (String(item.anvisa_code).replace(/\D/g, '') === best) continue;
        if (item.anvisa_source === 'manual') continue;
        updates.push({ id: item.id, majority: best });
      }
    }

    for (const update of updates) {
      await prisma.$executeRawUnsafe(
        `UPDATE product_registry SET anvisa_code = $2, anvisa_source = 'auto_infer', updated_at = NOW() WHERE id = $1`,
        update.id,
        update.majority,
      );
    }

    console.log(JSON.stringify({ analyzedCodes: byCode.size, updates: updates.length }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
})();
