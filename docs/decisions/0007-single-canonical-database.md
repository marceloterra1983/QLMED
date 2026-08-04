---
id: ADR-0007
status: accepted
date: 2026-08-03
supersedes: null
related_specs:
  - SPEC-002
---

# ADR-0007 — Banco persistente canônico único

- **Status:** accepted
- **Date:** 2026-08-03
- **Supersedes:** a orientação operacional de manter um banco persistente
  separado chamado `qlmed_dev`; os registros históricos não são reescritos.

## Contexto

O código QLMED já recebe sua conexão por `DATABASE_URL`, mas instruções,
diagramas e planos passaram a exigir um banco persistente `qlmed_dev`. Isso
criou uma dependência operacional que não existe na stack atual e bloqueou
verificações que só precisavam de um PostgreSQL funcional.

O projeto `server-backup` já trata o banco fiscal como o conjunto canônico
`qlmed`, com dump lógico, hashes, cópia remota e ensaios de restauração.

## Decisão

1. O runtime persistente do QLMED usa um único PostgreSQL canônico.
2. O nome do banco persistente canônico é `postgres`, conforme o Compose de
   produção e o inventário do host.
3. `DATABASE_URL` é a única variável aceita para a conexão da aplicação.
4. `qlmed_dev`, outros nomes de banco persistentes e aliases como
   `DATABASE_URL_DEV`/`DATABASE_URL_PROD` não são suportados.
5. CI continua autorizado a criar `qlmed_ci` como banco efêmero para replay de
   migrations e testes; ele é destruído ao final do job e não é um segundo
   ambiente persistente.
6. O conjunto `qlmed` do `server-backup` é o contrato de recuperação. A
   existência de um receipt recente é um gate operacional antes de manutenção
   que possa alterar dados.
7. Nenhuma migration, criação de banco ou alteração de schema é introduzida por
   esta decisão.

## Guardrails

- O startup rejeita o alvo `qlmed_dev` e quaisquer aliases de URL paralelos sem
  imprimir a credencial.
- O Prisma e o advisory-lock usam o mesmo resolvedor de `DATABASE_URL`.
- Desenvolvimento local com o banco canônico exige credencial protegida e
  `QLMED_DISABLE_BACKGROUND_SERVICES=true`.
- O `docker-compose.yml` do checkout consome `DATABASE_URL` e não cria um
  volume PostgreSQL local alternativo.
- `prisma migrate dev` não é um mecanismo de operação do banco canônico. Use o
  replay efêmero do CI e os gates de migration versionada.
- Backup, restore, off-site e drill continuam sob responsabilidade do projeto
  `server-backup`, não do processo da aplicação.

## Consequências

O fluxo local fica menor e não depende de provisionar `qlmed_dev`. Em troca,
um processo local autorizado pode ler ou alterar dados persistentes; por isso
as credenciais permanecem fora do Git, os serviços de fundo devem ficar
desabilitados e o receipt de backup é pré-requisito operacional. CI preserva a
reprodutibilidade sem misturar dados reais.

## Fora do escopo

- apontar automaticamente um ambiente local para o banco produtivo;
- executar migrations, recriar containers ou alterar dados existentes;
- alterar a política, a retenção ou os manifests congelados do backup;
- migrar ou apagar históricos que mencionem `qlmed_dev`.
