#!/usr/bin/env node
/**
 * Verifica os tokens de apresentação padronizados na etapa 1:
 *
 *   primary — todo `text-primary` que chega a uma className tem par escuro
 *             `dark:text-blue-400` na mesma variante (#2563eb dá 2,91:1 sobre
 *             card-dark; blue-400 dá 5,93:1).
 *   muted   — `text-slate-400` nunca fica em posição clara (2,56:1 sobre branco)
 *             e `dark:text-slate-500` nunca fica em posição escura (3,17:1).
 *             O par correto é `text-slate-500 dark:text-slate-400`.
 *   scale   — nenhum tamanho de texto em pixel cru até 16px: a escala nomeada
 *             tem seis degraus e piso de 12px. Pixel cru continua legítimo em
 *             literal de ícone (`material-symbols-*`), onde dimensiona o glifo.
 *   focus   — um anel de foco só, o do `globals.css` (`:focus-visible`).
 *             `focus:ring-*`, `focus:border-*`, `focus:outline-none` e os
 *             `focus-visible:*` equivalentes empilhavam um segundo sistema.
 *             `focus-within:` é outro caso (contêiner) e fica.
 *   radius  — três raios: `rounded-xl` (superfície), `rounded-lg` (controle),
 *             `rounded-full` (pill). `rounded-sm|md|2xl|3xl` são violação.
 *   field   — `<input|select|textarea>` usa a borda de campo
 *             `border-slate-200 dark:border-slate-700` (a de `FIELD_CONTROL_CLS`);
 *             `border-slate-300`/`dark:border-slate-600` nesses três é violação.
 *   pill    — pill de situação à mão: literal com `rounded-full`, texto
 *             xs/10px/11px, `font-bold|font-semibold` e fundo tonal
 *             (`bg-<cor>-50|100`, `bg-<cor>-900/n`, `bg-<cor>/10|20`) fora da
 *             className de um `<button>` e sem disco fixo (`w-7 h-7`).
 *             `components/ui/Badge.tsx` é a fonte.
 *   empty   — estado vazio à mão: `text-center` seguido, em 400 caracteres, de
 *             texto JSX `>Nenhum`/`>Nenhuma`. `components/ui/EmptyState.tsx` é
 *             a fonte; `<EmptyState title="Nenhum…">` não acusa (atributo).
 *   sortable — `<th onClick>`: o teclado não chega (um `<th>` não recebe foco).
 *             `components/ui/SortableTh.tsx` é a fonte e o único isento.
 *   iconbtn — `<button>` só-ícone (`material-symbols-outlined`, sem texto
 *             visível) sem `aria-label`/`aria-labelledby`. `title=` não conta:
 *             não é lido em toque. Só a tag minúscula; `<Button icon>` é o
 *             componente e cuida de si.
 *   label   — `<input|select|textarea>` sem `aria-label`, `aria-labelledby`
 *             nem `id` e sem `<Field`/`<label` nos 400 caracteres anteriores.
 *             checkbox/radio/hidden/file ficam de fora.
 *   faint   — `text-slate-300` como cor de texto (1,9:1 sobre branco). Em
 *             literal de ícone (`material-symbols`) é decorativo e passa;
 *             `hover:text-slate-300` é afordância, não texto.
 *
 * Uso: node scripts/verify-ui-tokens.mjs [--stats]
 */
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { literaisDe } from './ui-literais.mjs';

const STATS = process.argv.includes('--stats');
// Raiz varrida; um caminho explícito serve ao harness de controle positivo.
const ROOT = process.argv.slice(2).find((a) => !a.startsWith('--')) ?? 'src';

// Literais de string do TSX: "...", '...' e `...`.
// Literais vêm de ./ui-literais.mjs: a regex antiga parava no primeiro
// backtick e não via template aninhado nem regex com aspa dentro de ${…}.

