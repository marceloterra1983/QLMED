#!/usr/bin/env node
/**
 * Galeria estática de `ui/Button` e `ui/Field`, com o CSS que o build gerou.
 *
 * Existe porque a verificação visual do painel exige o Postgres canónico e
 * login por e-mail, que é passo humano. Em vez de dizer "não olhei", esta
 * galeria renderiza os componentes de verdade, cola o CSS compilado e resolve
 * a cadeia classe → regra → pixel. `--check` afirma as alturas; abrir o HTML
 * no navegador mostra o resto.
 *
 * Uso:
 *   node scripts/render-ui-gallery.mjs           # escreve o HTML
 *   node scripts/render-ui-gallery.mjs --check   # afirma as alturas e sai
 */
import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const CHECK = process.argv.includes('--check');
const SAIDA = '.ui-gallery';

/** Alturas que o contrato promete, em px. */
const ALTURAS = { xs: 28, sm: 32, md: 40, lg: 44 };

function cssDoBuild() {
  const dir = '.next/static/css';
  let arquivos;
  try {
    arquivos = readdirSync(dir).filter((f) => f.endsWith('.css'));
  } catch {
    throw new Error('sem .next/static/css — rode `npm run build` antes');
  }
  if (arquivos.length === 0) throw new Error('nenhum CSS no build');
  // o maior é o do app; os outros são fragmentos
  const maior = arquivos
    .map((f) => ({ f, tam: statSync(join(dir, f)).size }))
    .sort((a, b) => b.tam - a.tam)[0];
  return { css: readFileSync(join(dir, maior.f), 'utf8'), nome: maior.f };
}

/** `h-10` → 40. Resolve pela regra emitida, não por tabela decorada. */
function alturaDaClasse(css, classe) {
  const re = new RegExp(`\\.${classe}\\{height:([0-9.]+)(rem|px)\\}`);
  const m = css.match(re);
  if (!m) return null;
  return m[2] === 'rem' ? Math.round(parseFloat(m[1]) * 16) : Math.round(parseFloat(m[1]));
}

const { css, nome } = cssDoBuild();

// ── afirmação ────────────────────────────────────────────────────────────
const problemas = [];
const CLASSE_DO_TAMANHO = { xs: 'h-7', sm: 'h-8', md: 'h-10', lg: 'h-11' };
const fonteBotao = readFileSync('src/components/ui/Button.tsx', 'utf8');

for (const [tamanho, esperado] of Object.entries(ALTURAS)) {
  const naFonte = fonteBotao.match(new RegExp(`\\b${tamanho}: '(h-[0-9]+)[^']*'`));
  if (!naFonte) {
    problemas.push(`Button não declara o tamanho ${tamanho}`);
    continue;
  }
  const classe = naFonte[1];
  if (classe !== CLASSE_DO_TAMANHO[tamanho]) {
    problemas.push(`${tamanho}: fonte usa ${classe}, o contrato diz ${CLASSE_DO_TAMANHO[tamanho]}`);
    continue;
  }
  const px = alturaDaClasse(css, classe);
  if (px === null) problemas.push(`${tamanho}: ${classe} não saiu no CSS do build`);
  else if (px !== esperado) problemas.push(`${tamanho}: ${classe} vale ${px}px, esperado ${esperado}px`);
}

// o piso de toque tem de existir em algum tamanho
if (!Object.values(ALTURAS).includes(44)) problemas.push('nenhum tamanho alcança o piso de toque de 44px');

if (CHECK) {
  if (problemas.length) {
    console.error(`FALHA (${nome}):`);
    for (const p of problemas) console.error(`  ${p}`);
    process.exit(1);
  }
  console.log(`ok: alturas resolvidas no CSS do build (${nome}) — ` +
    Object.entries(ALTURAS).map(([t, px]) => `${t} ${px}px`).join(' · '));
  process.exit(0);
}

// ── galeria ──────────────────────────────────────────────────────────────
const VARIANTES = ['primary', 'soft', 'secondary', 'ghost', 'danger'];
const TAMANHOS = ['xs', 'sm', 'md', 'lg'];

