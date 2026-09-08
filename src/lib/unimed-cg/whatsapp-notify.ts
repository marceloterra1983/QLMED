import { createLogger } from '@/lib/logger';
import { getConfiguredWhatsAppGroup } from '@/lib/notification-outbox';
import { Decimal } from '@prisma/client-runtime-utils';
import {
  getEvolutionConfig,
  sendWhatsAppDocument,
  type EvolutionConfig,
} from '@/lib/whatsapp-evolution';
import { formatCnpj } from '@/lib/utils';
import {
  UNIMED_CG_NOTIFY_MAX_AGE_MS,
  getUnimedCgOcWhatsAppGroupRaw,
  getUnimedCgWhatsAppGroupRaw,
  isUnimedCgOcWhatsAppEnabled,
  isUnimedCgWhatsAppEnabled,
} from './constants';

const log = createLogger('unimed-cg/whatsapp');

export type UnimedCgNotifyFields = {
  processId: string;
  authorizationNumber: string | null;
  location: string | null;
  totalCents: number;
};

export type UnimedCgWhatsAppPort = {
  sendDocument(input: {
    jid: string;
    fileName: string;
    content: Buffer;
    caption: string;
  }): Promise<{ messageId: string | null }>;
};

export type UnimedCgWhatsAppTarget = {
  jid: string;
  port: UnimedCgWhatsAppPort;
};

export function resolveUnimedCgWhatsAppTarget(
  config: EvolutionConfig | null = getEvolutionConfig(),
): UnimedCgWhatsAppTarget | null {
  if (!isUnimedCgWhatsAppEnabled()) return null;
  const jid = getConfiguredWhatsAppGroup(getUnimedCgWhatsAppGroupRaw());
  if (!jid) return null;
  if (!config) return null;

  return {
    jid,
    port: {
      sendDocument: (input) => sendWhatsAppDocument(input, config),
    },
  };
}

export function isWithinUnimedCgNotifyWindow(receivedAt: Date, now: Date = new Date()): boolean {
  return now.getTime() - receivedAt.getTime() <= UNIMED_CG_NOTIFY_MAX_AGE_MS;
}

function formatBrlFromCents(cents: number): string {
  const formatted = new Decimal(cents)
    .div(100)
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
    .toFixed(2);
  const [reais, frac] = formatted.split('.');
  return `${reais.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${frac}`;
}

export function buildUnimedCgWhatsAppCaption(fields: UnimedCgNotifyFields): string {
  return [
    `Autorização Unimed CG — Processo ${fields.processId}`,
    `Autorização: ${fields.authorizationNumber?.trim() || 'não identificada'}`,
    `Local: ${fields.location?.trim() || 'não identificado'}`,
    `Valor total: R$ ${formatBrlFromCents(fields.totalCents)}`,
  ].join('\n');
}

export type NotifyResult = { sent: boolean; messageId: string | null };

export async function notifyUnimedCgAuthorization(input: {
  target: UnimedCgWhatsAppTarget;
  fields: UnimedCgNotifyFields;
  fileName: string;
  content: Buffer;
}): Promise<NotifyResult> {
  try {
    const { messageId } = await input.target.port.sendDocument({
      jid: input.target.jid,
      fileName: input.fileName,
      content: input.content,
      caption: buildUnimedCgWhatsAppCaption(input.fields),
    });
    log.info({ processId: input.fields.processId }, 'unimed_cg_whatsapp_sent');
    return { sent: true, messageId };
  } catch (error) {
    log.warn(
      {
        processId: input.fields.processId,
        err: error instanceof Error ? error.message.slice(0, 200) : 'envio',
      },
      'unimed_cg_whatsapp_failed',
    );
    return { sent: false, messageId: null };
  }
}

export type UnimedCgDeliveryNotifyFields = {
  processId: string;
  principalAuthorization: string | null;
  status: string | null;
  supplier: string | null;
};

export function buildUnimedCgDeliveryWhatsAppCaption(fields: UnimedCgDeliveryNotifyFields): string {
  return [
    `Autorização Unimed CG (entrega) — Processo ${fields.processId}`,
    `Autorização principal: ${fields.principalAuthorization?.trim() || 'não identificada'}`,
    `Situação: ${fields.status?.trim() || 'não identificada'}`,
    `Fornecedor: ${fields.supplier?.trim() || 'não identificado'}`,
  ].join('\n');
}

