import { SefazClient } from '../sefaz-client';
import { openCertificatePems } from '../certificate-secret';
import { parseInvoiceXml } from '../parse-invoice-xml';
import { resolveInvoiceDirection } from '../invoice-direction';
import { updateProductAggregatesForInvoice } from '../product-aggregate-updater';
import { saveXmlToFile } from '../xml-file-store';
import { extractFirstCfop } from '../cfop';
import { prisma } from '../prisma';
import { UF_TO_CODE } from '../constants';
import { createLogger } from '@/lib/logger';
import { upsertInvoiceWithOutbox } from '@/lib/notification-outbox';
import { beginSyncRun } from '@/lib/postgres-advisory-lock';
import { applyNfeCancellationOutcome } from '@/lib/nfe-cancellation';
import { isUniqueViolation } from '@/lib/prisma-errors';
import { distDfeIsProduction } from '@/lib/nfe-emission/environment';
import { invoicePatientWriteFields } from '@/lib/nfe/invoice-patient-fields';

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

/**
 * NSU como número; -1 para valor não numérico (nunca vira checkpoint).
 * NSU tem 15 dígitos (máx. 999999999999999), bem dentro de MAX_SAFE_INTEGER.
 */
function nsuValue(nsu: string | null | undefined): number {
  const digits = (nsu || '').replace(/\D/g, '');
  if (!digits) return -1;
  const value = Number(digits);
  return Number.isSafeInteger(value) ? value : -1;
}

/** O NSU imediatamente anterior a `nsu`, no formato de 15 dígitos da SEFAZ. */
function previousNsu(nsu: string): string {
  const value = nsuValue(nsu);
  if (value <= 0) return '0';
  return String(value - 1).padStart(15, '0');
}

