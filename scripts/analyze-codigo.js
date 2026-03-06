const XLSX = require('xlsx');
const fs = require('fs');

function norm(s) { return String(s||'').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^A-Z0-9 ]/g,' ').replace(/\s+/g,' ').trim(); }
function clean(s) { return norm(s).replace(/^POSICAO\s+\d+\s+/,'').replace(/^\(\d+\)\s*/,'').replace(/^\d+\s*-\s*/,'').replace(/^\d+\s+/,'').trim(); }
function tokenOverlap(a,b){const ta=new Set(a.split(' ').filter(t=>t.length>2));const tb=new Set(b.split(' ').filter(t=>t.length>2));if(!ta.size||!tb.size)return 0;let c=0;for(const t of ta)if(tb.has(t))c++;return c/Math.max(ta.size,tb.size);}
function parseCSV(text){const lines=text.split('\n');const headers=lines[0].split(',').map(h=>h.replace(/^"|"$/g,'').trim());const rows=[];for(let i=1;i<lines.length;i++){if(!lines[i].trim())continue;const vals=[];let cur='',inQ=false;for(const ch of lines[i]+','){if(ch=='"'){inQ=!inQ;continue;}if(ch==','&&!inQ){vals.push(cur);cur='';continue;}cur+=ch;}if(vals.length<headers.length)continue;const row={};headers.forEach((h,idx)=>{row[h]=vals[idx]||'';});rows.push(row);}return rows;}
function extractModelKey(s){const u=norm(s);let m;m=u.match(/DOKIMOS\s+PLUS\s*[-–]?\s*([AM])\s+(\d+)/);if(m)return'DOKIMOS_'+m[1]+'_'+m[2];m=u.match(/DOKIMOS\s+PLUS[-–]([AM])[-–]?\s*(\d+)/);if(m)return'DOKIMOS_'+m[1]+'_'+m[2];m=u.match(/P\s*[-–]?\s*2010\s*(\d+)\s*([AM])/);if(m)return'P2010_'+m[2]+'_'+m[1];m=u.match(/TLPB[-–\s]+([AM])\s+(\d+)/);if(m)return'TLPB_'+m[1]+'_'+m[2];m=u.match(/CROWN\s+(\d+)\s*MM/);if(m)return'CROWN_'+m[1];m=u.match(/(?:^|\s)(ICV\d{4}[^\s]*)/);if(m)return'ICV_'+m[1].replace(/^ICV/,'');return null;}
function extractDescCode(desc){if(!desc)return null;const m=desc.match(/^([A-Z0-9]{3,})\s*[-–]/i);if(m&&/[A-Z]/i.test(m[1])&&/[0-9]/.test(m[1]))return m[1].toUpperCase();const m2=desc.match(/^(\d{4,})\s*[-–]/);if(m2)return m2[1];return null;}
function scoreMatch(db,sp){let s=0,reasons=[];if(db._cu&&sp.refUp&&db._cu===sp.refUp){s+=50;reasons.push('ref');}else if(sp.refUp&&db._refs.some(r=>r.toUpperCase()===sp.refUp)){s+=35;reasons.push('ref_in_refs');}else if(db._descCode&&sp.refUp&&db._descCode===sp.refUp){s+=30;reasons.push('desc_code_ref');}else if(db._cu&&sp.refUp&&db._cu.replace(/\.$/,'')===sp.refUp.replace(/\.$/,'')){s+=45;reasons.push('ref_dot');}if(db.anvisa_code&&sp.anvisa&&db.anvisa_code===sp.anvisa){s+=30;reasons.push('anvisa');}if(db._modelKey&&sp._modelKey&&db._modelKey===sp._modelKey){s+=25;reasons.push('model_key');}const ov=tokenOverlap(db._cn,sp._cn);if(ov>=0.40){s+=Math.round(ov*20);reasons.push('ov'+Math.round(ov*100));}if(db._cn&&sp._cn&&db._cn===sp._cn){s+=5;reasons.push('name_exact');}return{s,reasons};}