export async function notifyUnimedCgDelivery(input: {
  target: UnimedCgWhatsAppTarget;
  fields: UnimedCgDeliveryNotifyFields;
  fileName: string;
  content: Buffer;
}): Promise<NotifyResult> {
  try {
    const { messageId } = await input.target.port.sendDocument({
      jid: input.target.jid,
      fileName: input.fileName,
      content: input.content,
      caption: buildUnimedCgDeliveryWhatsAppCaption(input.fields),
    });
    log.info({ processId: input.fields.processId }, 'unimed_cg_delivery_whatsapp_sent');
    return { sent: true, messageId };
  } catch (error) {
    log.warn(
      {
        processId: input.fields.processId,
        err: error instanceof Error ? error.message.slice(0, 200) : 'envio',
      },
      'unimed_cg_delivery_whatsapp_failed',
    );
    return { sent: false, messageId: null };
  }
}


export type UnimedCgReversalNotifyFields = {
  processId: string;
  authorizationNumber: string | null;
  location: string | null;
  procedureType: string | null;
};

export function buildUnimedCgReversalWhatsAppCaption(fields: UnimedCgReversalNotifyFields): string {
  return [
    `Reversão de processo Unimed CG — Processo ${fields.processId}`,
    `Autorização: ${fields.authorizationNumber?.trim() || 'não identificada'}`,
    `Local: ${fields.location?.trim() || 'não identificado'}`,
    `Tipo: ${fields.procedureType?.trim() || 'não identificado'}`,
  ].join('\n');
}

export async function notifyUnimedCgReversal(input: {
  target: UnimedCgWhatsAppTarget;
  fields: UnimedCgReversalNotifyFields;
  fileName: string;
  content: Buffer;
}): Promise<NotifyResult> {
  try {
    const { messageId } = await input.target.port.sendDocument({
      jid: input.target.jid,
      fileName: input.fileName,
      content: input.content,
      caption: buildUnimedCgReversalWhatsAppCaption(input.fields),
    });
    log.info({ processId: input.fields.processId }, 'unimed_cg_reversal_whatsapp_sent');
    return { sent: true, messageId };
  } catch (error) {
    log.warn(
      {
        processId: input.fields.processId,
        err: error instanceof Error ? error.message.slice(0, 200) : 'envio',
      },
      'unimed_cg_reversal_whatsapp_failed',
    );
    return { sent: false, messageId: null };
  }
}

export type UnimedCgPreSolicitationNotifyFields = {
  preSolicitationId: string;
  procedureType: string | null;
  quoteDeadlineDays: number | null;
};

export function buildUnimedCgPreSolicitationWhatsAppCaption(
  fields: UnimedCgPreSolicitationNotifyFields,
): string {
  const prazo = fields.quoteDeadlineDays != null
    ? `${fields.quoteDeadlineDays} dias`
    : 'não identificado';
  return [
    `Pré-solicitação Unimed CG — ${fields.preSolicitationId}`,
    `Tipo: ${fields.procedureType?.trim() || 'não identificado'}`,
    `Prazo cotação: ${prazo}`,
  ].join('\n');
}

export async function notifyUnimedCgPreSolicitation(input: {
  target: UnimedCgWhatsAppTarget;
  fields: UnimedCgPreSolicitationNotifyFields;
  fileName: string;
  content: Buffer;
}): Promise<NotifyResult> {
  try {
    const { messageId } = await input.target.port.sendDocument({
      jid: input.target.jid,
      fileName: input.fileName,
      content: input.content,
      caption: buildUnimedCgPreSolicitationWhatsAppCaption(input.fields),
    });
    log.info(
      { preSolicitationId: input.fields.preSolicitationId },
      'unimed_cg_pre_solicitation_whatsapp_sent',
    );
    return { sent: true, messageId };
  } catch (error) {
    log.warn(
      {
        preSolicitationId: input.fields.preSolicitationId,
        err: error instanceof Error ? error.message.slice(0, 200) : 'envio',
      },
      'unimed_cg_pre_solicitation_whatsapp_failed',
    );
    return { sent: false, messageId: null };
  }
}

export type UnimedCgInvoiceDeadlineNotifyFields = {
  processId: string;
  patientName: string | null;
};

export function buildUnimedCgInvoiceDeadlineWhatsAppCaption(
  fields: UnimedCgInvoiceDeadlineNotifyFields,
): string {
  return [
    `Prazo de Nota Fiscal Unimed CG — Processo ${fields.processId}`,
    `Paciente: ${fields.patientName?.trim() || 'não identificado'}`,
  ].join('\n');
}

