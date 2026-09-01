#!/usr/bin/env node
/**
 * Verifica que o painel tem um só diálogo.
 *
 *   overlay — `fixed inset-0` em literal de classe só existe em `ui/Modal.tsx`
 *             e `ui/ConfirmDialog.tsx`. Treze modais copiaram o overlay à mão
 *             e deixaram para trás foco preso, `Esc`, trava de rolagem e nome
 *             acessível; foram migrados para `<Modal>` e esta regra é o que
 *             impede que voltem.
 *   nome    — todo `role="dialog"` / `role="alertdialog"` tem `aria-labelledby`
 *             ou `aria-label` nos mesmos atributos. Sem isso o leitor de tela
 *             anuncia "diálogo" e mais nada. Sem isenção: `Modal.tsx` e
 *             `ConfirmDialog.tsx` também cumprem.
 *
 * Uso: node scripts/verify-ui-dialogs.mjs [--stats] [raiz]
 */
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const STATS = process.argv.includes('--stats');
// Raiz varrida; um caminho explícito serve ao harness de controle positivo.
const ROOT = process.argv.slice(2).find((a) => !a.startsWith('--')) ?? 'src';

// Literais de string do TSX: "...", '...' e `...`.
const LITERAL = /"([^"\\\n]*(?:\\.[^"\\\n]*)*)"|'([^'\\\n]*(?:\\.[^'\\\n]*)*)'|`([^`\\]*(?:\\.[^`\\]*)*)`/g;

// Overlay em repouso, sem prefixo de variante: `sm:fixed inset-0` não é o
// overlay de um diálogo que cobre a tela em todos os tamanhos.
const OVERLAY = /(?<![-\w:])fixed inset-0\b/g;
const ROLE_DIALOGO = /\brole=\{?["'](dialog|alertdialog)["']\}?/;
const NOME = /\baria-(labelledby|label)=/;
const TAG_ABRE = /<[A-Za-z][\w.]*(?=[\s/>])/g;

// Os únicos donos legítimos do overlay.
const DIALOGOS = ['components/ui/Modal.tsx', 'components/ui/ConfirmDialog.tsx'];
// Não é diálogo: fundo do menu lateral no celular (`fixed inset-0 … z-30
// lg:hidden`, `onClick={onCloseMobile}`), um drawer de navegação com fecho
// próprio e sem `role="dialog"`. Migrá-lo para `<Modal>` seria errado.
const DRAWERS = ['components/Sidebar.tsx'];

const files = execFileSync(
  'find', [ROOT, '-name', '*.tsx', '-not', '-path', '*/__tests__/*'],
  { encoding: 'utf8' }
).trim().split('\n').filter(Boolean).sort();

const violations = { overlay: [], nome: [] };
const stats = { arquivos: files.length, overlays: 0, dialogos: 0 };

const lineOf = (src, at) => src.slice(0, at).split('\n').length;

/**
 * Apaga comentários preservando os offsets, senão o cabeçalho de `Modal.tsx`
 * (que cita `role="dialog"` para explicar o porquê) viraria violação.
 */
const semComentarios = (src) =>
  src.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, (m) => m.replace(/[^\n]/g, ' '));

/**
 * Atributos da tag, do nome até o `>` que a fecha, contando chaves.
 * `[^>]*?>` truncava em qualquer `=>` de arrow function — e um
 * `onClick={() => ...}` antes do `role` escondia o diálogo inteiro da regra.
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

for (const file of files) {
  const src = semComentarios(readFileSync(file, 'utf8'));
  const isento = [...DIALOGOS, ...DRAWERS].some((p) => file.endsWith(p));

  // ── overlay ────────────────────────────────────────────────────────────
  for (const m of src.matchAll(LITERAL)) {
    const lit = m[1] ?? m[2] ?? m[3];
    if (!lit) continue;
    for (const _ of lit.matchAll(OVERLAY)) {
      stats.overlays++;
      if (isento) continue;
      violations.overlay.push(`${file}:${lineOf(src, m.index)}  overlay à mão fora de ui/Modal — use <Modal>`);
    }
  }

  // ── nome ───────────────────────────────────────────────────────────────
  for (const m of src.matchAll(TAG_ABRE)) {
    const lido = atributosDe(src, m.index + m[0].length);
    if (!lido || !ROLE_DIALOGO.test(lido.attrs)) continue;
    stats.dialogos++;
    if (NOME.test(lido.attrs)) continue;
    violations.nome.push(
      `${file}:${lineOf(src, m.index)}  role="dialog" sem aria-labelledby/aria-label — leitor de tela anuncia "diálogo" e mais nada`,
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
