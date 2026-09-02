#!/usr/bin/env node
/**
 * QLMED CT-e sync via SEFAZ CTeDistribuicaoDFe (mTLS A1).
 * NSDocs store stalled for CTE after 2026-07-02; SEFAZ AN still has docs.
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const zlib = require('zlib');
// Carregado onde é usado: o caminho é do container, e um `require` no topo
// impedia o teste de importar os helpers fora dele.
function forgeLib() { return require(process.env.QLMED_FORGE_PATH || '/app/node_modules/node-forge'); }
const { promisify } = require('util');
const gunzip = promisify(zlib.gunzip);

const STATE_FILE = process.env.CTE_NSU_STATE || '/srv/qlmed/ops/state/cte-last-nsu';
const CTE_COOLDOWN_FILE = process.env.CTE_656_COOLDOWN_FILE || '/tmp/cte-656-cooldown-until';
const PFX_PATH = process.env.PFX_PATH || '/tmp/cert.pfx';
const PASS_ENC = process.env.PASS_ENC || '/tmp/cert.pass.enc';
const CNPJ = (process.env.CNPJ || '07832309000197').replace(/\D/g, '');
const UF = process.env.CTE_UF_CODE || '50';
const API_URL = (process.env.QLMED_API_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
const API_KEY = process.env.QLMED_API_KEY || '';
const DELAY_MS = Number(process.env.CTE_QUERY_DELAY_MS || 2000);
const MAX_LOOPS = Number(process.env.CTE_MAX_LOOPS || 40);
// Docs older than this are imported silently (no WhatsApp/email). Matches
// app NOTIFICATION_MAX_AGE_HOURS default after deploy; until then we also
// dead any outbox deliveries created by the pre-gate upload path.
const NOTIFY_MAX_AGE_HOURS = Number(process.env.CTE_NOTIFY_MAX_AGE_HOURS || 48);
const CTE_656_COOLDOWN_MS = Number(process.env.CTE_656_COOLDOWN_MS || 6 * 60 * 60 * 1000);

function readCooldownUntil() {
  try {
    const raw = fs.readFileSync(CTE_COOLDOWN_FILE, 'utf8').trim();
    const until = Number(raw);
    return Number.isFinite(until) ? until : 0;
  } catch {
    return 0;
  }
}

function writeCooldown(ms = CTE_656_COOLDOWN_MS) {
  const until = Date.now() + ms;
  try {
    fs.writeFileSync(CTE_COOLDOWN_FILE, String(until));
  } catch (e) {
    console.error('cooldown_write_failed', e.message);
  }
  return until;
}

// Port fiel de src/lib/certificate-secret.ts: MAGIC(9)|salt(16)|iv(12)|tag(16)|ct,
// AES-256-GCM, chave = scrypt(ENCRYPTION_KEY, salt, 32), AAD = CNPJ só dígitos.
// A remediação b177b07 (FILE-007) passou a cifrar `pfxData`; este script lia
// o blob cru e o node-forge morria em "Unparsed DER bytes remain" — foi assim
// que o sync de CT-e ficou parado depois do deploy. DER cru continua aceite.
const PFX_MAGIC = Buffer.from('QLMEDPFX1', 'ascii');
const PFX_HEADER_LEN = PFX_MAGIC.length + 16 + 12 + 16;
function isEncryptedPfx(buf) {
  return buf.length > PFX_HEADER_LEN && buf.subarray(0, PFX_MAGIC.length).equals(PFX_MAGIC);
}
function cnpjAad(cnpj) {
  const digits = String(cnpj || '').replace(/\D/g, '');
  if (digits.length !== 14) throw new Error(`CNPJ inválido para o AAD do certificado: "${cnpj ?? ''}"`);
  return Buffer.from(digits, 'ascii');
}
function decryptPfx(value, cnpj) {
  const crypto = require('crypto');
  const buf = Buffer.isBuffer(value) ? value : Buffer.from(value);
  if (!isEncryptedPfx(buf)) {
    if (buf[0] === 0x30) return buf; // DER cru (pré-remediação)
    throw new Error('pfxData nem cifrado (QLMEDPFX1) nem DER');
  }
  let o = PFX_MAGIC.length;
  const salt = buf.subarray(o, (o += 16));
  const iv = buf.subarray(o, (o += 12));
  const tag = buf.subarray(o, (o += 16));
  const ct = buf.subarray(o);
  const d = crypto.createDecipheriv('aes-256-gcm', crypto.scryptSync(process.env.ENCRYPTION_KEY, salt, 32), iv);
  d.setAAD(cnpjAad(cnpj));
  d.setAuthTag(tag);
  return Buffer.concat([d.update(ct), d.final()]);
}

function decrypt(t) {
  const crypto = require('crypto');
  const parts = t.trim().split(':');
  const derive = (salt) => crypto.scryptSync(process.env.ENCRYPTION_KEY, salt, 32);
  if (parts.length === 4) {
    const [s, i, a, e] = parts;
    const d = crypto.createDecipheriv('aes-256-gcm', derive(Buffer.from(s, 'hex')), Buffer.from(i, 'hex'));
    d.setAuthTag(Buffer.from(a, 'hex'));
    return d.update(e, 'hex', 'utf8') + d.final('utf8');
  }
  if (parts.length === 3) {
    const [i, a, e] = parts;
    const d = crypto.createDecipheriv('aes-256-gcm', derive(Buffer.from('qlmed-salt')), Buffer.from(i, 'hex'));
    d.setAuthTag(Buffer.from(a, 'hex'));
    return d.update(e, 'hex', 'utf8') + d.final('utf8');
  }
  return t;
}

function extractPems(pfxBuf, password) {
  const forge = forgeLib();
  const p12 = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(pfxBuf.toString('binary')), password);
  let keyBag = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag]?.[0];
  if (!keyBag) keyBag = p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag]?.[0];
  const certBag = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag]?.find((b) => b.cert);
  if (!keyBag?.key || !certBag?.cert) throw new Error('PFX extract failed');
  return { key: forge.pki.privateKeyToPem(keyBag.key), cert: forge.pki.certificateToPem(certBag.cert) };
}

function readNsu() {
  try {
    return fs.readFileSync(STATE_FILE, 'utf8').trim() || '0';
  } catch {
    return '0';
  }
}
function writeNsu(nsu) {
  // O cursor só anda para frente. Um ultNSU não-numérico ou menor que o atual
  // vem de resposta corrompida/forjada; aceitá-lo pula CT-es reais de forma
  // silenciosa e permanente (a Sefaz passa a responder cStat 137 e o loop
  // encerra achando que terminou).
  if (!/^\d+$/.test(String(nsu))) {
    throw new Error(`ultNSU inválido (não numérico): ${JSON.stringify(String(nsu))}`);
  }
  // Só compara se o cursor em disco for legível: corrupção pré-existente não
  // deve virar crash novo aqui — o valor que entra já foi validado acima.
  const atual = readNsu();
  if (/^\d+$/.test(atual) && BigInt(nsu) < BigInt(atual)) {
    throw new Error(`ultNSU regrediu: ${nsu} < ${atual}`);
  }
  const content = String(nsu).padStart(15, '0') + '\n';
  // /tmp is sticky + fs.protected_regular: cannot overwrite another uid's file.
  try {
    fs.unlinkSync(STATE_FILE);
  } catch {
    /* missing is fine */
  }
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  fs.writeFileSync(STATE_FILE, content);
}

