---
id: SPEC-011
status: draft
owner: QLMED
affected_modules:
  - automacoes-ui
  - n8n-integration
---

# Feature Specification: Status real dos workflows do n8n

**Feature Branch**: `011-n8n-workflow-status`

**Created**: 2026-08-26

**Status**: Draft

**Input**: Achado crítico do levantamento das 19 telas do painel — a tela Automações apresenta uma lista de workflows que é um array fixo no componente, sem status algum.

## Contexto: o defeito que originou esta spec

`src/app/(painel)/sistema/automacoes/page-client.tsx:41-45` declara a lista de workflows dentro do JSX:

```tsx
{[
  { title: 'Sync NF-e/CT-e', desc: 'Sincronização periódica via NSDocs (cron a cada 6h)' },
  { title: 'Alertas Financeiros', desc: '...' },
  { title: 'Captura de Email',   desc: '...' },
  { title: 'Notificações',       desc: '...' },
].map((w) => ( ... ))}
```

São quatro cartões de texto. Nenhum deles reflete o que o n8n está de fato fazendo: não há estado (ativo/pausado), última execução, resultado, nem próxima execução. Se um workflow estiver parado há três semanas, a tela continua idêntica.

O problema não é a lista estar desatualizada — é ela **parecer** um painel de monitoramento sem ser um. A tela se chama "Automações", fica sob Sistema, ao lado de Sincronizar e Erros (que mostram estado real), e o usuário conclui que está vendo status. A informação não está errada; está ausente, disfarçada de presente.

### Dois defeitos menores na mesma tela

Independentes desta spec e **sem gate de Spec Kit**, por serem apenas apresentação:

1. **A tela inteira não tem dark mode.** `bg-white`, `text-gray-500`, `text-gray-600`, `border` — nenhuma variante `dark:` em lugar nenhum do arquivo. É a única tela do painel nessa situação; no tema escuro ela aparece como um bloco branco.
2. **Ícone fora do padrão.** Linha 32 usa um `<svg>` inline; toda a aplicação usa Material Symbols Outlined.

Ambos podem e devem ser corrigidos antes desta feature, num commit próprio de UI. Registrados aqui só para não se perderem.

## O que já existe

A integração com o n8n hoje é **unidirecional**: o n8n chama o QLMED, nunca o contrário.

- `src/app/api/webhooks/n8n/route.ts` recebe chamadas do n8n, com lista fechada de ações (`sync-nfe`, `sync-cte`, `notify`, `process-xml`, `sync-ncm-bulk`, `backfill-tax-data`, `batch-cnpj-check`).
- A entrada é autenticada: API key (`QLMED_API_KEY`), assinatura verificada e nonce de uso único (`@/lib/n8n-webhook-security`).
- `NEXT_PUBLIC_N8N_URL` existe apenas para montar o link "Abrir n8n". É um endereço público de navegação, não uma credencial.

**Não existe nenhum caminho de saída do QLMED para a API do n8n.** Ler status exige abrir esse sentido novo, com credencial própria — é essa a razão de a feature precisar de spec, e não de um ajuste de tela.

Há precedente de como o projeto guarda credencial de integração: `NsdocsConfig` e `ReceitaNfseConfig` (`prisma/schema.prisma`) mantêm `apiToken` cifrado, e `src/app/api/nsdocs/config/route.ts:10` devolve o valor **mascarado** ao frontend, nunca o token cru. Esta feature deve seguir o mesmo padrão, não inventar outro.

## User Scenarios & Testing

### User Story 1 - Ver se as automações estão de pé (Priority: P1)

Um administrador abre Sistema › Automações e vê, para cada workflow, se está ativo ou pausado e quando rodou pela última vez com que resultado. Descobre em segundos que a "Captura de Email" falhou há 14 minutos, sem abrir o n8n.

