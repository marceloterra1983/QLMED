#!/usr/bin/env node
/**
 * Reprocessa ImpcgAuthorization com doctorName nulo: baixa PDF, OCR, parse novo,
 * preenche médico/CRM sem sobrescrever editedFields. Não imprime secrets.
 */
const { spawnSync } = require('node:child_process');
const { mkdtempSync, readFileSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const crypto = require('node:crypto');
const { Client } = require('pg');

const ALGORITHM = 'aes-256-gcm';
const LEGACY_SALT = 'qlmed-salt';

function deriveKey(salt) {
  return crypto.scryptSync(process.env.ENCRYPTION_KEY, salt, 32);
}

function decrypt(encryptedText) {
  const parts = encryptedText.split(':');
  if (parts.length === 4) {
    const [saltHex, ivHex, authTagHex, encrypted] = parts;
    const key = deriveKey(Buffer.from(saltHex, 'hex'));
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    return decipher.update(encrypted, 'hex', 'utf8') + decipher.final('utf8');
  }
  if (parts.length === 3) {
    const [ivHex, authTagHex, encrypted] = parts;
    const key = deriveKey(Buffer.from(LEGACY_SALT));
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    return decipher.update(encrypted, 'hex', 'utf8') + decipher.final('utf8');
  }
  return encryptedText;
}

function run(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', timeout: 90_000 });
  return r.stdout || '';
}

function extractPdfText(pdf) {
  const dir = mkdtempSync(join(tmpdir(), 'impcg-medico-'));
  const pdfPath = join(dir, 'oficio.pdf');
  writeFileSync(pdfPath, pdf);
  try {
    const text = run('pdftotext', ['-layout', '-enc', 'UTF-8', pdfPath, '-']);
    if (text.trim()) return text;
    const prefix = join(dir, 'page');
    run('pdftoppm', ['-png', '-r', '300', pdfPath, prefix]);
    const pagePath = `${prefix}-1.png`;
    try {
      readFileSync(pagePath);
    } catch {
      return '';
    }
    return run('tesseract', [pagePath, 'stdout', '-l', 'por', '--oem', '1', '--psm', '6']).trim();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function normalizeName(raw) {
  if (!raw) return null;
  const cleaned = raw
    .replace(/\s+/g, ' ')
    .replace(/[^A-Za-zÀ-ÿ0-9 .\-]/g, '')
    .trim()
    .toUpperCase();
  return cleaned || null;
}

function extractDoctorFields(text) {
  const withColon = /m[eé]dico\s*:\s*([^\n]+)/i.exec(text);
  const withoutColon = /m[eé]dico\s+(?:dr\.?a?\.?\s+)?([^\n]+)/i.exec(text);
  const doctorRaw = (withColon?.[1] ?? withoutColon?.[1] ?? '').replace(/\s+/g, ' ').trim() || null;
  const doctorName = normalizeName(
    doctorRaw
      ?.replace(/\s+crm\b[\s:]*.*$/i, '')
      .replace(/^(?:dr\.?a?\.?\s+)/i, '') ?? null,
  );
  const crmFromLine = doctorRaw ? /\bcrm\s*:?\s*(\d{4,10})\b/i.exec(doctorRaw)?.[1] : null;
  const crmLabeled = /crm\s*:\s*([^\n]+)/i.exec(text)?.[1];
  const doctorCrm = (crmFromLine || crmLabeled || '').replace(/\D/g, '') || null;
  return { doctorName, doctorCrm };
}

function hasMedicoLine(text) {
  return /m[eé]dico\b/i.test(text);
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL missing');
  if (!process.env.ENCRYPTION_KEY) throw new Error('ENCRYPTION_KEY missing');

  const c = new Client({ connectionString: url.replace('qlmed-db', '127.0.0.1') });
  await c.connect();

  const before = await c.query(`
    SELECT COUNT(*)::int AS n FROM "ImpcgAuthorization" WHERE "doctorName" IS NULL
  `);
  const rows = await c.query(`
    SELECT a.id, a."oficioNumber", a."oneDriveItemId", a."editedFields",
           a."doctorName", a."doctorCrm", a."parseStatus",
           c."accessToken", c."driveId"
    FROM "ImpcgAuthorization" a
    JOIN "OneDriveConnection" c ON c."companyId" = a."companyId"
      AND c."accountEmail" = 'faturamento@qlmed.com.br'
    WHERE a."doctorName" IS NULL
    ORDER BY a."oficioNumber"
  `);

  let updated = 0;
  let stillNull = 0;
  let noMedicoLine = 0;
  let downloadFail = 0;
  const remaining = [];

  for (const row of rows.rows) {
    const edited = row.editedFields || [];
    if (edited.includes('doctorName')) {
      stillNull += 1;
      remaining.push({ n: row.oficioNumber, reason: 'edited' });
      continue;
    }
    let token;
    try {
      token = decrypt(row.accessToken);
    } catch {
      downloadFail += 1;
      remaining.push({ n: row.oficioNumber, reason: 'decrypt' });
      continue;
    }
    const pdfResp = await fetch(
      `https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(row.driveId)}/items/${row.oneDriveItemId}/content`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!pdfResp.ok) {
      downloadFail += 1;
      remaining.push({ n: row.oficioNumber, reason: `http_${pdfResp.status}` });
      continue;
    }
    const pdf = Buffer.from(await pdfResp.arrayBuffer());
    const text = extractPdfText(pdf);
    if (!hasMedicoLine(text)) {
      noMedicoLine += 1;
      remaining.push({ n: row.oficioNumber, reason: 'no_medico_line' });
      continue;
    }
    const { doctorName, doctorCrm } = extractDoctorFields(text);
    if (!doctorName) {
      stillNull += 1;
      remaining.push({ n: row.oficioNumber, reason: 'parse_miss' });
      continue;
    }
    const crm = edited.includes('doctorCrm') ? row.doctorCrm : (doctorCrm || row.doctorCrm);
    await c.query(
      `UPDATE "ImpcgAuthorization"
       SET "doctorName" = $2,
           "doctorCrm" = COALESCE($3, "doctorCrm"),
           "updatedAt" = NOW()
       WHERE id = $1`,
      [row.id, doctorName, crm],
    );
    updated += 1;
  }

  const after = await c.query(`
    SELECT COUNT(*)::int AS n FROM "ImpcgAuthorization" WHERE "doctorName" IS NULL
  `);
  await c.end();

  const report = {
    ok: true,
    before_no_doc: before.rows[0].n,
    updated,
    after_no_doc: after.rows[0].n,
    no_doc_remaining: after.rows[0].n,
    remaining_without_medico_line: noMedicoLine,
    download_fail: downloadFail,
    parse_or_edited_miss: stillNull,
    remaining_sample: remaining.slice(0, 15),
  };
  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error(String(err.message || err));
  process.exit(1);
});