async function distQuery(key, cert, ultNSU) {
  const nsu = String(ultNSU).padStart(15, '0');
  const body = `<distDFeInt xmlns="http://www.portalfiscal.inf.br/cte" versao="1.00"><tpAmb>1</tpAmb><cUFAutor>${UF}</cUFAutor><CNPJ>${CNPJ}</CNPJ><distNSU><ultNSU>${nsu}</ultNSU></distNSU></distDFeInt>`;
  const envelope = `<?xml version="1.0" encoding="utf-8"?><soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope"><soap12:Body><cteDistDFeInteresse xmlns="http://www.portalfiscal.inf.br/cte/wsdl/CTeDistribuicaoDFe"><cteDadosMsg>${body}</cteDadosMsg></cteDistDFeInteresse></soap12:Body></soap12:Envelope>`;
  const url = new URL('https://www1.cte.fazenda.gov.br/CTeDistribuicaoDFe/CTeDistribuicaoDFe.asmx');
  const xml = await new Promise((resolve, reject) => {
    const req = https.request(
      url,
      {
        method: 'POST',
        key,
        cert,
        headers: { 'Content-Type': 'application/soap+xml; charset=utf-8', 'Content-Length': Buffer.byteLength(envelope) },
        timeout: 60000,
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) resolve(data);
          else reject(new Error(`HTTP ${res.statusCode}`));
        });
      }
    );
    req.on('error', reject);
    req.write(envelope);
    req.end();
  });
  return {
    cStat: (xml.match(/<cStat>([^<]+)/) || [])[1],
    xMotivo: (xml.match(/<xMotivo>([^<]+)/) || [])[1],
    ultNSU: (xml.match(/<ultNSU>([^<]+)/) || [])[1],
    maxNSU: (xml.match(/<maxNSU>([^<]+)/) || [])[1],
    docs: [...xml.matchAll(/<docZip[^>]*schema="([^"]*)"[^>]*>([^<]+)<\/docZip>/g)].map((m) => ({
      schema: m[1],
      b64: m[2],
    })),
  };
}