**Why this priority**: É a razão de a tela existir. Sem isso ela é decoração, e o usuário só descobre uma automação parada pela consequência — nota que não chegou, alerta que não saiu.

**Independent Test**: Pausar um workflow no n8n, recarregar a tela e ver o estado mudar de ativo para pausado.

**Acceptance Scenarios**:

1. **Given** workflows cadastrados no n8n, **When** o administrador abre Automações, **Then** cada um aparece com estado atual, horário da última execução e se ela terminou em sucesso ou falha.
2. **Given** um workflow pausado no n8n, **When** a tela carrega, **Then** ele aparece como pausado, visivelmente distinto de um ativo.
3. **Given** um workflow que nunca executou, **When** a tela carrega, **Then** isso é dito explicitamente, e não apresentado como sucesso nem como falha.
4. **Given** um workflow existente no n8n e ausente da lista fixa atual, **When** a tela carrega, **Then** ele aparece — a fonte da verdade é o n8n, não o código do componente.

---

### User Story 2 - Distinguir "tudo certo" de "não consegui saber" (Priority: P1)

O n8n está fora do ar. O administrador abre Automações e entende imediatamente que o QLMED não conseguiu consultar o status — em vez de ver quatro cartões que parecem saudáveis.

**Why this priority**: Mesma prioridade da primeira porque sem ela a primeira é perigosa. Um painel de status que mostra estado inventado quando a fonte está inacessível é pior do que não ter painel: transforma silêncio em falso "tudo certo". É o mesmo defeito já identificado em Sistema › Erros, onde falha de rede e ausência de erros renderizam a mesma tela de sucesso.

**Independent Test**: Derrubar o acesso ao n8n (ou apontar para host inválido) e conferir que a tela declara indisponibilidade em vez de mostrar dados.

**Acceptance Scenarios**:

1. **Given** o n8n inacessível, **When** a tela carrega, **Then** ela informa que o status não pôde ser consultado, e não mostra estado de workflow algum.
2. **Given** a credencial de acesso ausente ou inválida, **When** a tela carrega, **Then** a mensagem distingue "não configurado" de "fora do ar" — as ações do administrador são diferentes em cada caso.
3. **Given** dados de uma consulta anterior, **When** a consulta atual falha, **Then** se algo antigo for exibido, sua idade é declarada; nunca apresentado como atual.

---

### User Story 3 - Saber quando a informação foi obtida (Priority: P2)

O administrador vê há quanto tempo o status foi consultado e pode forçar uma atualização.

**Why this priority**: Depende das duas primeiras. Reduz a chance de decidir com base em dado velho, mas o dado velho já vem rotulado pela P2.

**Acceptance Scenarios**:

1. **Given** a tela aberta, **When** o administrador olha o cabeçalho, **Then** há indicação de quando o status foi obtido.
2. **Given** a tela aberta, **When** ele pede atualização, **Then** uma nova consulta ocorre e o horário muda.

### Edge Cases

- n8n responde devagar: a consulta precisa de tempo limite, e estourá-lo cai no cenário da P2, sem travar a tela.
- Muitos administradores com a tela aberta: as consultas não podem se multiplicar por usuário a ponto de sobrecarregar o n8n. Ver FR-005.
- Workflow renomeado no n8n: a tela acompanha o nome de lá; nada no QLMED fixa o nome.
- Workflow com execuções concorrentes: "última execução" precisa de critério definido — a que iniciou por último, ou a que terminou por último. [NEEDS CLARIFICATION]
- Execução em andamento no momento da consulta: estado próprio, não sucesso nem falha.
- Credencial do n8n expirada: mesma via da P2, cenário 2.
- Volume de execuções: consultar histórico completo para calcular "falhas em 24h" não pode degradar com o crescimento do histórico.

## Requirements

### Functional Requirements

