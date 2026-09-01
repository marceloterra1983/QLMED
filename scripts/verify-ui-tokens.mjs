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
 *
 * Uso: node scripts/verify-ui-tokens.mjs [--stats]
 */
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const STATS = process.argv.includes('--stats');
// Raiz varrida; um caminho explícito serve ao harness de controle positivo.
const ROOT = process.argv.slice(2).find((a) => !a.startsWith('--')) ?? 'src';

// Literais de string do TSX: "...", '...' e `...`.
const LITERAL = /"([^"\\\n]*(?:\\.[^"\\\n]*)*)"|'([^'\\\n]*(?:\\.[^'\\\n]*)*)'|`([^`\\]*(?:\\.[^`\\]*)*)`/g;

// Prefixo de variante Tailwind (sm:, hover:, dark:group-hover: ...).
const VARIANTS = '(?:[a-z][a-z0-9-]*:)*';
const PRIMARY = new RegExp(`(?<![-\\w])(${VARIANTS})text-primary\\b(?!-)`, 'g');
// primary-dark é ainda mais escuro (2,33:1 sobre card-dark): par mais claro.
const PRIMARY_DARK = new RegExp(`(?<![-\\w])(${VARIANTS})text-primary-dark\\b`, 'g');
const SLATE400 = new RegExp(`(?<![-\\w])(${VARIANTS})text-slate-400\\b`, 'g');
const DARK500 = /(?<![-\w])dark:text-slate-500\b/g;
const PX = new RegExp(`(?<![-\\w])(${VARIANTS})text-\\[(\\d+)px\\]`, 'g');

const PX_FLOOR = 16; // até aqui é tamanho de texto; acima, só ícone usa px

const files = execFileSync(
  'find', [ROOT, '(', '-name', '*.tsx', '-o', '-name', '*.ts', ')', '-not', '-path', '*/__tests__/*'],
  { encoding: 'utf8' }
).trim().split('\n').filter(Boolean).sort();

const violations = { primary: [], muted: [], scale: [], button: [] };
const stats = { arquivos: files.length, literais: 0, primary: 0, muted: 0, icone: 0, escala: 0 };

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
  for (const m of src.matchAll(LITERAL)) {
    const lit = m[1] ?? m[2] ?? m[3];
    if (!lit) continue;
    const at = m.index;
    const raw = m[0];
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
  }
}

// ── button ────────────────────────────────────────────────────────────────
// Superfície de botão primário ou de perigo escrita à mão. Antes da etapa 2 o
// botão primário tinha 23 grafias, divergindo em hover, raio, peso e estado
// desabilitado; `components/ui/Button.tsx` é a única fonte agora.
// Fora do alvo: item de navegação, ação só-ícone de linha, item de menu e
// controles com papel próprio (`role="switch"`, cabeçalho de acordeão).
const BOTAO_ABRE = /<(button|Link|a)\b/g;

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
// Superfície em REPOUSO, sem prefixo de variante: `hover:bg-primary/10` é
// afordância de passagem do mouse, não fundo de botão — contá-la fazia a regra
// acusar os atalhos da barra lateral.
const SUPERFICIE = /(?<![-\w:])bg-(primary|red-600|red-500)\b/;
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
