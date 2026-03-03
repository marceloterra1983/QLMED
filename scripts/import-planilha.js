#!/usr/bin/env node
/**
 * import-planilha.js — Sincroniza a planilha com o product_registry.
 *
 * Estratégia (simples e idempotente):
 *   • Chave: SP:{codInt}  →  link direto planilha ↔ DB, sem algoritmo de matching
 *   • Campos de catálogo (fabricante, tipo, código, etc.): SEMPRE atualiza da planilha
 *   • Campos fiscais: COALESCE — mantém valor manual já cadastrado; só preenche se NULL
 *   • Deletar linhas do DB cujo codInt não existe mais na planilha
 *   • Inserir linhas novas da planilha que ainda não estão no DB
 *   • out_of_line segue o campo "tipo" da planilha (tipo = "FORA DE LINHA" → true)
 *
 * Uso:
 *   cd ~/QLMED && node scripts/import-planilha.js [--apply]
 */

const XLSX         = require('xlsx');
const fs           = require('fs');
const { execSync } = require('child_process');

const COMPANY_ID   = 'cmlrdunyx0002zthpl4jo7dld';
const SQL_OUT      = '/tmp/import-planilha.sql';
const DB_CONTAINER = 'ssksgwgo40gcok4s44gc0cgw';

const args    = process.argv.slice(2);
const DRY_RUN = !args.includes('--apply');

