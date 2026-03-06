#!/usr/bin/env node
/**
 * sync-anvisa-opendata.js
 *
 * Baixa o CSV de dados abertos da ANVISA e enriquece o product_registry com:
 *   • anvisa_matched_product_name  (NOME_COMERCIAL)
 *   • anvisa_holder                (DETENTOR_REGISTRO_CADASTRO)
 *   • anvisa_process               (NUMERO_PROCESSO)
 *   • anvisa_status                (Vigente / Vencido / Cancelado …)
 *   • anvisa_expiration            (VALIDADE_REGISTRO_CADASTRO, quando data)
 *   • anvisa_risk_class            (CLASSE_RISCO)
 *   • anvisa_manufacturer          (NOME_FABRICANTE)
 *   • anvisa_manufacturer_country  (NOME_PAIS_FABRIC)
 *   • anvisa_synced_at             = NOW()
 *
 * Uso:
 *   cd ~/QLMED && node scripts/sync-anvisa-opendata.js [--apply]
 *
 * Arquivo CSV salvo em /tmp/anvisa-opendata.csv (reusado se < 7 dias)
 */

const { execSync } = require('child_process');
const fs   = require('fs');
const path = require('path');
const https = require('https');

const COMPANY_ID   = 'cmlrdunyx0002zthpl4jo7dld';
const DB_CONTAINER = 'ssksgwgo40gcok4s44gc0cgw';
const CSV_PATH     = '/tmp/anvisa-opendata.csv';
const CSV_URL      = 'https://dados.anvisa.gov.br/dados/TA_PRODUTO_SAUDE_SITE.csv';
const CSV_MAX_AGE  = 7 * 24 * 60 * 60 * 1000; // 7 dias em ms
const SQL_OUT      = '/tmp/sync-anvisa-opendata.sql';

const args    = process.argv.slice(2);
const DRY_RUN = !args.includes('--apply');

// ─── Download CSV ────────────────────────────────────────────────────────────
async function downloadCsv() {
  const needsDownload = !fs.existsSync(CSV_PATH) ||
    (Date.now() - fs.statSync(CSV_PATH).mtimeMs) > CSV_MAX_AGE;

  if (!needsDownload) {
    const ageDays = ((Date.now() - fs.statSync(CSV_PATH).mtimeMs) / 86400000).toFixed(1);
    console.log(`   ♻  Reusando CSV em cache (${ageDays} dias atrás)`);
    return;
  }

  console.log(`   ⬇  Baixando CSV da ANVISA...`);
  await new Promise((resolve, reject) => {
    const file = fs.createWriteStream(CSV_PATH);
    const req = https.get(CSV_URL, { rejectUnauthorized: false }, (res) => {
      if (res.statusCode !== 200) { reject(new Error(`HTTP ${res.statusCode}`)); return; }
      const total = parseInt(res.headers['content-length'] || '0');
      let received = 0;
      res.on('data', (chunk) => {
        received += chunk.length;
        if (total) process.stdout.write(`\r      ${(received/1024/1024).toFixed(1)}/${(total/1024/1024).toFixed(1)} MB`);
      });
      res.pipe(file);
      file.on('finish', () => { file.close(); process.stdout.write('\n'); resolve(); });
    });
    req.on('error', reject);
  });
  console.log(`   ✓  CSV salvo em ${CSV_PATH}`);
}

// ─── Parse CSV ───────────────────────────────────────────────────────────────
// Colunas: NUMERO_REGISTRO_CADASTRO;NUMERO_PROCESSO;NOME_TECNICO;CLASSE_RISCO;
//          NOME_COMERCIAL;CNPJ_DETENTOR;DETENTOR;NOME_FABRICANTE;NOME_PAIS_FABRIC;
//          DT_PUB;VALIDADE;DT_ATUALIZACAO
function parseCsv() {
  const raw  = fs.readFileSync(CSV_PATH);
  const text = raw.toString('latin1');
  const lines = text.split('\n');

  // Build map: padded-11-digit-code → item (last wins for duplicates by recency)
  const byCode = new Map();

  for (let i = 1; i < lines.length; i++) {
    const l = lines[i].trim();
    if (!l) continue;
    const p = l.split(';');
    const raw_reg = (p[0] || '').replace(/\D/g, '');
    if (!raw_reg) continue;
    const code = raw_reg.padStart(11, '0');

    const validade = (p[10] || '').trim(); // "VIGENTE" ou "DD/MM/YYYY" ou "CANCELADO/INDEFERIDO/…"

    let status = null;
    let expiration = null;

    if (!validade || validade.toUpperCase() === 'VIGENTE') {
      status = 'Vigente';
    } else if (/^\d{2}\/\d{2}\/\d{4}$/.test(validade)) {
      // Parse date DD/MM/YYYY
      const [d, m, y] = validade.split('/');
      const dt = new Date(`${y}-${m}-${d}`);
      expiration = `${y}-${m}-${d}`; // ISO
      status = dt >= new Date() ? 'Vigente' : 'Vencido';
    } else {
      // "CANCELADO", "INDEFERIDO", etc.
      status = validade;
    }

    const item = {
      nomeProduto:      (p[4] || '').trim() || (p[2] || '').trim() || null,
      nomeEmpresa:      (p[6] || '').trim() || null,
      processo:         (p[1] || '').trim() || null,
      situacao:         status,
      vencimento:       expiration,
      classeRisco:      (p[3] || '').trim() || null,
      nomeFabricante:   (p[7] || '').trim() || null,
      paisFabricante:   (p[8] || '').trim() || null,
    };

    // Prefer vigente entries — don't overwrite a Vigente with Vencido
    const existing = byCode.get(code);
    if (!existing || existing.situacao !== 'Vigente' || item.situacao === 'Vigente') {
      byCode.set(code, item);
    }
  }

  return byCode;
}

