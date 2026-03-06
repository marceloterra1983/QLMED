#!/usr/bin/env node
/**
 * update-ool-instrumental.js
 *
 * Usa Rel_Produtos_2026_211810.XLSX para definir:
 *   • out_of_line = false  para produtos cujo codigo aparece na planilha
 *   • out_of_line = true   para produtos cujo codigo NÃO aparece
 *   • instrumental = true  onde coluna "Instrumental" = "Sim"
 *   • instrumental = false nos demais
 *
 * Uso:
 *   cd ~/QLMED && node scripts/update-ool-instrumental.js [--apply]
 */

const XLSX         = require('xlsx');
const fs           = require('fs');
const { execSync } = require('child_process');

const COMPANY_ID   = 'cmlrdunyx0002zthpl4jo7dld';
const SQL_OUT      = '/tmp/update-ool-instrumental.sql';
const DB_CONTAINER = 'ssksgwgo40gcok4s44gc0cgw';
const PLANILHA     = 'Rel_Produtos_2026_211810.XLSX';

const args    = process.argv.slice(2);
const DRY_RUN = !args.includes('--apply');

// ─── Load planilha ─────────────────────────────────────────────────────────
const wb   = XLSX.readFile(PLANILHA);
const ws   = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });

// Header is row index 2; data starts at row index 3
const data = rows.slice(3).filter(r => r && r[0]);

// Build map: codigo → instrumental (true/false)
const emLinha = new Map(); // codigo → instrumental
for (const r of data) {
  const codigo = String(r[0]).trim();
  const instr  = String(r[7] || '').trim().toLowerCase() === 'sim';
  if (codigo) emLinha.set(codigo, instr);
}

console.log(`\n📋 Planilha: ${emLinha.size} produtos EM LINHA`);
console.log(`   Instrumentais (Sim): ${[...emLinha.values()].filter(Boolean).length}`);

// ─── Build SQL ──────────────────────────────────────────────────────────────
const lines = [];
lines.push(`-- update-ool-instrumental.sql — ${new Date().toISOString()}`);
lines.push(`-- Empresa: ${COMPANY_ID}`);
lines.push(`-- Planilha: ${PLANILHA}`);
lines.push(`-- Em linha: ${emLinha.size} | Instrumentais: ${[...emLinha.values()].filter(Boolean).length}`);
lines.push('');
lines.push('BEGIN;');
lines.push('');

// Temp table with em-linha códigos
lines.push('-- ══ Em linha: códigos presentes na planilha ══');
lines.push(`CREATE TEMP TABLE _em_linha (codigo TEXT, instrumental BOOLEAN) ON COMMIT DROP;`);

const emLinhaEntries = [...emLinha.entries()];
const BATCH = 500;
for (let i = 0; i < emLinhaEntries.length; i += BATCH) {
  const batch = emLinhaEntries.slice(i, i + BATCH)
    .map(([c, inst]) => `('${c.replace(/'/g, "''")}', ${inst})`)
    .join(', ');
  lines.push(`INSERT INTO _em_linha VALUES ${batch};`);
}
lines.push('');

// UPDATE em linha
lines.push('-- ══ SET out_of_line = false + instrumental para produtos EM LINHA ══');
lines.push(
  `UPDATE product_registry pr\n` +
  `SET    out_of_line  = false,\n` +
  `       instrumental = el.instrumental,\n` +
  `       updated_at   = NOW()\n` +
  `FROM   _em_linha el\n` +
  `WHERE  pr.company_id = '${COMPANY_ID}'\n` +
  `  AND  pr.codigo     = el.codigo;`
);
lines.push('');

// UPDATE fora de linha
lines.push('-- ══ SET out_of_line = true + instrumental = false para produtos FORA DA PLANILHA ══');
lines.push(
  `UPDATE product_registry\n` +
  `SET    out_of_line  = true,\n` +
  `       instrumental = false,\n` +
  `       updated_at   = NOW()\n` +
  `WHERE  company_id = '${COMPANY_ID}'\n` +
  `  AND  codigo IS NOT NULL\n` +
  `  AND  codigo NOT IN (SELECT codigo FROM _em_linha);`
);
lines.push('');

// Summary query
lines.push('-- ══ Verificação ══');
lines.push(
  `SELECT out_of_line, instrumental, count(*)\n` +
  `FROM   product_registry\n` +
  `WHERE  company_id = '${COMPANY_ID}'\n` +
  `GROUP  BY out_of_line, instrumental\n` +
  `ORDER  BY out_of_line, instrumental;`
);
lines.push('');
lines.push('COMMIT;');

const sql = lines.join('\n');
fs.writeFileSync(SQL_OUT, sql, 'utf8');
console.log(`\n📄 SQL: ${SQL_OUT} (${Math.round(sql.length / 1024)}KB)`);

if (DRY_RUN) {
  console.log('\n⚠️  Dry-run. Para aplicar: node scripts/update-ool-instrumental.js --apply');
} else {
  console.log('\n🚀 Aplicando...');
  try {
    const out = execSync(
      `docker exec -i ${DB_CONTAINER} psql -U postgres -d postgres -v ON_ERROR_STOP=1 < ${SQL_OUT}`,
      { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] }
    );
    console.log('✅ Aplicado!');
    // Print summary table
    const lines = (out || '').split('\n').filter(l => l.trim());
    const tableStart = lines.findIndex(l => l.includes('out_of_line'));
    if (tableStart >= 0) console.log('\n' + lines.slice(tableStart).join('\n'));
  } catch (e) {
    const stderr = e.stderr || e.message || '';
    console.error('❌ Erro:', stderr.split('\n').filter(l => l.includes('ERROR')).join('\n') || stderr.substring(0, 500));
    process.exit(1);
  }
}