// Prefixo de variante Tailwind (sm:, hover:, dark:group-hover: ...).
const VARIANTS = '(?:[a-z][a-z0-9-]*:)*';
const PRIMARY = new RegExp(`(?<![-\\w])(${VARIANTS})text-primary\\b(?!-)`, 'g');
// primary-dark é ainda mais escuro (2,33:1 sobre card-dark): par mais claro.
const PRIMARY_DARK = new RegExp(`(?<![-\\w])(${VARIANTS})text-primary-dark\\b`, 'g');
const SLATE400 = new RegExp(`(?<![-\\w])(${VARIANTS})text-slate-400\\b`, 'g');
const DARK500 = /(?<![-\w])dark:text-slate-500\b/g;
const PX = new RegExp(`(?<![-\\w])(${VARIANTS})text-\\[(\\d+)px\\]`, 'g');
// `focus:`/`focus-visible:` seguido de ring, ring-offset, border ou outline-none.
// Não casa `focus-within:` (o `(?:-visible)?` só admite esse sufixo).
const FOCO = new RegExp(
  `(?<![-\\w])${VARIANTS}focus(?:-visible)?:(?:ring|border|outline-none)(?:-[\\w/\\[\\].#%-]*)?`,
  'g',
);
// Raio fora da escala, com variante e canto (`sm:rounded-t-2xl`) preservados.
const RAIO = new RegExp(
  `(?<![-\\w])(${VARIANTS}rounded(?:-(?:t|b|l|r|s|e|tl|tr|bl|br|ss|se|ee|es))?-)(sm|md|2xl|3xl)\\b`,
  'g',
);
const RAIO_PARA = { sm: 'lg', md: 'lg', '2xl': 'xl', '3xl': 'xl' };
const BORDA_CAMPO = /(?<![-\w])(?:border-slate-300|dark:border-slate-600)\b/g;
const PILL_RAIO = /(?<![-\w:])rounded-full\b/;
const PILL_TEXTO = /(?<![-\w:])text-(?:xs|\[1[01]px\])\b/;
const PILL_PESO = /(?<![-\w:])font-(?:bold|semibold)\b/;
const PILL_FUNDO = /(?<![-\w:])bg-[a-z]+-(?:50|100)\b|(?<![-\w])dark:bg-[a-z]+-900\/\d+|(?<![-\w:])bg-[a-z]+\/(?:10|20)\b/;
// Disco de tamanho fixo (`w-7 h-7`: passo numerado, avatar) não é pill;
// `min-w-[22px]` de contador não casa e continua a acusar.
const DISCO = /(?<![-\w:])w-\d+(?:\.\d+)?\b[^"'`]*(?<![-\w:])h-\d+(?:\.\d+)?\b/;
const VAZIO = /(?<![-\w:])text-center\b/g;
const TH_ABRE = /<th\b/g;
const BOTAO_MIN = /<button\b/g;
const ROTULO_ARIA = /\saria-label(?:ledby)?=/;
const TIPO_SEM_ROTULO = /\stype="(?:checkbox|radio|hidden|file)"/;
// Qualquer wrapper que termine em `Field` (`DetailField`) embrulha o `<Field>`
// de rótulo implícito: o controle lá dentro está rotulado.
const ROTULO_ANTES = /<(?:\w*Field|label)\b/;
const FAINT = /(?<![-\w:])text-slate-300\b/;
const FAINT_HOVER = /hover:text-slate-300\b/;
const NENHUM = />\s*Nenhuma?\b/;

const PX_FLOOR = 16; // até aqui é tamanho de texto; acima, só ícone usa px

const files = execFileSync(
  'find', [ROOT, '(', '-name', '*.tsx', '-o', '-name', '*.ts', ')', '-not', '-path', '*/__tests__/*'],
  { encoding: 'utf8' }
).trim().split('\n').filter(Boolean).sort();

const violations = {
  primary: [], muted: [], scale: [], button: [], focus: [], radius: [], field: [], pill: [], empty: [],
  sortable: [], iconbtn: [], label: [], faint: [],
};
const stats = {
  arquivos: files.length, literais: 0, primary: 0, muted: 0, icone: 0, escala: 0,
  focus: 0, radius: 0, field: 0, pill: 0, empty: 0,
  sortable: 0, iconbtn: 0, label: 0, faint: 0,
};

/**
 * Chave de mapa, não classe: ou é chave de objeto (`'text-primary': ...`),
 * ou é índice de lookup (`bgMap['text-primary']`). Qualquer outra posição —
 * prop, resultado de ternário, variável — chega a uma className e é policiada.
 */
const isTokenKey = (src, at, raw) =>
  src[at - 1] === '[' || src[at + raw.length] === ':';

const lineOf = (src, at) => src.slice(0, at).split('\n').length;

/**
 * Apaga comentários preservando os offsets, senão uma crase dentro de um
 * comentário vira literal e o verificador acusa a própria documentação —
 * aconteceu com o cabeçalho de `ui/Button.tsx`.
 */
const semComentarios = (src) =>
  src.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, (m) => m.replace(/[^\n]/g, ' '));

