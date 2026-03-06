const XLSX = require('xlsx');
const fs = require('fs');
function norm(s){return String(s||'').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^A-Z0-9 ]/g,' ').replace(/\s+/g,' ').trim();}
function clean(s){return norm(s).replace(/^POSICAO\s+\d+\s+/,'').replace(/^\(\d+\)\s*/,'').replace(/^\d+\s*-\s*/,'').replace(/^\d+\s+/,'').trim();}
function tokenOverlap(a,b){const ta=new Set(a.split(' ').filter(t=>t.length>2));const tb=new Set(b.split(' ').filter(t=>t.length>2));if(!ta.size||!tb.size)return 0;let c=0;for(const t of ta)if(tb.has(t))c++;return c/Math.max(ta.size,tb.size);}
function parseCSV(text){const lines=text.split('\n');const headers=lines[0].split(',').map(h=>h.replace(/^"|"$/g,'').trim());const rows=[];for(let i=1;i<lines.length;i++){if(!lines[i].trim())continue;const vals=[];let cur='',inQ=false;for(const ch of lines[i]+','){if(ch==='"'){inQ=!inQ;continue;}if(ch===','&&!inQ){vals.push(cur);cur='';continue;}cur+=ch;}if(vals.length<headers.length)continue;const row={};headers.forEach((h,idx)=>{row[h]=vals[idx]||'';});rows.push(row);}return rows;}
function extractDescCode(desc){if(!desc)return null;const m=desc.match(/^([A-Z0-9]{3,})\s*[-–]/i);if(m&&/[A-Z]/i.test(m[1])&&/[0-9]/.test(m[1]))return m[1].toUpperCase();const m2=desc.match(/^(\d{4,})\s*[-–]/);if(m2)return m2[1];return null;}
function extractModelKey(s){const u=norm(s);let m;m=u.match(/DOKIMOS\s+PLUS\s*[-–]?\s*([AM])\s+(\d+)/);if(m)return'DOKIMOS_'+m[1]+'_'+m[2];m=u.match(/DOKIMOS\s+PLUS[-–]([AM])[-–]?\s*(\d+)/);if(m)return'DOKIMOS_'+m[1]+'_'+m[2];m=u.match(/P\s*[-–]?\s*2010\s*(\d+)\s*([AM])/);if(m)return'P2010_'+m[2]+'_'+m[1];m=u.match(/TLPB[-–\s]+([AM])\s+(\d+)/);if(m)return'TLPB_'+m[1]+'_'+m[2];m=u.match(/CROWN\s+(\d+)\s*MM/);if(m)return'CROWN_'+m[1];m=u.match(/(?:^|\s)(ICV\d{4}[^\s]*)/);if(m)return'ICV_'+m[1].replace(/^ICV/,'');return null;}

// Generate all ref lookup variants for a code string
function codeVariants(cu) {
  if (!cu) return [];
  const vs = new Set([cu]);
  // strip 001 prefix
  if (cu.startsWith('001') && cu.length > 3) vs.add(cu.slice(3));
  // strip leading zeros (pure numeric or starts with zeros)
  const noZero = cu.replace(/^0+/, '');
  if (noZero && noZero !== cu) vs.add(noZero);
  // strip trailing dot
  if (cu.endsWith('.')) vs.add(cu.slice(0, -1));
  // strip .00 or .00. suffix
  const noDecimal = cu.replace(/\.00+\.?$/, '');
  if (noDecimal !== cu) vs.add(noDecimal);
  // strip XL / L suffix (balloon sizes)
  const noSuffix = cu.replace(/\s*(XL|L|S|M)$/, '');
  if (noSuffix !== cu) vs.add(noSuffix);
  // replace space with dash and vice versa
  vs.add(cu.replace(/ /g, '-'));
  vs.add(cu.replace(/-/g, ' '));
  return [...vs].filter(v => v.length >= 2);
}

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
  sheet.push({
    codInt: r[0] != null ? String(r[0]).trim() || null : null,
    ref, refUp: ref ? ref.toUpperCase().trim() : null,
    produto, _cn: clean(produto),
    _modelKey: extractModelKey(ref) || extractModelKey(produto),
    fab: r[4] != null ? String(r[4]).trim() || null : null,
    fornPad: r[5] != null ? String(r[5]).trim() || null : null,
    tipo, subtipo: r[7] != null ? String(r[7]).trim() || null : null,
    anvisa: av.length === 11 ? av : null,
    ncm: r[9] != null ? String(r[9]).trim() || null : null,
    trib: r[10] != null ? String(r[10]).trim() || null : null,
    obsIcms: r[11] != null ? String(r[11]).trim() || null : null,
    cstIcms: r[12] != null ? String(r[12]).trim() || null : null,
    icms: r[14] != null && r[14] !== '' ? Number(r[14]) : null,
    obsPisCof: r[16] != null ? String(r[16]).trim() || null : null,
    pis: r[17] != null && r[17] !== '' ? Number(r[17]) : null,
    cstPis: r[19] != null ? String(r[19]).trim() || null : null,
    cofins: r[21] != null && r[21] !== '' ? Number(r[21]) : null,
    cstCofins: r[23] != null ? String(r[23]).trim() || null : null,
    ipi: r[25] != null && r[25] !== '' ? Number(r[25]) : null,
    outOfLine: tipo ? tipo.toUpperCase().includes('FORA') : false,
    _row: i,
  });
}