/** Devolve o maior dos dois NSUs; garante que o cursor nunca anda para trás. */
function maxNsu(a: string, b: string): string {
  return nsuValue(a) >= nsuValue(b) ? a : b;
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
  const run = await beginSyncRun(companyId, 'sefaz', existingSyncLogId);
  const syncLog = { id: run.syncLogId };

  let ultNSU = cert.lastNsu || '0';
  // Motivos de documento não gravado. Enquanto houver um, o cursor não passa
  // por cima dele (mesma regra do NSDocs, que é a referência correta no repo).
  const skippedReasons: string[] = [];

  try {
    const { key, cert: certPem } = openCertificatePems(cert, cnpj);

    const sefaz = new SefazClient(
      certPem,
      key,
      cnpj,
      distDfeIsProduction(cert.environment),
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

      if (response.status === 'error') {
        // Resposta de erro não entrega documento nenhum. Avançar o cursor com o
        // ultNSU devolvido aqui saltava NSUs que nunca foram lidos.
        if (response.cStat === '656') {
          // O `xMotivo` é a ÚNICA fonte do motivo e do tempo de bloqueio que a
          // SEFAZ informa. Descartá-lo por um texto fixo deixou 24 dias de
          // bloqueio sem diagnóstico: o log dizia "Aguarde 1h" — palpite nosso —
          // enquanto a tentativa diária continuava a ser recusada.
          // O prefixo com "656" é contrato: sync-scheduler detecta o bloqueio
          // por `errorMessage.includes('656')` para armar o cooldown.
          const motivo = response.xMotivo?.trim();
          throw new Error(
            motivo
              ? `Bloqueio SEFAZ (656): ${motivo}`
              : 'Bloqueio SEFAZ (656): excesso de consultas, sem xMotivo na resposta.',
          );
        }
        throw new Error(`Erro SEFAZ: ${response.xMotivo} (cStat: ${response.cStat})`);
      }

      if (response.status === 'empty') break;
      if (response.docs.length === 0 && (!response.ultNSU || response.ultNSU === nsuAntes)) break;

      // NSUs que este lote entregou e que NÃO foram gravados. O cursor final do
      // run tem de parar antes do menor deles.
      const failedNsus: string[] = [];
      const skipDoc = (nsu: string, chave: string | undefined, reason: string, err?: unknown) => {
        failedNsus.push(nsu);
        const identifier = chave ? `chave=${chave.slice(0, 12)}…` : `nsu=${nsu || '?'}`;
        const detail = err instanceof Error ? err.message.slice(0, 120) : '';
        skippedReasons.push(detail ? `${identifier} ${reason}: ${detail}` : `${identifier} ${reason}`);
        log.warn({ nsu, chave, reason, err }, 'SEFAZ doc skipped');
      };

      // Documentos que o client não conseguiu abrir (base64/gunzip/parse).
      for (const nsu of response.failedNsus) {
        skipDoc(nsu, undefined, 'docZip_ilegivel');
      }

      for (const doc of response.docs) {
        try {
          if (!doc.xml) {
            skipDoc(doc.nsuseq, doc.chave, 'xml_ausente');
            continue;
          }

          if (doc.tipo === 'evento') {
            // Evento não é documento fiscal: a maioria (ciência, carta de
            // correção) não gera escrita e não pode travar o cursor. Já um
            // cancelamento aceite cuja nota não está nesta base é facto fiscal
            // perdido — a SEFAZ não o reentrega, então o cursor tem de parar
            // antes dele (REAUD-FISCAL-015).
            const outcome = await applyNfeCancellationOutcome({ companyId, xml: doc.xml, accessKey: doc.chave, documentType: 'NFE' });
            if (outcome === 'lost') skipDoc(doc.nsuseq, doc.chave, 'cancelamento_sem_nota');
            continue;
          }

          if (!doc.chave || doc.chave.length < 44) {
            skipDoc(doc.nsuseq, doc.chave, 'chave_invalida');
            continue;
          }

          const parsed = await parseInvoiceXml(doc.xml);
          if (!parsed) {
            // Último recurso: pode ser um cancelamento reconhecível. Se nem isso
            // gravou nada, o documento foi perdido — segura o cursor.
            const outcome = await applyNfeCancellationOutcome({ companyId, xml: doc.xml, accessKey: doc.chave, documentType: 'NFE' });
            if (outcome !== 'applied') {
              skipDoc(doc.nsuseq, doc.chave, outcome === 'lost' ? 'cancelamento_sem_nota' : 'parse_falhou_schema_desconhecido');
            }
            continue;
          }

          const accessKey = parsed.accessKey || doc.chave;
          const direction = resolveInvoiceDirection(cnpj, parsed.senderCnpj, accessKey);
          const cfop = extractFirstCfop(doc.xml);

          const patientFields = invoicePatientWriteFields({
            xmlContent: doc.xml,
            type: parsed.type,
            direction,
          });
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
              ...patientFields,
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
              ...patientFields,
            },
          });
          if (isNewInvoice) {
            totalNovos++;
            saveXmlToFile(companyId, accessKey, parsed.type, doc.xml, parsed.issueDate).catch((err) => { log.error({ err, accessKey }, 'saveXmlToFile failed for SEFAZ'); });
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
          if (isUniqueViolation(docErr)) {
            // Outra linha já tem o unique que este documento precisa (série+
            // número da NF-e emitida, ou a própria chave numa corrida). Reter o
            // cursor aqui é falha DETERMINÍSTICA: a corrida seguinte tropeça no
            // mesmo NSU e a ingestão da empresa para até intervenção manual
            // (REAUD-DATA-015). Skip durável por chave, com o XML, e o cursor
            // segue. Se ESTA escrita falhar, o erro sobe para o catch da
            // corrida: o cursor não avança e nada se perde.
            const target = (docErr as { meta?: { target?: unknown } }).meta?.target;
            await prisma.syncSkippedDocument.upsert({
              where: { companyId_accessKey: { companyId, accessKey: doc.chave } },
              create: { companyId, accessKey: doc.chave, nsu: doc.nsuseq, reason: 'unique_violado', xmlContent: doc.xml },
              update: { nsu: doc.nsuseq, xmlContent: doc.xml },
            });
            skippedReasons.push(`chave=${doc.chave.slice(0, 12)}… unique_violado${target ? ` (${String(target)})` : ''}: skip durável, cursor segue`);
            log.warn({ nsu: doc.nsuseq, chave: doc.chave, target }, 'SEFAZ doc skipped durably (unique violation)');
            continue;
          }
          log.error({ err: docErr, chave: doc.chave }, 'Erro ao processar doc SEFAZ');
          skipDoc(doc.nsuseq, doc.chave, 'gravacao_falhou', docErr);
        }
      }

      if (failedNsus.length > 0) {
        // O cursor para imediatamente ANTES do primeiro NSU não gravado. Os NSUs
        // seguintes deste lote já foram gravados (upsert é idempotente), mas
        // reentregá-los na próxima corrida é barato — perder o que falhou não é.
        // ponytail: teto conhecido — falha DETERMINÍSTICA no mesmo NSU trava o
        // cursor até alguém intervir (mesma propriedade do NSDocs). Fica visível
        // como 'partial' com o motivo, em vez de silencioso. O piso anti-656
        // (getSefazCooldown, 6h) limita a reconsulta. Se stall repetido virar
        // problema, o passo é skip durável por chave em vez de afrouxar o cursor.
        const primeiroFalho = failedNsus.reduce((min, nsu) => (nsuValue(nsu) < nsuValue(min) ? nsu : min));
        ultNSU = maxNsu(ultNSU, previousNsu(primeiroFalho));
        log.warn(
          { company: razaoSocial, primeiroFalho, cursorFinal: ultNSU, skipped: failedNsus.length },
          'SEFAZ sync parcial — cursor NSU retido antes do documento não gravado',
        );
        break;
      }

      if (response.ultNSU) ultNSU = maxNsu(ultNSU, response.ultNSU);

      const ultBig = nsuValue(response.ultNSU || '0');
      const maxBig = nsuValue(response.maxNSU || '0');
      if (ultBig >= maxBig) temMais = false;
    }

    await prisma.certificateConfig.update({
      where: { id: cert.id },
      data: { lastNsu: ultNSU, lastSyncAt: new Date() },
    });

    const skippedCount = skippedReasons.length;
    const finalStatus: 'completed' | 'partial' = skippedCount === 0 ? 'completed' : 'partial';
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
      { company: razaoSocial, newDocs: totalNovos, updatedDocs: totalAtualizados, skippedDocs: skippedCount, status: finalStatus, lastNsu: ultNSU },
      `SEFAZ sync ${finalStatus}`,
    );
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
  } finally {
    await run.release();
  }
}
