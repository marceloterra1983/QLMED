import type { BackgroundServiceName, BackgroundServiceStatus } from './background-service-health';
import { CASSEMS_INGEST_INTERVAL_MS } from './cassems/constants';
import {
  DOCUMENTOS_ALERT_THRESHOLDS,
  DOCUMENTOS_INGEST_INTERVAL_MS,
} from './documentos/constants';
import { IMPCG_INGEST_INTERVAL_MS } from './impcg/constants';

function intervalLabel(ms: number): string {
  const minutes = Math.round(ms / 60_000);
  if (minutes % (24 * 60) === 0 && minutes >= 24 * 60) {
    const days = minutes / (24 * 60);
    return days === 1 ? 'A cada 24 horas' : `A cada ${days} dias`;
  }
  if (minutes % 60 === 0 && minutes >= 60) {
    const hours = minutes / 60;
    return hours === 1 ? 'A cada 1 hora' : `A cada ${hours} horas`;
  }
  return `A cada ${minutes} minutos`;
}

function intervalSeconds(ms: number): number {
  return Math.round(ms / 1000);
}

export type RoutineCategory =
  | 'fiscal'
  | 'gestao'
  | 'documentos'
  | 'estoque'
  | 'notificacoes'
  | 'infra';

export type RoutineTriggerType =
  | 'background_service'
  | 'scheduled_timer'
  | 'event_driven'
  | 'worker_cron';

export interface SystemRoutine {
  id: string;
  name: string;
  category: RoutineCategory;
  categoryLabel: string;
  triggerType: RoutineTriggerType;
  triggerTypeLabel: string;
  frequency: string;
  scheduleDetails: string;
  concurrencyLock: string;
  sourceModule: string;
  description: string;
  backgroundServiceName?: BackgroundServiceName;
  environmentVars?: string[];
}

export const ROUTINE_CATEGORIES: Record<RoutineCategory, { label: string; icon: string; color: string }> = {
  fiscal: {
    label: 'Fiscal & Faturamento',
    icon: 'receipt_long',
    color: 'emerald',
  },
  gestao: {
    label: 'Gestão & Convênios',
    icon: 'clinical_notes',
    color: 'blue',
  },
  documentos: {
    label: 'Documentos & Regulatório',
    icon: 'verified',
    color: 'indigo',
  },
  estoque: {
    label: 'Estoque & Catálogo',
    icon: 'inventory_2',
    color: 'amber',
  },
  notificacoes: {
    label: 'Notificações & Mensageria',
    icon: 'notifications_active',
    color: 'purple',
  },
  infra: {
    label: 'Infraestrutura & Conectividade',
    icon: 'dns',
    color: 'slate',
  },
};