export async function notifyUnimedCgInvoiceDeadline(input: {
  target: UnimedCgWhatsAppTarget;
  fields: UnimedCgInvoiceDeadlineNotifyFields;
  fileName: string;
  content: Buffer;
}): Promise<NotifyResult> {
  try {
    const { messageId } = await input.target.port.sendDocument({
      jid: input.target.jid,
      fileName: input.fileName,
      content: input.content,
      caption: buildUnimedCgInvoiceDeadlineWhatsAppCaption(input.fields),
    });
    log.info({ processId: input.fields.processId }, 'unimed_cg_prazo_nf_whatsapp_sent');
    return { sent: true, messageId };
  } catch (error) {
    log.warn(
      {
        processId: input.fields.processId,
        err: error instanceof Error ? error.message.slice(0, 200) : 'envio',
      },
      'unimed_cg_prazo_nf_whatsapp_failed',
    );
    return { sent: false, messageId: null };
  }
}

export function resolveUnimedCgOcWhatsAppTarget(
  config: EvolutionConfig | null = getEvolutionConfig(),
): UnimedCgWhatsAppTarget | null {
  if (!isUnimedCgOcWhatsAppEnabled()) return null;
  const jid = getConfiguredWhatsAppGroup(getUnimedCgOcWhatsAppGroupRaw());
  if (!jid) return null;
  if (!config) return null;

  return {
    jid,
    port: {
      sendDocument: (input) => sendWhatsAppDocument(input, config),
    },
  };
}

export type UnimedCgPurchaseOrderNotifyItem = {
  description: string;
  quantity: string;
  unitPrice: string;
  lineTotal: string;
};

export type UnimedCgPurchaseOrderNotifyFields = {
  orderNumber: string;
  items: UnimedCgPurchaseOrderNotifyItem[];
  totalAmount: string;
  billingCnpj: string | null;
  paymentTerms: string | null;
};

function formatBrlFromDecimalString(value: string): string {
  const formatted = new Decimal(value || 0)
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
    .toFixed(2);
  const [reais, frac] = formatted.split('.');
  return `${reais.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${frac}`;
}

const MAX_OC_CAPTION_ITEMS = 6;

export function buildUnimedCgPurchaseOrderWhatsAppCaption(
  fields: UnimedCgPurchaseOrderNotifyFields,
): string {
  const lines = [`Ordem de compra Unimed CG — ${fields.orderNumber}`];
  const items = fields.items.slice(0, MAX_OC_CAPTION_ITEMS);
  if (items.length === 0) {
    lines.push('Produto: não identificado');
  } else {
    for (const item of items) {
      lines.push(`Produto: ${item.description.trim() || 'não identificado'}`);
      lines.push(`Qtd: ${item.quantity}`);
      lines.push(`Valor unitário: R$ ${formatBrlFromDecimalString(item.unitPrice)}`);
      lines.push(`Valor total: R$ ${formatBrlFromDecimalString(item.lineTotal)}`);
    }
    const extra = fields.items.length - items.length;
    if (extra > 0) lines.push(`e mais ${extra} item(ns)`);
  }
  if (items.length !== 1) {
    lines.push(`Valor total da OC: R$ ${formatBrlFromDecimalString(fields.totalAmount)}`);
  }
  const digits = (fields.billingCnpj ?? '').replace(/\D/g, '');
  lines.push(`CNPJ faturar: ${digits.length === 14 ? formatCnpj(digits) : (fields.billingCnpj?.trim() || 'não identificado')}`);
  lines.push(`Prazo: ${fields.paymentTerms?.trim() || 'não identificado'}`);
  return lines.join('\n');
}

export async function notifyUnimedCgPurchaseOrder(input: {
  target: UnimedCgWhatsAppTarget;
  fields: UnimedCgPurchaseOrderNotifyFields;
  fileName: string;
  content: Buffer;
}): Promise<NotifyResult> {
  try {
    const { messageId } = await input.target.port.sendDocument({
      jid: input.target.jid,
      fileName: input.fileName,
      content: input.content,
      caption: buildUnimedCgPurchaseOrderWhatsAppCaption(input.fields),
    });
    log.info({ orderNumber: input.fields.orderNumber }, 'unimed_cg_oc_whatsapp_sent');
    return { sent: true, messageId };
  } catch (error) {
    log.warn(
      {
        orderNumber: input.fields.orderNumber,
        err: error instanceof Error ? error.message.slice(0, 200) : 'envio',
      },
      'unimed_cg_oc_whatsapp_failed',
    );
    return { sent: false, messageId: null };
  }
}
