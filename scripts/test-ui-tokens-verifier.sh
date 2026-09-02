#!/usr/bin/env bash
# Controle positivo de scripts/verify-ui-tokens.mjs.
#
# Um verificador que nunca reprova é indistinguível de um verificador cego.
# Este harness injeta uma violação de cada tipo num fixture e exige reprovação,
# e exige aprovação no fixture limpo. Falha se qualquer um dos dois inverter.
set -euo pipefail

VERIFIER="$(cd "$(dirname "$0")" && pwd)/verify-ui-tokens.mjs"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

falhas=0

caso() { # nome  esperado(pass|fail)  conteudo
  local nome="$1" esperado="$2" conteudo="$3"
  local dir="$TMP/$nome"
  mkdir -p "$dir"
  printf '%s\n' "$conteudo" > "$dir/Fixture.tsx"
  local saida rc
  set +e
  saida="$(node "$VERIFIER" "$dir" 2>&1)"; rc=$?
  set -e
  if [ "$esperado" = "fail" ] && [ "$rc" -eq 0 ]; then
    echo "CEGO  $nome: verificador aprovou uma violação real"
    echo "$saida" | sed 's/^/      /'
    falhas=$((falhas + 1))
  elif [ "$esperado" = "pass" ] && [ "$rc" -ne 0 ]; then
    echo "FALSO $nome: verificador reprovou código correto"
    echo "$saida" | sed 's/^/      /'
    falhas=$((falhas + 1))
  else
    echo "ok    $nome (esperado $esperado, rc=$rc)"
  fi
}

caso primary-sem-par fail \
  'export const A = () => <span className="font-bold text-primary">x</span>;'

caso primary-hover-sem-par fail \
  'export const A = () => <span className="hover:text-primary dark:text-blue-400">x</span>;'

caso primary-dark-hover-sem-par fail \
  'export const A = () => <span className="text-primary dark:text-blue-400 hover:text-primary-dark">x</span>;'

caso slate400-claro fail \
  'export const A = () => <span className="text-slate-400 dark:text-white">x</span>;'

caso dark-slate500 fail \
  'export const A = () => <span className="text-slate-600 dark:text-slate-500">x</span>;'

caso px-em-texto fail \
  'export const A = () => <span className="text-[10px] font-bold">x</span>;'

caso botao-cru fail \
  'export const A = () => <button className="px-4 py-2.5 bg-primary text-white rounded-lg">Salvar</button>;'

caso botao-perigo-cru fail \
  'export const A = () => <a className="px-4 py-2 bg-red-600 text-white rounded-lg">Excluir</a>;'

caso botao-superficie-em-const fail \
  'const cls = "px-4 py-2.5 bg-primary text-white rounded-lg";
export const A = () => <button className={cls}>Salvar</button>;'

caso botao-superficie-em-ternario fail \
  'const isDanger = true;
const confirmCls = isDanger ? "bg-red-600 text-white" : "bg-primary text-white";
export const A = () => <button className={`flex-1 px-4 py-2.5 ${confirmCls}`}>Confirmar</button>;'

caso botao-escondido-atras-de-arrow fail \
  'export const A = () => <button onClick={() => salvar()} className="px-4 py-2.5 bg-primary text-white rounded-lg">Salvar</button>;'

caso botao-gradiente fail \
  'export const A = () => <button className="px-4 py-2.5 rounded-lg bg-gradient-to-r from-primary to-primary-dark text-white">Salvar</button>;'

caso foco-ring fail \
  'export const A = () => <input className="border rounded-lg focus:ring-2 focus:ring-primary/50" />;'

caso foco-outline-none fail \
  'export const A = () => <button className="focus:outline-none">x</button>;'

caso raio-md fail \
  'export const A = () => <div className="rounded-md">x</div>;'

caso raio-2xl-com-canto fail \
  'export const A = () => <div className="sm:rounded-t-2xl">x</div>;'

caso campo-borda-300 fail \
  'export const A = () => <input className="border border-slate-300 dark:border-slate-600" />;'

caso classe-em-template-aninhado fail \
  'export const A = ({ on }: { on: boolean }) => <a className={`px-3 ${on ? `bg-primary/10 text-primary` : "text-slate-600 dark:text-slate-300"}`}>x</a>;'

caso pill-a-mao fail \
  'export const A = () => <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-green-100 text-green-700">Ativa</span>;'

caso contador-a-mao fail \
  'export const A = () => <span className="min-w-[22px] rounded-full bg-slate-100 text-xs font-bold">3</span>;'

caso vazio-a-mao fail \
  'export const A = () => <div className="p-8 text-center text-slate-500"><span className="material-symbols-outlined">inbox</span><p>Nenhum item</p></div>;'