export const SYSTEM_ROUTINES: SystemRoutine[] = [
  {
    id: 'sefaz-auto-sync',
    name: 'Sincronização Fiscal SEFAZ (DistDFe)',
    category: 'fiscal',
    categoryLabel: 'Fiscal & Faturamento',
    triggerType: 'scheduled_timer',
    triggerTypeLabel: 'Agendamento / Timer',
    frequency: 'A cada 6 horas (piso padrão)',
    scheduleDetails: 'Checagem a cada 60s no minuto :00 (SEFAZ_AUTO_SYNC_MINUTE); piso default SEFAZ_AUTO_SYNC_INTERVAL_MINUTES=360; cooldown anti-656',
    concurrencyLock: 'Postgres Advisory Lock por empresa (syncExecutionLockKey) + cooldown progressivo anti-656',
    sourceModule: 'src/lib/sync-scheduler.ts / src/lib/sync-strategies/sefaz.ts',
    description: 'Consulta o WebService DistDFe da SEFAZ Nacional usando certificado A1 (.pfx) da empresa, buscando novos lotes de NF-e, CT-e, eventos e manifestações, atualizando NSU e salvando XMLs.',
    backgroundServiceName: 'auto-sync',
    environmentVars: [
      'SEFAZ_AUTO_SYNC_MINUTE',
      'SEFAZ_AUTO_SYNC_INTERVAL_MINUTES',
      'SEFAZ_RATE_LIMIT_COOLDOWN_MINUTES',
      'SEFAZ_EMPTY_SYNC_COOLDOWN_MINUTES',
    ],
  },
  {
    id: 'nsdocs-auto-sync',
    name: 'Sincronização Fiscal NSDocs',
    category: 'fiscal',
    categoryLabel: 'Fiscal & Faturamento',
    triggerType: 'scheduled_timer',
    triggerTypeLabel: 'Agendamento / Timer',
    frequency: 'Periódica configurável',
    scheduleDetails: 'Intervalo em minutos configurado por empresa (padrão 60 min, minuto :00 em NSDOCS_AUTO_SYNC_MINUTE)',
    concurrencyLock: 'Postgres Advisory Lock por empresa + paginação resiliente NsdocsClient',
    sourceModule: 'src/lib/sync-scheduler.ts / src/lib/sync-strategies/nsdocs.ts',
    description: 'Conecta à API Nuvem Fiscal da NSDocs para download e reconciliação de notas fiscais emitidas e recebidas, persistindo faturas no banco e emitindo notificações.',
    backgroundServiceName: 'auto-sync',
    environmentVars: ['NSDOCS_AUTO_SYNC_MINUTE'],
  },
  {
    id: 'receita-nfse-sync',
    name: 'Sincronização Fiscal Receita NFS-e (ADN)',
    category: 'fiscal',
    categoryLabel: 'Fiscal & Faturamento',
    triggerType: 'scheduled_timer',
    triggerTypeLabel: 'Agendamento / Timer',
    frequency: 'Periódica configurável',
    scheduleDetails: 'Executado a cada intervalo no minuto :30 (configurável via RECEITA_NFSE_AUTO_SYNC_MINUTE)',
    concurrencyLock: 'Postgres Advisory Lock por empresa + autenticação mTLS A1',
    sourceModule: 'src/lib/sync-scheduler.ts / src/lib/receita-nfse-sync.ts',
    description: 'Conecta ao Ambiente de Dados Nacional (ADN) da Receita Federal via mTLS com certificado digital A1 para capturar e reconciliar NFS-e padrão nacional.',
    backgroundServiceName: 'auto-sync',
    environmentVars: ['RECEITA_NFSE_AUTO_SYNC_MINUTE'],
  },
  {
    id: 'stuck-sync-recovery',
    name: 'Recuperação de Sincronizações Travadas',
    category: 'fiscal',
    categoryLabel: 'Fiscal & Faturamento',
    triggerType: 'background_service',
    triggerTypeLabel: 'Serviço em Segundo Plano (Contínuo)',
    frequency: 'A cada 60 segundos',
    scheduleDetails: 'Executado a cada ciclo de heartbeat do auto-sync',
    concurrencyLock: 'Inspeciona Postgres Advisory Lock; recupera apenas se o lock da empresa estiver livre após 30 min em running',
    sourceModule: 'src/lib/sync-scheduler.ts (recoverStuckSyncLogs)',
    description: 'Detecta sincronizações fiscais travadas por queda de conexão ou encerramento abrupto do processo e libera com segurança o log para estado error com mensagem explicativa.',
    backgroundServiceName: 'auto-sync',
  },
  {
    id: 'cte-dist-sync',
    name: 'Sincronização de Distribuição DFe para CT-e',
    category: 'fiscal',
    categoryLabel: 'Fiscal & Faturamento',
    triggerType: 'worker_cron',
    triggerTypeLabel: 'Worker / Cron do Sistema',
    frequency: 'A cada hora no :17',
    scheduleDetails: 'Timer systemd qlmed-cte-dist-sync.timer: OnCalendar=*-*-* *:17:00',
    concurrencyLock: 'Controle de NSU por CNPJ da empresa com verificação de bloqueio 656',
    sourceModule: 'ops/scripts/qlmed-cte-dist-sync.js / ops/systemd/qlmed-cte-dist-sync.service',
    description: 'Rotina autônoma de varredura focada na captura e conciliação de Conhecimentos de Transporte Eletrônico (CT-e) associados às empresas cadastradas.',
  },
  {
    id: 'product-aggregate-rebuild',
    name: 'Reconciliação e Rebuild de Agregados de Produtos',
    category: 'estoque',
    categoryLabel: 'Estoque & Catálogo',
    triggerType: 'scheduled_timer',
    triggerTypeLabel: 'Agendamento / Timer',
    frequency: 'Diariamente às 03:00 + Incremental por Nota',
    scheduleDetails: 'Rebuild noturno completo programado às 03:00 (horário de Brasília) e atualização incremental a cada nota upserted',
    concurrencyLock: 'Postgres Advisory Lock (productAggregateLockKey) + corte temporal cutoffCreatedAt',
    sourceModule: 'src/lib/product-aggregate-updater.ts / src/lib/product-aggregate-rebuild.ts',
    description: 'Recalcula todas as estatísticas consolidadas de produtos (quantidade total, deduções de saídas por revenda, preço médio ponderado, último fornecedor e preço de compra).',
  },
  {
    id: 'anvisa-registry-sync',
    name: 'Validação e Sincronização de Registros ANVISA',
    category: 'estoque',
    categoryLabel: 'Estoque & Catálogo',
    triggerType: 'event_driven',
    triggerTypeLabel: 'Gatilho por Evento / Watcher',
    frequency: 'Sob demanda / Na importação de XMLs',
    scheduleDetails: 'Executado automaticamente no enriquecimento de produtos importados e no upload manual de dados abertos',
    concurrencyLock: 'Sanitização de registro e cache de consultas por empresa',
    sourceModule: 'src/lib/anvisa/ / src/app/api/products/anvisa/*',
    description: 'Valida códigos de registro ANVISA dos produtos hospitalares contra a base de dados abertos da ANVISA, atualizando classes de risco e vencimentos sanitários.',
  },
  {
    id: 'local-xml-watcher',
    name: 'Monitoramento Contínuo de XMLs Locais',
    category: 'infra',
    categoryLabel: 'Infraestrutura & Conectividade',
    triggerType: 'event_driven',
    triggerTypeLabel: 'Gatilho por Evento / Watcher',
    frequency: 'Contínuo (File Watcher)',
    scheduleDetails: 'Watcher do sistema de arquivos (Chokidar) com rescan de segurança configurável (RESCAN_INTERVAL_MS)',
    concurrencyLock: 'Deduplicação de chaves de acesso no banco + semáforo de leitura de arquivo',
    sourceModule: 'src/lib/local-xml-sync/sync-scheduler.ts',
    description: 'Monitora pastas do servidor local onde faturadores ou sistemas legados gravam arquivos XML de notas fiscais, realizando a ingestão automática instantânea.',
    backgroundServiceName: 'local-xml-sync',
    environmentVars: ['LOCAL_XML_WATCH_ENABLED', 'LOCAL_XML_INPUT_DIR', 'LOCAL_XML_EMITTED_DIR'],
  },
  {
    id: 'onedrive-xml-sync',
    name: 'Sincronização de XMLs Fiscais do OneDrive',
    category: 'infra',
    categoryLabel: 'Infraestrutura & Conectividade',
    triggerType: 'scheduled_timer',
    triggerTypeLabel: 'Agendamento / Timer',
    frequency: 'A cada 1 min (cópia) / 30 min (reconciliação)',
    scheduleDetails: 'Cópia default LOCAL_XML_COPY_INTERVAL_MS=60000 (mínimo 15s); reconciliação a cada 30 min (HALF_HOUR_MS)',
    concurrencyLock: 'Advisory Lock por empresa + rastreamento de hashes e datas de modificação',
    sourceModule: 'src/lib/local-xml-sync/sync-scheduler.ts (runCopyFromOneDrive)',
    description: 'Conecta ao OneDrive corporativo da empresa para localizar e baixar novos XMLs de notas fiscais emitidas ou recebidas, submetendo-os ao pipeline de banco de dados.',
    backgroundServiceName: 'local-xml-sync',
  },
  {
    id: 'impcg-mail-ingest',
    name: 'Ingestão Automática de E-mails/Faturas IMPCG',
    category: 'gestao',
    categoryLabel: 'Gestão & Convênios',
    triggerType: 'background_service',
    triggerTypeLabel: 'Serviço em Segundo Plano (Contínuo)',
    frequency: intervalLabel(IMPCG_INGEST_INTERVAL_MS),
    scheduleDetails: `Ciclo contínuo no timer com heartbeat ativo; ${intervalSeconds(IMPCG_INGEST_INTERVAL_MS)}s (IMPCG_INGEST_INTERVAL_MS)`,
    concurrencyLock: 'Postgres Advisory Lock por empresa (impcgIngestLockKey) + salvamento de estado atômico',
    sourceModule: 'src/lib/impcg/ingest.ts',
    description: 'Autentica via Microsoft Graph na caixa de entrada corporativa, identifica mensagens de faturamento do IMPCG, baixa relatórios PDF/XLSX, executa OCR/parser de guias e persiste no banco.',
    backgroundServiceName: 'impcg-mail-ingest',
    environmentVars: ['QLMED_DISABLE_BACKGROUND_SERVICES', 'IMPCG_GRAPH_FOLDER_PATH'],
  },
  {
    id: 'cassems-mail-ingest',
    name: 'Ingestão Automática de E-mails/Faturas CASSEMS',
    category: 'gestao',
    categoryLabel: 'Gestão & Convênios',
    triggerType: 'background_service',
    triggerTypeLabel: 'Serviço em Segundo Plano (Contínuo)',
    frequency: intervalLabel(CASSEMS_INGEST_INTERVAL_MS),
    scheduleDetails: `Ciclo contínuo no timer com heartbeat ativo; ${intervalSeconds(CASSEMS_INGEST_INTERVAL_MS)}s (CASSEMS_INGEST_INTERVAL_MS)`,
    concurrencyLock: 'Postgres Advisory Lock por empresa (cassemsIngestLockKey) + rastreamento de remetentes autorizados',
    sourceModule: 'src/lib/cassems/ingest.ts',
    description: 'Varre e-mails recebidos da CASSEMS via Microsoft Graph, processa demonstrativos de contas médicas, extrai dados de procedimentos/autorizações e atualiza o estado operacional.',
    backgroundServiceName: 'cassems-mail-ingest',
    environmentVars: ['QLMED_DISABLE_BACKGROUND_SERVICES', 'CASSEMS_MAILBOXES'],
  },
  {
    id: 'daily-summary-catchup',
    name: 'Resumo Diário Operacional e Financeiro',
    category: 'gestao',
    categoryLabel: 'Gestão & Convênios',
    triggerType: 'worker_cron',
    triggerTypeLabel: 'Worker / Cron do Sistema',
    frequency: 'Catch-up a cada 15 min (alvo 18h Campo Grande)',
    scheduleDetails: 'Timer qlmed-daily-summary-catchup: boot + OnUnitActiveSec=15min; reenvia o workflow n8n dailysummaryissued01 se o schedule 18h America/Campo_Grande foi perdido',
    concurrencyLock: 'Agregação idempotente por data e empresa',
    sourceModule: 'ops/scripts/qlmed-daily-summary-catchup.sh / ops/systemd/qlmed-daily-summary-catchup.service',
    description: 'Gera o consolidado do dia com faturamento realizado, notas fiscais recebidas/emitidas e conciliação de convênios, despachando resumo para os gestores.',
  },
  {
    id: 'documentos-ingest',
    name: 'Ingestão de Documentos Corporativos (OneDrive)',
    category: 'documentos',
    categoryLabel: 'Documentos & Regulatório',
    triggerType: 'background_service',
    triggerTypeLabel: 'Serviço em Segundo Plano (Contínuo)',
    frequency: intervalLabel(DOCUMENTOS_INGEST_INTERVAL_MS),
    scheduleDetails: `Ciclo com timer a cada ${intervalSeconds(DOCUMENTOS_INGEST_INTERVAL_MS)}s (DOCUMENTOS_INGEST_INTERVAL_MS)`,
    concurrencyLock: 'Postgres Advisory Lock por empresa (documentosIngestLockKey)',
    sourceModule: 'src/lib/documentos/ingest.ts',
    description: 'Varre a pasta oficial de certidões, contratos e alvarás no OneDrive, detecta novos PDFs ou versões renovadas, extrai vigência/validade e registra no módulo de Documentos.',
    backgroundServiceName: 'documentos-ingest',
    environmentVars: ['QLMED_DISABLE_BACKGROUND_SERVICES'],
  },
  {
    id: 'documentos-alert',
    name: 'Alertas Diários de Vencimento de Documentos',
    category: 'documentos',
    categoryLabel: 'Documentos & Regulatório',
    triggerType: 'background_service',
    triggerTypeLabel: 'Serviço em Segundo Plano (Contínuo)',
    frequency: 'Diariamente às 08:00 (Brasília)',
    scheduleDetails: 'Verificação minuto a minuto; executa o lote no slot das 08:00 da manhã local',
    concurrencyLock: 'Postgres Advisory Lock (documentosAlertLockKey) + deduplicação de limiar em alertedThresholds',
    sourceModule: 'src/lib/documentos/alerts.ts',
    description: `Verifica certidões e alvarás vigentes que atingiram limiares de aviso (${DOCUMENTOS_ALERT_THRESHOLDS.join(', ')} dias ou vencidos), baixa o PDF vigente e envia a notificação com arquivo anexo via WhatsApp (Evolution API).`,
    backgroundServiceName: 'documentos-alert',
    environmentVars: ['QLMED_DISABLE_BACKGROUND_SERVICES', 'EVOLUTION_API_URL', 'DOCUMENTOS_WHATSAPP_GROUP'],
  },
  {
    id: 'notification-outbox-worker',
    name: 'Despacho da Fila de Notificações (Worker)',
    category: 'notificacoes',
    categoryLabel: 'Notificações & Mensageria',
    triggerType: 'worker_cron',
    triggerTypeLabel: 'Worker / Cron do Sistema',
    frequency: 'A cada 10 minutos (NFE e CTE)',
    scheduleDetails: 'Cron do host instalado por scripts/install-notification-outbox-cron.sh: */10 para NFE e CTE',
    concurrencyLock: 'Reserva atômica de lote com token de lease (newOutboxLockToken) e expiração automática de lock',
    sourceModule: 'scripts/notification-outbox-worker.py / src/app/api/notifications/outbox/*',
    description: 'Consome a tabela transacional de outbox, distribui notificações para Web Push dos navegadores de usuários e despacha mensagens formatadas no WhatsApp via Evolution API.',
    environmentVars: ['NOTIFICATION_OUTBOX_API_KEY', 'EVOLUTION_API_URL', 'VAPID_PRIVATE_KEY'],
  },
  {
    id: 'notification-outbox-purge',
    name: 'Purga e Retenção do Outbox de Notificações',
    category: 'notificacoes',
    categoryLabel: 'Notificações & Mensageria',
    triggerType: 'background_service',
    triggerTypeLabel: 'Serviço em Segundo Plano (Contínuo)',
    frequency: 'A cada 24 horas',
    scheduleDetails: 'Ciclo diário executado a cada 86.400 segundos',
    concurrencyLock: 'Exclusão transacional em lote baseada em janela de dias configurada',
    sourceModule: 'src/lib/notification-outbox.ts (purgeNotificationOutbox)',
    description: 'Limpa registros de notificações antigas já entregues com sucesso ou descartadas que excederam a política de retenção em dias.',
    backgroundServiceName: 'notification-outbox-purge',
    environmentVars: ['NOTIFICATION_OUTBOX_RETENTION_DAYS'],
  },
  {
    id: 'evolution-session-watchdog',
    name: 'Watchdog de Sessão do WhatsApp (Evolution API)',
    category: 'infra',
    categoryLabel: 'Infraestrutura & Conectividade',
    triggerType: 'worker_cron',
    triggerTypeLabel: 'Worker / Cron do Sistema',
    frequency: 'A cada 5 minutos',
    scheduleDetails: 'Monitoramento disparado via timer systemd qlmed-evolution-session-monitor.timer',
    concurrencyLock: 'Circuit-breaker de reinício com detecção de estado de sessão QR/conectado',
    sourceModule: 'ops/scripts/qlmed-evolution-session-monitor.sh / ops/systemd/qlmed-evolution-session-monitor.service',
    description: 'Testa ativamente o status da instância de mensageria da Evolution API e executa reinicialização graciosa da sessão em caso de desconexão com o WhatsApp.',
  },
  {
    id: 'n8n-stuck-watchdog',
    name: 'Watchdog de Execuções Travadas no n8n',
    category: 'infra',
    categoryLabel: 'Infraestrutura & Conectividade',
    triggerType: 'worker_cron',
    triggerTypeLabel: 'Worker / Cron do Sistema',
    frequency: 'A cada 2 minutos',
    scheduleDetails: 'Timer systemd qlmed-n8n-stuck-watchdog.timer: OnUnitActiveSec=2min',
    concurrencyLock: 'Cancelamento seguro por API REST com alerta automático gerado na outbox',
    sourceModule: 'ops/scripts/qlmed-n8n-stuck-watchdog.sh / ops/systemd/qlmed-n8n-stuck-watchdog.service',
    description: 'Inspeciona a fila de execuções do n8n para identificar fluxos em execução há mais de 30 minutos, cancelando jobs zumbis e notificando a administração.',
  },
  {
    id: 'postgres-backup',
    name: 'Backup Automatizado do PostgreSQL',
    category: 'infra',
    categoryLabel: 'Infraestrutura & Conectividade',
    triggerType: 'worker_cron',
    triggerTypeLabel: 'Worker / Cron do Sistema',
    frequency: 'Sob demanda / fallback (sem timer no repo)',
    scheduleDetails: 'qlmed-pg-backup.sh é fallback manual; a cobertura noturna documentada é o snapshot server-backup, não um cron 02:00 neste repositório',
    concurrencyLock: 'Lock consistente pg_dump com verificação de integridade pós-exportação',
    sourceModule: 'ops/scripts/qlmed-pg-backup.sh / ops/scripts/qlmed-backup-validate.sh',
    description: 'Gera dump integral comprimido do banco relacional de produção, valida a integridade do arquivo gerado e gerencia a rotação de retenção de segurança.',
  },
];