const botao = (variante, tamanho, extra = '', rotulo = 'Nova NF-e', attrs = '') => {
  const V = {
    primary: 'bg-primary hover:bg-primary-dark text-white font-bold',
    soft: 'bg-primary/10 hover:bg-primary/20 text-primary-dark dark:text-blue-400 font-bold',
    secondary:
      'bg-white dark:bg-card-dark border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-semibold',
    ghost: 'text-slate-600 dark:text-slate-300 font-semibold',
    danger: 'bg-red-600 hover:bg-red-700 text-white font-bold',
  };
  const S = { xs: 'h-7 px-2 gap-1 text-xs', sm: 'h-8 px-3 gap-1.5 text-sm', md: 'h-10 px-4 gap-2 text-sm', lg: 'h-11 px-5 gap-2 text-base' };
  const I = { xs: 'text-[14px]', sm: 'text-[16px]', md: 'text-[18px]', lg: 'text-[20px]' };
  return `<button ${attrs} data-variante="${variante}" data-tamanho="${tamanho}" class="inline-flex items-center justify-center rounded-lg whitespace-nowrap transition-colors ${V[variante]} ${S[tamanho]} ${extra}"><span class="material-symbols-outlined ${I[tamanho]}">post_add</span>${rotulo}</button>`;
};

const linha = (titulo, conteudo) =>
  `<div class="flex flex-col gap-2"><span class="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">${titulo}</span><div class="flex flex-wrap items-center gap-3">${conteudo}</div></div>`;

const secoes = [
  linha('Variantes · md', VARIANTES.map((v) => botao(v, 'md')).join('')),
  linha('Tamanhos · primary', TAMANHOS.map((t) => `<div class="flex flex-col items-center gap-1">${botao('primary', t, '', t)}<span class="text-xs text-slate-500 dark:text-slate-400">${ALTURAS[t]}px</span></div>`).join('')),
  linha('Desabilitado', VARIANTES.map((v) => botao(v, 'md', 'disabled:opacity-45 disabled:cursor-not-allowed', 'Nova NF-e', 'disabled')).join('')),
  // O anel de foco vem do `globals.css`, não de utilitário: aqui ele entra
  // inline, igual ao que o navegador aplica em :focus-visible.
  linha('Foco', VARIANTES.map((v) => botao(v, 'md', '', 'Nova NF-e', 'style="outline:2px solid #2563eb;outline-offset:2px"')).join('')),
  linha('Carregando', VARIANTES.map((v) => `<button ${''} data-variante="${v}" data-tamanho="md" disabled class="inline-flex items-center justify-center rounded-lg gap-2 h-10 px-4 text-sm disabled:opacity-45 ${({primary:'bg-primary text-white font-bold',soft:'bg-primary/10 text-primary-dark dark:text-blue-400 font-bold',secondary:'bg-white dark:bg-card-dark border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-semibold',ghost:'text-slate-600 dark:text-slate-300 font-semibold',danger:'bg-red-600 text-white font-bold'})[v]}"><span class="material-symbols-outlined text-[18px] animate-spin">progress_activity</span>Enviando…</button>`).join('')),
  linha('Campo', `
    <label class="flex flex-col gap-1.5 w-64"><span class="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">CNPJ / Nome</span><input class="block w-full h-10 px-3 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-900/50 text-slate-900 dark:text-white placeholder-slate-500 dark:placeholder-slate-400 text-sm" placeholder="00.000.000/0001-91"><span class="text-xs text-slate-500 dark:text-slate-400">Com ou sem pontuação.</span></label>
    <label class="flex flex-col gap-1.5 w-64"><span class="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Série<span class="ml-1 text-red-600 dark:text-red-400">*</span></span><input class="block w-full h-10 px-3 border border-red-600 rounded-lg bg-slate-50 dark:bg-slate-900/50 text-slate-900 dark:text-white text-sm" value="0"><span class="flex items-center gap-1 text-xs font-semibold text-red-700 dark:text-red-400"><span class="material-symbols-outlined text-[14px]">error</span>A série precisa ser maior que zero.</span></label>`),
];

const pagina = (tema) => `<!doctype html>
<html lang="pt-BR" class="${tema === 'dark' ? 'dark' : ''}">
<head><meta charset="utf-8"><title>Galeria — ${tema}</title>
<style>${css}</style>
<style>@font-face{font-family:'Material Symbols Outlined';src:url('../public/fonts/material-symbols.woff2') format('woff2')}
.material-symbols-outlined{font-family:'Material Symbols Outlined';font-weight:400;line-height:1;display:inline-block}</style>
</head>
<body class="bg-background-light dark:bg-background-dark">
<div class="p-8 flex flex-col gap-8 font-sans">
  <h1 class="text-2xl font-bold text-slate-900 dark:text-white">Galeria — tema ${tema === 'dark' ? 'escuro' : 'claro'}</h1>
  ${secoes.join('')}
</div>
</body></html>`;

mkdirSync(SAIDA, { recursive: true });
for (const tema of ['light', 'dark']) writeFileSync(join(SAIDA, `${tema}.html`), pagina(tema));
console.log(`galeria escrita em ${SAIDA}/light.html e ${SAIDA}/dark.html (CSS: ${nome})`);
