# Implementation Plan: Status real dos workflows do n8n

**Branch**: `011-n8n-workflow-status` | **Date**: 2026-08-26 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/011-n8n-workflow-status/spec.md`

## Summary

Abrir o sentido QLMED → n8n para ler estado de workflows e sua última execução, e trocar a lista fixa de `page-client.tsx:41-45` por dado real — com a interface capaz de dizer "não consegui saber" em vez de inventar saúde.

Abordagem em uma frase: **um cliente de integração em `src/lib`, com credencial cifrada no banco no mesmo padrão do NSDocs, uma rota fina que serve status já agregado com cache curto compartilhado entre usuários, e três estados de tela mutuamente exclusivos** — obtido, indisponível, não configurado.

## Verificação prévia (o que deixou de ser suposição)

A spec registrava, como maior incógnita, se a API do n8n estava habilitada e alcançável — o QLMED nunca a consumiu, então nada disso constava do código. **Verificado por sondagem somente-leitura, sem credencial, a partir do próprio servidor do QLMED, em 2026-08-26:**

| Alvo | `/healthz` | `/api/v1/workflows` sem chave |
|---|---|---|
| dev `100.83.11.58:5678` | `200 {"status":"ok"}` | `401 {"message":"'X-N8N-API-KEY' header required"}` |
| prod `n8n.qlmed.com.br` | `200 {"status":"ok"}` | `401` idêntico |

Três fatos que o plano passa a poder assumir:

1. **A API pública está habilitada nas duas instâncias.** O 401 é decisivo: instância com a API desligada (`N8N_PUBLIC_API_DISABLED`) responde **404**, não 401. O 401 só existe porque a rota existe e exige autenticação.
2. **O mecanismo de autenticação é o cabeçalho `X-N8N-API-KEY`**, dito pela própria resposta. Não é bearer, não é básica.
3. **O caminho servidor → n8n funciona**, em dev e em produção. A spec marcava isso como não exercitado; agora está.

Continua **não verificado**: a versão do n8n (o `/rest/settings` deste build não a expõe) e, por consequência, o formato exato das respostas de `/api/v1/workflows` e `/api/v1/executions` — isso exige uma chave, que é passo do dono. Ver "Ambiguidades em aberto".

## Technical Context

**Language/Version**: TypeScript 6, Node (Next.js 15.5 App Router), React 19

**Primary Dependencies**: Prisma 7.9, NextAuth 4.24, Zod 4 (validação da resposta externa), Pino (log)

**Storage**: PostgreSQL canônico. Uma tabela de configuração da integração, no padrão de `NsdocsConfig`.

**Testing**: Vitest 4, `environment: node`, em `src/lib/__tests__/`

**Target Platform**: Servidor Linux self-hosted; n8n alcançável por rede interna (dev) e HTTPS (prod)

**Project Type**: Aplicação web única (Next.js full-stack)

**Performance Goals**: A carga sobre o n8n não cresce com o número de administradores com a tela aberta (FR-005). Uma consulta por janela de cache, compartilhada, não uma por usuário.

**Constraints**: Tempo limite explícito por requisição ao n8n (FR-004). Estouro cai no estado "indisponível", nunca em erro de página. Nenhum segredo em log ou em resposta de API (FR-008, Princípio V).

**Scale/Scope**: Empresa única, 4 workflows conhecidos hoje, punhado de administradores. O histórico de execuções cresce indefinidamente no n8n — a consulta precisa ser limitada por página, nunca varrer tudo (edge case da spec).

## Constitution Check

*GATE: avaliado antes da Fase 0 e reavaliado após a Fase 1.*

| Princípio | Situação | Como este plano atende |
|---|---|---|
| **I. Evidência executável obrigatória** | Atende | Testes com resposta do n8n simulada, incluindo os caminhos de falha, que são o coração da User Story 2. Verificação por reversão: removido o tratamento de indisponibilidade, o teste que exige "nenhum cartão de status quando a fonte caiu" deve reprovar. |
| **II. Autorização é do servidor** | Atende | A rota de status verifica papel no servidor, e não por ausência de botão. Papel decidido em D4: `viewer`, que preserva quem enxerga a tela hoje. |
| **III. Migrations Prisma donas do esquema** | Atende | Tabela nova, aditiva, para a configuração da integração. Sem DDL em runtime. Rollback trivial: sem a tabela, a tela cai em "não configurado". |
| **IV. Rotas adaptam; `src/lib` implementa** | Atende | Cliente do n8n, cache e agregação em `src/lib/n8n-client.ts`. A rota autentica, valida e delega. O princípio exige explicitamente "integration clients require bounded failure behavior, safe logs" — é o que D2 detalha. |
| **V. Segredos contidos** | Atende | Chave cifrada no banco, devolvida **mascarada** como em `src/app/api/nsdocs/config/route.ts:10`. Nunca em log, nunca em resposta. `NEXT_PUBLIC_N8N_URL` continua só link de navegação e não vira caminho de credencial. |
| **VI. Uma fonte canônica por assunto** | Atende | O endereço do n8n passa a ter um dono só. Hoje há duas fontes divergentes: `NEXT_PUBLIC_N8N_URL` e a inferência por substituição de `app.` por `n8n.` em `page-client.tsx:5-7`. Ver D5. |

**Violações**: nenhuma.

## Decisões de projeto

### D1 — Somente leitura, e o motivo de isso ser arquitetural

FR-009 já exclui disparar, pausar ou editar workflows. O plano reforça: o cliente do n8n expõe **apenas** operações de leitura, e a chave configurada deveria ser de escopo mínimo se o n8n permitir.

Razão: escrita a partir do QLMED cria um segundo dono das automações, e um erro ali tem consequência operacional real (uma sincronização fiscal pausada por engano). Leitura é reversível; escrita não. Se for desejada, é spec própria com revisão própria.

### D2 — Falha da integração é um estado de dado, não uma exceção

O coração da User Story 2. O cliente **não** propaga exceção para a rota. Ele devolve um resultado que é uma de três coisas, e a tela renderiza a partir disso:

| Estado | Origem | O que a tela mostra |
|---|---|---|
| `ok` | n8n respondeu e a resposta validou | Os workflows, com o horário da consulta |
| `unavailable` | tempo limite, rede, 5xx, ou resposta que não valida | "Não foi possível consultar", **nenhum cartão de workflow** |
| `not_configured` | sem credencial gravada, ou 401 do n8n | "Integração não configurada", com o caminho para configurar |

Os três são mutuamente exclusivos e nenhum tem estado de workflow inventado. Um 401 é deliberadamente `not_configured`, e não `unavailable`: a ação do administrador é diferente — configurar chave versus investigar a instância.

Resposta que chega mas não valida contra o schema Zod cai em `unavailable`, nunca é renderizada parcialmente. É o que impede a versão do n8n mudar o formato e a tela passar a mostrar meia verdade.

### D3 — Cache curto, compartilhado, com idade declarada

FR-005 exige que a carga sobre o n8n não acompanhe o número de administradores com a tela aberta. Uma consulta por carregamento de página não serve.

O resultado agregado é guardado em memória do processo, com janela curta, e servido a todos os pedidos dentro dela. Toda resposta carrega **quando foi obtida**, e a tela exibe isso (User Story 3).

Consequência aceita e declarada: em cenário multiprocesso, cada processo tem seu cache, então a carga é proporcional a processos, não a usuários. Continua satisfazendo FR-005. Cache compartilhado entre processos exigiria armazenamento externo e não se justifica nesta escala.

Se a consulta falhar tendo cache anterior, a spec (User Story 2, cenário 3) permite exibir o antigo **desde que a idade seja declarada**. O plano escolhe o caminho mais conservador: em falha, `unavailable`, sem exibir o antigo. Menos código, e nenhum risco de dado velho parecer atual. Reavaliar só se o dono pedir.

### D4 — Papel exigido: `viewer` (decidido)

`src/app/(painel)/sistema/automacoes/page-client.tsx` nunca verificou papel algum. A rota nova verifica, porque pelo Princípio II a autorização tem de estar no servidor — restringir só a tela não seria autorização, seria decoração.

**Decidido pelo dono em 2026-08-26: `viewer`**, o piso da hierarquia. Ninguém perde acesso que tinha, e a verificação passa a existir onde deve.

A escolha separa duas perguntas que é fácil confundir. O que precisa de proteção forte é a **credencial**, não o status: gravar a chave exige `admin` (`config/route.ts`), e ela é decifrada e usada só dentro da rota, sem nunca aparecer na resposta. Ler o resultado da automação é outra pergunta, e é a que o dono decidiu manter aberta a todos.

Consequência registrada: com `viewer` no piso, o ramo `FORBIDDEN` da rota fica inalcançável, porque `requireSessionRole` só o lança quando o papel está **abaixo** do mínimo. Mantido no código de propósito, para seguir correto caso a constante suba — é o único ponto que precisaria mudar.

### D5 — Um dono só para o endereço do n8n

Hoje o endereço vem de duas fontes que podem divergir: `NEXT_PUBLIC_N8N_URL` e, na sua ausência, uma inferência que troca `app.` por `n8n.` no host atual (`page-client.tsx:5-7`). A segunda existe só porque não havia configuração de verdade.

Com a tabela de configuração, o endereço passa a ter um dono. `NEXT_PUBLIC_N8N_URL` permanece **apenas** para o link "Abrir n8n" no navegador; a inferência por substituição de host some. O cliente do servidor usa exclusivamente o endereço configurado — nunca infere, porque inferir endereço de destino a partir do host da requisição é padrão de SSRF.

### D6 — Correções de apresentação vão antes, em commit próprio

Os dois defeitos menores da spec — ausência total de dark mode e o `<svg>` inline na linha 32 — não dependem desta feature e não têm gate de Spec Kit. Devem ir num commit de UI separado, antes.

Motivo prático: eles tocam o mesmo arquivo que esta feature vai reescrever. Separados, o diff da feature mostra a mudança de comportamento; juntos, ela fica enterrada numa reformatação de cores.

## Project Structure

### Documentation (this feature)

```text
specs/011-n8n-workflow-status/
├── spec.md              # já existe
├── plan.md              # este arquivo
├── data-model.md        # Fase 1
├── contracts/           # Fase 1 — contrato da rota interna e forma esperada do n8n
└── tasks.md             # Fase 2 (/speckit-tasks), não criado aqui
```

### Source Code (repository root)

```text
prisma/
├── schema.prisma                          # + model de configuração da integração n8n
└── migrations/<timestamp>_n8n_integration_config/