function isFreshForNotify(dhEmi) {
  if (!dhEmi || !Number.isFinite(NOTIFY_MAX_AGE_HOURS) || NOTIFY_MAX_AGE_HOURS <= 0) return true;
  const issued = new Date(dhEmi);
  if (Number.isNaN(issued.getTime())) return true;
  return Date.now() - issued.getTime() <= NOTIFY_MAX_AGE_HOURS * 60 * 60 * 1000;
}

async function ingestXml(xml, fileName = 'cte.xml', { skipNotification = false } = {}) {
  if (!API_KEY) throw new Error('QLMED_API_KEY required');
  // /api/invoices/upload expects multipart field "files" (plural).
  const form = new FormData();
  form.append('files', new Blob([xml], { type: 'text/xml' }), fileName);
  // Honored after app deploy (createHistoricalInvoiceWithoutOutbox). Safe to
  // send always — older upload handlers ignore unknown form fields.
  if (skipNotification) form.append('skipNotification', 'true');
  const res = await fetch(`${API_URL}/api/invoices/upload`, {
    method: 'POST',
    headers: { 'x-api-key': API_KEY },
    body: form,
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text.slice(0, 200) };
  }
  return { status: res.status, json };
}

/** Safety net until age-gate/skipNotification is live in qlmed-app. */
async function suppressOutboxForAccessKey(accessKey, reason) {
  if (!accessKey || !process.env.DATABASE_URL) return 0;
  const { Client } = require('/app/node_modules/pg');
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const { rowCount } = await client.query(
      `UPDATE "NotificationDelivery" d
       SET status = 'dead',
           "lastError" = $2,
           "lockedAt" = NULL,
           "lockToken" = NULL,
           "availableAt" = now(),
           "updatedAt" = now()
       FROM "NotificationOutboxEvent" e
       JOIN "Invoice" i ON i.id = e."invoiceId"
       WHERE d."eventId" = e.id
         AND i."accessKey" = $1
         AND d.status IN ('pending', 'retry', 'processing', 'uncertain')`,
      [accessKey, reason],
    );
    return rowCount || 0;
  } finally {
    await client.end();
  }
}

async function loadPfxFromDb() {
  // Prefer files if present; else CertificateConfig (A1) inside qlmed-app.
  // Prisma 7 needs adapter options — use pg directly (available in image).
  if (fs.existsSync(PFX_PATH) && fs.existsSync(PASS_ENC) && process.env.FORCE_CERT_FROM_DB !== '1') {
    return;
  }
  const { Client } = require('/app/node_modules/pg');
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const { rows } = await client.query(
      'SELECT c."pfxData", c."pfxPassword", c.subject, co.cnpj '
      + 'FROM "CertificateConfig" c JOIN "Company" co ON co.id = c."companyId" '
      + 'ORDER BY c."updatedAt" DESC LIMIT 1',
    );
    const cfg = rows[0];
    if (!cfg?.pfxData || !cfg.pfxPassword) throw new Error('CertificateConfig vazio');
    // O AAD é o CNPJ da empresa dona: um blob copiado para outra empresa não abre.
    fs.writeFileSync(PFX_PATH, decryptPfx(Buffer.from(cfg.pfxData), cfg.cnpj));
    fs.writeFileSync(PASS_ENC, cfg.pfxPassword);
    console.log(new Date().toISOString(), 'cert_loaded_from_db', (cfg.subject || '').slice(0, 80));
  } finally {
    await client.end();
  }
}

module.exports = { decryptPfx, isEncryptedPfx, cnpjAad };
if (require.main !== module) return;

