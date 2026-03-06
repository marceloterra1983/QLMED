#!/usr/bin/env node
/**
 * anvisa-sweep.js
 *
 * Varredura ANVISA nos produtos em linha sem anvisa_code:
 *   1. Classifica N/A (instrumentais, equipamentos, veículos, acessórios sem registro)
 *   2. Para os demais, busca no ANVISA consultas API por descrição/código
 *   3. Gera SQL com UPDATE (anvisa_code = 'N/A' ou o registro encontrado)
 *
 * Uso:
 *   cd ~/QLMED && node scripts/anvisa-sweep.js [--apply]
 */

const { execSync } = require('child_process');
const fs = require('fs');

const COMPANY_ID   = 'cmlrdunyx0002zthpl4jo7dld';
const SQL_OUT      = '/tmp/anvisa-sweep.sql';
const DB_CONTAINER = 'ssksgwgo40gcok4s44gc0cgw';
const args         = process.argv.slice(2);
const DRY_RUN      = !args.includes('--apply');

// ─── Fetch DB rows ──────────────────────────────────────────────────────────
const csv = execSync(
  `docker exec -i ${DB_CONTAINER} psql -U postgres -d postgres -t -A -F'|' -c ` +
  `"SELECT codigo, code, description, product_type, product_subtype, manufacturer_short_name ` +
  `FROM product_registry ` +
  `WHERE company_id='${COMPANY_ID}' ` +
  `AND (anvisa_code IS NULL OR anvisa_code='') ` +
  `AND out_of_line=false ` +
  `ORDER BY product_subtype, codigo"`,
  { encoding: 'utf8' }
);
const products = csv.trim().split('\n').filter(Boolean).map(l => {
  const p = l.split('|');
  return {
    codigo: p[0], code: (p[1]||'').trim(),
    desc: (p[2]||'').trim(), tipo: (p[3]||'').trim(),
    sub: (p[4]||'').trim(), fab: (p[5]||'').trim(),
  };
});

console.log(`\n📋 Produtos em linha sem ANVISA: ${products.length}`);

// ─── N/A classification ─────────────────────────────────────────────────────
// Keywords na descrição que indicam instrumental/acessório sem necessidade de RVS
const NA_DESC_KEYWORDS = [
  'MARTELO', 'CABO PARA', 'CABO P/', 'CABO PACIENTE',
  'SUPORTE PARA TRANSDUTOR', 'PLATE PARA TRANSDUTOR', 'SUPORTE TROCADOR',
  'SUPORTE DE CARTUCHO', 'CILINDRO DE GAS', 'CILINDRO GAS',
  'KIT MEDIDOR', 'KIT INSTRUMENTAL',
  'SERRA P/', 'SERRA PARA',
  'AFASTADOR', 'FORMAO', 'FORMÃO', 'CURETA', 'RUGINA',
  'MENISCOTOMO', 'MENISCÓTOMO', 'IMPACTOR',
  'DESCOLADOR', 'PINÇA GOIVA', 'PINCA GOIVA', 'PINÇA MARTIN', 'PINCA MARTIN',
  'TESOURA', 'GRASPER', 'GANCHO PARA NERVOS', 'CLAMP PARA',
  'BANDEJA INOX', 'CAIXA INOX',
  'ESTOJO', 'REGULADOR DE PRESSAO', 'REGULADOR DE PRESSÃO',
  'GUIA PROXIMAL', 'ASPIRADOR ULTRASSONICO', 'ASPIRADOR ULTRASSÔNICO',
];

const NA_SUBTYPES_EXTRA = new Set([
  'INSTRUMENAL BUCO', 'CAIXAS DE ORTOPEDIA', 'DRILL - MEDTRONIC',
  'PEÇAS DE MÃO', 'EQUIPAMENTOS - OUTROS', 'SUPORTES', 'MAQUINA DE CEC',
  'CONSOLE DE BOMBA CENTRIFUGA', 'MISTURADOR DE GASES / BLENDER',
  'TROLLEY - ECMO', 'MONITOR MCA', 'MODULO CARDIOPLEGIA',
  'REGULADOR DE VACUO', 'VIGILEO', 'EQUIPAMENTO',
  'ITENS - MEDICALWORLD', // all surgical instruments
]);

