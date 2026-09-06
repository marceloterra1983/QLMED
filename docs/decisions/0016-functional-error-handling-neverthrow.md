---
id: ADR-0016
status: accepted
date: 2026-09-06
supersedes: null
related_specs: []
---

# Tratamento funcional de erros em domínios críticos via Result Types (neverthrow)

## Context

Lançar exceções genéricas (`throw new Error(...)`) para erros esperados de validação, parsing e integridade de negócio dificulta que o TypeScript garanta em tempo de compilação a exaustividade de tratamento pelos chamadores.

## Decision drivers

- Robustez contra erros não tratados que derrubam rotas ou jobs em background.
- Tornar os tipos de falha de negócio explícitos na assinatura das funções.
- Compatibilidade idiomática com TypeScript e Next.js Route Handlers.

## Considered options

### A — Exceções customizadas com hierarquia de classes
Criar subclasses de `Error`. Custo: chamadores continuam precisando de `try/catch` manual e o compilador não alerta caso uma falha específica não seja tratada.

### B — Result Types funcionais com `neverthrow`
Retornar `Result<T, E>` onde `E` é uma união estrita de tipos de erro de domínio.

## Decision

**Opção B.** Empregado em repositórios de domínio e parsers essenciais, combinando `ok(...)` e `err(...)`. Chamadores utilizam métodos de correspondência (`isOk()`, `isErr()`, `map()`) garantindo compilação segura.

## Consequences

### Positive
- Garantia pelo compilador TypeScript de que erros de negócio foram avaliados.
- Menos blocos `try/catch` defensivos aninhados.

### Negative
- Curva de aprendizado inicial para desenvolvedores acostumados a fluxo de controle exclusivamente baseado em exceções.

## Verification
- Testes unitários de repositório e handlers verificando branches de `isErr()`.
