#!/usr/bin/env node
/**
 * Backfill Invoice.patientName from xmlContent infCpl (SPEC-052).
 * Usage: node scripts/backfill-invoice-patient-name.mjs
 * Requires DATABASE_URL (same as app).
 */
import pg from 'pg';

const PATIENT_RE = /\(\s*Paciente\s+([^)]+?)\s*\)/i;

function extract(xml) {
  if (!xml) return null;
  const cpl = xml.match(/<infCpl>([\s\S]*?)<\/infCpl>/i)?.[1];
  if (!cpl) return null;
  const m = cpl.match(PATIENT_RE);
  if (!m?.[1]) return null;
  let name = m[1].replace(/\s+/g, ' ').trim();
  name = name.replace(/\s*[-–—]\s*ATEND\.?:?\s*\S+/i, '').trim();
  const tokens = name.split(/\s+/).filter((t) => /[A-Za-zÀ-ÿ]{2,}/.test(t));
  if (tokens.length < 2) return null;
  return name.toUpperCase();
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL required');
  process.exit(1);
}

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  const { rows } = await client.query(`
    SELECT id, "xmlContent"
    FROM "Invoice"
    WHERE direction = 'issued' AND type = 'NFE'
      AND "patientName" IS NULL
      AND "xmlContent" ILIKE '%Paciente%'
  `);
  let updated = 0;
  let skipped = 0;
  for (const row of rows) {
    const name = extract(row.xmlContent);
    if (!name) {
      skipped++;
      continue;
    }
    await client.query(
      `UPDATE "Invoice" SET "patientName" = $1, "updatedAt" = NOW() WHERE id = $2`,
      [name, row.id],
    );
    updated++;
  }
  const { rows: counts } = await client.query(`
    SELECT
      count(*) FILTER (WHERE direction='issued' AND type='NFE') AS issued,
      count(*) FILTER (WHERE "patientName" IS NOT NULL) AS with_patient
    FROM "Invoice"
  `);
  console.log(JSON.stringify({ scanned: rows.length, updated, skipped, ...counts[0] }, null, 2));
} finally {
  await client.end();
}
