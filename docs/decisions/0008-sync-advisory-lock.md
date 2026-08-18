---
id: ADR-0008
status: accepted
date: 2026-08-17
supersedes: ADR-0003
related_specs: []
---

# Iniciar cada sincronização sob advisory lock transacional

## Context

O scheduler in-process continua sendo a opção operacional mais simples, mas
requisições manuais e réplicas podem iniciar o mesmo ciclo simultaneamente.
Uma consulta seguida de create não é atômica e pode duplicar chamadas fiscais.

## Decision drivers

- Evitar duas sincronizações running para a mesma empresa.
- Manter o scheduler in-process sem adicionar fila ou serviço.
- Liberar o lock automaticamente no commit/rollback da transação.

## Considered options

### Option A — Consulta e criação separadas

Menos código, mas sujeita a corrida entre processos.

### Option B — Fila ou worker dedicado

Resolve coordenação, mas adiciona infraestrutura sem necessidade atual.

### Option C — Advisory lock transacional do PostgreSQL

Usa o banco canônico já obrigatório e serializa somente a criação do log de
sincronização por empresa.

## Decision

Adotar a Option C. createSyncLogIfIdle adquire
pg_advisory_xact_lock(hashtext(key)) dentro de prisma.$transaction, verifica
status = running e cria o log somente quando não existe outro ciclo ativo.
Os caminhos manual e agendado usam o mesmo helper.

## Consequences

### Positive

- A decisão é atômica entre processos e réplicas.
- Não há conexão persistente ou componente operacional novo.

### Negative

- O hash textual compartilha o espaço de advisory locks do PostgreSQL.
- A execução segue acoplada ao processo web; um worker dedicado continua sendo
  uma evolução futura se o volume exigir.

## Verification

- Testes unitários confirmam lock, consulta e criação na mesma transação.
- Um segundo início para a empresa retorna HTTP 409 sem criar novo log.
