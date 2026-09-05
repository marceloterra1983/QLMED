---
id: SPEC-044
status: implemented
owner: QLMED
affected_modules:
  - sistema-rotinas-ui
  - sistema-rotinas-api
  - navigation
---

# Feature Specification: Página de Rotinas do Sistema

**Feature Branch**: `feat/044-pagina-rotinas`

**Created**: 2026-09-04

**Status**: Implemented

**Input**: Solicitação do usuário: "crie uma pagina chama Rotinas, e na forma de tabela, relacione todas as rotinas que o codigo do portal realiza hoje".

## Contexto & Visão Geral

O QLMED executa uma série de rotinas em segundo plano (background services contínuos, agendamentos periódicos, watchers de arquivos locais e na nuvem, rotinas de integração externa, workers de notificação e scripts operacionais).
Até o momento, o operador precisava navegar entre diferentes telas (como *Sincronizar*, *Automações*, *Erros*, *Documentos*) ou consultar logs e documentação para ter visibilidade sobre os processos assíncronos.

Esta especificação cria a página canônica **Rotinas** (`/sistema/rotinas`), acessível no menu lateral sob a seção **Sistema**, contendo uma visão tabular rica e exaustiva de todas as rotinas operacionais executadas pelo código do portal, integrando metadados estruturais (categoria, frequência, mecanismo de concorrência e descrição de negócio) com status operacional em tempo real obtido via health check (`getBackgroundServiceHealth()`).

## Catálogo Canônico de Rotinas Mapeadas

1. **Sincronização Fiscal SEFAZ (DistDFe)**: Checagem no minuto `:00` com piso padrão de 6 horas (`SEFAZ_AUTO_SYNC_INTERVAL_MINUTES=360`) via WebService DistDFe com certificado A1 (.pfx), controle anti-bloqueio cStat 656 e cooldown progressivo.
2. **Sincronização Fiscal NSDocs (API Nuvem Fiscal)**: Consulta periódica configurável para reconciliação de NF-e, NFS-e e CT-e com paginação e rate limit.
3. **Sincronização Fiscal Receita NFS-e (ADN Nacional)**: Consulta periódica ao Ambiente de Dados Nacional da Receita Federal para notas de serviços via mTLS.
4. **Recuperação de Sincronizações Travadas (Stuck Sync Recovery)**: Ciclo a cada 60s que detecta processos fiscais caídos há mais de 30 minutos sob lock Postgres liberado e auto-recupera para erro.
5. **Reconciliação e Rebuild de Agregados de Produtos**: Rebuild noturno diário às 03:00 e atualização incremental a cada nota emitida/recebida, recalculando estoque, preços médios e tributação.
6. **Monitoramento de XMLs Locais (File Watcher)**: Monitoramento contínuo de pastas locais de emissão e entrada de notas fiscais via Chokidar.
7. **Sincronização de XMLs do OneDrive**: Cópia default a cada 1 minuto (`LOCAL_XML_COPY_INTERVAL_MS=60000`) e reconciliação a cada 30 minutos de XMLs fiscais sincronizados na nuvem Microsoft.
8. **Ingestão Automática de E-mails/Faturas IMPCG**: Ciclo a cada 15 minutos via Microsoft Graph para download e OCR de guias e relatórios de faturamento do IMPCG.
9. **Ingestão Automática de E-mails/Faturas CASSEMS**: Ciclo a cada 15 minutos via Microsoft Graph para processamento de demonstrativos de contas médicas CASSEMS.
10. **Ingestão de Documentos Corporativos (OneDrive)**: Ciclo a cada 1 hora (`DOCUMENTOS_INGEST_INTERVAL_MS`) para detecção de certidões, alvarás e contratos da pasta corporativa da empresa.
11. **Alertas Diários de Vencimento de Documentos**: Execução diária às 08:00 (Brasília) para verificação de prazos de certidões e envio de PDFs com aviso via WhatsApp Evolution API.
12. **Purga e Retenção do Outbox de Notificações**: Ciclo a cada 24 horas para expurgo seguro de entregas de notificações antigas acima do teto de retenção.
13. **Despacho de Notificações Outbox (Worker Cron)**: Execução a cada 10 minutos (`*/10` em `install-notification-outbox-cron.sh`, NFE e CTE) consumindo a fila transacional tokenizada para envio de Web Push e WhatsApp.
14. **Sincronização e Validação com Base ANVISA**: Validação cadastral periódica e sob demanda de produtos hospitalares contra os dados abertos da ANVISA.
15. **Watchdog de Sessão WhatsApp (Evolution API)**: Monitoramento a cada 5 minutos com circuit breaker e auto-reconexão do gateway WhatsApp.
16. **Watchdog de Execuções Travadas do n8n**: Monitoramento a cada 2 minutos (`OnUnitActiveSec=2min`) para identificação e cancelamento seguro de execuções órfãs do n8n.
17. **Backup Automatizado do PostgreSQL**: Script `qlmed-pg-backup.sh` como fallback manual; sem timer 02:00 no repositório. A cobertura noturna documentada é o snapshot `server-backup`.
18. **Sincronização de Distribuição DFe para CT-e**: Timer horário no minuto `:17` (`OnCalendar=*-*-* *:17:00`) para captura dedicada de conhecimentos de transporte eletrônico.
19. **Resumo Diário Operacional e Financeiro**: Catch-up a cada 15 minutos do workflow n8n `dailysummaryissued01` após o alvo 18h `America/Campo_Grande` (não 19:30).