export type RoutineLiveStatus = 'running' | 'stale' | 'disabled' | 'error' | 'scheduled' | 'worker';

export interface EnrichedSystemRoutine extends SystemRoutine {
  liveStatus: RoutineLiveStatus;
  liveStatusLabel: string;
  lastHeartbeatAt: string | null;
  lastHeartbeatAgeMs: number | null;
  lastError: string | null;
}

function liveStatusLabel(status: RoutineLiveStatus): string {
  switch (status) {
    case 'running':
      return 'Ativo (Em Execução)';
    case 'stale':
      return 'Sem Batimento (Stale)';
    case 'disabled':
      return 'Desativado';
    case 'error':
      return 'Falha / Erro';
    case 'worker':
      return 'Worker do Host';
    case 'scheduled':
    default:
      return 'Agendado no Sistema';
  }
}

/** Enriquece o catálogo estático com telemetria ao vivo de background services. */
export function enrichRoutinesWithHealth(
  health: Partial<Record<string, BackgroundServiceStatus>>,
  routines: SystemRoutine[] = SYSTEM_ROUTINES,
): EnrichedSystemRoutine[] {
  return routines.map((routine) => {
    if (routine.backgroundServiceName) {
      const serviceStatus = health[routine.backgroundServiceName];
      if (serviceStatus) {
        const status = serviceStatus.status as RoutineLiveStatus;
        return {
          ...routine,
          liveStatus: status,
          liveStatusLabel: liveStatusLabel(status),
          lastHeartbeatAt: serviceStatus.lastHeartbeatAt,
          lastHeartbeatAgeMs: serviceStatus.lastHeartbeatAgeMs,
          lastError: serviceStatus.lastError,
        };
      }
    }

    const defaultStatus: RoutineLiveStatus =
      routine.triggerType === 'worker_cron' ? 'worker' : 'scheduled';

    return {
      ...routine,
      liveStatus: defaultStatus,
      liveStatusLabel: liveStatusLabel(defaultStatus),
      lastHeartbeatAt: null,
      lastHeartbeatAgeMs: null,
      lastError: null,
    };
  });
}