const dbRows = parseCSV(fs.readFileSync('/tmp/db_products.csv', 'utf8'));
for (const r of dbRows) {
  r._ool = r.out_of_line === 't';
  r._refs = r.product_refs_str ? r.product_refs_str.split('|').map(x => x.trim()).filter(Boolean) : [];
  r._cn = clean(r.description);
  r._cu = r.code ? r.code.toUpperCase().trim() : null;
  r._inv = parseInt(r.agg_invoice_count) || 0;
  r._descCode = extractDescCode(r.description);
  r._modelKey = extractModelKey(r.description) || (r.code ? extractModelKey(r.code) : null);
}

// Build EXTENDED ref index: includes all variants of each planilha ref
const spByRef = new Map();
const spByNorm = new Map(); // norm(ref) → sp
for (const sp of sheet) {
  if (!sp.refUp) continue;
  for (const v of codeVariants(sp.refUp)) {
    if (!spByRef.has(v)) spByRef.set(v, []);
    spByRef.get(v).push(sp);
  }
  // Also index by norm (stripped of non-alphanumeric)
  const n = sp.refUp.replace(/[^A-Z0-9]/g, '');
  if (n) {
    if (!spByNorm.has(n)) spByNorm.set(n, []);
    spByNorm.get(n).push(sp);
  }
}

// Count how many DB codes hit via extended lookup vs direct
let directHit = 0, variantHit = 0, normHit = 0, noHit = 0;
const variantExamples = [];

for (const db of dbRows) {
  const cu = db._cu;
  if (!cu) { noHit++; continue; }

  // Direct
  if (spByRef.has(cu)) { directHit++; continue; }

  // Variants
  const vars = codeVariants(cu);
  let found = false;
  for (const v of vars) {
    if (v !== cu && spByRef.has(v)) {
      variantHit++;
      if (variantExamples.length < 40) {
        variantExamples.push(`DB:${cu.padEnd(25)} → variant:${v.padEnd(25)} → SP:${spByRef.get(v)[0].ref} codInt:${spByRef.get(v)[0].codInt}`);
      }
      found = true;
      break;
    }
  }
  if (found) continue;

  // Norm (alphanumeric only)
  const cuNorm = cu.replace(/[^A-Z0-9]/g, '');
  if (cuNorm && spByNorm.has(cuNorm) && cuNorm !== cu.replace(/[^A-Z0-9]/g,'')) {
    normHit++;
    found = true;
  }
  if (!found) noHit++;
}

console.log(`Direct ref hit: ${directHit}`);
console.log(`Variant hit (001-strip, zero-strip, dot, etc.): ${variantHit}`);
console.log(`Norm hit (alphanumeric only): ${normHit}`);
console.log(`No hit at all: ${noHit}`);
console.log(`\nVariant match examples (${variantExamples.length}):`);
variantExamples.forEach(e => console.log(' ', e));

// For refs_str: check if any DB product_refs hit planilha
let refsHit = 0;
for (const db of dbRows) {
  for (const ref of db._refs) {
    const ru = ref.toUpperCase();
    if (spByRef.has(ru)) { refsHit++; break; }
    for (const v of codeVariants(ru)) if (v !== ru && spByRef.has(v)) { refsHit++; break; }
  }
}
console.log(`\nDB products with product_refs hitting planilha: ${refsHit}`);
