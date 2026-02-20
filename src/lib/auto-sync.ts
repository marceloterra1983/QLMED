import { PrismaClient } from '@prisma/client';
import { SefazClient } from './sefaz-client';
import { CertificateManager } from './certificate-manager';
import { NsdocsClient } from './nsdocs-client';
import { decrypt } from './crypto';
import { parseInvoiceXml } from './parse-invoice-xml';
import { getNsdocsSyncWindow } from './nsdocs-sync-window';
import { mapSourceStatusToInvoiceStatus } from './source-status';

// Instância própria de Prisma para evitar import circular com prisma.ts
const prisma = new PrismaClient();

const CHECK_INTERVAL_MS = 60 * 1000; // Verifica a cada 60 segundos
const AUTO_SYNC_TIMEZONE = process.env.AUTO_SYNC_TIMEZONE || 'America/Sao_Paulo';

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

export function startAutoSync() {
  if (started) return;
  started = true;

  console.log('[AutoSync] Scheduler iniciado - verificando a cada 60s');

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

    // Auto-sync apenas na virada da hora (ex.: 13:00, 14:00, 15:00).
    if (nowParts.minute !== '00') {
      return;
    }

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

      if (!company.nsdocsConfig) continue;

      console.log(`[AutoSync] Sincronizando NSDocs (slot ${currentHourSlotKey} ${AUTO_SYNC_TIMEZONE}): ${company.razaoSocial} (${company.cnpj})`);
      await syncViaNsdocs(company.id, company.cnpj, company.razaoSocial, company.nsdocsConfig);
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

          const exists = await prisma.invoice.findUnique({ where: { accessKey: doc.chave } });
          if (exists) {
            totalAtualizados++;
            continue;
          }

          const parsed = await parseInvoiceXml(doc.xml);
          if (!parsed) continue;

          const accessKey = parsed.accessKey || doc.chave;
          const companyCnpjClean = cnpj.replace(/\D/g, '');
          const senderCnpjClean = parsed.senderCnpj.replace(/\D/g, '');
          const direction = senderCnpjClean === companyCnpjClean ? 'issued' : 'received';

          await prisma.invoice.create({
            data: {
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
          totalNovos++;
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
    const client = new NsdocsClient(nsdocsConfig.apiToken);
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
        const exists = await prisma.invoice.findUnique({
          where: { accessKey: parsed.accessKey },
          select: { id: true, status: true },
        });
        if (exists) {
          if (exists.status !== mappedStatus) {
            await prisma.invoice.update({
              where: { id: exists.id },
              data: { status: mappedStatus },
            });
          }
          totalAtualizados++;
          continue;
        }

        const companyCnpjClean = cnpj.replace(/\D/g, '');
        const senderCnpjClean = parsed.senderCnpj.replace(/\D/g, '');
        const direction = senderCnpjClean === companyCnpjClean ? 'issued' : 'received';

        await prisma.invoice.create({
          data: {
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
        totalNovos++;
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
