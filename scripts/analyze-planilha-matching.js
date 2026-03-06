#!/usr/bin/env node
/**
 * Matching bidirecional completo — máxima cobertura.
 *
 * Sinais de matching (acumulativos):
 *   +50  Referência (col 1) == DB code (exato)
 *   +35  Referência (col 1) está em product_refs do DB
 *   +30  Referência (col 1) == código prefixo da description do DB ("ICV1209 - VALVULA...")
 *   +30  ANVISA match
 *   +25  Chave de modelo: DOKIMOS/P-2010/ICV/CROWN/TLPB extraída do DB desc == extraída da planilha ref
 *   ov*20  Token overlap (se ov ≥ 0.40)
 *   +5   Nome normalizado exato
 *
 *   MIN_SCORE = 30 para aceitar match
 */

const XLSX = require('xlsx');
const fs   = require('fs');

function norm(s) {
  return String(s || '').toUpperCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}
function clean(s) {
  return norm(s)
    .replace(/^POSICAO\s+\d+\s+/, '')   // "Posicao: 000 BIOPROTESE..." → "BIOPROTESE..."
    .replace(/^\(\d+\)\s*/, '')
    .replace(/^\d+\s*-\s*/, '')
    .replace(/^\d+\s+/, '')
    .trim();
}
function tokenOverlap(a, b) {
  const ta = new Set(a.split(' ').filter(t => t.length > 2));
  const tb = new Set(b.split(' ').filter(t => t.length > 2));
  if (!ta.size || !tb.size) return 0;
  let c = 0; for (const t of ta) if (tb.has(t)) c++;
  return c / Math.max(ta.size, tb.size);
}
function parseCSV(text) {
  const lines = text.split('\n');
  const headers = lines[0].split(',').map(h => h.replace(/^"|"$/g, '').trim());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const vals = []; let cur = '', inQ = false;
    for (const ch of lines[i] + ',') {
      if (ch === '"') { inQ = !inQ; continue; }
      if (ch === ',' && !inQ) { vals.push(cur); cur = ''; continue; }
      cur += ch;
    }
    if (vals.length < headers.length) continue;
    const row = {}; headers.forEach((h, idx) => { row[h] = vals[idx] || ''; });
    rows.push(row);
  }
  return rows;
}

// ── Model key extractors ──────────────────────────────────────────────────────
// Returns a canonical key for product grouping (e.g. "DOKIMOS_A_25", "P2010_M_29")
function extractModelKey(s) {
  const u = norm(s);
  let m;
  m = u.match(/DOKIMOS\s+PLUS\s*[-–]?\s*([AM])\s+(\d+)/);
  if (m) return 'DOKIMOS_' + m[1] + '_' + m[2];
  m = u.match(/DOKIMOS\s+PLUS[-–]([AM])[-–]?\s*(\d+)/);
  if (m) return 'DOKIMOS_' + m[1] + '_' + m[2];
  // P-2010: handles "P-2010 23A", "P-201023A", "P 2010 23A" after norm()
  m = u.match(/P\s*[-–]?\s*2010\s*(\d+)\s*([AM])/);
  if (m) return 'P2010_' + m[2] + '_' + m[1];
  m = u.match(/TLPB[-–\s]+([AM])\s+(\d+)/);
  if (m) return 'TLPB_' + m[1] + '_' + m[2];
  m = u.match(/CROWN\s+(\d+)\s*MM/);
  if (m) return 'CROWN_' + m[1];
  m = u.match(/(?:^|\s)(ICV\d{4}[^\s]*)/);
  if (m) return 'ICV_' + m[1].replace(/^ICV/, '');
  return null;
}

// Extract alphanumeric code prefix from description: "ICV1209 - VALVULA..." → "ICV1209"
function extractDescCode(desc) {
  if (!desc) return null;
  // Pattern: starts with alphanumeric token (at least 3 chars, includes letter+digit) followed by dash
  const m = desc.match(/^([A-Z0-9]{3,})\s*[-–]/i);
  if (m && /[A-Z]/i.test(m[1]) && /[0-9]/.test(m[1])) return m[1].toUpperCase();
  // Pure numeric prefix
  const m2 = desc.match(/^(\d{4,})\s*[-–]/);
  if (m2) return m2[1];
  return null;
}

