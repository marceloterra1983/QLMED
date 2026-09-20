---
id: PLAN-080
status: approved
owner: QLMED
---

# Plan: SPEC-080 — token Graph expirado

## Constitution check

- Sem schema, sem auth de painel nova, sem segredo em log (V).
- Comportamento de integração no `src/lib` (IV).
- Evidência: testes unitários com `fetch` mockado (I).
- Isolamento de empresa inalterado (II).

## Approach

1. **Binder de refresh OneDrive** (`onedrive-auth.ts`):
   `ensureValidOneDriveAccessToken` registra o access token atual e um
   `force` refresh serializado por `connection.id`. Atualiza o objeto
   Prisma **e** o `OneDriveConnection` em memória.
2. **Um `fetchMicrosoftGraph`** em `onedrive-graph.ts`: em HTTP 401,
   pede token novo ao binder e repete **uma** vez. Todas as chamadas
   Graph do OneDrive (JSON, download, PUT, PATCH, DELETE, GET pasta)
   passam por aí.
3. **Graph Mail**: `getGraphAppOnlyToken({ force })` ignora o cache;
   `graphJson` em 401 força token novo e retenta uma vez. A listagem
   `$search` reusa `graphJson` (hoje duplica o fetch).
4. Folga OneDrive: 5 min (era 2). Contrato é a retry em 401.

## Varredura (AC-080-006)

| Integração | Token | Classe deste bug? |
|---|---|---|
| OneDrive Graph (delegado) | JWT ~1 h + refresh no banco | **Sim — corrigir** |
| Graph Mail (client credentials) | JWT em memória + 60 s de folga | **Sim — corrigir** |
| NSDocs | API key / estratégia fiscal | Não |
| Sefaz | certificado A1 | Não |
| Evolution WhatsApp | API key | Não |
| reCAPTCHA OPME | token de página, já re-executa | Não |
| cache de relatório | TTL de dados, não OAuth | Não |

## Files

- `src/lib/onedrive-auth.ts` (novo)
- `src/lib/onedrive-graph.ts`
- `src/lib/onedrive-client.ts`
- `src/lib/onedrive-connections.ts`
- `src/lib/graph-mail-client.ts`
- testes em `src/lib/__tests__/`

## Complexity

Rejeitado AsyncLocalStorage (padrão novo). Rejeitado mudar a assinatura
de todos os callers (`accessToken: string` permanece). O binder liga o
token já emitido ao refresh da conexão.