- **FR-001**: O sistema MUST obter a lista de workflows e seu estado a partir do n8n, em tempo de consulta. A lista fixa em `page-client.tsx:41-45` MUST ser removida — nenhuma parte da tela pode continuar servindo dado inventado.
- **FR-002**: Para cada workflow, o sistema MUST apresentar: estado (ativo/pausado), horário e resultado da última execução, e distinguir "nunca executou" de "executou com sucesso".
- **FR-003**: O sistema MUST distinguir, na interface, três situações que hoje seriam indistinguíveis: status obtido, status indisponível por falha de comunicação, e integração não configurada.
- **FR-004**: A consulta ao n8n MUST ter tempo limite explícito e tratamento de erro, conforme a regra de integrações externas em `CLAUDE.md`. Falha de consulta MUST NOT derrubar a página.
- **FR-005**: O sistema MUST limitar a frequência de consultas ao n8n, de modo que o número de administradores com a tela aberta não determine a carga sobre o n8n.
- **FR-006**: A credencial de acesso à API do n8n MUST ser guardada cifrada e MUST NOT ser devolvida em claro a nenhum cliente, seguindo o padrão já usado em `src/app/api/nsdocs/config/route.ts:10` (valor mascarado).
- **FR-007**: O acesso ao status MUST ser autorizado no servidor. [NEEDS CLARIFICATION: a tela Automações hoje não tem verificação de papel; status operacional e credenciais sugerem restringir a administradores, mas isso muda quem enxerga a tela hoje.]
- **FR-008**: Registros e mensagens de erro MUST NOT conter a credencial do n8n nem conteúdo de execução, conforme a regra de log seguro do projeto.
- **FR-009**: O sistema MUST NOT permitir, nesta feature, disparar, pausar ou editar workflows a partir do QLMED. Escopo é leitura. Escrita é decisão separada, com consequência operacional real.

### Key Entities

- **Workflow (do n8n)**: identidade, nome e estado ativo/pausado. Pertence ao n8n; o QLMED não o cria nem o altera, apenas lê.
- **Execução (do n8n)**: pertence a um workflow; tem início, fim e desfecho. O QLMED usa a mais recente por workflow, mais uma contagem agregada por janela de tempo.
- **Configuração da integração**: endereço do n8n e credencial de acesso, cifrada. Análoga a `NsdocsConfig` e `ReceitaNfseConfig`, sem repetir o token em variável de ambiente pública. `NEXT_PUBLIC_N8N_URL` continua sendo só o link de navegação e MUST NOT virar caminho de credencial.

## Success Criteria

### Measurable Outcomes

- **SC-001**: Pausar um workflow no n8n reflete-se na tela na consulta seguinte, em 100% dos casos.
- **SC-002**: Com o n8n indisponível, a tela nunca apresenta estado de workflow: verificado por teste que simula indisponibilidade e falha se qualquer cartão de status renderizar.
- **SC-003**: Nenhum dado de workflow na tela tem origem em literal do código — verificado por ausência da lista fixa e por teste que altera a resposta da integração e observa a tela acompanhar.
- **SC-004**: A carga sobre o n8n não cresce proporcionalmente ao número de administradores com a tela aberta.
- **SC-005**: A credencial do n8n não aparece em resposta de API nem em log — verificado por teste, como já se faz para o token NSDocs.

## Assumptions

- O n8n expõe API de consulta de workflows e execuções autenticada por credencial própria. [NEEDS CLARIFICATION: confirmar a versão em uso e se a API está habilitada na instância de produção — o QLMED nunca consumiu essa API, então isso não está verificado no código.]
- A instância de produção é alcançável pelo servidor do QLMED. Hoje só o navegador do usuário fala com o n8n, pelo link; a rota servidor→n8n não foi exercitada.
- Somente leitura nesta feature. Disparo manual de workflow, se desejado, é spec separada.
- As correções de dark mode e de ícone da mesma tela seguem por fora, sem depender desta spec.
- Escopo de empresa única, como o resto do sistema.
