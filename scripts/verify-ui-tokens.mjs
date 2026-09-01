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

const violations = { primary: [], muted: [], scale: [] };
const stats = { arquivos: files.length, literais: 0, primary: 0, muted: 0, icone: 0, escala: 0 };

/**
 * Chave de mapa, não classe: ou é chave de objeto (`'text-primary': ...`),
 * ou é índice de lookup (`bgMap['text-primary']`). Qualquer outra posição —
 * prop, resultado de ternário, variável — chega a uma className e é policiada.
 */
const isTokenKey = (src, at, raw) =>
  src[at - 1] === '[' || src[at + raw.length] === ':';

const lineOf = (src, at) => src.slice(0, at).split('\n').length;

for (const file of files) {
  const src = readFileSync(file, 'utf8');
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
      const pair = `dark:${variant}text-blue-300`;
      if (!lit.includes(pair)) {
        violations.primary.push(`${line()}  ${variant}text-primary-dark sem ${pair}`);
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
