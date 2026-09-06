---
id: ADR-0018
status: accepted
date: 2026-09-06
supersedes: null
related_specs: []
---

# Trace-as-State para parsers de operadoras e Resiliência HTTP Unificada

## Context

1. **Parsers de Ofícios/Autorizações**: O parsing de PDFs e e-mails de autorizações hospitalares (Cassems, IMPCG, Unimed CG) realizava extrações complexas diretamente para modelos de persistência. Quando layouts mudavam ou falhavam, os motivos ficavam opacos e dependentes de inspeção manual de logs.
2. **Resiliência Externa**: Chamadas HTTP para a Evolution API e Microsoft Graph tratavam instabilidades de rede de forma heterogênea ou lançavam exceções imediatas diante de 429 (rate-limit) ou 502/503 temporários.

## Decision drivers

- **Trace-as-State (Paper #8)**: Tornar a extração de texto e regras de parsing um estado intermediário observável e diagnosticável.
- **Bounded Guardrails & Resiliência (Paper #5 - CORAL)**: Padronizar retries com exponential backoff, jitter e respeito aos cabeçalhos `Retry-After`.
- Retrocompatibilidade total sem quebrar tipos ou contratos existentes.

## Considered options

### A — Tratamento ad-hoc por módulo
Manter cada cliente HTTP e parser com suas próprias lógicas de regex e repetição de requisição. Custo: duplicação de código e inconsistência de tolerância a falhas.

### B — Módulos universais de Trace e Resiliência
- `src/lib/parse-trace.ts`: Builder e objeto de diagnóstico `ParseTrace` com contagem de campos, snippets e avisos.
- `src/lib/resilience.ts`: Mecanismo unificado `fetchWithResilience` e `executeWithRetry` com jitter backoff e suporte a `Retry-After`.

## Decision

**Opção B.** 
- `ParseTrace` anexado a `ParsedCassemsOficio` e `ParsedImpcgOficio` para rastreabilidade e métricas de matching em tempo real.
- `fetchWithResilience` adotado no cliente Evolution WhatsApp (`whatsapp-evolution.ts`) e no cliente Microsoft Graph (`graph-mail-client.ts`), protegendo contra interrupções momentâneas de rede ou 429 de rate limiting.

## Consequences

### Positive
- Diagnóstico imediato de quebras de layout em ofícios de operadoras.
- Maior tolerância a falhas temporárias nos envios de mensagens do WhatsApp e sincronização de e-mails.

### Negative
- Requisições com falhas transitórias passam por um breve intervalo de backoff antes de falharem definitivamente.

## Verification
- Testes unitários em `src/lib/__tests__/parse-trace.test.ts`, `src/lib/__tests__/resilience.test.ts`, `src/lib/__tests__/cassems-parse-oficio.test.ts` e `src/lib/__tests__/impcg-parse-oficio.test.ts`.
