import { PrismaClient } from '@prisma/client';
import { SefazClient } from './sefaz-client';
import { CertificateManager } from './certificate-manager';
import { NsdocsClient } from './nsdocs-client';
import { decrypt } from './crypto';
import { parseInvoiceXml } from './parse-invoice-xml';
import { getNsdocsSyncWindow } from './nsdocs-sync-window';
import { mapSourceStatusToInvoiceStatus } from './source-status';
import { resolveInvoiceDirection } from './invoice-direction';
import { updateProductAggregatesForInvoice, scheduleNightlyRebuild } from './product-aggregate-updater';
import { syncReceitaNfseByNsu } from './receita-nfse-sync';

// Instância própria de Prisma para evitar import circular com prisma.ts
const prisma = new PrismaClient();

const CHECK_INTERVAL_MS = 60 * 1000; // Verifica a cada 60 segundos
const AUTO_SYNC_TIMEZONE = process.env.AUTO_SYNC_TIMEZONE || 'America/Sao_Paulo';
const NSDOCS_AUTO_SYNC_MINUTE = normalizeMinuteSlot(process.env.NSDOCS_AUTO_SYNC_MINUTE, '00');
const RECEITA_NFSE_AUTO_SYNC_MINUTE = normalizeMinuteSlot(process.env.RECEITA_NFSE_AUTO_SYNC_MINUTE, '30');

const UF_TO_CODE: Record<string, string> = {
  AC: '12', AL: '27', AP: '16', AM: '13', BA: '29', CE: '23', DF: '53', ES: '32',
  GO: '52', MA: '21', MT: '51', MS: '50', MG: '31', PA: '15', PB: '25', PR: '41',
  PE: '26', PI: '22', RJ: '33', RN: '24', RS: '43', RO: '11', RR: '14', SC: '42',
  SP: '35', SE: '28', TO: '17',
};

function getUfCode(subject?: string | null): string {
  if (!subject) return '50';
  const uf = subject.match(/(?:^|,\s*)ST=([A-Z]{2})(?:,|$)/)?.[1];
  return (uf && UF_TO_CODE[uf]) ? UF_TO_CODE[uf] : '50';
}

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

  console.log('[AutoSync] Scheduler iniciado - verificando a cada 60s');

  // Schedule nightly product aggregate rebuild at 3am
  scheduleNightlyRebuild();

  // Primeira verificação após 30s (tempo para o servidor aquecer)
  setTimeout(() => {
    checkAndSync();
    setInterval(checkAndSync, CHECK_INTERVAL_MS);
  }, 30_000);
}

async function checkAndSync() {
  try {
    const now = new Date();
    const nowParts = getDatePartsInTimeZone(now, AUTO_SYNC_TIMEZONE);
    const currentHourSlotKey = `${nowParts.year}-${nowParts.month}-${nowParts.day} ${nowParts.hour}`;
    const runNsdocsNow = nowParts.minute === NSDOCS_AUTO_SYNC_MINUTE;
    const runReceitaNow = nowParts.minute === RECEITA_NFSE_AUTO_SYNC_MINUTE;

    if (!runNsdocsNow && !runReceitaNow) return;

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
        const company = config.company;

        // Não iniciar se já tem sync rodando
        const running = await prisma.syncLog.findFirst({
          where: { companyId: company.id, status: 'running' },
        });
        if (running) continue;

        // Evita mais de uma execução automática de NSDocs dentro da mesma hora.
        const lastNsdocsCompleted = await prisma.syncLog.findFirst({
          where: {
            companyId: company.id,
            syncMethod: 'nsdocs',
            status: 'completed',
          },
          orderBy: { completedAt: 'desc' },
          select: { completedAt: true },
        });
        if (
          lastNsdocsCompleted?.completedAt &&
          getHourSlotKey(lastNsdocsCompleted.completedAt, AUTO_SYNC_TIMEZONE) === currentHourSlotKey
        ) {
          continue;
        }
        if (
          lastNsdocsCompleted?.completedAt &&
          !hasElapsedInterval(lastNsdocsCompleted.completedAt, now, normalizeSyncIntervalMinutes(config.syncInterval))
        ) {
          continue;
        }

        if (!company.nsdocsConfig) continue;

        console.log(
          `[AutoSync] Sincronizando NSDocs (slot ${currentHourSlotKey}:${NSDOCS_AUTO_SYNC_MINUTE} ${AUTO_SYNC_TIMEZONE}): ` +
          `${company.razaoSocial} (${company.cnpj})`
        );
        await syncViaNsdocs(company.id, company.cnpj, company.razaoSocial, company.nsdocsConfig);
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
        const company = config.company;
        if (!company.receitaNfseConfig || !company.certificateConfig) continue;

        const running = await prisma.syncLog.findFirst({
          where: { companyId: company.id, status: 'running' },
        });
        if (running) continue;

        const lastReceitaCompleted = await prisma.syncLog.findFirst({
          where: {
            companyId: company.id,
            syncMethod: 'receita_nfse',
            status: 'completed',
          },
          orderBy: { completedAt: 'desc' },
          select: { completedAt: true },
        });
        if (
          lastReceitaCompleted?.completedAt &&
          getHourSlotKey(lastReceitaCompleted.completedAt, AUTO_SYNC_TIMEZONE) === currentHourSlotKey
        ) {
          continue;
        }
        if (
          lastReceitaCompleted?.completedAt &&
          !hasElapsedInterval(lastReceitaCompleted.completedAt, now, normalizeSyncIntervalMinutes(config.syncInterval))
        ) {
          continue;
        }

        console.log(
          `[AutoSync] Sincronizando Receita NFS-e (slot ${currentHourSlotKey}:${RECEITA_NFSE_AUTO_SYNC_MINUTE} ${AUTO_SYNC_TIMEZONE}): ` +
          `${company.razaoSocial} (${company.cnpj})`
        );

        await syncViaReceitaNfse(
          company.id,
          company.cnpj,
          company.razaoSocial,
          company.receitaNfseConfig,
          company.certificateConfig,
        );
      }
    }
  } catch (error) {
    console.error('[AutoSync] Erro no check:', error);
  }
}

