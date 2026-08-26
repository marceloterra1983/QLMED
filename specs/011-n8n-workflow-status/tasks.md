# Tasks: Status real dos workflows do n8n

**Input**: Design documents from `/specs/011-n8n-workflow-status/`

**Prerequisites**: [spec.md](./spec.md), [plan.md](./plan.md)

**Tests**: obrigatórios (Princípio I). Aqui com uma ênfase própria: **os testes de falha vêm antes dos de sucesso**, porque o risco central desta feature não é mostrar status errado, é mostrar saúde quando não se sabe.

---

## O bloqueio, e por que ele é estreito

O plano proíbe escrever o schema Zod de memória: exige observar uma resposta real de `/api/v1/workflows` e `/api/v1/executions`, o que depende de uma chave de API que só o dono gera.

Ao decompor, o bloqueio ficou **menor do que parecia**. Falha não tem corpo para interpretar: tempo limite, conexão recusada, 5xx e 401 são exercitáveis com `fetch` simulado, sem n8n e sem chave. E é justamente aí que mora a User Story 2, que é P1 e é a que impede a tela de mentir.

Das 23 tarefas, **três** dependem da chave — T012, T013 e T014: observar a resposta, escrever o schema contra o formato observado, e testar o mapeamento com ela como fixture. As outras **vinte** não dependem.

| Fase | Depende da chave? |
|---|---|
| A · Configuração da integração | não |
| B · Cliente e três estados | não |
| C · Caminhos de falha | não |
| D · Formato da resposta | **sim** — T012, T013 |
| E · Rota e cache | não |
| F · Tela | parcialmente (T017 espera D) |
| G · Portões | não |

Recomendação de sequência: A → B → C → E, parar, pedir a chave, então D → F → G. Assim a maior parte fica pronta e revisável antes de qualquer credencial existir.

Já verificado por sondagem, sem credencial (ver plano): a API pública está habilitada em dev e prod, autentica por cabeçalho `X-N8N-API-KEY`, e o caminho servidor → n8n funciona. Nada disso precisa ser redescoberto.

---

## Fase A — Configuração da integração (sem chave)

- [ ] **T001** Acrescentar a `prisma/schema.prisma` o modelo de configuração da integração n8n, espelhando `NsdocsConfig`: `baseUrl`, `apiToken` (cifrado), timestamps. Decidir por `@@unique` de empresa como as outras configs fazem.

- [ ] **T002** Gerar a migration `add_n8n_integration_config`. **Não** aplicar: usar `prisma migrate diff --from-schema <cópia antes> --to-schema prisma/schema.prisma --script`, como feito na SPEC-010, e limpar o banner do dotenv que contamina a primeira linha do arquivo. `migrate deploy` é passo humano.

- [ ] **T003** `npx prisma generate`.

- [ ] **T004** Criar `src/app/api/integrations/n8n/config/route.ts`, espelhando `src/app/api/nsdocs/config/route.ts`: `encrypt`/`decrypt` de `@/lib/crypto` na gravação e leitura, e **`maskToken` na resposta** — o token cru nunca sai. Exige papel (ver T016).

- [ ] **T005** Teste: a resposta do `config` traz o token mascarado, nunca o valor cru; e nenhuma mensagem de erro o contém. É o espelho do que já se faz para o NSDocs.

## Fase B — Cliente e os três estados (sem chave)

- [ ] **T006** Criar `src/lib/n8n-client.ts` com o tipo de resultado da decisão D2 — três estados **mutuamente exclusivos**: `ok`, `unavailable`, `not_configured`. Modelar como união discriminada, para que o consumidor não consiga ler workflows de um resultado que não os tem.

- [ ] **T007** Implementar a busca com **tempo limite explícito** (`AbortSignal.timeout`), tratamento de erro e log seguro. Nunca propagar exceção para a rota: falha é estado de dado, não exceção (D2 e Princípio IV).

- [ ] **T008** Mapear as condições: sem credencial gravada **ou** 401 do n8n → `not_configured`; tempo limite, rede, 5xx, ou resposta que não valida → `unavailable`. O 401 cai em `not_configured` de propósito — a ação do administrador é configurar chave, não investigar a instância.

## Fase C — Caminhos de falha primeiro (sem chave)

- [ ] **T009** `src/lib/__tests__/n8n-client.test.ts` com `fetch` simulado, cobrindo: tempo limite estourado, conexão recusada, 500, 401, e resposta 200 bem-formada em HTTP mas inválida contra o schema. Cada uma deve produzir o estado certo e **nunca** uma lista de workflows.

- [ ] **T010** Teste de que `not_configured` e `unavailable` não são confundidos entre si — são ações diferentes do administrador.

- [ ] **T011** **Portão de reversão.** Remover o tratamento de indisponibilidade e exigir que T009 reprove. Se a suíte continuar verde, o teste não protege nada — foi exatamente o que aconteceu na SPEC-010, onde o teste que cobriria a composição estava `skipped` e o portão pegou.

## Fase D — Formato da resposta (**depende da chave**)

- [x] **T012** ✅ Feito em 26/08 contra `n8n.qlmed.com.br` (n8n 2.29.10). Formato registrado em [contracts/n8n-api-observed.md](./contracts/n8n-api-observed.md). Confirmou `id`/`name`/`active` como o parser provisório já assumia, e revelou três coisas que T013 precisa tratar: `nextCursor` é paginação real e hoje é ignorada em silêncio; a resposta pesa ~15 KB por workflow por trazer `nodes`/`staticData`; e só `success` e `error` apareceram em 17 execuções, então o enum de status **não** pode ser fechado nesses dois.