function main() {
  // ── Planilha ─────────────────────────────────────────────────────────────────
  const wb = XLSX.readFile('List_Produtos_Cad_20260227_144022.XLSX');
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rawRows = XLSX.utils.sheet_to_json(ws, { header: 1 });
  const sheet = [];
  for (let i = 7; i < rawRows.length; i++) {
    const r = rawRows[i]; if (!r || !r[2]) continue;
    const av = r[8] != null ? String(r[8]).replace(/\D/g, '') : '';
    const ref = r[1] != null ? String(r[1]).trim() : null;
    const produto = r[2] != null ? String(r[2]).trim() : null;
    const tipo = r[6] != null ? String(r[6]).trim() : null;
    const refUp = ref ? ref.toUpperCase().trim() : null;
    sheet.push({
      codInt:     r[0] != null ? String(r[0]).trim() : null,
      ref, refUp,
      produto,  _cn: clean(produto),
      _modelKey: extractModelKey(ref) || extractModelKey(produto),
      fab:        r[4] != null ? String(r[4]).trim() || null : null,
      fornPad:    r[5] != null ? String(r[5]).trim() || null : null,
      tipo, subtipo: r[7] != null ? String(r[7]).trim() || null : null,
      anvisa: av.length === 11 ? av : null,
      ncm:        r[9]  != null ? String(r[9]).trim()  || null : null,
      trib:       r[10] != null ? String(r[10]).trim() || null : null,
      obsIcms:    r[11] != null ? String(r[11]).trim() || null : null,
      cstIcms:    r[12] != null ? String(r[12]).trim() || null : null,
      icms:       r[14] != null && r[14] !== '' ? Number(r[14]) : null,
      obsPisCof:  r[16] != null ? String(r[16]).trim() || null : null,
      pis:        r[17] != null && r[17] !== '' ? Number(r[17]) : null,
      cstPis:     r[19] != null ? String(r[19]).trim() || null : null,
      cofins:     r[21] != null && r[21] !== '' ? Number(r[21]) : null,
      cstCofins:  r[23] != null ? String(r[23]).trim() || null : null,
      ipi:        r[25] != null && r[25] !== '' ? Number(r[25]) : null,
      outOfLine: tipo ? tipo.toUpperCase().includes('FORA') : false,
      _row: i,
    });
  }

  // ── DB ───────────────────────────────────────────────────────────────────────
  const dbRows = parseCSV(fs.readFileSync('/tmp/db_products.csv', 'utf8'));
  for (const r of dbRows) {
    r._ool  = r.out_of_line === 't';
    r._refs = r.product_refs_str ? r.product_refs_str.split('|').map(x => x.trim()).filter(Boolean) : [];
    r._cn   = clean(r.description);
    r._cu   = r.code ? r.code.toUpperCase().trim() : null;
    r._inv  = parseInt(r.agg_invoice_count) || 0;
    r._descCode = extractDescCode(r.description);
    r._modelKey = extractModelKey(r.description) || (r.code ? extractModelKey(r.code) : null);
  }

  console.log(`\n📋 Planilha: ${sheet.length} (in-line: ${sheet.filter(s=>!s.outOfLine).length})`);
  console.log(`🗄️  DB: ${dbRows.length} (in-line: ${dbRows.filter(r=>!r._ool).length})`);

  // ── Build indexes ─────────────────────────────────────────────────────────────
  const spByAnvisa   = new Map();
  const spByRef      = new Map(); // ref uppercase → [sp]
  const spByModelKey = new Map(); // model key → [sp]

  for (const sp of sheet) {
    if (sp.anvisa) {
      if (!spByAnvisa.has(sp.anvisa)) spByAnvisa.set(sp.anvisa, []);
      spByAnvisa.get(sp.anvisa).push(sp);
    }
    if (sp.refUp) {
      if (!spByRef.has(sp.refUp)) spByRef.set(sp.refUp, []);
      spByRef.get(sp.refUp).push(sp);
    }
    if (sp._modelKey) {
      if (!spByModelKey.has(sp._modelKey)) spByModelKey.set(sp._modelKey, []);
      spByModelKey.get(sp._modelKey).push(sp);
    }
  }

  // ── Score function ────────────────────────────────────────────────────────────
  function scoreMatch(db, sp) {
    let s = 0, reasons = [];
    // Referência == DB code
    if (db._cu && sp.refUp && db._cu === sp.refUp) {
      s += 50; reasons.push('ref');
    } else if (sp.refUp && db._refs.some(r => r.toUpperCase() === sp.refUp)) {
      s += 35; reasons.push('ref_in_refs');
    } else if (db._descCode && sp.refUp && db._descCode === sp.refUp) {
      // Description prefix code matches ref (e.g. DB: "ICV1209 - VALVULA..." → sp.ref="ICV1209")
      s += 30; reasons.push('desc_code_ref');
    } else if (db._cu && sp.refUp && db._cu.replace(/\.$/, '') === sp.refUp.replace(/\.$/, '')) {
      // Trailing dot difference (e.g. "10304.00." vs "10304.00")
      s += 45; reasons.push('ref_dot');
    }
    // ANVISA
    if (db.anvisa_code && sp.anvisa && db.anvisa_code === sp.anvisa) {
      s += 30; reasons.push('anvisa');
    }
    // Model key match (DOKIMOS, P-2010, ICV, etc.)
    if (db._modelKey && sp._modelKey && db._modelKey === sp._modelKey) {
      s += 25; reasons.push('model_key');
    }
    // Name overlap
    const ov = tokenOverlap(db._cn, sp._cn);
    if (ov >= 0.40) { s += Math.round(ov * 20); reasons.push(`ov${Math.round(ov*100)}`); }
    if (db._cn && sp._cn && db._cn === sp._cn) { s += 5; reasons.push('name_exact'); }
    return { s, reasons };
  }

  const MIN_SCORE = 30;

  // ── Match DB → best planilha ─────────────────────────────────────────────────
  const dbResults = [];
  for (const db of dbRows) {
    const candSet = new Set();
    // Standard candidates
    if (db.anvisa_code) for (const sp of (spByAnvisa.get(db.anvisa_code) || [])) candSet.add(sp);
    if (db._cu)         for (const sp of (spByRef.get(db._cu) || []))             candSet.add(sp);
    for (const ref of db._refs) for (const sp of (spByRef.get(ref.toUpperCase()) || [])) candSet.add(sp);
    // Description code prefix lookup (ICV1209 etc.)
    if (db._descCode)   for (const sp of (spByRef.get(db._descCode) || []))       candSet.add(sp);
    // Trailing-dot variant
    if (db._cu) {
      const dotless = db._cu.replace(/\.$/, '');
      for (const sp of (spByRef.get(dotless) || []))       candSet.add(sp);
      for (const sp of (spByRef.get(dotless + '.') || [])) candSet.add(sp);
    }
    // Model key
    if (db._modelKey) for (const sp of (spByModelKey.get(db._modelKey) || [])) candSet.add(sp);

    // Name scan (only if still empty and meaningful name)
    if (candSet.size === 0 && db._cn.length > 6) {
      for (const sp of sheet) {
        if (tokenOverlap(db._cn, sp._cn) >= 0.65) candSet.add(sp);
      }
    }

    let bestSp = null, bestScore = 0, bestReasons = [];
    for (const sp of candSet) {
      const { s, reasons } = scoreMatch(db, sp);
      if (s > bestScore) { bestScore = s; bestSp = sp; bestReasons = reasons; }
    }

    const matched = bestSp && bestScore >= MIN_SCORE;
    let method = 'UNMATCHED';
    if (matched) {
      const hasRef = bestReasons.some(r => ['ref','ref_in_refs','desc_code_ref','ref_dot'].includes(r));
      const hasAnv = bestReasons.includes('anvisa');
      const hasMod = bestReasons.includes('model_key');
      const hasOv  = bestReasons.some(r => r.startsWith('ov'));
      const nameEx = bestReasons.includes('name_exact');
      if (hasRef && hasAnv)      method = 'ref+anvisa';
      else if (hasRef && hasMod) method = 'ref+model';
      else if (hasRef)           method = 'ref_only';
      else if (hasAnv && nameEx) method = 'anvisa+name_exact';
      else if (hasAnv && hasOv)  method = 'anvisa+name_sim';
      else if (hasMod && hasOv)  method = 'model+name';
      else if (hasMod)           method = 'model_key';
      else if (hasAnv)           method = 'anvisa_only';
      else if (hasOv || nameEx)  method = 'name_sim';
      else                       method = 'other';
    }
    dbResults.push({ db, sp: matched ? bestSp : null, score: bestScore, method, reasons: bestReasons });
  }

  // ── Stats ─────────────────────────────────────────────────────────────────────
  const matched   = dbResults.filter(r => r.sp);
  const unmatched = dbResults.filter(r => !r.sp);
  const byMethod  = {};
  for (const r of dbResults) byMethod[r.method] = (byMethod[r.method] || 0) + 1;

  const inLineM   = matched.filter(r => !r.db._ool);
  const inLineAll = dbRows.filter(r => !r._ool);
  const outM      = matched.filter(r => r.db._ool);
  const outAll    = dbRows.filter(r => r._ool);

  console.log(`\n✅ DB matched: ${matched.length}/${dbRows.length} (${((matched.length/dbRows.length)*100).toFixed(1)}%)`);
  console.log(`   In-line:     ${inLineM.length}/${inLineAll.length} (${((inLineM.length/inLineAll.length)*100).toFixed(1)}%)`);
  console.log(`   Out-of-line: ${outM.length}/${outAll.length} (${((outM.length/outAll.length)*100).toFixed(1)}%)`);
  console.log('\nPor método:');
  for (const [m, c] of Object.entries(byMethod).sort((a,b)=>b[1]-a[1]))
    console.log(`  ${m.padEnd(25)} ${String(c).padStart(5)}`);

  // Conflicts: planilha row used by >1 DB product with different codes
  const spUsage = new Map();
  for (const r of matched) {
    const k = r.sp._row;
    if (!spUsage.has(k)) spUsage.set(k, []);
    spUsage.get(k).push(r);
  }
  const diffConflicts = [...spUsage.values()].filter(v => new Set(v.map(u=>u.db.code)).size > 1);
  console.log(`\n⚠️  Conflitos reais (planilha row → DB codes diferentes): ${diffConflicts.length}`);

  // Out-of-line mismatch
  const ool_in  = matched.filter(r=>!r.sp.outOfLine && r.db._ool).length;
  const ool_out = matched.filter(r=>r.sp.outOfLine && !r.db._ool).length;
  console.log(`⚠️  out_of_line mismatch: planilha=in→DB=out: ${ool_in}  planilha=out→DB=in: ${ool_out}`);

  // Unmatched detail
  const unmInLine  = unmatched.filter(r=>!r.db._ool);
  const unmOutLine = unmatched.filter(r=>r.db._ool);
  console.log(`\n❌ DB sem match: ${unmatched.length} (in-line: ${unmInLine.length}, out-of-line: ${unmOutLine.length})`);

  // Categorize unmatched in-line
  const unmByCategory = { medical_noAnvisa: [], medical_anvisaNotInSheet: [], nonMedical: [], other_: [] };
  const NON_MEDICAL_KEYWORDS = ['OIL','VID VW','GOL','LONA','LIXA','LUBRIFIC','SIM CARD','BATERIA','IPHONE','SAMSUNG','APPLE','YBSC','DGAP','YGSC','TGSA'];
  for (const r of unmInLine) {
    const d = (r.db.description || '').toUpperCase();
    if (NON_MEDICAL_KEYWORDS.some(k => d.includes(k) || (r.db.code||'').toUpperCase().includes(k))) {
      unmByCategory.nonMedical.push(r);
    } else if (r.db.anvisa_code && !spByAnvisa.has(r.db.anvisa_code)) {
      unmByCategory.medical_anvisaNotInSheet.push(r);
    } else if (!r.db.anvisa_code) {
      unmByCategory.medical_noAnvisa.push(r);
    } else {
      unmByCategory.other_.push(r);
    }
  }
  console.log(`   Não médicos (carro, eletrônico, etc.): ${unmByCategory.nonMedical.length}`);
  console.log(`   Médicos sem ANVISA: ${unmByCategory.medical_noAnvisa.length}`);
  console.log(`   Médicos ANVISA fora da planilha: ${unmByCategory.medical_anvisaNotInSheet.length}`);
  console.log(`   Outros: ${unmByCategory.other_.length}`);

  // ── Unmatched DB in-line — full list ─────────────────────────────────────────
  const unmSorted = [...unmInLine].sort((a,b) => b.db._inv - a.db._inv);
  console.log(`\n${'='.repeat(90)}`);
  console.log(`DB IN-LINE SEM MATCH (${unmInLine.length} produtos)`);
  console.log(`${'='.repeat(90)}`);
  console.log(`${'NF'.padStart(4)} ${'code'.padEnd(22)} ${'description'.padEnd(55)} ANVISA`);
  console.log('-'.repeat(90));
  for (const r of unmSorted) {
    const tag = unmByCategory.nonMedical.includes(r)?'[NM]':
                unmByCategory.medical_anvisaNotInSheet.includes(r)?'[AV]':'    ';
    console.log(`${tag}${String(r.db._inv).padStart(3)} ${r.db.code?.substring(0,22).padEnd(22)} ${r.db.description?.substring(0,55).padEnd(55)} ${r.db.anvisa_code||''}`);
  }

  // ── Planilha in-line sem DB match — full list ─────────────────────────────────
  const spUsedRows2 = new Set(matched.map(r=>r.sp._row));
  const spUnused = sheet.filter(s => !s.outOfLine && !spUsedRows2.has(s._row));
  const spUnusedSorted = [...spUnused].sort((a,b) => (a._row - b._row));
  console.log(`\n${'='.repeat(90)}`);
  console.log(`PLANILHA IN-LINE SEM MATCH NO DB (${spUnused.length} linhas)`);
  console.log(`${'='.repeat(90)}`);
  console.log(`${'Excel'.padEnd(6)} ${'CodInt'.padEnd(8)} ${'Referência'.padEnd(25)} ${'Produto'.padEnd(50)}`);
  console.log('-'.repeat(90));
  for (const sp of spUnusedSorted) {
    const excelRow = sp._row + 1; // 0-based array index → 1-based Excel row
    console.log(`${String(excelRow).padStart(6)} ${(sp.codInt||'').padEnd(8)} ${(sp.ref||'').substring(0,25).padEnd(25)} ${(sp.produto||'').substring(0,50)}`);
  }

  // Final summary
  const highConf = ['ref+anvisa','ref+model','ref_only','anvisa+name_exact'];
  const medConf  = ['anvisa+name_sim','model+name','desc_code_ref'];
  const lowConf  = ['model_key','anvisa_only','name_sim','other'];
  const hc = matched.filter(r=>highConf.includes(r.method)).length;
  const mc = matched.filter(r=>medConf.includes(r.method)).length;
  const lc = matched.filter(r=>lowConf.includes(r.method)).length;
  console.log(`\n📊 CONFIANÇA:`);
  console.log(`   Alta  (${highConf.join('/')}): ${hc}`);
  console.log(`   Média (${medConf.join('/')}): ${mc}`);
  console.log(`   Baixa (${lowConf.join('/')}): ${lc}`);
  console.log(`   Sem match DB in-line: ${unmInLine.length} (${unmByCategory.nonMedical.length} não-médicos)`);
  console.log(`   Sem match planilha in-line: ${spUnused.length}`);
}

main();
