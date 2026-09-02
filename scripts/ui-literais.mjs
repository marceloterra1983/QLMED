/**
 * Literais de string de um ficheiro TSX, com templates ANINHADOS.
 *
 * A regex `"…"|'…'|`…`` parava no primeiro backtick — num template dentro de
 * `${…}` de outro template, tudo entre o backtick interno de abertura e a
 * próxima aspa ficava fora de qualquer literal, e todas as regras passavam
 * cegas por ele. Foi assim que o item ativo do menu ficou sem par escuro.
 *
 * Devolve `{ lit, at, raw }` por literal; num template, `lit` é o texto
 * estático (as partes `${…}` viram um espaço) e os literais que vivem dentro
 * das `${…}` são devolvidos também, cada um por si.
 */
export function literaisDe(src) {
  const out = [];
  const n = src.length;
  let i = 0;

  const simples = (q) => {                     // "…" ou '…' a partir de i
    const ini = i; i++;
    let s = '';
    while (i < n && src[i] !== q && src[i] !== '\n') { if (src[i] === '\\') { s += src[i + 1] ?? ''; i += 2; continue; } s += src[i++]; }
    // Uma string JS não atravessa linha. Se não fechou, era um apóstrofo em
    // texto JSX ("d'água", "Voc'…") — não é literal, e engoli-lo até ao
    // próximo `'` fabricava literais falsos que atravessavam tags.
    if (src[i] !== q) { i = ini + 1; return; }
    i++;                                       // fecha
    out.push({ lit: s, at: ini, raw: src.slice(ini, i) });
  };

  // Regex literal: um `/` em posição de operando (depois de `( , = : [ ! & | ? { } ;`
  // ou de `return`) abre /…/flags. Sem isto, `replace(/"/g, '""')` dentro de um
  // `${…}` faz a aspa do regex abrir uma string falsa, o fecho verdadeiro do
  // template vira abertura, e o corpo engole o ficheiro até ao próximo backtick.
  const regexAqui = () => {
    let k = i - 1;
    while (k >= 0 && (src[k] === ' ' || src[k] === '\t' || src[k] === '\n')) k--;
    if (k < 0) return true;
    if ('(,=:[!&|?{};'.includes(src[k])) return true;
    return /\breturn$|\btypeof$|\bcase$/.test(src.slice(Math.max(0, k - 6), k + 1));
  };
  const saltaRegex = () => {                   // i está no `/` de abertura
    i++;
    let classe = false;
    while (i < n && src[i] !== '\n') {
      const c = src[i];
      if (c === '\\') { i += 2; continue; }
      if (classe) { if (c === ']') classe = false; i++; continue; }
      if (c === '[') { classe = true; i++; continue; }
      if (c === '/') { i++; while (i < n && /[a-z]/.test(src[i])) i++; return; }
      i++;
    }
  };

  const template = () => {                     // `…${…}…` a partir de i
    const ini = i; i++;
    let s = '';
    while (i < n && src[i] !== '`') {
      if (src[i] === '\\') { s += src[i + 1] ?? ''; i += 2; continue; }
      if (src[i] === '$' && src[i + 1] === '{') {
        i += 2; s += ' ';
        let chaves = 1;
        while (i < n && chaves > 0) {          // JS dentro de ${…}: literais aninhados contam
          const c = src[i];
          if (c === '"' || c === "'") { simples(c); continue; }
          if (c === '`') { template(); continue; }
          if (c === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; continue; }
          if (c === '/' && src[i + 1] === '*') { const f = src.indexOf('*/', i + 2); i = f < 0 ? n : f + 2; continue; }
          if (c === '/' && regexAqui()) { saltaRegex(); continue; }
          if (c === '{') chaves++;
          else if (c === '}') { chaves--; if (chaves === 0) { i++; break; } }
          i++;
        }
        continue;
      }
      s += src[i++];
    }
    i++;                                       // fecha
    out.push({ lit: s, at: ini, raw: src.slice(ini, i) });
  };

  while (i < n) {
    const c = src[i];
    if (c === '"' || c === "'") simples(c);
    else if (c === '`') template();
    else if (c === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; }
    else if (c === '/' && src[i + 1] === '*') { const f = src.indexOf('*/', i + 2); i = f < 0 ? n : f + 2; }
    else if (c === '/' && regexAqui()) saltaRegex();
    else i++;
  }
  return out;
}

// ── auto-teste: o caso real do SidebarNav ────────────────────────────────
if (process.argv[1] && process.argv[1].endsWith('ui-literais.mjs')) {
  const amostra = "className={`flex gap-3 ${\n isActive\n ? `bg-primary/10 text-primary ${collapsed ? '' : 'shadow-x'}`\n : 'text-slate-600 dark:text-slate-300'\n }`}";
  const lits = literaisDe(amostra).map((l) => l.lit.trim()).filter(Boolean);
  const vê = (t) => lits.some((l) => l.includes(t));
  const falhas = [];
  if (!vê('bg-primary/10 text-primary')) falhas.push('não vê o template interno');
  if (!vê('shadow-x')) falhas.push('não vê a string dentro do ${} interno');
  if (!vê('text-slate-600')) falhas.push('não vê o ramo else');
  if (!vê('flex gap-3')) falhas.push('não vê o template externo');
  // comentários não são literais
  if (literaisDe("// 'nao'\n/* \"nem\" */ x='sim'").some((l) => l.lit !== 'sim')) falhas.push('lê literal em comentário');
  // apóstrofo em texto JSX não abre string; o literal seguinte continua a ser visto
  const jsx = literaisDe("<p>Voc'ê {x ? x : '-'}</p>\n<input className=\"focus:ring-2\" />");
  if (jsx.some((l) => l.lit.includes('</p>'))) falhas.push('apóstrofo em JSX fabricou literal');
  if (!jsx.some((l) => l.lit === 'focus:ring-2')) falhas.push('perdeu o literal depois do apóstrofo');
  // regex com aspa dentro de ${…}: o caso que engolia 40 linhas
  const rx = literaisDe('const esc = (v) => `"${String(v).replace(/"/g, \'""\')}"`;\nconst x = \'depois\';');
  if (!rx.some((l) => l.lit === '""')) falhas.push('não vê a string depois do regex');
  if (!rx.some((l) => l.lit === 'depois')) falhas.push('o regex engoliu o resto do ficheiro');
  if (rx.some((l) => l.raw.length > 40)) falhas.push('literal falso gigante depois do regex');
  // divisão não é regex
  const div = literaisDe("const r = a / b; const s = 'ok';");
  if (!div.some((l) => l.lit === 'ok')) falhas.push('tratou divisão como regex');
  if (falhas.length) { console.error('FALHA:', falhas); process.exit(1); }
  console.log('ok: scanner vê template aninhado —', lits.length, 'literais:', JSON.stringify(lits));
}