// ─── SQL helpers ─────────────────────────────────────────────────────────────
function q(v) {
  if (v == null) return 'NULL';
  return "'" + String(v).replace(/'/g, "''") + "'";
}

// ─── Main ────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n🔄 sync-anvisa-opendata.js\n');

  // 1. Download CSV
  await downloadCsv();

  // 2. Parse
  process.stdout.write('   📖 Parseando CSV...');
  const byCode = parseCsv();
  console.log(` ${byCode.size.toLocaleString()} registros únicos`);

  // 3. Fetch products with anvisa_code (excluding N/A)
  const csv = execSync(
    `docker exec -i ${DB_CONTAINER} psql -U postgres -d postgres -t -A -F'|' -c ` +
    `"SELECT id, codigo, anvisa_code FROM product_registry ` +
    `WHERE company_id='${COMPANY_ID}' AND anvisa_code IS NOT NULL AND anvisa_code != '' AND anvisa_code != 'N/A'"`,
    { encoding: 'utf8' }
  );

  const products = csv.trim().split('\n').filter(Boolean).map(l => {
    const p = l.split('|');
    return { id: p[0], codigo: p[1], code: (p[2] || '').replace(/\D/g, '').padStart(11, '0') };
  });

  console.log(`   📋 Produtos com código ANVISA: ${products.length}`);

  let matched = 0, noMatch = 0;
  const sqlLines = [
    `-- sync-anvisa-opendata.sql — ${new Date().toISOString()}`,
    `-- CSV: ${CSV_PATH} | Registros ANVISA: ${byCode.size} | Produtos: ${products.length}`,
    '', 'BEGIN;', ''
  ];

  for (const pr of products) {
    const item = byCode.get(pr.code);
    if (!item) { noMatch++; continue; }
    matched++;

    sqlLines.push(
      `UPDATE product_registry SET ` +
      `anvisa_matched_product_name=${q(item.nomeProduto)}, ` +
      `anvisa_holder=${q(item.nomeEmpresa)}, ` +
      `anvisa_process=${q(item.processo)}, ` +
      `anvisa_status=${q(item.situacao)}, ` +
      `anvisa_expiration=${item.vencimento ? q(item.vencimento) : 'NULL'}, ` +
      `anvisa_risk_class=${q(item.classeRisco)}, ` +
      `anvisa_manufacturer=${q(item.nomeFabricante)}, ` +
      `anvisa_manufacturer_country=${q(item.paisFabricante)}, ` +
      `anvisa_synced_at=NOW(), updated_at=NOW() ` +
      `WHERE id=${q(pr.id)};`
    );
  }

  sqlLines.push('', 'COMMIT;');

  const sql = sqlLines.join('\n');
  fs.writeFileSync(SQL_OUT, sql, 'utf8');

  console.log(`\n📊 Resultado:`);
  console.log(`   Enriquecidos:  ${matched}`);
  console.log(`   Sem match:     ${noMatch}`);
  console.log(`\n📄 SQL: ${SQL_OUT}`);

  if (DRY_RUN) {
    console.log('⚠️  Dry-run. Para aplicar: node scripts/sync-anvisa-opendata.js --apply\n');
  } else {
    console.log('🚀 Aplicando...');
    execSync(
      `docker exec -i ${DB_CONTAINER} psql -U postgres -d postgres -v ON_ERROR_STOP=1 < ${SQL_OUT}`,
      { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 }
    );
    console.log('✅ Aplicado!\n');

    // Show status breakdown
    const stats = execSync(
      `docker exec -i ${DB_CONTAINER} psql -U postgres -d postgres -t -A -F'|' -c ` +
      `"SELECT anvisa_status, count(*) FROM product_registry ` +
      `WHERE company_id='${COMPANY_ID}' AND anvisa_status IS NOT NULL ` +
      `GROUP BY 1 ORDER BY 2 DESC"`,
      { encoding: 'utf8' }
    );
    console.log('   Status ANVISA no banco:');
    stats.trim().split('\n').filter(Boolean).forEach(l => {
      const [status, count] = l.split('|');
      console.log(`   ${(status || '').padEnd(20)} ${count}`);
    });
    console.log('');
  }
}

main().catch(e => { console.error(e); process.exit(1); });