// ─── SQL helpers ───────────────────────────────────────────────────────────────
function sqlStr(v) {
  if (v == null || v === '') return 'NULL';
  return "'" + String(v).replace(/'/g, "''") + "'";
}
function sqlNum(v) {
  if (v == null || v === '' || isNaN(Number(v))) return 'NULL';
  return String(Number(v));
}
function sqlBool(v) { return v ? 'true' : 'false'; }

// ─── Load planilha ─────────────────────────────────────────────────────────────
async function main() {
  const wb = XLSX.readFile('List_Produtos_Cad_20260227_144022.XLSX');
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rawRows = XLSX.utils.sheet_to_json(ws, { header: 1 });

  const sheet = [];
  for (let i = 7; i < rawRows.length; i++) {
    const r = rawRows[i];
    if (!r || !r[2]) continue;

    const av      = r[8]  != null ? String(r[8]).replace(/\D/g, '')  : '';
    const ref     = r[1]  != null ? String(r[1]).trim() : null;
    const produto = r[2]  != null ? String(r[2]).trim() : null;
    const tipo    = r[6]  != null ? String(r[6]).trim() : null;
    const codInt  = r[0]  != null ? String(r[0]).trim() || null : null;

    if (!codInt) continue; // planilha sem código interno não pode ser chaveada

    sheet.push({
      codInt,
      ref,
      produto,
      fab:       r[4]  != null ? String(r[4]).trim() || null : null,
      fornPad:   r[5]  != null ? String(r[5]).trim() || null : null,
      tipo,
      subtipo:   r[7]  != null ? String(r[7]).trim() || null : null,
      anvisa:    av.length === 11 ? av : null,
      ncm:       r[9]  != null ? String(r[9]).trim()  || null : null,
      trib:      r[10] != null ? String(r[10]).trim() || null : null,
      obsIcms:   r[11] != null ? String(r[11]).trim() || null : null,
      cstIcms:   r[12] != null ? String(r[12]).trim() || null : null,
      icms:      r[14] != null && r[14] !== '' ? Number(r[14]) : null,
      obsPisCof: r[16] != null ? String(r[16]).trim() || null : null,
      pis:       r[17] != null && r[17] !== '' ? Number(r[17]) : null,
      cstPis:    r[19] != null ? String(r[19]).trim() || null : null,
      cofins:    r[21] != null && r[21] !== '' ? Number(r[21]) : null,
      cstCofins: r[23] != null ? String(r[23]).trim() || null : null,
      ipi:       r[25] != null && r[25] !== '' ? Number(r[25]) : null,
      outOfLine: tipo ? tipo.toUpperCase().includes('FORA') : false,
    });
  }

  console.log(`\n📋 Planilha: ${sheet.length} itens (com codInt)`);

  const inlineCount = sheet.filter(sp => !sp.outOfLine).length;
  const oolCount    = sheet.filter(sp =>  sp.outOfLine).length;
  console.log(`   Em linha:      ${inlineCount}`);
  console.log(`   Fora de linha: ${oolCount}`);

  // ─── Gerar SQL ────────────────────────────────────────────────────────────────
  const lines = [];
  lines.push(`-- import-planilha.sql  —  ${new Date().toISOString()}`);
  lines.push(`-- Empresa: ${COMPANY_ID}`);
  lines.push(`-- Itens: ${sheet.length} | Em linha: ${inlineCount} | Fora: ${oolCount}`);
  lines.push('');
  lines.push('BEGIN;');
  lines.push('');

  // 1. Deletar linhas do DB cujo SP:{codInt} não está mais na planilha
  //    Usa tabela temporária para evitar IN clause gigante
  lines.push('-- ══ REMOVER itens que saíram da planilha ══');
  lines.push(`CREATE TEMP TABLE _valid_keys (k TEXT) ON COMMIT DROP;`);
  // Insert in batches of 500 to avoid huge individual statements
  const allKeys = sheet.map(sp => `SP:${sp.codInt}`);
  for (let i = 0; i < allKeys.length; i += 500) {
    const batch = allKeys.slice(i, i + 500).map(k => `(${sqlStr(k)})`).join(', ');
    lines.push(`INSERT INTO _valid_keys VALUES ${batch};`);
  }
  lines.push(
    `DELETE FROM product_registry\n` +
    `WHERE company_id = '${COMPANY_ID}'\n` +
    `  AND product_key NOT IN (SELECT k FROM _valid_keys);`
  );
  lines.push('');

  // 2. UPSERT: INSERT cada item da planilha; ON CONFLICT → UPDATE
  lines.push(`-- ══ UPSERT ${sheet.length} itens da planilha ══`);
  lines.push('');

  for (const sp of sheet) {
    const pk = `SP:${sp.codInt}`;
    lines.push(`-- codInt:${sp.codInt} ref:${sp.ref||''} — ${(sp.produto||'').substring(0, 60)}`);
    lines.push(
      `INSERT INTO product_registry (\n` +
      `  id, company_id, product_key,\n` +
      `  code, description, ncm, anvisa_code,\n` +
      `  product_type, product_subtype, manufacturer_short_name, default_supplier,\n` +
      `  out_of_line, codigo,\n` +
      `  fiscal_nome_tributacao, fiscal_sit_tributaria,\n` +
      `  fiscal_obs_icms, fiscal_icms,\n` +
      `  fiscal_obs_pis_cofins, fiscal_pis, fiscal_cst_pis,\n` +
      `  fiscal_cofins, fiscal_cst_cofins, fiscal_ipi,\n` +
      `  created_at, updated_at\n` +
      `) VALUES (\n` +
      `  gen_random_uuid(), '${COMPANY_ID}', ${sqlStr(pk)},\n` +
      `  ${sqlStr(sp.ref)}, ${sqlStr(sp.produto)}, ${sqlStr(sp.ncm)}, ${sqlStr(sp.anvisa)},\n` +
      `  ${sqlStr(sp.tipo)}, ${sqlStr(sp.subtipo)}, ${sqlStr(sp.fab)}, ${sqlStr(sp.fornPad)},\n` +
      `  ${sqlBool(sp.outOfLine)}, ${sqlStr(sp.codInt)},\n` +
      `  ${sqlStr(sp.trib)}, ${sqlStr(sp.cstIcms)},\n` +
      `  ${sqlStr(sp.obsIcms)}, ${sqlNum(sp.icms)},\n` +
      `  ${sqlStr(sp.obsPisCof)}, ${sqlNum(sp.pis)}, ${sqlStr(sp.cstPis)},\n` +
      `  ${sqlNum(sp.cofins)}, ${sqlStr(sp.cstCofins)}, ${sqlNum(sp.ipi)},\n` +
      `  NOW(), NOW()\n` +
      `)\n` +
      `ON CONFLICT (company_id, product_key) DO UPDATE SET\n` +
      // Campos de catálogo: sempre da planilha
      `  code                  = EXCLUDED.code,\n` +
      `  description           = EXCLUDED.description,\n` +
      `  ncm                   = EXCLUDED.ncm,\n` +
      `  anvisa_code           = COALESCE(product_registry.anvisa_code, EXCLUDED.anvisa_code),\n` +
      `  product_type          = EXCLUDED.product_type,\n` +
      `  product_subtype       = EXCLUDED.product_subtype,\n` +
      `  manufacturer_short_name = EXCLUDED.manufacturer_short_name,\n` +
      `  default_supplier      = EXCLUDED.default_supplier,\n` +
      `  out_of_line           = EXCLUDED.out_of_line,\n` +
      `  codigo                = EXCLUDED.codigo,\n` +
      // Campos fiscais: COALESCE — preserva cadastro manual, só preenche se NULL
      `  fiscal_nome_tributacao  = COALESCE(product_registry.fiscal_nome_tributacao,  EXCLUDED.fiscal_nome_tributacao),\n` +
      `  fiscal_sit_tributaria   = COALESCE(product_registry.fiscal_sit_tributaria,   EXCLUDED.fiscal_sit_tributaria),\n` +
      `  fiscal_obs_icms         = COALESCE(product_registry.fiscal_obs_icms,         EXCLUDED.fiscal_obs_icms),\n` +
      `  fiscal_icms             = COALESCE(product_registry.fiscal_icms,             EXCLUDED.fiscal_icms),\n` +
      `  fiscal_obs_pis_cofins   = COALESCE(product_registry.fiscal_obs_pis_cofins,   EXCLUDED.fiscal_obs_pis_cofins),\n` +
      `  fiscal_pis              = COALESCE(product_registry.fiscal_pis,              EXCLUDED.fiscal_pis),\n` +
      `  fiscal_cst_pis          = COALESCE(product_registry.fiscal_cst_pis,          EXCLUDED.fiscal_cst_pis),\n` +
      `  fiscal_cofins           = COALESCE(product_registry.fiscal_cofins,           EXCLUDED.fiscal_cofins),\n` +
      `  fiscal_cst_cofins       = COALESCE(product_registry.fiscal_cst_cofins,       EXCLUDED.fiscal_cst_cofins),\n` +
      `  fiscal_ipi              = COALESCE(product_registry.fiscal_ipi,              EXCLUDED.fiscal_ipi),\n` +
      `  updated_at              = NOW();`
    );
    lines.push('');
  }

  lines.push('COMMIT;');

  const sql = lines.join('\n');
  fs.writeFileSync(SQL_OUT, sql, 'utf8');
  console.log(`\n📄 SQL: ${SQL_OUT} (${Math.round(sql.length / 1024)}KB, ${sheet.length} UPSERTs)`);

  if (DRY_RUN) {
    console.log('\n⚠️  Dry-run. Para aplicar: node scripts/import-planilha.js --apply');
  } else {
    console.log('\n🚀 Aplicando...');
    try {
      execSync(
        `docker exec -i ${DB_CONTAINER} psql -U postgres -d postgres -v ON_ERROR_STOP=1 < ${SQL_OUT}`,
        { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] }
      );
      console.log('✅ Aplicado!');
    } catch (e) {
      const stderr = e.stderr || e.message || '';
      console.error('❌ Erro:', stderr.split('\n').filter(l => l.includes('ERROR')).join('\n') || stderr.substring(0, 500));
      process.exit(1);
    }
  }
}

main().catch(e => { console.error(e); process.exit(1); });
