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
  </>
);'

echo
if [ "$falhas" -ne 0 ]; then
  echo "REPROVADO: $falhas controle(s) inverteram"
  exit 1
fi
echo "APROVADO: 18 violações reprovadas, fixture limpo aprovado"