export interface RoutineSummary {
  total: number;
  backgroundServices: number;
  scheduledTimers: number;
  watchdogs: number;
  totalRoutines: number;
  backgroundServicesCount: number;
  activeServicesCount: number;
  errorServicesCount: number;
  recentSyncs24h?: number;
  pendingOutbox?: number;
}

/** Contadores de resumo para cards do painel e resposta da API. */
export function buildRoutineSummary(
  routines: SystemRoutine[],
  health: Partial<Record<string, BackgroundServiceStatus>>,
  extras: { recentSyncs24h?: number; pendingOutbox?: number } = {},
): RoutineSummary {
  const activeServicesCount = Object.values(health).filter((h) => h?.status === 'running').length;
  const errorServicesCount = Object.values(health).filter(
    (h) => h?.status === 'error' || h?.status === 'stale',
  ).length;
  const scheduledTimers = routines.filter(
    (r) => r.triggerType === 'scheduled_timer' || r.triggerType === 'worker_cron',
  ).length;
  const watchdogs = routines.filter((r) => r.id.includes('watchdog') || r.name.toLowerCase().includes('watchdog')).length;

  return {
    total: routines.length,
    backgroundServices: Object.keys(health).length,
    scheduledTimers,
    watchdogs,
    totalRoutines: routines.length,
    backgroundServicesCount: Object.keys(health).length,
    activeServicesCount,
    errorServicesCount,
    ...extras,
  };
}