caso th-onclick fail \
  'export const A = () => <table><thead><tr><th onClick={() => ordenar("a")} className="px-4">A</th></tr></thead></table>;'

caso botao-so-icone fail \
  'export const A = () => <button onClick={x}><span className="material-symbols-outlined">close</span></button>;'

caso botao-so-icone-com-title fail \
  'export const A = () => <button onClick={x} title="Fechar"><span className="material-symbols-outlined">close</span></button>;'

caso controle-sem-rotulo fail \
  'export const A = () => <input value={v} onChange={f} />;'

caso texto-slate-300 fail \
  'export const A = () => <p className="text-slate-300">—</p>;'

caso formato-nu fail \
  'export const A = () => <p>{(n).toLocaleString("pt-BR")}</p>;'

caso cartao-a-mao fail \
  'export const A = () => <div className="bg-white dark:bg-card-dark border border-slate-200 rounded-xl p-4">x</div>;'

caso spinner-a-mao fail \
  'export const A = () => <span className="material-symbols-outlined animate-spin">progress_activity</span>;'

caso sombra-cravada fail \
  'export const A = () => <div className="shadow-[0_2px_8px_rgba(0,0,0,0.08)]">x</div>;'

caso ui-ok-sem-motivo fail \
  'export const A = () => <p>{n.toFixed(2)}</p>; // ui-ok'

caso cartao-de-secao-antigo fail \
  'export const A = () => <CollapsibleCard icon="x" title="T">c</CollapsibleCard>;'

caso limpo pass \
  'const bgMap: Record<string, string> = { "text-primary": "bg-primary/10" };
export const A = () => (
  <>
    <span className="text-primary dark:text-blue-400">a</span>
    <span className="hover:text-primary dark:hover:text-blue-400">b</span>\n    <span className="hover:text-primary-dark dark:hover:text-blue-300">b2</span>
    <span className="text-slate-500 dark:text-slate-400 text-xs">c</span>
    <span className="material-symbols-outlined text-[20px]">home</span>
    <span className={bgMap["text-primary"]}>d</span>
    <button className="p-1.5 rounded-lg hover:bg-primary/10" aria-label="Ver"><span className="material-symbols-outlined text-[18px]">search</span></button>
    <button role="switch" aria-checked="false" aria-label="Avisar" className="w-12 h-6 rounded-full bg-primary">x</button>
    <button onClick={() => ir(2)} aria-pressed={true} className="px-3 py-1 rounded-lg bg-primary text-white">2026</button>
    <button onClick={() => sair()} className="px-3 py-2 rounded-lg text-slate-500 hover:bg-primary/10">Trocar conta</button>
    <div className="border-slate-300 rounded-lg">e</div>
    <div className="focus-within:ring-2">f</div>
    <span className="rounded-full">g</span>
    <button aria-current="page" className="w-9 h-9 rounded-full bg-primary text-white text-xs font-bold hover:bg-primary-dark">1</button>
    <button onClick={() => ir(1)} className="w-9 h-9 rounded-full bg-slate-100 text-xs font-semibold">1</button>
    <EmptyState icon="inbox" title="Nenhum item" />
    <Badge tone="success">Ativa</Badge>
    <span className="flex items-center justify-center w-7 h-7 rounded-full bg-primary/10 text-primary dark:text-blue-400 text-xs font-bold">1</span>
    <button aria-label="Fechar"><span className="material-symbols-outlined">close</span></button>
    <button><span className="material-symbols-outlined">save</span>Salvar</button>
    <input aria-label="Quantidade" />
    <span className="material-symbols-outlined text-slate-300">inbox</span>
    <SortableTh col="a" sortBy="a" sortOrder="asc" onSort={f}>A</SortableTh>
  </>
);
    <button onClick={f}><span className="material-symbols-outlined">save</span><span>{tab.label}</span></button>
    <button aria-label="Recolher" className="p-1 rounded text-slate-300 hover:text-slate-500"><span className="material-symbols-outlined">chevron_left</span></button>
    <DetailField label="Referência"><input value={r} onChange={f} /></DetailField>
    <Card padding="sm">x</Card>
    <Spinner size="sm" />
    <div className="shadow-sheet-top">h</div>
    <p>{formatInt(n)}</p>
    <div className="bg-white dark:bg-card-dark sm:rounded-xl">i</div>
    <p>{new Decimal(v).toDecimalPlaces(2).toFixed(2)}</p>
    {/* ui-ok: payload da API, não exibição */}
    <p>{vNf.toFixed(2)}</p>
    <Section icon="x" title="T" defaultOpen>c</Section>'

echo
if [ "$falhas" -ne 0 ]; then
  echo "REPROVADO: $falhas controle(s) inverteram"
  exit 1
fi
echo "APROVADO: 32 violações reprovadas, fixture limpo aprovado"
