---
id: PLAN-076
status: approved
owner: QLMED
---

# Plan: SPEC-076 — follow-up operacional após SEFAZ

## Constitution check

- I. Evidência: testes do módulo + costura em `authorizeInvoiceEmission`.
- II. Sem mudança de ACL; emissão já é por `companyId` autenticado.
- III. Sem schema.
- IV. Cliente em `src/lib/nfe-emission/jev-sefaz-followup.ts`; rota HTTP intocada.
  Costura de teste: `AuthorizeDeps.followup`.
- V. Sem XML, certificado ou chave de acesso no estado enviado. Timeout 2,5s.
  Falha não propaga. `.env` não é lido/gravado por este trabalho.
- VI. Contrato em `specs/076-jev-sefaz-followup/spec.md`.

## Approach

1. Depois de `pending`/`rejected` (envio ou consulta de protocolo), chamar
   `adviseSefazFollowup`. Autorizado não chama.
2. Sem `OPENROUTER_API_KEY`: `skipped`, zero rede.
3. `decide` injetável nos testes; OpenRouter só no default.
4. WhatsApp fora desta versão.

## Files

- `src/lib/nfe-emission/jev-sefaz-followup.ts`
- `src/lib/nfe-emission/authorize.ts`
- `src/lib/__tests__/jev-sefaz-followup.test.ts`
- `src/lib/__tests__/nfe-emission-authorize-atomic.test.ts`
- `.env.example` (comentário opcional)

## Complexity

Baixa. O interpretador fiscal não muda.