## User Scenarios & Testing

### User Story 1 - Visualizar o painel de rotinas em formato de tabela (Priority: P1)

Como operador ou administrador do sistema, ao acessar `/sistema/rotinas`, quero visualizar uma tabela detalhada com todas as rotinas que o portal executa, identificando o objetivo de cada uma, sua frequência e seu estado atual de funcionamento.

**Critérios de Aceitação**:
1. A tabela exibe todas as rotinas catalogadas com nome, categoria, frequência/horário, tipo de gatilho, lock/concorrência e descrição.
2. Indicadores visuais de status ao vivo diferenciam serviços ativos, agendados, em execução, saudáveis ou desativados.
3. Filtros por categoria e campo de busca rápida por texto permitem localizar rotinas específicas em segundos.

### User Story 2 - Integração ao Menu e Segurança (Priority: P1)

A rota `/sistema/rotinas` e sua API associada `/api/sistema/rotinas` devem estar protegidas pelo sistema de autorização canônico do QLMED, registradas em `PAGE_GROUPS`, `PAGE_LABELS`, `buildNavItems` e testadas contra regressões de rotas.

## Requirements

### Functional Requirements

- **FR-001**: O sistema MUST disponibilizar a rota `/sistema/rotinas` sob o layout do painel, utilizando o componente `PageHeader` padrão.
- **FR-002**: A tela MUST apresentar tabelas responsivas dentro dos cards de
  seção, com colunas: *Rotina & Descrição*, *Gatilho / Frequência*, *Status* e
  *Detalhes*. Categoria e Lock NÃO aparecem como colunas da listagem (ficam no
  popup de detalhes).
- **FR-003**: O sistema MUST expor a rota de API `/api/sistema/rotinas` (autorizada para usuários da sessão com acesso à página ou perfil admin) fornecendo o catálogo estático enriquecido com a telemetria ao vivo de `getBackgroundServiceHealth()`.
- **FR-004**: O menu de navegação lateral (`SidebarNav`) MUST incluir o item "Rotinas" com ícone representativo (`schedule`), sincronizado entre `PAGE_GROUPS`, `PAGE_LABELS` e `buildNavItems`.
- **FR-005**: A tabela MUST disponibilizar contadores de resumo (total de rotinas, serviços em background ativos, rotinas agendadas/cron e rotinas de proteção/watchdog).
- **FR-006**: Símbolos e caminhos do catálogo MUST existir no código.
  Locks IMPCG/CASSEMS usam `impcgMailIngestLockKey` / `cassemsMailIngestLockKey`.
  ANVISA aponta para `src/lib/anvisa-api.ts` e a rota de sync; **não** há
  `src/lib/anvisa/` nem sync automático no ingest de XML. As quatro rotinas
  fiscais do processo `auto-sync` declaram telemetria compartilhada.
- **FR-008**: A listagem MUST agrupar rotinas em cards colapsáveis pelas seções
  de `PAGE_GROUPS` (Cadastros, Fiscal, Estoque, Financeiro, Gestão, Relatórios,
  Sistema), com card **Outros** apenas para rotinas sem mapeamento. Todos os
  cards MUST iniciar **recolhidos** ao abrir a página (`defaultOpen=false`).
- **FR-009**: O detalhe de uma rotina MUST abrir em popup (`CardDetailPopupModal`)
  com abas **Detalhes** e **Histórico**. O histórico usa `GET /api/sistema/rotinas/[id]/history`
  (ACL da página Rotinas); SyncLog para rotinas fiscais mapeadas; mensagem explícita
  quando a rotina não tem fonte de execução persistida.

## Acceptance Criteria

- **AC-006** (FR-006): o teste do catálogo falha se o lock IMPCG voltar a
  `impcgIngestLockKey`, se o módulo ANVISA voltar a `src/lib/anvisa/`, ou se
  algum `sourceModule` apontar para ficheiro inexistente.
- **AC-008** (FR-008): o teste do catálogo cobre `groupRoutinesByPageSection`
  (sem duplicar/perder rotinas; ordem = PAGE_GROUPS + Outros) e o client
  declara `defaultOpen={false}` com `Section`.
- **AC-009** (FR-009): o client usa `RoutineDetailModal`/`CardDetailPopupModal`
  com aba Histórico; a tabela da listagem não contém cabeçalhos Categoria nem
  Lock; a API de history responde 404 para id inexistente e 403 sem a página.
