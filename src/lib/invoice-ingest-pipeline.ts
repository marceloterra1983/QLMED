/**
 * invoice-ingest-pipeline.ts — Pipeline profunda de pós-ingestão de notas fiscais.
 *
 * Coordena de forma atômica e observável as etapas satélites pós-upsert da nota:
 *   1. Agregados de catálogo de produto (product-aggregate-updater)
 *   2. Extração e armazenamento de tributos (invoice-tax-store)
 *   3. Cadastro fiscal de contatos emitente/destinatário (contact-fiscal-store)
 *   4. Duplicatas / financeiro (invoice-duplicata-store)
 *   5. Vínculo de itens da nota recebida ao catálogo Spica (nfe-item-link)
 *
 * Substitui o acoplamento raso anterior onde `updateProductAggregatesForInvoice`
 * orquestrava secretamente domínios não correlatos.
 */

import { createLogger } from '@/lib/logger';
import {
  updateProductAggregatesOnly,
  extractAndStoreTaxData,
  extractAndStoreContactFiscal,
} from '@/lib/product-aggregate-updater';
import { extractAndStoreDuplicatas } from '@/lib/invoice-duplicata-store';
import { linkInvoiceItems } from '@/lib/nfe-item-link/store';

const log = createLogger('invoice-ingest-pipeline');

export interface ProcessInvoiceInput {
  companyId: string;
  invoiceId: string;
  xmlContent: string;
  direction: 'received' | 'issued';
  issueDate: Date | null;
  senderName: string | null;
  senderCnpj: string | null;
  recipientName: string | null;
  recipientCnpj: string | null;
  invoiceNumber: string | null;
  updateAggregates?: boolean;
  ignoreRebuildCutoff?: boolean;
  aggregateLockHeld?: boolean;
}

export type PipelineStage =
  | 'product_aggregates'
  | 'tax_data'
  | 'contact_fiscal'
  | 'duplicatas'
  | 'item_links';

export interface PipelineStageResult {
  stage: PipelineStage;
  status: 'ok' | 'skipped' | 'error';
  error?: string;
}

export interface ProcessInvoiceResult {
  invoiceId: string;
  success: boolean;
  stages: PipelineStageResult[];
}

/**
 * Processa todas as etapas satélites de uma nota ingerida.
 * Cada etapa possui barreira de contenção de falhas para que a falha de um
 * satélite não comprometa os demais ou a própria persistência da nota.
 */
export async function processIngestedInvoice(
  opts: ProcessInvoiceInput,
): Promise<ProcessInvoiceResult> {
  const stages: PipelineStageResult[] = [];

  // Etapa 1: Agregados de produto
  try {
    if (opts.updateAggregates === false) {
      stages.push({ stage: 'product_aggregates', status: 'skipped' });
    } else {
      await updateProductAggregatesOnly(opts);
      stages.push({ stage: 'product_aggregates', status: 'ok' });
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    log.error({ invoiceId: opts.invoiceId, err }, 'Pipeline: product aggregates failed');
    stages.push({ stage: 'product_aggregates', status: 'error', error: errorMsg });
  }

  // Etapa 2: Dados tributários (totais e itens)
  try {
    await extractAndStoreTaxData(opts.invoiceId, opts.companyId, opts.xmlContent);
    stages.push({ stage: 'tax_data', status: 'ok' });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    log.error({ invoiceId: opts.invoiceId, err }, 'Pipeline: tax data extraction failed');
    stages.push({ stage: 'tax_data', status: 'error', error: errorMsg });
  }

  // Etapa 3: Contatos fiscais (emitente e destinatário)
  try {
    await extractAndStoreContactFiscal(opts.invoiceId, opts.companyId, opts.xmlContent);
    stages.push({ stage: 'contact_fiscal', status: 'ok' });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    log.error({ invoiceId: opts.invoiceId, err }, 'Pipeline: contact fiscal extraction failed');
    stages.push({ stage: 'contact_fiscal', status: 'error', error: errorMsg });
  }

  // Etapa 4: Duplicatas
  try {
    await extractAndStoreDuplicatas(opts.invoiceId, opts.companyId, opts.xmlContent);
    stages.push({ stage: 'duplicatas', status: 'ok' });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    log.error({ invoiceId: opts.invoiceId, err }, 'Pipeline: duplicatas extraction failed');
    stages.push({ stage: 'duplicatas', status: 'error', error: errorMsg });
  }

  // Etapa 5: Vínculo de itens da nota recebida ao catálogo Spica (SPEC-047)
  if (opts.direction === 'received') {
    try {
      const stats = await linkInvoiceItems({
        id: opts.invoiceId,
        companyId: opts.companyId,
        senderCnpj: opts.senderCnpj || '',
        senderName: opts.senderName,
        xmlContent: opts.xmlContent,
      });
      if (stats.writes > 0) {
        log.info(
          {
            invoiceId: opts.invoiceId,
            linked: stats.linked,
            pending: stats.pending,
            writes: stats.writes,
          },
          'Pipeline: nfe item links registered',
        );
      }
      stages.push({ stage: 'item_links', status: 'ok' });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      log.warn({ invoiceId: opts.invoiceId, err }, 'Pipeline: nfe item link failed');
      stages.push({ stage: 'item_links', status: 'error', error: errorMsg });
    }
  } else {
    stages.push({ stage: 'item_links', status: 'skipped' });
  }

  const hasCriticalErrors = stages.some((s) => s.status === 'error' && s.stage === 'product_aggregates');

  return {
    invoiceId: opts.invoiceId,
    success: !hasCriticalErrors,
    stages,
  };
}
