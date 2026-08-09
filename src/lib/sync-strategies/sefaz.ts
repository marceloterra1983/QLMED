import { SefazClient } from '../sefaz-client';
import { CertificateManager } from '../certificate-manager';
import { decrypt } from '../crypto';
import { parseInvoiceXml } from '../parse-invoice-xml';
import { resolveInvoiceDirection } from '../invoice-direction';
import { updateProductAggregatesForInvoice } from '../product-aggregate-updater';
import { saveXmlToFile } from '../xml-file-store';
import { extractFirstCfop } from '../cfop';
import { prisma } from '../prisma';
import { UF_TO_CODE } from '../constants';
import { createLogger } from '@/lib/logger';
import { upsertInvoiceWithOutbox } from '@/lib/notification-outbox';

const log = createLogger('auto-sync');

// Intervalo entre consultas consecutivas à DistribuiçãoDFe no mesmo run (espaça a
// rajada que disparava o 656 'consumo indevido').
const SEFAZ_QUERY_DELAY_MS = Math.max(0, Number(process.env.SEFAZ_QUERY_DELAY_MS) || 2000);

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function getUfCode(subject?: string | null): string {
  if (!subject) return '50';
  const uf = subject.match(/(?:^|,\s*)ST=([A-Z]{2})(?:,|$)/)?.[1];
  return (uf && UF_TO_CODE[uf]) ? UF_TO_CODE[uf] : '50';
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
      // Espaça consultas consecutivas (a partir da 2ª) — rajada disparava 656.
      if (loopCount > 1 && SEFAZ_QUERY_DELAY_MS > 0) {
        await sleep(SEFAZ_QUERY_DELAY_MS);
      }
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

          const { invoice: result, isNewInvoice } = await upsertInvoiceWithOutbox({
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
          if (isNewInvoice) {
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
              updateAggregates: isNewInvoice,
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