for (const file of files) {
  const src = semComentarios(readFileSync(file, 'utf8'));
  const lits = literaisDe(src);
  // Literal aninhado (`${ativa ? 'text-slate-300' : …}`) chega sozinho, sem o
  // `material-symbols` do template que o envolve: herda a isenção do pai.
  const icones = lits.filter((l) => /material-symbols/.test(l.lit)).map((l) => [l.at, l.at + l.raw.length]);
  // Um `<button className="text-slate-300 …">` cujo único filho é um ícone
  // pinta o ícone por herança: a cor é de ícone, não de texto.
  const botoesIcone = [];
  for (const m of src.matchAll(/<button\b/g)) {
    const lido = atributosDe(src, m.index + m[0].length);
    if (!lido) continue;
    const fimCorpo = src.indexOf('</button>', lido.fim);
    if (fimCorpo < 0) continue;
    const corpo = src.slice(lido.fim, fimCorpo);
    if (!/material-symbols-outlined/.test(corpo)) continue;
    const semIcone = semTags(corpo.replace(/<span[^>]*material-symbols[^>]*>[\s\S]*?<\/span>/g, '')).replace(/\{[\s\S]*?\}/g, '');
    if (!/\p{L}{2}/u.test(semIcone)) botoesIcone.push([m.index, lido.fim]);
  }
  const dentroDeIcone = (at) =>
    icones.some(([ini, fim]) => at > ini && at < fim) || botoesIcone.some(([ini, fim]) => at > ini && at < fim);
  for (const m of lits) {
    const lit = m.lit;
    if (!lit) continue;
    const at = m.at;
    const raw = m.raw;
    const line = () => `${file}:${lineOf(src, at)}`;
    const isIcon = /material-symbols/.test(lit);
    stats.literais++;

    // ── primary ──────────────────────────────────────────────────────────
    for (const p of lit.matchAll(PRIMARY)) {
      const variant = p[1];
      if (variant.includes('dark:')) continue;
      stats.primary++;
      if (isTokenKey(src, at, raw)) continue;
      const pair = `dark:${variant}text-blue-400`;
      if (!lit.includes(pair)) {
        violations.primary.push(`${line()}  ${variant}text-primary sem ${pair}`);
      }
    }

    for (const p of lit.matchAll(PRIMARY_DARK)) {
      const variant = p[1];
      if (variant.includes('dark:')) continue;
      stats.primary++;
      if (isTokenKey(src, at, raw)) continue;
      const pares = [`dark:${variant}text-blue-300`, `dark:${variant}text-blue-400`];
      if (!pares.some((par) => lit.includes(par))) {
        violations.primary.push(`${line()}  ${variant}text-primary-dark sem ${pares[0]}`);
      }
    }

    // ── muted ────────────────────────────────────────────────────────────
    for (const s of lit.matchAll(SLATE400)) {
      if (s[1].includes('dark:')) continue;
      stats.muted++;
      if (isTokenKey(src, at, raw)) continue;
      violations.muted.push(`${line()}  ${s[1]}text-slate-400 em posição clara (2,56:1)`);
    }
    for (const _ of lit.matchAll(DARK500)) {
      violations.muted.push(`${line()}  dark:text-slate-500 (3,17:1 sobre card-dark)`);
    }

    // ── escala ───────────────────────────────────────────────────────────
    for (const s of lit.matchAll(PX)) {
      const px = Number(s[2]);
      if (isIcon) { stats.icone++; continue; }
      stats.escala++;
      if (px <= PX_FLOOR) {
        violations.scale.push(`${line()}  text-[${px}px] em literal de texto — use a escala nomeada`);
      }
    }

    // ── focus ────────────────────────────────────────────────────────────
    for (const f of lit.matchAll(FOCO)) {
      stats.focus++;
      violations.focus.push(`${line()}  ${f[0]} por cima do anel global — remova`);
    }

    // ── radius ───────────────────────────────────────────────────────────
    for (const r of lit.matchAll(RAIO)) {
      stats.radius++;
      violations.radius.push(`${line()}  ${r[0]} — use ${r[1]}${RAIO_PARA[r[2]]}`);
    }

    // ── faint ────────────────────────────────────────────────────────────
    if (FAINT.test(lit) && !isIcon && !dentroDeIcone(at) && !FAINT_HOVER.test(lit)) {
      stats.faint++;
      violations.faint.push(`${line()}  text-slate-300 como texto — 1,9:1; use slate-500, ou é ícone decorativo (isento)`);
    }
  }
}

