# Plano: campanha de verificação QLMED (2026-09-11)

Base: `main` @ `be3ffb4`. Working tree limpa salvo `GATES.md`.
Não misturar DANFE / `public/brand`. Não deploy.

## Porquê esta janela

`main` não tem diff local. Skills de review que exigem diff usam a janela
documentos `e8c5ef1^..HEAD` (#430–#442, SPEC-042). Skills de repo inteiro
(ponytail-audit, security em auth/isolamento) olham as superfícies quentes.

## Skills nesta passagem

| Skill | Superfície |
|---|---|
| typecheck / lint / npm test | repo |
| docs:validate, ui:verify, test:invariants, audit:verify | repo |
| graphify query | hotspots |
| security-review | auth, company isolation, APIs documentos |
| ponytail-audit | `src/lib/documentos/` |
| ponytail-review | diff #430–#442 |
| code-review Standards | AGENTS.md + smells vs diff |
| code-review Spec | SPEC-042 vs diff |
| audit-code | ficheiros da janela |
| review (correctness) | mesmos ficheiros |
| web-design-guidelines | UI documentos |
| Codex `exec` read-only | mesma janela |

`request-review` Santa AND-gate e `test:integration` / `build` ficam para
depois do ledger — não bloqueiam esta passagem.

## Entrega

`docs/superpowers/plans/2026-09-11-verify-qlmed-ledger.md` com achados
confirmados (refutados à parte). Correcções só depois do G6, em branch.

## Status

- 2026-09-11: gates escritos; workflow + portões mecânicos a arrancar.
- 2026-09-11: G1–G4 verdes (tsc/lint/test/docs/ui/invariants/audit). Codex+agy lidos e refutados. Ledger em `docs/superpowers/plans/2026-09-11-verify-qlmed-ledger.md`. Workflow ainda na fase Review (`skill:correctness`).
- 2026-09-11: workflow complete (8 review + 16 verify). G5–G6 fechados. 6/6 gates.