const wb=XLSX.readFile('List_Produtos_Cad_20260227_144022.XLSX');
const ws=wb.Sheets[wb.SheetNames[0]];
const rawRows=XLSX.utils.sheet_to_json(ws,{header:1});
const sheet=[];
for(let i=7;i<rawRows.length;i++){const r=rawRows[i];if(!r||!r[2])continue;const av=r[8]!=null?String(r[8]).replace(/\D/g,''):'';const ref=r[1]!=null?String(r[1]).trim():null;const produto=r[2]!=null?String(r[2]).trim():null;const tipo=r[6]!=null?String(r[6]).trim():null;sheet.push({codInt:r[0]!=null?String(r[0]).trim()||null:null,ref,refUp:ref?ref.toUpperCase().trim():null,produto,_cn:clean(produto),_modelKey:extractModelKey(ref)||extractModelKey(produto),anvisa:av.length===11?av:null,tipo,outOfLine:tipo?tipo.toUpperCase().includes('FORA'):false,_row:i});}

const dbRows=parseCSV(fs.readFileSync('/tmp/db_products.csv','utf8'));
for(const r of dbRows){r._ool=r.out_of_line==='t';r._refs=r.product_refs_str?r.product_refs_str.split('|').map(x=>x.trim()).filter(Boolean):[];r._cn=clean(r.description);r._cu=r.code?r.code.toUpperCase().trim():null;r._inv=parseInt(r.agg_invoice_count)||0;r._descCode=extractDescCode(r.description);r._modelKey=extractModelKey(r.description)||(r.code?extractModelKey(r.code):null);}

const spByAnvisa=new Map();const spByRef=new Map();const spByModelKey=new Map();
for(const sp of sheet){if(sp.anvisa){if(!spByAnvisa.has(sp.anvisa))spByAnvisa.set(sp.anvisa,[]);spByAnvisa.get(sp.anvisa).push(sp);}if(sp.refUp){if(!spByRef.has(sp.refUp))spByRef.set(sp.refUp,[]);spByRef.get(sp.refUp).push(sp);}if(sp._modelKey){if(!spByModelKey.has(sp._modelKey))spByModelKey.set(sp._modelKey,[]);spByModelKey.get(sp._modelKey).push(sp);}}

const MIN_SCORE=30;
const HIGH_CONF=['ref','ref_in_refs','desc_code_ref','ref_dot'];
const results=[];
const unmatchedDb=[];
for(const db of dbRows){const candSet=new Set();if(db.anvisa_code)for(const sp of(spByAnvisa.get(db.anvisa_code)||[]))candSet.add(sp);if(db._cu)for(const sp of(spByRef.get(db._cu)||[]))candSet.add(sp);for(const ref of db._refs)for(const sp of(spByRef.get(ref.toUpperCase())||[]))candSet.add(sp);if(db._descCode)for(const sp of(spByRef.get(db._descCode)||[]))candSet.add(sp);if(db._cu){const dotless=db._cu.replace(/\.$/,'');for(const sp of(spByRef.get(dotless)||[]))candSet.add(sp);for(const sp of(spByRef.get(dotless+'.')||[]))candSet.add(sp);}if(db._modelKey)for(const sp of(spByModelKey.get(db._modelKey)||[]))candSet.add(sp);if(candSet.size===0&&db._cn.length>6)for(const sp of sheet)if(tokenOverlap(db._cn,sp._cn)>=0.65)candSet.add(sp);let bestSp=null,bestScore=0,bestReasons=[];for(const sp of candSet){const{s,reasons}=scoreMatch(db,sp);if(s>bestScore){bestScore=s;bestSp=sp;bestReasons=reasons;}}if(bestSp&&bestScore>=MIN_SCORE)results.push({db,sp:bestSp,score:bestScore,reasons:bestReasons});else unmatchedDb.push(db);}

const hiConf=results.filter(r=>r.reasons.some(x=>HIGH_CONF.includes(x)));
const loConf=results.filter(r=>!r.reasons.some(x=>HIGH_CONF.includes(x)));

