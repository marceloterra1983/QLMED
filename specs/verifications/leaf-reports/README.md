---
title: Relatórios de verificação das folhas da remediação b177b07
status: histórico
date: 2026-09-01
---

# O que estes ficheiros são — e o que NÃO são

Cada `L*.md` aqui é o **relatório de verificação de um agente** que remediou uma
fatia do backlog da auditoria `b177b07`. Contêm o que cada folha mediu:
comandos, saídas coladas, e os controlos positivos (reverter a correção,
confirmar o teste vermelho, restaurar).

**Não são o meu ledger de gates.** Ficavam em `gates/`, e ali o verificador do
`unlazy` os lia como se fossem caixas minhas: 401 gates, 234 sem o par
`CHECK:`/`EVIDENCE:` que ele exige. As folhas escreveram prosa com evidência
colada, não a forma que a ferramenta executa.

Marcar essas 234 como cumpridas seria eu afirmar 234 medições que **não fiz** —
exatamente a falha que a disciplina de gates existe para impedir. Reescrevê-las
no formato estrito seria transcrever alegação alheia como se fosse verificação
própria, o que é a mesma falha com melhor letra.

Então ficam aqui, como o que são: evidência declarada por quem escreveu o
código, valiosa e a ser lida com a desconfiança devida.

## Onde está a verificação independente

- **`GATES.md` na raiz** é o meu ledger: 14 caixas, todas com evidência que eu
  medi, incluindo os controlos positivos do item 1.
- **A re-auditoria adversarial** (agentes que não escreveram nenhuma linha
  destas correções) está a refazer uma amostra destes controlos positivos por
  conta própria. O que ela conseguir reproduzir vale; o que não conseguir vira
  achado.
- **O CI** é o portão que não depende de relatório nenhum: replay das migrações
  contra Postgres real, testes de integração com banco, typecheck, lint,
  hardening e o portão de dependências.

## Residuais declarados

Onze caixas ficaram deliberadamente abertas, cada uma com o motivo escrito no
próprio ficheiro como linha `ABANDON:`. Estão consolidadas para o dono em
`../REMEDIACAO-b177b07-NOTAS.md`.