// ── button ────────────────────────────────────────────────────────────────
// Superfície de botão primário ou de perigo escrita à mão. Antes da etapa 2 o
// botão primário tinha 23 grafias, divergindo em hover, raio, peso e estado
// desabilitado; `components/ui/Button.tsx` é a única fonte agora.
// Fora do alvo: item de navegação, ação só-ícone de linha, item de menu e
// controles com papel próprio (`role="switch"`, cabeçalho de acordeão).
const BOTAO_ABRE = /<(button|Link|a)\b/g;
const CAMPO_ABRE = /<(input|select|textarea)\b/g;

/**
 * Atributos da tag, do nome até o `>` que a fecha, contando chaves.
 * `[^>]*?>` truncava em qualquer `=>` de arrow function — e um
 * `onClick={() => ...}` antes da className escondia o botão inteiro da regra.
 */
function atributosDe(src, apos) {
  let chaves = 0;
  for (let i = apos; i < src.length && i < apos + 4000; i++) {
    const c = src[i];
    if (c === '{') chaves++;
    else if (c === '}') chaves--;
    else if (c === '>' && chaves === 0) return { attrs: src.slice(apos, i), fim: i + 1 };
  }
  return null;
}
/** Corpo sem as tags, cada `<…>` retirada com `atributosDe` (um `=>` não a fecha). */
function semTags(corpo) {
  let out = '';
  for (let i = 0; i < corpo.length; ) {
    if (corpo[i] !== '<') { out += corpo[i++]; continue; }
    const lido = atributosDe(corpo, i + 1);
    if (!lido) break;
    i = lido.fim;
  }
  return out;
}
// Superfície em REPOUSO, sem prefixo de variante: `hover:bg-primary/10` é
// afordância de passagem do mouse, não fundo de botão — contá-la fazia a regra
// acusar os atalhos da barra lateral. Gradiente (`from-primary …`) é a mesma
// superfície primária: não distingue nada, some no PDF e escapava da regra.
const SUPERFICIE = /(?<![-\w:])(?:bg|from)-(primary|red-600|red-500)\b/;
const classeDe = (attrs) => {
  const m = attrs.match(/className=(?:"([^"]*)"|\{`([^`]*)`\}|\{([^}]*)\})/s);
  return m ? (m[1] ?? m[2] ?? m[3] ?? '') : '';
};

/**
 * Ligações locais de classe: `const X = '…'` e `const X = cond ? '…' : '…'`.
 * Sem isto a regra lê só o literal da className e uma superfície montada numa
 * variável passa — foi assim que o `ConfirmDialog` escapou na etapa 2.
 * Escopo deliberado: um ficheiro, um nível, sem seguir import. Resolver mais
 * exigiria um analisador de verdade, e o retorno não paga.
 */