src/lib/
├── n8n-client.ts                          # NOVO — leitura, tempo limite, validação, 3 estados
├── n8n-status-cache.ts                    # NOVO — janela curta compartilhada (D3)
└── __tests__/
    ├── n8n-client.test.ts                 # NOVO — caminhos de falha primeiro
    └── n8n-status-cache.test.ts           # NOVO

src/app/api/integrations/n8n/
├── status/route.ts                        # NOVO — GET status agregado, exige papel
└── config/route.ts                        # NOVO — GET mascarado / PUT chave, espelha nsdocs/config

src/app/(painel)/sistema/automacoes/
└── page-client.tsx                        # ALTERADO — sem lista fixa; 3 estados
```

**Structure Decision**: sem diretório novo de topo. `src/app/api/integrations/n8n/` é caminho novo porque `src/app/api/webhooks/n8n/` é o sentido oposto (entrada) e misturar os dois num diretório confundiria quem chama quem. O cliente fica em `src/lib` por exigência do Princípio IV.

## Compatibilidade e rollback

**Compatibilidade**: aditiva. Nenhuma tabela ou coluna existente muda. O webhook de entrada (`src/app/api/webhooks/n8n/route.ts`) não é tocado — sentido oposto, credencial diferente, nada compartilhado.

**Ordem de implantação**: migration pode subir antes do código. Sem configuração gravada, a tela cai em `not_configured`, que é estado previsto e legível — não é falha.

**Rollback**: reverter o código restaura a tela anterior. A tabela pode ficar; nada mais a consulta. Se a chave já tiver sido gravada, revogá-la no n8n é passo manual do dono, fora do repositório.

**Verificação de migration**: `npm run db:migrate:verify` e `npm run db:reconcile:verify`.

## Estratégia de testes

O risco central não é mostrar status errado — é **mostrar saúde quando não se sabe**. Os testes seguem essa ordem.

1. **Caminhos de falha primeiro** (`n8n-client.test.ts`): tempo limite, conexão recusada, 5xx, 401, e resposta bem-formada em HTTP mas inválida contra o schema. Cada um deve produzir o estado certo entre `unavailable` e `not_configured`, e **nunca** uma lista de workflows.
2. **Reversão obrigatória**: removido o tratamento de indisponibilidade, o teste que exige ausência de cartões com a fonte caída deve reprovar. Sem isso ele não protege nada.
3. **Cache** (`n8n-status-cache.test.ts`): N pedidos dentro da janela resultam em **uma** chamada ao n8n; passada a janela, nova chamada. É a prova de FR-005.
4. **Segredo**: teste afirmando que a chave não aparece na resposta de `config` (só mascarada) nem em nenhuma mensagem de erro — espelhando o que já se faz para o token NSDocs.
5. **Autorização**: usuário sem o papel exigido recebe 403 da rota de status, verificado no servidor e não por ausência de botão.
6. **Ausência de dado inventado**: teste que afirma que nenhuma string de workflow da lista fixa atual ("Sync NF-e/CT-e", "Alertas Financeiros", "Captura de Email", "Notificações") sobrevive no componente. É a prova mecânica de SC-003.

Teste de integração real contra o n8n **não** entra na suíte: dependeria de credencial e de instância no ar, e CI usa apenas recursos descartáveis. A verificação contra a instância real é passo manual, uma vez, ao configurar a chave.

## Quality gates

```bash
npm run docs:validate
npx tsc --noEmit
npm run lint
npm test
npm run build
npm run db:migrate:verify      # mudança de banco
npm run db:reconcile:verify    # idem
```

## Escopo excluído

- **Qualquer escrita no n8n** — disparar, pausar, editar, reprocessar. FR-009 e D1.
- **Histórico de execuções na tela**: só a última por workflow, mais contagem agregada. Navegar o histórico é o n8n que faz, e o link já existe.
- **Notificar sobre workflow parado**: seria produtor de notificação, terreno da SPEC-010-P2, não desta.
- **Cache compartilhado entre processos** (D3).
- **Exibir dado antigo quando a consulta falha** (D3, escolha conservadora).
- **Correções de dark mode e ícone** — vão antes, por fora (D6).

## Ambiguidades em aberto

Precisam do dono antes da Fase 2. Nenhuma bloqueia a Fase 1.

- **Versão do n8n e formato das respostas.** A sondagem provou que a API existe e como autentica, mas não o formato de `/api/v1/workflows` e `/api/v1/executions` — isso exige uma chave. **O schema Zod só deve ser escrito depois de observar uma resposta real**; escrevê-lo de memória é como este projeto já se queimou antes. Passo do dono: gerar a chave no n8n e fornecê-la pelo canal protegido.
- **Duração da janela de cache** (D3): número a calibrar. Quanto mais curta, mais fresco e mais carga.
- **Critério de "última execução"** com execuções concorrentes: a que iniciou por último ou a que terminou por último (edge case herdado da spec).
