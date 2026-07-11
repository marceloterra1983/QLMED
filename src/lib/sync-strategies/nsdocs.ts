import { NsdocsClient, NsdocsTransientError, NsdocsPaginationError } from '../nsdocs-client';
import { decrypt } from '../crypto';
import { parseInvoiceXml } from '../parse-invoice-xml';
import { getNsdocsSyncWindow } from '../nsdocs-sync-window';
import { mapSourceStatusToInvoiceStatus } from '../source-status';
import { resolveInvoiceDirection } from '../invoice-direction';
import { updateProductAggregatesForInvoice } from '../product-aggregate-updater';
import { saveXmlToFile } from '../xml-file-store';
import { extractFirstCfop } from '../cfop';
import { prisma } from '../prisma';
import { createLogger } from '@/lib/logger';
import { upsertInvoiceWithOutbox } from '@/lib/notification-outbox';
import type { SyncStrategy } from './types';

const log = createLogger('auto-sync');

export interface NsdocsSyncConfig {
  id: string;
  apiToken: string;
  lastSyncAt: Date | null;
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

        const { invoice: result, isNewInvoice } = await upsertInvoiceWithOutbox({
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
        if (isNewInvoice) {
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
            updateAggregates: isNewInvoice,
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

export const nsdocsStrategy: SyncStrategy<NsdocsSyncConfig> = {
  method: 'nsdocs',
  run: (ctx, config) => syncViaNsdocs(ctx.companyId, ctx.cnpj, ctx.razaoSocial, config, ctx.existingSyncLogId),
};
