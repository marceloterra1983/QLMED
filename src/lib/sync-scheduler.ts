import { prisma } from './prisma';
import { scheduleNightlyRebuild } from './product-aggregate-updater';
import { createLogger } from '@/lib/logger';
import { sefazStrategy } from './sync-strategies/sefaz';
import { nsdocsStrategy } from './sync-strategies/nsdocs';
import { receitaNfseStrategy } from './sync-strategies/receita-nfse';

const log = createLogger('auto-sync');

const CHECK_INTERVAL_MS = 60 * 1000; // Verifica a cada 60 segundos
const AUTO_SYNC_TIMEZONE = process.env.AUTO_SYNC_TIMEZONE || 'America/Sao_Paulo';
const SEFAZ_AUTO_SYNC_MINUTE = normalizeMinuteSlot(process.env.SEFAZ_AUTO_SYNC_MINUTE, '00');
const NSDOCS_AUTO_SYNC_MINUTE = normalizeMinuteSlot(process.env.NSDOCS_AUTO_SYNC_MINUTE, '00');
const RECEITA_NFSE_AUTO_SYNC_MINUTE = normalizeMinuteSlot(process.env.RECEITA_NFSE_AUTO_SYNC_MINUTE, '30');
// Intervalo mínimo entre syncs SEFAZ quando o último run trouxe documentos.
// Consultar DistDFe com frequência alta (ainda mais com ultNSU==maxNSU) dispara
// cStat 656 — padrão observado em prod: empty às HH:15 → 656 2–3h depois.
const SEFAZ_AUTO_SYNC_INTERVAL_MINUTES = normalizeSyncIntervalMinutes(process.env.SEFAZ_AUTO_SYNC_INTERVAL_MINUTES || '360');
// Após sync vazio (caught-up), usar o mesmo piso longo: a SEFAZ pune reconsulta
// sem documentos novos mais do que o intervalo "com novidade".
const SEFAZ_EMPTY_SYNC_COOLDOWN_MINUTES = normalizeSyncIntervalMinutes(
  process.env.SEFAZ_EMPTY_SYNC_COOLDOWN_MINUTES || String(SEFAZ_AUTO_SYNC_INTERVAL_MINUTES),
);
// Cooldown DEDICADO após bloqueio 656 (a SEFAZ pune consumo indevido por horas).
const SEFAZ_RATE_LIMIT_COOLDOWN_MINUTES = normalizeSyncIntervalMinutes(process.env.SEFAZ_RATE_LIMIT_COOLDOWN_MINUTES || '360');
// Bloqueios 656 consecutivos dobram o cooldown (6h → 12h → 24h...) até este teto.
const SEFAZ_RATE_LIMIT_COOLDOWN_MAX_MINUTES = normalizeSyncIntervalMinutes(process.env.SEFAZ_RATE_LIMIT_COOLDOWN_MAX_MINUTES || '1440');

const STUCK_SYNC_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

let started = false;

function getDatePartsInTimeZone(date: Date, timeZone: string): {
  year: string;
  month: string;
  day: string;
  hour: string;
  minute: string;
} {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || '';

  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
  };
}

