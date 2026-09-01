# Gates: nfe-destinatario-apelido

Scope: Na Nova NF-e, label do destinatário usa ContactNickname.shortName/apelido quando existir; senão recipientName (razão social). Sem inventar apelido.

- [x] G1: Helper preferencial de label: shortName trimado não-vazio vence; vazio/null/whitespace cai na razão social
  CHECK: cd /home/marce/qlmed/.worktrees/nfe-form-order && npx vitest run src/lib/__tests__/nfe-recipient-display-name.test.ts --reporter=dot
  EXPECT: Test Files  1 passed
  EVIDENCE: Start at  21:11:30 | Duration  151ms (transform 28ms, setup 0ms, import 37ms, tests 4ms, environment 0ms)

- [x] G2: SPEC-025 documenta o contrato de label do destinatário (apelido > razão)
  CHECK: rg -n "shortName|apelido|nome abreviado" /home/marce/qlmed/.worktrees/nfe-form-order/specs/025-emissao-nota-fiscal/spec.md
  EXPECT: /shortName|apelido/
  EVIDENCE: 472:- **SC-006**: Editor localiza o destinatário pelo nome, apelido ou | 473:  CNPJ no mesmo campo; reconhece o apelido na lista e no

- [x] G3: UI da caixa de destinatários e do campo selecionado usam o helper (não recipientName cru)
  CHECK: rg -n "recipientDisplayName|shortName" /home/marce/qlmed/.worktrees/nfe-form-order/src/app/\(painel\)/fiscal/issued/nova/page-client.tsx
  EXPECT: recipientDisplayName
  EVIDENCE: 513:                        <div className="text-sm font-bold text-slate-900 dark:text-white">{recipientDisplayName(dest.name, dest.shortName)}</div> | 529:                            <span className=

- [x] G4: tsc sem erro de tipo
  CHECK: cd /home/marce/qlmed/.worktrees/nfe-form-order && npx tsc --noEmit && echo TSC_OK
  EXPECT: TSC_OK
  EVIDENCE: TSC_OK

- [x] G5: lint sem erro nos arquivos tocados
  CHECK: cd /home/marce/qlmed/.worktrees/nfe-form-order && npx eslint src/lib/nfe-emission/recipient-display-name.ts src/lib/__tests__/nfe-recipient-display-name.test.ts src/app/\(painel\)/fiscal/issued/nova/page-client.tsx --max-warnings 0 && echo LINT_OK
  EXPECT: LINT_OK
  EVIDENCE: LINT_OK

- [x] G6: Preview :3002 responde (health/HTML) na worktree nfe-form-order
  CHECK: curl -sS -o /dev/null -w "%{http_code}" http://127.0.0.1:3002/fiscal/issued/nova
  EXPECT: /200|307|302/
  EVIDENCE: 307
