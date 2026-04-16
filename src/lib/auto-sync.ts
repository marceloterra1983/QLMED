import { SefazClient } from './sefaz-client';
import { CertificateManager } from './certificate-manager';
import { NsdocsClient, NsdocsTransientError, NsdocsPaginationError } from './nsdocs-client';
import { decrypt } from './crypto';
import { parseInvoiceXml } from './parse-invoice-xml';
import { getNsdocsSyncWindow } from './nsdocs-sync-window';
import { mapSourceStatusToInvoiceStatus } from './source-status';
import { resolveInvoiceDirection } from './invoice-direction';
import { updateProductAggregatesForInvoice, scheduleNightlyRebuild } from './product-aggregate-updater';
import { syncReceitaNfseByNsu } from './receita-nfse-sync';
import { saveXmlToFile } from './xml-file-store';
import { extractFirstCfop } from './cfop';
import { prisma } from './prisma';
import { UF_TO_CODE } from './constants';
import { createLogger } from '@/lib/logger';

const log = createLogger('auto-sync');

const CHECK_INTERVAL_MS = 60 * 1000; // Verifica a cada 60 segundos
const AUTO_SYNC_TIMEZONE = process.env.AUTO_SYNC_TIMEZONE || 'America/Sao_Paulo';
const SEFAZ_AUTO_SYNC_MINUTE = normalizeMinuteSlot(process.env.SEFAZ_AUTO_SYNC_MINUTE, '00');
const NSDOCS_AUTO_SYNC_MINUTE = normalizeMinuteSlot(process.env.NSDOCS_AUTO_SYNC_MINUTE, '00');
const RECEITA_NFSE_AUTO_SYNC_MINUTE = normalizeMinuteSlot(process.env.RECEITA_NFSE_AUTO_SYNC_MINUTE, '30');