- [x] **T013** ✅ `src/lib/n8n-schema.ts`, escrito contra o formato observado. `status` é `z.string()` e **não** enum fechado — o achado central de T012. `buildWorkflowStatuses` casa workflow com a execução de `startedAt` maior, e "nunca executou" é `lastExecution: null`, resolvido pela ausência. O cliente passou a seguir `nextCursor` com teto de páginas e a declarar `truncated`, fechando o defeito latente que a observação revelou.

- [x] **T014** ✅ `src/lib/__tests__/n8n-schema.test.ts`, 16 casos com fixtures da forma real, anonimizadas. Portão de reversão exercitado: trocando `status` por enum fechado nos dois valores observados, 2 testes reprovam — exatamente o erro que escrever de memória teria produzido.

## Fase E — Rota e cache (sem chave)

- [ ] **T015** Criar `src/lib/n8n-status-cache.ts`: janela curta, compartilhada entre pedidos do mesmo processo, com o instante da obtenção no resultado. Em falha, **não** servir o valor antigo (escolha conservadora de D3).

- [ ] **T016** Criar `src/app/api/integrations/n8n/status/route.ts`: autentica, exige papel, delega ao cliente. **Autorização no servidor**, não por ausência de botão (Princípio II). Papel exigido: `viewer`, decidido em D4 — preserva quem enxerga a tela hoje e move a verificação para o servidor.

- [ ] **T017** Teste do cache: N pedidos dentro da janela resultam em **uma** chamada ao n8n; passada a janela, nova chamada. É a prova de FR-005 e não precisa de n8n real.

- [ ] **T018** Teste de autorização, verificado no servidor. Atenção ao que `viewer` implica: sendo o piso da hierarquia, o ramo `FORBIDDEN` fica **inalcançável**, e um teste que espere 403 reprovaria contra um servidor correto — a mesma armadilha já documentada no contrato da SPEC-010. O que se afirma aqui é: sem sessão devolve 401; a rota usa `requireSessionRole` e não `requireAuth` (chave de API não lê estado operacional); e gravar credencial continua exigindo `admin`.

## Fase F — Tela

- [x] **T019** ✅ Reescrito. `src/app/(painel)/sistema/automacoes/page-client.tsx` para consumir a rota, renderizando os três estados. Remover a lista estática e o aviso provisório que a acompanha — a moldura honesta foi paliativo até esta tarefa existir.
  Remover também a inferência de endereço por substituição de `app.` por `n8n.` (linhas 5-7): o servidor passa a usar só o endereço configurado. Derivar destino a partir do host da requisição é padrão de SSRF (D5). `NEXT_PUBLIC_N8N_URL` permanece **apenas** para o link de navegação no navegador.

- [x] **T020** ✅ `src/lib/__tests__/automacoes-no-fabricated-data.test.ts`, 12 casos. Teste de ausência de dado inventado: nenhuma das strings da lista fixa atual ("Sync NF-e/CT-e", "Alertas Financeiros", "Captura de Email", "Notificações") sobrevive no componente. É a prova mecânica de SC-003.

## Fase G — Portões

- [ ] **T021** Bateria da constituição:
  ```bash
  npm run docs:validate && npx tsc --noEmit && npm run lint && npm test && npm run build
  npm run db:migrate:verify && npm run db:reconcile:verify   # exige DATABASE_URL
  ```
  Os dois últimos precisam de `DATABASE_URL` e rodam `migrate deploy` — passo humano, como registrado na SPEC-010.

- [x] **T022** ✅ Exercitada: renderizando a lista fora do ramo `ok`, o teste "só renderiza a lista dentro do ramo ok" reprova. **Reversão final** sobre o conjunto: com o n8n simulado como fora do ar, a tela não pode renderizar cartão de workflow algum. Desfazer esse tratamento deve deixar a suíte vermelha.

- [ ] **T023** Verificação manual, uma vez, contra a instância real, ao configurar a chave. Não entra na suíte: dependeria de credencial e de instância no ar, e o CI usa só recursos descartáveis.

---

## Dependências

```
T001 → T002 → T003 → T004 → T005          (configuração)
T003 → T006 → T007 → T008                 (cliente)
T008 → T009 → T010 → T011                 (falhas; T011 é portão)
T008 → T015 → T016 → T017, T018           (rota e cache; T017 ‖ T018)
🔑 chave → T012 → T013 → T014             (formato)
T013 + T016 → T019 → T020                 (tela)
tudo → T021 → T022 → T023
```

Paralelizável: **Fase C ‖ Fase E** depois de T008; **T017 ‖ T018**; e a Fase A inteira é independente da Fase B até T004.

## Critério de pronto

1. As 23 tarefas concluídas, ou com `ABANDON` e motivo visível.
2. Os dois portões de reversão (T011, T022) exercitados de fato, com a suíte observada vermelha e depois verde. Não basta suíte verde.
3. T021 limpo, com os dois verificadores de migration rodados por quem tem `DATABASE_URL`.
4. Nenhuma string da lista fixa sobrevivendo no componente (T020).
5. Os cinco critérios de sucesso da spec afirmados por teste.

## Fora deste ciclo

- **Qualquer escrita no n8n** — disparar, pausar, editar. FR-009 e D1: leitura é reversível, escrita não.
- **Histórico de execuções na tela**: só a última por workflow. Navegar histórico é o n8n que faz, e o link já existe.
- **Notificar sobre workflow parado**: seria produtor de notificação, terreno da SPEC-010 P2.
- **Cache compartilhado entre processos** e **exibir dado antigo em falha** (D3).
- **Dark mode e ícone da tela**: já entregues à parte (D6), commit `44b2b85`.