// Which low-conf have a unique planilha row vs shared
const loRowUsage=new Map();
for(const r of loConf){const k=r.sp._row;if(!loRowUsage.has(k))loRowUsage.set(k,[]);loRowUsage.get(k).push(r);}
const loOneToOne=loConf.filter(r=>loRowUsage.get(r.sp._row).length===1);
const loManyToOne=loConf.filter(r=>loRowUsage.get(r.sp._row).length>1);

console.log('=== SITUAÇÃO DO CODIGO INTERNO APÓS IMPORT ===\n');
console.log('Total produtos no DB:                 ', dbRows.length);
console.log('Alta conf (receberão codigo):         ', hiConf.length);
console.log('Baixa conf 1:1 (planilha exclusiva): ', loOneToOne.length, '← pode receber codigo com segurança');
console.log('Baixa conf N:1 (planilha partilhada):', loManyToOne.length, '← planilha row compartilhada por múltiplos DB');
console.log('Sem match nenhum:                     ', unmatchedDb.length);
console.log('');
console.log('Com lógica ATUAL (sem codigo em baixa conf):');
console.log('  Receberão codigo:', hiConf.length);
console.log('  Ficarão sem codigo:', loConf.length + unmatchedDb.length, '=', loConf.length, '(baixa conf) +', unmatchedDb.length, '(sem match)');
console.log('');
console.log('Se liberar 1:1 (codigo para baixa conf exclusiva):');
console.log('  Receberão codigo:', hiConf.length + loOneToOne.length);
console.log('  Ficarão sem codigo:', loManyToOne.length + unmatchedDb.length, '=', loManyToOne.length, '(N:1) +', unmatchedDb.length, '(sem match)');

// Break down the unmatched by category
const NON_MED=['OIL','VID VW','GOL','LONA','LIXA','LUBRIFIC','SIM CARD','BATERIA','IPHONE','SAMSUNG','APPLE','YBSC','DGAP','YGSC','TGSA'];
const unmInLine=unmatchedDb.filter(r=>!r._ool);
const unmOutLine=unmatchedDb.filter(r=>r._ool);
const nonMed=unmInLine.filter(r=>NON_MED.some(k=>(r.description||'').toUpperCase().includes(k)||(r.code||'').toUpperCase().includes(k)));
console.log('\n=== DETALHAMENTO: SEM MATCH (' + unmatchedDb.length + ' total) ===');
console.log('  In-line:', unmInLine.length, '| Out-of-line:', unmOutLine.length);
console.log('  In-line não-médicos:', nonMed.length, '(carro, eletrônico — não precisam de codigo)');
console.log('  In-line médicos sem match:', unmInLine.length - nonMed.length);

console.log('\n=== BAIXA CONF N:1 — grupos (planilha compartilhada) ===');
const groupsByRow=[...loRowUsage.entries()].filter(([,v])=>v.length>1).sort((a,b)=>b[1].length-a[1].length);
for(const [row,rs] of groupsByRow.slice(0,15)){
  console.log('  SP row '+(row+1)+' ref:'+(rs[0].sp.ref||'').padEnd(18)+' codInt:'+(rs[0].sp.codInt||'').padEnd(8)+' → '+rs.length+' produtos DB:');
  for(const r of rs) console.log('    '+r.db.code?.substring(0,30).padEnd(30)+'NF:'+r.db._inv);
}
if(groupsByRow.length>15)console.log('  ... e mais '+(groupsByRow.length-15)+' grupos');

console.log('\n=== BAIXA CONF 1:1 — candidatos seguros para codigo ===');
for(const r of loOneToOne.sort((a,b)=>b.db._inv-a.db._inv).slice(0,30)){
  console.log('  NF:'+String(r.db._inv).padStart(3)+' DB:'+r.db.code?.substring(0,22).padEnd(22)+' → SP ref:'+(r.sp.ref||'').padEnd(20)+' codInt:'+r.sp.codInt+' ['+r.reasons.join('+')+']');
}
if(loOneToOne.length>30)console.log('  ... e mais '+(loOneToOne.length-30)+' itens');
