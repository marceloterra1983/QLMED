---
id: PLAN-073
status: approved
owner: QLMED
---

# Plan: SPEC-073 — número da NF com ponto

## Constitution check

- Sem schema, sem auth, sem segredo. Só apresentação.
- Helper em `src/lib/utils.ts` (Principle IV).
- Evidência: testes do helper, Highlight, caption e push.

## Approach

1. `formatInvoiceNumber` ao lado de `formatInt`: dígitos, tira zeros à esquerda, agrupa com `.`.
2. Highlight inclui a forma formatada nos variantes da busca.
3. Trocar exibições do painel; CSV/API/DANFE ficam crus.

## Files

- `src/lib/utils.ts` + `src/lib/__tests__/utils.test.ts`
- `src/components/ui/Highlight.tsx` + teste
- Listas fiscais, entrada NF-e, financeiro, estoque, cadastro, Unimed, emissões, modais
- `src/lib/web-push.ts`, `src/lib/cte-whatsapp-caption.ts`

## Complexity

Nenhuma. Rejeitada a ideia de reusar `fmtNfNum` (pad 9 dígitos `000.065.254`) — o pedido é `65.254`.