function isNA(r) {
  if (r.tipo === '5 - EQUIPAMENTOS') return true;
  if (r.tipo === 'MEDTRONIC') return true;
  if (r.tipo === 'PANAMEDICA') return true;
  if (r.sub.toUpperCase().startsWith('INSTRUMENTAL')) return true;
  if (NA_SUBTYPES_EXTRA.has(r.sub)) return true;
  if (r.fab === 'VW' || r.fab === 'VOLKSWAGEN') return true;
  if (r.fab === 'Muzymed') return true; // all Muzymed = surgical instruments
  const descUp = r.desc.toUpperCase();
  for (const kw of NA_DESC_KEYWORDS) {
    if (descUp.includes(kw)) return true;
  }
  return false;
}

const naProducts   = products.filter(r => isNA(r));
const toSearch     = products.filter(r => !isNA(r));

console.log(`   → N/A (instrumental/equip/veículo): ${naProducts.length}`);
console.log(`   → Busca ANVISA necessária:           ${toSearch.length}`);

// ─── ANVISA API search ──────────────────────────────────────────────────────
function norm(s) {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function extractSearchTerms(r) {
  // Build 2-3 word query from description, removing size/model codes
  const words = r.desc
    .replace(/\d+([.,]\d+)?\s*(MG|ML|G|CM|MM|FR|GA|F|GR|IN|M|L)\b/gi, '')
    .replace(/\b\d{2,}\b/g, '')
    .replace(/[()[\]/\\]/g, ' ')
    .split(/\s+/)
    .map(w => w.trim())
    .filter(w => w.length >= 3 && !/^\d+$/.test(w));
  return words.slice(0, 4).join(' ');
}

async function searchAnvisa(r) {
  const query = encodeURIComponent(extractSearchTerms(r));
  const urls = [
    `https://consultas.anvisa.gov.br/api/saude/equipamento/?count=10&filter[denominacaoGenerica]=${query}`,
    `https://consultas.anvisa.gov.br/api/saude/equipamento/?count=10&filter[nomeProduto]=${query}`,
  ];

  for (const url of urls) {
    try {
      const res = await fetch(url, {
        headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(12000),
      });
      if (!res.ok) continue;
      const json = await res.json();
      const items = json?.content ?? json?.data ?? (Array.isArray(json) ? json : []);
      if (!items.length) continue;

      // Score each result by name similarity
      const descNorm = norm(r.desc);
      let best = null, bestScore = 0;
      for (const item of items) {
        const nome = item.nomeProduto || item.descricaoProduto || '';
        const nomeNorm = norm(nome);
        // token overlap
        const ta = new Set(descNorm.split(/\s+/).filter(t => t.length > 3));
        const tb = new Set(nomeNorm.split(/\s+/).filter(t => t.length > 3));
        if (!ta.size || !tb.size) continue;
        let inter = 0;
        for (const t of ta) if (tb.has(t)) inter++;
        const score = inter / Math.max(ta.size, tb.size);
        if (score > bestScore) { bestScore = score; best = { item, score }; }
      }

      if (best && best.score >= 0.25) {
        const reg = String(best.item.numeroRegistro || '').replace(/\D/g, '');
        if (reg.length >= 10) return { anvisa: reg, name: best.item.nomeProduto, score: best.score, query };
      }
    } catch { /* skip */ }
  }
  return null;
}

// ─── Main async ─────────────────────────────────────────────────────────────
async function main() {
  console.log('\n🔍 Buscando ANVISA para', toSearch.length, 'produtos...\n');

  const found    = []; // { r, anvisa, name, score }
  const notFound = []; // { r }

  for (let i = 0; i < toSearch.length; i++) {
    const r = toSearch[i];
    process.stdout.write(`  [${i+1}/${toSearch.length}] ${r.codigo} ${r.code.padEnd(20)} `);

    const result = await searchAnvisa(r);
    if (result) {
      found.push({ r, ...result });
      console.log(`✓ ${result.anvisa} (conf:${(result.score*100).toFixed(0)}%) "${result.name?.substring(0,50)}"`);
    } else {
      notFound.push({ r });
      console.log(`✗ não encontrado`);
    }
    // small delay to avoid rate limiting
    await new Promise(res => setTimeout(res, 400));
  }

  console.log(`\n📊 Resultado:`);
  console.log(`   N/A:             ${naProducts.length}`);
  console.log(`   ANVISA encontrado: ${found.length}`);
  console.log(`   Não encontrado:   ${notFound.length}`);

  if (notFound.length > 0) {
    console.log('\n⚠️  Sem ANVISA (revisar manualmente):');
    for (const { r } of notFound) {
      console.log(`   ${r.codigo} | ${r.code.padEnd(20)} | ${r.sub.padEnd(25)} | ${r.desc}`);
    }
  }

  // ─── Generate SQL ──────────────────────────────────────────────────────────
  const lines = [];
  lines.push(`-- anvisa-sweep.sql — ${new Date().toISOString()}`);
  lines.push(`-- N/A: ${naProducts.length} | Encontrado: ${found.length} | Não encontrado: ${notFound.length}`);
  lines.push('');
  lines.push('BEGIN;');
  lines.push('');

  // N/A updates
  if (naProducts.length) {
    lines.push(`-- ══ N/A: instrumentais, equipamentos, veículos (${naProducts.length} itens) ══`);
    const naList = naProducts.map(r => `'${r.codigo}'`).join(', ');
    lines.push(`UPDATE product_registry SET anvisa_code = 'N/A', updated_at = NOW()`);
    lines.push(`WHERE company_id = '${COMPANY_ID}' AND codigo IN (${naList});`);
    lines.push('');
  }

  // Found ANVISA updates
  if (found.length) {
    lines.push(`-- ══ ANVISA encontrado via API (${found.length} itens) ══`);
    for (const { r, anvisa, name, score } of found) {
      lines.push(`-- ${r.codigo} ${r.code} | "${r.desc?.substring(0,50)}" → ${anvisa} (${(score*100).toFixed(0)}%) "${name?.substring(0,50)}"`);
      lines.push(`UPDATE product_registry SET anvisa_code = '${anvisa}', anvisa_source = 'api_sweep', updated_at = NOW()`);
      lines.push(`WHERE company_id = '${COMPANY_ID}' AND codigo = '${r.codigo}';`);
    }
    lines.push('');
  }

  lines.push('COMMIT;');
  lines.push('');
  lines.push(`-- Produtos sem ANVISA após sweep (${notFound.length}):`);
  for (const { r } of notFound) {
    lines.push(`-- ${r.codigo} | ${r.code} | ${r.sub} | ${r.desc}`);
  }

  const sql = lines.join('\n');
  fs.writeFileSync(SQL_OUT, sql, 'utf8');
  console.log(`\n📄 SQL: ${SQL_OUT}`);

  if (DRY_RUN) {
    console.log('⚠️  Dry-run. Para aplicar: node scripts/anvisa-sweep.js --apply');
  } else {
    console.log('🚀 Aplicando...');
    try {
      execSync(
        `docker exec -i ${DB_CONTAINER} psql -U postgres -d postgres -v ON_ERROR_STOP=1 < ${SQL_OUT}`,
        { encoding: 'utf8', maxBuffer: 5 * 1024 * 1024 }
      );
      console.log('✅ Aplicado!');
    } catch (e) {
      const stderr = e.stderr || e.message || '';
      console.error('❌ Erro:', stderr.substring(0, 500));
      process.exit(1);
    }
  }
}

main().catch(e => { console.error(e); process.exit(1); });
