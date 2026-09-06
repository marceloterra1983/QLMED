#!/usr/bin/env node
/**
 * Backfill Invoice.convenioName + doctorName from xmlContent infCpl (SPEC-054).
 * Usage: node scripts/backfill-invoice-convenio-doctor.mjs
 */
import pg from 'pg';

function normalize(raw) {
  return raw.replace(/\|/g, ' ').replace(/\s+/g, ' ').trim();
}

function extractInfCpl(xml) {
  if (!xml) return null;
  const cpl = xml.match(/<infCpl>([\s\S]*?)<\/infCpl>/i)?.[1];
  return cpl ? normalize(cpl) : null;
}

function isPlaceholder(value) {
  return !value || /^[-–—.:]+$/.test(value);
}

function extractConvenio(inf) {
  if (!inf) return null;
  const m = inf.match(/\(\s*Convenio\s+([^)]+?)\s*\)/i);
  if (!m?.[1]) return null;
  const name = normalize(m[1]);
  if (isPlaceholder(name) || !/[A-Za-zÀ-ÿ]{2,}/.test(name)) return null;
  return name.toUpperCase();
}

function extractDoctor(inf) {
  if (!inf) return null;
  const m = inf.match(/\(\s*M[eé]dico\s*[:\-]?\s*([^)]+?)\s*\)/i);
  if (!m?.[1]) return null;
  let name = normalize(m[1]).replace(/^[-–—.:]+\s*/, '').trim();
  if (isPlaceholder(name)) return null;
  const tokens = name.split(/\s+/).filter((t) => /[A-Za-zÀ-ÿ]{2,}/.test(t));
  if (tokens.length < 1) return null;
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
    SELECT id, "xmlContent", "convenioName", "doctorName"
    FROM "Invoice"
    WHERE direction = 'issued' AND type = 'NFE'
      AND ("convenioName" IS NULL OR "doctorName" IS NULL)
      AND (
        "xmlContent" ILIKE '%Convenio%'
        OR "xmlContent" ILIKE '%Medico%'
        OR "xmlContent" ILIKE '%Médico%'
      )
  `);
  let updated = 0;
  let skipped = 0;
  for (const row of rows) {
    const inf = extractInfCpl(row.xmlContent);
    const convenioName = row.convenioName ?? extractConvenio(inf);
    const doctorName = row.doctorName ?? extractDoctor(inf);
    if (
      convenioName === row.convenioName &&
      doctorName === row.doctorName
    ) {
      skipped++;
      continue;
    }
    if (convenioName == null && doctorName == null && row.convenioName == null && row.doctorName == null) {
      skipped++;
      continue;
    }
    await client.query(
      `UPDATE "Invoice"
       SET "convenioName" = COALESCE("convenioName", $1),
           "doctorName" = COALESCE("doctorName", $2),
           "updatedAt" = NOW()
       WHERE id = $3`,
      [convenioName, doctorName, row.id],
    );
    updated++;
  }
  const { rows: counts } = await client.query(`
    SELECT
      count(*) FILTER (WHERE direction='issued' AND type='NFE') AS issued,
      count(*) FILTER (WHERE "convenioName" IS NOT NULL) AS with_convenio,
      count(*) FILTER (WHERE "doctorName" IS NOT NULL) AS with_doctor
    FROM "Invoice"
  `);
  console.log(JSON.stringify({ scanned: rows.length, updated, skipped, ...counts[0] }, null, 2));
} finally {
  await client.end();
}