function getHourSlotKey(date: Date, timeZone: string): string {
  const parts = getDatePartsInTimeZone(date, timeZone);
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}`;
}

function normalizeMinuteSlot(rawValue: string | undefined, fallback: string): string {
  const parsed = Number(rawValue ?? fallback);
  if (!Number.isFinite(parsed)) return fallback;
  const minute = Math.max(0, Math.min(59, Math.round(parsed)));
  return String(minute).padStart(2, '0');
}

function normalizeSyncIntervalMinutes(rawInterval: unknown): number {
  const parsed = Number(rawInterval);
  if (!Number.isFinite(parsed) || parsed <= 0) return 60;
  return Math.max(5, Math.min(1440, Math.round(parsed)));
}

function hasElapsedInterval(lastCompletedAt: Date | null | undefined, now: Date, intervalMinutes: number): boolean {
  if (!lastCompletedAt) return true;
  return (now.getTime() - lastCompletedAt.getTime()) >= intervalMinutes * 60 * 1000;
}

export async function getSefazCooldown(companyId: string, now = new Date()): Promise<{
  active: boolean;
  lastRunAt: Date | null;
  waitMinutes: number;
  reason: string | null;
}> {
  const recentRuns = await prisma.syncLog.findMany({
    where: {
      companyId,
      syncMethod: 'sefaz',
      status: { in: ['completed', 'error'] },
      completedAt: { not: null },
    },
    orderBy: { completedAt: 'desc' },
    take: 6,
    select: {
      status: true,
      errorMessage: true,
      completedAt: true,
      newDocs: true,
      updatedDocs: true,
    },
  });
  type SyncRun = (typeof recentRuns)[number];
  const is656 = (run: SyncRun) =>
    run.status === 'error' && (run.errorMessage || '').includes('656');
  const isEmptyCompleted = (run: SyncRun) =>
    run.status === 'completed' && run.newDocs === 0 && run.updatedDocs === 0;
  const isProductiveCompleted = (run: SyncRun) =>
    run.status === 'completed' && (run.newDocs > 0 || run.updatedDocs > 0);

  const lastRun = recentRuns[0];
  if (!lastRun?.completedAt) {
    return { active: false, lastRunAt: null, waitMinutes: 0, reason: null };
  }

  // Streak de 656 a partir do mais recente. Empty no meio NÃO zera (não cura o
  // bloqueio). Só um completed com documentos novos encerra a sequência.
  let rateLimitStreak = 0;
  let latest656At: Date | null = null;
  for (const run of recentRuns) {
    if (is656(run)) {
      rateLimitStreak++;
      if (!latest656At && run.completedAt) latest656At = run.completedAt;
      continue;
    }
    if (isProductiveCompleted(run)) break;
    if (isEmptyCompleted(run)) continue;
    break;
  }

  const wasEmptyRun = isEmptyCompleted(lastRun);
  const wasProductiveRun = isProductiveCompleted(lastRun);

  if (!wasEmptyRun && !wasProductiveRun && rateLimitStreak === 0) {
    return { active: false, lastRunAt: lastRun.completedAt, waitMinutes: 0, reason: null };
  }

  let cooldownMinutes: number;
  let reason: string;
  let anchorAt = lastRun.completedAt;

  if (rateLimitStreak > 0) {
    cooldownMinutes = Math.min(
      SEFAZ_RATE_LIMIT_COOLDOWN_MINUTES * 2 ** (rateLimitStreak - 1),
      SEFAZ_RATE_LIMIT_COOLDOWN_MAX_MINUTES,
    );
    anchorAt = latest656At || lastRun.completedAt;
    reason = `Bloqueio SEFAZ 656 recente (${rateLimitStreak} consecutivo${rateLimitStreak > 1 ? 's' : ''})`;
  } else if (wasEmptyRun) {
    cooldownMinutes = SEFAZ_EMPTY_SYNC_COOLDOWN_MINUTES;
    reason = 'Última consulta SEFAZ sem documentos (caught-up)';
  } else if (wasProductiveRun) {
    cooldownMinutes = SEFAZ_AUTO_SYNC_INTERVAL_MINUTES;
    reason = 'Intervalo mínimo entre syncs SEFAZ com documentos';
  } else {
    return { active: false, lastRunAt: lastRun.completedAt, waitMinutes: 0, reason: null };
  }

  const elapsedMs = now.getTime() - anchorAt.getTime();
  const cooldownMs = cooldownMinutes * 60 * 1000;
  if (elapsedMs >= cooldownMs) {
    return { active: false, lastRunAt: lastRun.completedAt, waitMinutes: 0, reason: null };
  }

  return {
    active: true,
    lastRunAt: lastRun.completedAt,
    waitMinutes: Math.ceil((cooldownMs - elapsedMs) / 60000),
    reason,
  };
}

export function startAutoSync() {
  if (started) return;
  started = true;

  log.info('Scheduler iniciado - verificando a cada 60s');

  // Schedule nightly product aggregate rebuild at 3am
  scheduleNightlyRebuild();

  // Sync de startup após 30s (catch-up de período offline)
  setTimeout(async () => {
    await runStartupSync();
    setInterval(checkAndSync, CHECK_INTERVAL_MS);
  }, 30_000);
}

async function recoverStuckSyncLogs() {
  try {
    const cutoff = new Date(Date.now() - STUCK_SYNC_TIMEOUT_MS);
    const stuckLogs = await prisma.syncLog.findMany({
      where: {
        status: 'running',
        startedAt: { lt: cutoff },
      },
      include: { company: { select: { razaoSocial: true } } },
    });

    if (stuckLogs.length > 0) {
      for (const stuckLog of stuckLogs) {
        log.warn(
          { syncLogId: stuckLog.id, syncMethod: stuckLog.syncMethod, company: stuckLog.company.razaoSocial, runningMinutes: Math.round((Date.now() - stuckLog.startedAt.getTime()) / 60000) },
          'Recovering stuck syncLog'
        );
        await prisma.syncLog.update({
          where: { id: stuckLog.id },
          data: {
            status: 'error',
            errorMessage: 'Auto-recovered: sync timed out after 30 minutes',
            completedAt: new Date(),
          },
        });
      }
      log.warn({ count: stuckLogs.length }, 'Recovered stuck syncLog(s)');
    }
  } catch (error) {
    log.error({ err: error }, 'Failed to recover stuck syncLogs');
  }
}

async function runStartupSync() {
  log.info('Sync de startup - verificando pendencias');

  // Recover any syncLogs stuck in 'running' for over 30 minutes
  await recoverStuckSyncLogs();

  // SEFAZ
  try {
    const certConfigs = await prisma.certificateConfig.findMany({
      include: { company: true },
    });
    for (const cert of certConfigs) {
      try {
        const company = cert.company;
        const running = await prisma.syncLog.findFirst({
          where: { companyId: company.id, status: 'running' },
        });
        if (running) continue;

        const lastSefaz = await prisma.syncLog.findFirst({
          where: { companyId: company.id, syncMethod: 'sefaz', status: 'completed' },
          orderBy: { completedAt: 'desc' },
          select: { completedAt: true },
        });
        const sefazAge = lastSefaz?.completedAt
          ? Date.now() - lastSefaz.completedAt.getTime()
          : Infinity;

        // Roda no startup apenas se a janela mínima anti-bloqueio da SEFAZ já passou.
        if (sefazAge > 60 * 60 * 1000) {
          const cooldown = await getSefazCooldown(company.id);
          if (cooldown.active) {
            log.info(
              { company: company.razaoSocial, reason: cooldown.reason, waitMinutes: cooldown.waitMinutes },
              'Startup SEFAZ skipped due to cooldown'
            );
            continue;
          }

          log.info({ company: company.razaoSocial, lastSyncMinutes: Math.round(sefazAge / 60000) }, 'Startup SEFAZ sync');
          await sefazStrategy.run({ companyId: company.id, cnpj: company.cnpj, razaoSocial: company.razaoSocial }, {
            id: cert.id,
            pfxData: cert.pfxData,
            pfxPassword: cert.pfxPassword,
            lastNsu: cert.lastNsu,
            environment: cert.environment,
            subject: cert.subject,
          });
        }
      } catch (error) {
        log.error({ err: error, company: cert.company?.razaoSocial }, 'Startup SEFAZ failed');
      }
    }
  } catch (error) {
    log.error({ err: error }, 'Startup SEFAZ query failed');
  }

  // NSDocs
  try {
    const nsdocsConfigs = await prisma.nsdocsConfig.findMany({
      where: { autoSync: true },
      include: { company: { include: { nsdocsConfig: true } } },
    });
    for (const config of nsdocsConfigs) {
      try {
        const company = config.company;
        const running = await prisma.syncLog.findFirst({
          where: { companyId: company.id, status: 'running' },
        });
        if (running) continue;

        const lastNsdocs = await prisma.syncLog.findFirst({
          where: { companyId: company.id, syncMethod: 'nsdocs', status: 'completed' },
          orderBy: { completedAt: 'desc' },
          select: { completedAt: true },
        });
        const nsdocsAge = lastNsdocs?.completedAt
          ? Date.now() - lastNsdocs.completedAt.getTime()
          : Infinity;

        if (nsdocsAge > 60 * 60 * 1000 && company.nsdocsConfig) {
          log.info({ company: company.razaoSocial, lastSyncMinutes: Math.round(nsdocsAge / 60000) }, 'Startup NSDocs sync');
          await nsdocsStrategy.run({ companyId: company.id, cnpj: company.cnpj, razaoSocial: company.razaoSocial }, company.nsdocsConfig);
        }
      } catch (error) {
        log.error({ err: error, company: config.company?.razaoSocial }, 'Startup NSDocs failed');
      }
    }
  } catch (error) {
    log.error({ err: error }, 'Startup NSDocs query failed');
  }

  // Receita NFS-e
  try {
    const receitaConfigs = await prisma.receitaNfseConfig.findMany({
      where: { autoSync: true },
      include: { company: { include: { receitaNfseConfig: true, certificateConfig: true } } },
    });
    for (const config of receitaConfigs) {
      try {
        const company = config.company;
        if (!company.receitaNfseConfig || !company.certificateConfig) continue;

        const running = await prisma.syncLog.findFirst({
          where: { companyId: company.id, status: 'running' },
        });
        if (running) continue;

        const lastReceita = await prisma.syncLog.findFirst({
          where: { companyId: company.id, syncMethod: 'receita_nfse', status: 'completed' },
          orderBy: { completedAt: 'desc' },
          select: { completedAt: true },
        });
        const receitaAge = lastReceita?.completedAt
          ? Date.now() - lastReceita.completedAt.getTime()
          : Infinity;

        if (receitaAge > 60 * 60 * 1000) {
          log.info({ company: company.razaoSocial, lastSyncMinutes: Math.round(receitaAge / 60000) }, 'Startup Receita NFS-e sync');
          await receitaNfseStrategy.run(
            { companyId: company.id, cnpj: company.cnpj, razaoSocial: company.razaoSocial },
            { receitaConfig: company.receitaNfseConfig, certificateConfig: company.certificateConfig },
          );
        }
      } catch (error) {
        log.error({ err: error, company: config.company?.razaoSocial }, 'Startup Receita NFS-e failed');
      }
    }
  } catch (error) {
    log.error({ err: error }, 'Startup Receita NFS-e query failed');
  }

  log.info('Sync de startup concluido');
}

async function checkAndSync() {
  try {
    // Recover any syncLogs stuck in 'running' for over 30 minutes
    await recoverStuckSyncLogs();

    const now = new Date();
    const nowParts = getDatePartsInTimeZone(now, AUTO_SYNC_TIMEZONE);
    const currentHourSlotKey = `${nowParts.year}-${nowParts.month}-${nowParts.day} ${nowParts.hour}`;
    const runSefazNow = nowParts.minute === SEFAZ_AUTO_SYNC_MINUTE;
    const runNsdocsNow = nowParts.minute === NSDOCS_AUTO_SYNC_MINUTE;
    const runReceitaNow = nowParts.minute === RECEITA_NFSE_AUTO_SYNC_MINUTE;

    if (!runSefazNow && !runNsdocsNow && !runReceitaNow) return;

    if (runSefazNow) {
      const certConfigs = await prisma.certificateConfig.findMany({
        include: {
          company: true,
        },
      });

      for (const cert of certConfigs) {
        try {
          const company = cert.company;

          const running = await prisma.syncLog.findFirst({
            where: { companyId: company.id, status: 'running' },
          });
          if (running) continue;

          const lastSefazRun = await prisma.syncLog.findFirst({
            where: {
              companyId: company.id,
              syncMethod: 'sefaz',
              status: { in: ['completed', 'error'] },
            },
            orderBy: { completedAt: 'desc' },
            select: { completedAt: true },
          });
          if (
            lastSefazRun?.completedAt &&
            getHourSlotKey(lastSefazRun.completedAt, AUTO_SYNC_TIMEZONE) === currentHourSlotKey
          ) {
            continue;
          }
          const sefazCooldown = await getSefazCooldown(company.id, now);
          if (sefazCooldown.active) {
            log.info(
              { company: company.razaoSocial, reason: sefazCooldown.reason, waitMinutes: sefazCooldown.waitMinutes },
              'SEFAZ sync skipped due to cooldown'
            );
            continue;
          }

          log.info({ company: company.razaoSocial, cnpj: company.cnpj, slot: `${currentHourSlotKey}:${SEFAZ_AUTO_SYNC_MINUTE}`, tz: AUTO_SYNC_TIMEZONE }, 'Sincronizando SEFAZ');
          await sefazStrategy.run({ companyId: company.id, cnpj: company.cnpj, razaoSocial: company.razaoSocial }, {
            id: cert.id,
            pfxData: cert.pfxData,
            pfxPassword: cert.pfxPassword,
            lastNsu: cert.lastNsu,
            environment: cert.environment,
            subject: cert.subject,
          });
        } catch (error) {
          log.error({ err: error, company: cert.company?.razaoSocial }, 'Hourly SEFAZ failed');
        }
      }
    }

    if (runNsdocsNow) {
      const configs = await prisma.nsdocsConfig.findMany({
        where: { autoSync: true },
        include: {
          company: {
            include: {
              nsdocsConfig: true,
            },
          },
        },
      });

      for (const config of configs) {
        try {
          const company = config.company;

          // Não iniciar se já tem sync rodando
          const running = await prisma.syncLog.findFirst({
            where: { companyId: company.id, status: 'running' },
          });
          if (running) continue;

          // Evita mais de uma execução automática de NSDocs dentro da mesma hora.
          const lastNsdocsRun = await prisma.syncLog.findFirst({
            where: {
              companyId: company.id,
              syncMethod: 'nsdocs',
              status: { in: ['completed', 'error'] },
            },
            orderBy: { completedAt: 'desc' },
            select: { completedAt: true },
          });
          if (
            lastNsdocsRun?.completedAt &&
            getHourSlotKey(lastNsdocsRun.completedAt, AUTO_SYNC_TIMEZONE) === currentHourSlotKey
          ) {
            continue;
          }
          if (
            lastNsdocsRun?.completedAt &&
            !hasElapsedInterval(lastNsdocsRun.completedAt, now, normalizeSyncIntervalMinutes(config.syncInterval))
          ) {
            continue;
          }

          if (!company.nsdocsConfig) continue;

          log.info({ company: company.razaoSocial, cnpj: company.cnpj, slot: `${currentHourSlotKey}:${NSDOCS_AUTO_SYNC_MINUTE}`, tz: AUTO_SYNC_TIMEZONE }, 'Sincronizando NSDocs');
          await nsdocsStrategy.run({ companyId: company.id, cnpj: company.cnpj, razaoSocial: company.razaoSocial }, company.nsdocsConfig);
        } catch (error) {
          log.error({ err: error, company: config.company?.razaoSocial }, 'Hourly NSDocs failed');
        }
      }
    }

    if (runReceitaNow) {
      const receitaConfigs = await prisma.receitaNfseConfig.findMany({
        where: { autoSync: true },
        include: {
          company: {
            include: {
              receitaNfseConfig: true,
              certificateConfig: true,
            },
          },
        },
      });

      for (const config of receitaConfigs) {
        try {
          const company = config.company;
          if (!company.receitaNfseConfig || !company.certificateConfig) continue;

          const running = await prisma.syncLog.findFirst({
            where: { companyId: company.id, status: 'running' },
          });
          if (running) continue;

          const lastReceitaRun = await prisma.syncLog.findFirst({
            where: {
              companyId: company.id,
              syncMethod: 'receita_nfse',
              status: { in: ['completed', 'error'] },
            },
            orderBy: { completedAt: 'desc' },
            select: { completedAt: true },
          });
          if (
            lastReceitaRun?.completedAt &&
            getHourSlotKey(lastReceitaRun.completedAt, AUTO_SYNC_TIMEZONE) === currentHourSlotKey
          ) {
            continue;
          }
          if (
            lastReceitaRun?.completedAt &&
            !hasElapsedInterval(lastReceitaRun.completedAt, now, normalizeSyncIntervalMinutes(config.syncInterval))
          ) {
            continue;
          }

          log.info({ company: company.razaoSocial, cnpj: company.cnpj, slot: `${currentHourSlotKey}:${RECEITA_NFSE_AUTO_SYNC_MINUTE}`, tz: AUTO_SYNC_TIMEZONE }, 'Sincronizando Receita NFS-e');

          await receitaNfseStrategy.run(
            { companyId: company.id, cnpj: company.cnpj, razaoSocial: company.razaoSocial },
            { receitaConfig: company.receitaNfseConfig, certificateConfig: company.certificateConfig },
          );
        } catch (error) {
          log.error({ err: error, company: config.company?.razaoSocial }, 'Hourly Receita NFS-e failed');
        }
      }
    }
  } catch (error) {
    log.error({ err: error }, 'Erro no check');
  }
}