function ligacoesDe(src) {
  const mapa = new Map();
  const SIMPLES = /\bconst\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=\s*(['"`])([^'"`\n]*)\2/g;
  for (const m of src.matchAll(SIMPLES)) mapa.set(m[1], [m[3]]);
  const TERNARIO = /\bconst\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=\s*[^;]*?\?\s*(['"`])([^'"`]*)\2\s*:\s*(['"`])([^'"`]*)\4/gs;
  for (const m of src.matchAll(TERNARIO)) mapa.set(m[1], [m[3], m[5]]);
  return mapa;
}

/** Troca `${ident}` pelo que a ligação pode valer; o desconhecido some. */
function expandir(expr, ligacoes) {
  let saida = expr;
  for (let volta = 0; volta < 2; volta++) {
    saida = saida.replace(/\$\{\s*([A-Za-z_$][\w$]*)\s*\}/g, (m, nome) =>
      ligacoes.has(nome) ? ' ' + ligacoes.get(nome).join(' ') + ' ' : m,
    );
    saida = saida.replace(/\b([A-Za-z_$][\w$]*)\b/g, (m, nome) =>
      ligacoes.has(nome) && !m.includes('-') ? ligacoes.get(nome).join(' ') : m,
    );
  }
  return saida;
}

for (const file of files) {
  if (!file.endsWith('.tsx')) continue;
  if (file.endsWith('components/ui/Button.tsx')) continue;
  const src = semComentarios(readFileSync(file, 'utf8'));
  const ligacoes = ligacoesDe(src);
  for (const m of src.matchAll(BOTAO_ABRE)) {
    const tagName = m[1];
    const lido = atributosDe(src, m.index + m[0].length);
    if (!lido) continue;
    const { attrs, fim: fimDaTag } = lido;
    if (attrs.trimEnd().endsWith('/')) continue; // auto-fechada: sem rótulo
    const c = expandir(classeDe(attrs), ligacoes);
    if (!SUPERFICIE.test(c)) continue;
    if (/role="(switch|tab|menuitem)"/.test(attrs)) continue;
    // Controle de seleção (aba, segmentado, paginação, navegação de ano): tem
    // estado, não ação. A marcação semântica é o que o torna legível sem cor —
    // é ela que compra a isenção, não o formato do botão.
    if (/aria-(pressed|current|selected)=/.test(attrs)) continue;
    const resto = src.slice(fimDaTag);
    const fim = resto.indexOf(`</${tagName}>`);
    if (fim < 0 || fim > 900) continue;
    const corpo = resto.slice(0, fim);
    // sem rótulo de texto é ação só-ícone: outro componente cuida dela
    const texto = corpo
      .replace(/<span[^>]*material-symbols[^>]*>[\s\S]*?<\/span>/g, '')
      .replace(/<svg[\s\S]*?<\/svg>/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!texto || /^\{?\s*\}?$/.test(texto)) continue;
    violations.button.push(
      `${file}:${lineOf(src, m.index)}  <${tagName}> com superfície de botão fora de ui/Button`,
    );
  }

  // ── pill ───────────────────────────────────────────────────────────────
  // Um botão redondo (`<button … rounded-full`) tem a mesma forma e não é
  // pill: os literais dentro dos atributos de `<button` ficam de fora.
  if (!file.endsWith('components/ui/Badge.tsx')) {
    const botoes = [];
    for (const m of src.matchAll(/<button\b/g)) {
      const lido = atributosDe(src, m.index);
      if (lido) botoes.push([m.index, lido.fim]);
    }
    for (const { lit, at } of literaisDe(src)) {
      if (!PILL_RAIO.test(lit) || !PILL_TEXTO.test(lit) || !PILL_PESO.test(lit) || !PILL_FUNDO.test(lit)) continue;
      stats.pill++;
      if (DISCO.test(lit) || botoes.some(([ini, fim]) => at >= ini && at < fim)) continue;
      violations.pill.push(`${file}:${lineOf(src, at)}  pill de situação à mão — use <Badge tone=…>`);
    }
  }

  // ── empty ──────────────────────────────────────────────────────────────
  // No código-fonte, não nos literais: o `text-center` e o texto JSX
  // `>Nenhum` estão em nós diferentes. `title="Nenhum…"` é atributo e passa.
  if (!file.endsWith('components/ui/EmptyState.tsx')) {
    for (const m of src.matchAll(VAZIO)) {
      if (!NENHUM.test(src.slice(m.index, m.index + 400))) continue;
      stats.empty++;
      violations.empty.push(`${file}:${lineOf(src, m.index)}  estado vazio à mão — use <EmptyState icon title>`);
    }
  }

  // ── field ──────────────────────────────────────────────────────────────
  // Só nos três controles de campo: num `<div>` a borda 300 pode ser legítima.
  for (const m of src.matchAll(CAMPO_ABRE)) {
    const lido = atributosDe(src, m.index + m[0].length);
    if (!lido) continue;
    const c = expandir(classeDe(lido.attrs), ligacoes);
    for (const b of c.matchAll(BORDA_CAMPO)) {
      stats.field++;
      violations.field.push(
        `${file}:${lineOf(src, m.index)}  <${m[1]}> com ${b[0]} — campo usa border-slate-200 dark:border-slate-700`,
      );
    }

    // ── label ──────────────────────────────────────────────────────────
    const a = lido.attrs;
    if (TIPO_SEM_ROTULO.test(a) || ROTULO_ARIA.test(a) || /\sid=/.test(a)) continue;
    if (ROTULO_ANTES.test(src.slice(Math.max(0, m.index - 400), m.index))) continue;
    stats.label++;
    violations.label.push(`${file}:${lineOf(src, m.index)}  controle sem rótulo — <Field>, <label htmlFor> ou aria-label`);
  }

  // ── sortable ───────────────────────────────────────────────────────────
  if (!file.endsWith('components/ui/SortableTh.tsx')) {
    for (const m of src.matchAll(TH_ABRE)) {
      const lido = atributosDe(src, m.index + m[0].length);
      if (!lido || !/\sonClick=/.test(lido.attrs)) continue;
      stats.sortable++;
      violations.sortable.push(`${file}:${lineOf(src, m.index)}  <th onClick> — o teclado não chega; use <SortableTh>`);
    }
  }

  // ── iconbtn ────────────────────────────────────────────────────────────
  // Texto visível = ≥ 2 letras fora de `{…}` depois de tirar os spans de ícone.
  // Dentro de `{…}` só as strings contam (`{a ? 'Salvando…' : 'Salvar'}` é
  // rótulo; `{label}` é opaco e não compra a isenção).
  if (!file.endsWith('components/ui/Button.tsx')) {
    for (const m of src.matchAll(BOTAO_MIN)) {
      const lido = atributosDe(src, m.index + m[0].length);
      if (!lido || ROTULO_ARIA.test(lido.attrs)) continue;
      const resto = src.slice(lido.fim);
      const fim = resto.indexOf('</button>');
      if (fim < 0) continue;
      const corpo = resto.slice(0, fim);
      if (!corpo.includes('material-symbols-outlined')) continue;
      // `{tab.label}` / `{u.name}` é rótulo visível — um identificador dentro de
      // `{…}` compra a isenção. Só `{' '}` e afins ficam opacos.
      const texto = semTags(corpo.replace(/<span[^>]*material-symbols[^>]*>[\s\S]*?<\/span>/g, ''))
        .replace(/\{[\s\S]*?\}/g, (m) => {
          const strings = (m.match(/(['"])(?:(?!\1).)*\1/g) ?? []).join(' ');
          const semStrings = m.replace(/(['"])(?:(?!\1).)*\1/g, '');
          return /[A-Za-z_$][\w$.]*/.test(semStrings) ? strings + ' expr' : strings;
        });
      if (/\p{L}{2}/u.test(texto)) continue;
      stats.iconbtn++;
      violations.iconbtn.push(`${file}:${lineOf(src, m.index)}  botão só-ícone sem aria-label — o leitor de tela diz "botão"`);
    }
  }
}

if (STATS) {
  console.log(JSON.stringify(stats, null, 2));
}

let failed = 0;
for (const [secao, lista] of Object.entries(violations)) {
  if (lista.length === 0) {
    console.log(`ok   ${secao}: 0 violações`);
    continue;
  }
  failed += lista.length;
  console.error(`FALHA ${secao}: ${lista.length} violações`);
  for (const v of lista.slice(0, 20)) console.error(`  ${v}`);
  if (lista.length > 20) console.error(`  ... e mais ${lista.length - 20}`);
}

process.exit(failed === 0 ? 0 : 1);