function getUfCode(subject?: string | null): string {
  if (!subject) return '50';
  const uf = subject.match(/(?:^|,\s*)ST=([A-Z]{2})(?:,|$)/)?.[1];
  return (uf && UF_TO_CODE[uf]) ? UF_TO_CODE[uf] : '50';
}

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

        // Roda se última sync completada foi há mais de 1h
        if (sefazAge > 60 * 60 * 1000) {
          log.info({ company: company.razaoSocial, lastSyncMinutes: Math.round(sefazAge / 60000) }, 'Startup SEFAZ sync');
          await syncViaSefaz(company.id, company.cnpj, company.razaoSocial, {
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
          await syncViaNsdocs(company.id, company.cnpj, company.razaoSocial, company.nsdocsConfig);
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
          await syncViaReceitaNfse(
            company.id,
            company.cnpj,
            company.razaoSocial,
            company.receitaNfseConfig,
            company.certificateConfig,
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

          log.info({ company: company.razaoSocial, cnpj: company.cnpj, slot: `${currentHourSlotKey}:${SEFAZ_AUTO_SYNC_MINUTE}`, tz: AUTO_SYNC_TIMEZONE }, 'Sincronizando SEFAZ');
          await syncViaSefaz(company.id, company.cnpj, company.razaoSocial, {
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
          await syncViaNsdocs(company.id, company.cnpj, company.razaoSocial, company.nsdocsConfig);
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

          await syncViaReceitaNfse(
            company.id,
            company.cnpj,
            company.razaoSocial,
            company.receitaNfseConfig,
            company.certificateConfig,
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

export async function syncViaSefaz(
  companyId: string,
  cnpj: string,
  razaoSocial: string,
  cert: {
    id: string;
    pfxData: Buffer | Uint8Array;
    pfxPassword: string;
    lastNsu: string;
    environment: string;
    subject: string | null;
  },
  existingSyncLogId?: string,
) {
  const syncLog = existingSyncLogId
    ? { id: existingSyncLogId }
    : await prisma.syncLog.create({
        data: { companyId, syncMethod: 'sefaz', status: 'running' },
      });

  let ultNSU = cert.lastNsu || '0';

  try {
    const pfxPassword = decrypt(cert.pfxPassword);
    const { key, cert: certPem } = CertificateManager.extractPems(cert.pfxData, pfxPassword);

    const sefaz = new SefazClient(
      certPem,
      key,
      cnpj,
      cert.environment === 'production',
      getUfCode(cert.subject),
    );

    let temMais = true;
    let totalNovos = 0;
    let totalAtualizados = 0;
    let loopCount = 0;

    while (temMais && loopCount < 50) {
      loopCount++;
      const nsuAntes = ultNSU;

      const response = await sefaz.buscarNovosDocumentos(ultNSU);

      // Always advance ultNSU even on error (SEFAZ returns valid ultNSU with 656)
      if (response.ultNSU) ultNSU = response.ultNSU;

      if (response.status === 'error') {
        if (response.cStat === '656') {
          throw new Error('Bloqueio SEFAZ (656): Excesso de consultas. Aguarde 1h.');
        }
        throw new Error(`Erro SEFAZ: ${response.xMotivo} (cStat: ${response.cStat})`);
      }

      if (response.status === 'empty') break;
      if (response.docs.length === 0 && ultNSU === nsuAntes) break;

      for (const doc of response.docs) {
        try {
          if (!doc.chave || doc.chave.length < 44 || !doc.xml) continue;

          const parsed = await parseInvoiceXml(doc.xml);
          if (!parsed) continue;

          const accessKey = parsed.accessKey || doc.chave;
          const direction = resolveInvoiceDirection(cnpj, parsed.senderCnpj, accessKey);
          const cfop = extractFirstCfop(doc.xml);

          const result = await prisma.invoice.upsert({
            where: { accessKey },
            update: {
              type: parsed.type,
              direction,
              number: parsed.number,
              series: parsed.series,
              issueDate: parsed.issueDate,
              senderCnpj: parsed.senderCnpj,
              senderName: parsed.senderName,
              recipientCnpj: parsed.recipientCnpj,
              recipientName: parsed.recipientName,
              totalValue: parsed.totalValue,
              cfop,
              xmlContent: doc.xml,
            },
            create: {
              companyId,
              accessKey,
              type: parsed.type,
              direction,
              number: parsed.number,
              series: parsed.series,
              issueDate: parsed.issueDate,
              senderCnpj: parsed.senderCnpj,
              senderName: parsed.senderName,
              recipientCnpj: parsed.recipientCnpj,
              recipientName: parsed.recipientName,
              totalValue: parsed.totalValue,
              status: 'received',
              cfop,
              xmlContent: doc.xml,
            },
          });
          if (result.createdAt.getTime() === result.updatedAt.getTime()) {
            totalNovos++;
            saveXmlToFile(accessKey, parsed.type, doc.xml, parsed.issueDate).catch((err) => { log.error({ err, accessKey }, 'saveXmlToFile failed for SEFAZ'); });
          } else {
            totalAtualizados++;
          }
          // Incremental aggregate update
          if (parsed.type === 'NFE' && doc.xml) {
            updateProductAggregatesForInvoice({
              companyId,
              invoiceId: result.id,
              xmlContent: doc.xml,
              direction,
              issueDate: parsed.issueDate ? new Date(parsed.issueDate) : null,
              senderName: parsed.senderName,
              senderCnpj: parsed.senderCnpj,
              recipientName: parsed.recipientName,
              recipientCnpj: parsed.recipientCnpj,
              invoiceNumber: parsed.number,
            }).catch((err) => { log.error({ err, accessKey }, 'updateProductAggregatesForInvoice failed for SEFAZ'); });
          }
        } catch (docErr) {
          log.error({ err: docErr, chave: doc.chave }, 'Erro ao processar doc SEFAZ');
        }
      }

      const ultBig = BigInt(response.ultNSU || '0');
      const maxBig = BigInt(response.maxNSU || '0');
      if (ultBig >= maxBig) temMais = false;
    }

    await prisma.certificateConfig.update({
      where: { id: cert.id },
      data: { lastNsu: ultNSU, lastSyncAt: new Date() },
    });

    await prisma.syncLog.update({
      where: { id: syncLog.id },
      data: { status: 'completed', newDocs: totalNovos, updatedDocs: totalAtualizados, completedAt: new Date() },
    });

    log.info({ company: razaoSocial, newDocs: totalNovos, updatedDocs: totalAtualizados }, 'SEFAZ sync completed');
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    log.error({ err, company: razaoSocial }, 'Erro SEFAZ');
    try {
      await prisma.certificateConfig.update({ where: { id: cert.id }, data: { lastNsu: ultNSU } });
    } catch (saveErr) {
      log.error({ err: saveErr }, 'CRITICAL: Failed to save NSU checkpoint');
    }
    try {
      await prisma.syncLog.update({
        where: { id: syncLog.id },
        data: { status: 'error', errorMessage: message, completedAt: new Date() },
      });
    } catch (logErr) {
      log.error({ err: logErr, syncLogId: syncLog.id }, 'CRITICAL: Failed to update syncLog to error');
    }
  }
}

export async function syncViaNsdocs(
  companyId: string,
  cnpj: string,
  razaoSocial: string,
  nsdocsConfig: { id: string; apiToken: string; lastSyncAt: Date | null },
  existingSyncLogId?: string,
) {
  const syncLog = existingSyncLogId
    ? { id: existingSyncLogId }
    : await prisma.syncLog.create({
        data: { companyId, syncMethod: 'nsdocs', status: 'running' },
      });

  try {
    const client = new NsdocsClient(decrypt(nsdocsConfig.apiToken));
    const { dtInicial, dtFinal, syncedAt } = getNsdocsSyncWindow(nsdocsConfig.lastSyncAt);

    const documentos = await client.listarTodosDocumentos({
      dtInicial,
      dtFinal,
      ordenacao_campo: 'dataemissao',
      ordenacao_tipo: 'asc',
    });

    let totalNovos = 0;
    let totalAtualizados = 0;
    const skippedReasons: string[] = [];
    const skipDoc = (docId: string | undefined, chave: string | undefined, reason: string, err?: unknown) => {
      const identifier = chave ? `chave=${chave.slice(0, 12)}…` : `docId=${docId || '?'}`;
      const detail = err instanceof Error ? err.message.slice(0, 120) : '';
      const entry = detail ? `${identifier} ${reason}: ${detail}` : `${identifier} ${reason}`;
      skippedReasons.push(entry);
      log.warn({ docId, chave, reason, err }, 'NSDocs doc skipped');
    };

    for (const doc of documentos) {
      try {
        if (!doc.id) {
          skipDoc(doc.id, doc.chave_acesso, 'missing_doc_id');
          continue;
        }

        let xmlContent: string;
        try {
          xmlContent = await client.recuperarXml(doc.id);
        } catch (xmlErr) {
          // Transient errors abort the whole sync so we retry the window.
          if (xmlErr instanceof NsdocsTransientError) throw xmlErr;
          skipDoc(doc.id, doc.chave_acesso, 'xml_fetch_failed', xmlErr);
          continue;
        }
        if (!xmlContent || xmlContent.length < 50) {
          skipDoc(doc.id, doc.chave_acesso, 'xml_empty_or_too_small');
          continue;
        }

        const parsed = await parseInvoiceXml(xmlContent);
        if (!parsed) {
          skipDoc(doc.id, doc.chave_acesso, 'parse_failed_unknown_schema');
          continue;
        }
        if (!parsed.accessKey) {
          skipDoc(doc.id, doc.chave_acesso, 'parse_missing_access_key');
          continue;
        }

        const mappedStatus = mapSourceStatusToInvoiceStatus(parsed.type, doc.situacao);
        const direction = resolveInvoiceDirection(cnpj, parsed.senderCnpj, parsed.accessKey);
        const cfop = extractFirstCfop(xmlContent);

        const result = await prisma.invoice.upsert({
          where: { accessKey: parsed.accessKey },
          update: {
            type: parsed.type,
            direction,
            number: parsed.number,
            series: parsed.series,
            issueDate: parsed.issueDate,
            senderCnpj: parsed.senderCnpj,
            senderName: parsed.senderName,
            recipientCnpj: parsed.recipientCnpj,
            recipientName: parsed.recipientName,
            totalValue: parsed.totalValue,
            status: mappedStatus,
            cfop,
            xmlContent,
          },
          create: {
            companyId,
            accessKey: parsed.accessKey,
            type: parsed.type,
            direction,
            number: parsed.number,
            series: parsed.series,
            issueDate: parsed.issueDate,
            senderCnpj: parsed.senderCnpj,
            senderName: parsed.senderName,
            recipientCnpj: parsed.recipientCnpj,
            recipientName: parsed.recipientName,
            totalValue: parsed.totalValue,
            status: mappedStatus,
            cfop,
            xmlContent,
          },
        });
        if (result.createdAt.getTime() === result.updatedAt.getTime()) {
          totalNovos++;
          saveXmlToFile(parsed.accessKey, parsed.type, xmlContent, parsed.issueDate).catch((err) => { log.error({ err, accessKey: parsed.accessKey }, 'saveXmlToFile failed for NSDocs'); });
        } else {
          totalAtualizados++;
        }
        // Incremental aggregate update
        if (parsed.type === 'NFE' && xmlContent) {
          const aggDirection = resolveInvoiceDirection(cnpj, parsed.senderCnpj, parsed.accessKey);
          updateProductAggregatesForInvoice({
            companyId,
            invoiceId: result.id,
            xmlContent,
            direction: aggDirection,
            issueDate: parsed.issueDate ? new Date(parsed.issueDate) : null,
            senderName: parsed.senderName,
            senderCnpj: parsed.senderCnpj,
            recipientName: parsed.recipientName,
            recipientCnpj: parsed.recipientCnpj,
            invoiceNumber: parsed.number,
          }).catch((err) => { log.error({ err, accessKey: parsed.accessKey }, 'updateProductAggregatesForInvoice failed for NSDocs'); });
        }
      } catch (docErr) {
        if (docErr instanceof NsdocsTransientError) throw docErr;
        skipDoc(doc.id, doc.chave_acesso, 'upsert_failed', docErr);
      }
    }

    const skippedCount = skippedReasons.length;
    const finalStatus: 'completed' | 'partial' = skippedCount === 0 ? 'completed' : 'partial';

    // Only advance lastSyncAt when EVERY doc in the window was processed successfully.
    // Partial runs keep the previous cursor so the skipped docs get retried next run
    // (combined with the 1-day overlap in getNsdocsSyncWindow, this gives us durable replay).
    if (skippedCount === 0) {
      await prisma.nsdocsConfig.update({
        where: { id: nsdocsConfig.id },
        data: { lastSyncAt: syncedAt },
      });
    } else {
      log.warn({ company: razaoSocial, skippedCount }, 'NSDocs sync partial — lastSyncAt NOT advanced, window will be retried');
    }

    const errorMessage = skippedCount > 0
      ? `${skippedCount} docs skipped: ${skippedReasons.slice(0, 15).join('; ')}${skippedCount > 15 ? ` (+${skippedCount - 15} more)` : ''}`
      : null;

    await prisma.syncLog.update({
      where: { id: syncLog.id },
      data: {
        status: finalStatus,
        newDocs: totalNovos,
        updatedDocs: totalAtualizados,
        skippedDocs: skippedCount,
        errorMessage,
        completedAt: new Date(),
      },
    });

    log.info(
      { company: razaoSocial, newDocs: totalNovos, updatedDocs: totalAtualizados, skippedDocs: skippedCount, status: finalStatus },
      `NSDocs sync ${finalStatus}`,
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    const isTransient = err instanceof NsdocsTransientError;
    const isPagination = err instanceof NsdocsPaginationError;
    log.error({ err, company: razaoSocial, transient: isTransient, pagination: isPagination }, 'Erro NSDocs');
    try {
      await prisma.syncLog.update({
        where: { id: syncLog.id },
        data: { status: 'error', errorMessage: message.slice(0, 2000), completedAt: new Date() },
      });
    } catch (logErr) {
      log.error({ err: logErr, syncLogId: syncLog.id }, 'CRITICAL: Failed to update syncLog to error');
    }
  }
}

export async function syncViaReceitaNfse(
  companyId: string,
  cnpj: string,
  razaoSocial: string,
  receitaConfig: {
    id: string;
    apiToken: string | null;
    lastNsu: string;
    cnpjConsulta: string | null;
    environment: string;
    baseUrl: string | null;
  },
  certificateConfig: {
    pfxData: Buffer | Uint8Array;
    pfxPassword: string;
  },
  existingSyncLogId?: string,
) {
  const syncLog = existingSyncLogId
    ? { id: existingSyncLogId }
    : await prisma.syncLog.create({
        data: { companyId, syncMethod: 'receita_nfse', status: 'running' },
      });

  try {
    const result = await syncReceitaNfseByNsu({
      prisma,
      companyId,
      companyCnpj: cnpj,
      config: {
        id: receitaConfig.id,
        apiToken: receitaConfig.apiToken,
        lastNsu: receitaConfig.lastNsu,
        cnpjConsulta: receitaConfig.cnpjConsulta,
        environment: receitaConfig.environment,
        baseUrl: receitaConfig.baseUrl,
      },
      certificate: {
        pfxData: certificateConfig.pfxData,
        pfxPassword: certificateConfig.pfxPassword,
      },
    });

    const rateLimitMessage = result.rateLimited
      ? 'Receita NFS-e limitou a consulta (HTTP 429). Tente novamente em alguns minutos.'
      : null;
    const hasImportedDocs = result.importedXmlCount > 0;
    const finalStatus = result.rateLimited && !hasImportedDocs ? 'error' : 'completed';

    await prisma.receitaNfseConfig.update({
      where: { id: receitaConfig.id },
      data: {
        lastNsu: result.lastNsu,
        lastSyncAt: new Date(),
      },
    });

    await prisma.syncLog.update({
      where: { id: syncLog.id },
      data: {
        status: finalStatus,
        newDocs: result.newDocs,
        updatedDocs: result.updatedDocs,
        errorMessage: rateLimitMessage,
        completedAt: new Date(),
      },
    });

    log.info({ company: razaoSocial, newDocs: result.newDocs, updatedDocs: result.updatedDocs, scannedNsus: result.scannedNsuCount }, 'Receita NFS-e sync completed');
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    log.error({ err, company: razaoSocial }, 'Erro Receita NFS-e');
    try {
      await prisma.syncLog.update({
        where: { id: syncLog.id },
        data: { status: 'error', errorMessage: message, completedAt: new Date() },
      });
    } catch (logErr) {
      log.error({ err: logErr, syncLogId: syncLog.id }, 'CRITICAL: Failed to update syncLog to error');
    }
  }
}
