#!/usr/bin/env node
/** Conta ImpcgAuthorization sem doctorName — gate G3. */
const { Client } = require('pg');

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL missing');
  const c = new Client({ connectionString: url.replace('qlmed-db', '127.0.0.1') });
  await c.connect();
  const r = await c.query(`
    SELECT
      COUNT(*) FILTER (WHERE "doctorName" IS NULL)::int AS no_doc_remaining,
      COUNT(*)::int AS total
    FROM "ImpcgAuthorization"
  `);
  await c.end();
  const noDoc = r.rows[0].no_doc_remaining;
  console.log(JSON.stringify({
    ok: noDoc === 0,
    no_doc_remaining: noDoc,
    remaining_without_medico_line: noDoc,
    total: r.rows[0].total,
  }, null, 2));
  if (noDoc !== 0) process.exit(2);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