async function syncViaSefaz(
  companyId: string,
  cnpj: string,
  razaoSocial: string,
  cert: {
    id: string;
    pfxData: Buffer;
    pfxPassword: string;
    lastNsu: string;
    environment: string;
    subject: string | null;
  },
) {
  const syncLog = await prisma.syncLog.create({
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

      if (response.status === 'error') {
        if (response.cStat === '656') {
          throw new Error('Bloqueio SEFAZ (656): Excesso de consultas. Aguarde 1h.');
        }
        throw new Error(`Erro SEFAZ: ${response.xMotivo} (cStat: ${response.cStat})`);
      }

      ultNSU = response.ultNSU || ultNSU;

      if (response.status === 'empty') break;
      if (response.docs.length === 0 && ultNSU === nsuAntes) break;

      for (const doc of response.docs) {
        try {
          if (!doc.chave || doc.chave.length < 44 || !doc.xml) continue;

          const parsed = await parseInvoiceXml(doc.xml);
          if (!parsed) continue;

          const accessKey = parsed.accessKey || doc.chave;
          const direction = resolveInvoiceDirection(cnpj, parsed.senderCnpj, accessKey);

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
              xmlContent: doc.xml,
            },
          });
          if (result.createdAt.getTime() === result.updatedAt.getTime()) {
            totalNovos++;
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
            }).catch(() => {});
          }
        } catch (docErr) {
          console.error(`[AutoSync] Erro ao processar doc ${doc.chave}:`, docErr);
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

    console.log(`[AutoSync] SEFAZ OK: ${razaoSocial} - ${totalNovos} novos, ${totalAtualizados} atualizados`);
  } catch (err: any) {
    console.error(`[AutoSync] Erro SEFAZ ${razaoSocial}:`, err.message);
    try {
      await prisma.certificateConfig.update({ where: { id: cert.id }, data: { lastNsu: ultNSU } });
    } catch {}
    await prisma.syncLog.update({
      where: { id: syncLog.id },
      data: { status: 'error', errorMessage: err.message, completedAt: new Date() },
    });
  }
}

async function syncViaNsdocs(
  companyId: string,
  cnpj: string,
  razaoSocial: string,
  nsdocsConfig: { id: string; apiToken: string; lastSyncAt: Date | null },
) {
  const syncLog = await prisma.syncLog.create({
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

    for (const doc of documentos) {
      try {
        if (!doc.id) continue;
        const xmlContent = await client.recuperarXml(doc.id);
        if (!xmlContent || xmlContent.length < 50) continue;

        const parsed = await parseInvoiceXml(xmlContent);
        if (!parsed || !parsed.accessKey) continue;

        const mappedStatus = mapSourceStatusToInvoiceStatus(parsed.type, doc.situacao);
        const direction = resolveInvoiceDirection(cnpj, parsed.senderCnpj, parsed.accessKey);

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
            xmlContent,
          },
        });
        if (result.createdAt.getTime() === result.updatedAt.getTime()) {
          totalNovos++;
        } else {
          totalAtualizados++;
        }
        // Incremental aggregate update
        if (parsed.type === 'NFE' && xmlContent) {
          const direction = resolveInvoiceDirection(cnpj, parsed.senderCnpj, parsed.accessKey);
          updateProductAggregatesForInvoice({
            companyId,
            invoiceId: result.id,
            xmlContent,
            direction,
            issueDate: parsed.issueDate ? new Date(parsed.issueDate) : null,
            senderName: parsed.senderName,
            senderCnpj: parsed.senderCnpj,
            recipientName: parsed.recipientName,
            recipientCnpj: parsed.recipientCnpj,
            invoiceNumber: parsed.number,
          }).catch(() => {});
        }
      } catch (docErr) {
        console.error(`[AutoSync] Erro no doc ${doc.id}:`, docErr);
      }
    }

    await prisma.nsdocsConfig.update({
      where: { id: nsdocsConfig.id },
      data: { lastSyncAt: syncedAt },
    });

    await prisma.syncLog.update({
      where: { id: syncLog.id },
      data: { status: 'completed', newDocs: totalNovos, updatedDocs: totalAtualizados, completedAt: new Date() },
    });

    console.log(`[AutoSync] NSDocs OK: ${razaoSocial} - ${totalNovos} novos, ${totalAtualizados} existentes`);
  } catch (err: any) {
    console.error(`[AutoSync] Erro NSDocs ${razaoSocial}:`, err.message);
    await prisma.syncLog.update({
      where: { id: syncLog.id },
      data: { status: 'error', errorMessage: err.message, completedAt: new Date() },
    });
  }
}

async function syncViaReceitaNfse(
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
    pfxData: Buffer;
    pfxPassword: string;
  },
) {
  const syncLog = await prisma.syncLog.create({
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

    console.log(
      `[AutoSync] Receita NFS-e OK: ${razaoSocial} - ` +
      `${result.newDocs} novos, ${result.updatedDocs} atualizados, NSUs: ${result.scannedNsuCount}`
    );
  } catch (err: any) {
    console.error(`[AutoSync] Erro Receita NFS-e ${razaoSocial}:`, err.message);
    await prisma.syncLog.update({
      where: { id: syncLog.id },
      data: { status: 'error', errorMessage: err.message, completedAt: new Date() },
    });
  }
}