(async () => {
  const cooldownUntil = readCooldownUntil();
  if (cooldownUntil > Date.now()) {
    const waitMin = Math.ceil((cooldownUntil - Date.now()) / 60000);
    console.log(new Date().toISOString(), 'skip_cooldown_656', { waitMinutes: waitMin });
    process.exit(0);
  }

  await loadPfxFromDb();
  const pfx = fs.readFileSync(PFX_PATH);
  const pass = decrypt(fs.readFileSync(PASS_ENC, 'utf8'));
  const { key, cert } = extractPems(pfx, pass);
  let ult = readNsu();
  // Bootstrap: if state missing/zero but we know NSDocs had docs through Jul2,
  // still start from 0 once — expensive but safe. Prefer env BOOTSTRAP_ULT_NSU.
  if (process.env.BOOTSTRAP_ULT_NSU) ult = process.env.BOOTSTRAP_ULT_NSU;

  let imported = 0;
  let skipped = 0;
  let errors = 0;
  console.log(new Date().toISOString(), 'start ultNSU=', ult);

  for (let i = 0; i < MAX_LOOPS; i++) {
    if (i) await new Promise((r) => setTimeout(r, DELAY_MS));
    const batch = await distQuery(key, cert, ult);
    console.log(new Date().toISOString(), 'batch', i, batch.cStat, batch.xMotivo, 'ult', batch.ultNSU, 'max', batch.maxNSU, 'docs', batch.docs.length);

    if (batch.cStat === '656') {
      const until = writeCooldown();
      console.error('SEFAZ 656 consumo indevido — abort; cooldown until', new Date(until).toISOString());
      process.exitCode = 2;
      break;
    }

    for (const doc of batch.docs) {
      if (!doc.schema.startsWith('procCTe')) {
        skipped++;
        continue;
      }
      try {
        const xml = (await gunzip(Buffer.from(doc.b64, 'base64'))).toString('utf8');
        const dh = (xml.match(/<dhEmi>([^<]+)/) || [])[1];
        const skipBefore = process.env.SKIP_BEFORE; // ISO date YYYY-MM-DD
        if (skipBefore && dh && dh.slice(0, 10) < skipBefore) { skipped++; continue; }
        const ch = (xml.match(/Id="CTe(\d{44})"/) || xml.match(/<chCTe>(\d{44})/) || [])[1];
        const nCT = (xml.match(/<nCT>([^<]+)/) || [])[1];
        const skipNotification = !isFreshForNotify(dh);
        let result;
        for (let attempt = 0; attempt < 4; attempt++) {
          result = await ingestXml(xml, `cte-${nCT || ch || 'doc'}.xml`, { skipNotification });
          if (result.status !== 429) break;
          const wait = 15000 * (attempt + 1);
          console.log('RATE429', nCT, 'retry_in_ms', wait);
          await new Promise((r) => setTimeout(r, wait));
        }
        const successes = result.json?.results?.success?.length || 0;
        const errs = result.json?.results?.errors || [];
        const msg = result.json?.message || '';
        const duplicate = errs.some((e) => /unique|existe|duplicate|já/i.test(String(e)));
        const ok = result.status >= 200 && result.status < 300 && (successes > 0 || duplicate || /sucesso/i.test(msg));
        console.log(
          ok ? (duplicate ? 'SKIP_DUP' : skipNotification ? 'INGEST_SILENT' : 'INGEST') : 'FAIL',
          nCT,
          dh,
          ch,
          result.status,
          JSON.stringify(result.json).slice(0, 220),
        );
        if (ok && !duplicate) {
          imported++;
          // Until upload honors skipNotification / age-gate, kill outbox rows
          // that the live container still enqueues for stale CT-es.
          // Prefer status semantics: age-gate now live in app — keep as dead
          // with explicit suppressed prefix for metrics filters.
          if (skipNotification && ch) {
            const killed = await suppressOutboxForAccessKey(
              ch,
              `Suppressed: DistDFe silent ingest (dhEmi older than ${NOTIFY_MAX_AGE_HOURS}h)`,
            );
            if (killed > 0) console.log('OUTBOX_SUPPRESSED', nCT, ch, killed);
          }
        } else if (duplicate) skipped++;
        else errors++;
        // Upload API rate-limits aggressively; space ingest + retry 429.
        await new Promise((r) => setTimeout(r, Number(process.env.CTE_INGEST_DELAY_MS || 1200)));
      } catch (e) {
        errors++;
        console.error('doc_error', e.message);
      }
    }

    if (batch.ultNSU) {
      writeNsu(batch.ultNSU);
      ult = String(Number(batch.ultNSU));
    }
    if (batch.cStat === '137' || !batch.docs.length) break;
    if (batch.maxNSU && batch.ultNSU && Number(batch.ultNSU) >= Number(batch.maxNSU)) break;
  }

  console.log(new Date().toISOString(), 'done', { imported, skipped, errors, ultNSU: readNsu() });
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
