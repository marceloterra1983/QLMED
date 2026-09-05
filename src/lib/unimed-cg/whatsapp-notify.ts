import { createLogger } from '@/lib/logger';
import { getConfiguredWhatsAppGroup } from '@/lib/notification-outbox';
import { Decimal } from '@prisma/client-runtime-utils';
import {
  getEvolutionConfig,
  sendWhatsAppDocument,
  type EvolutionConfig,
} from '@/lib/whatsapp-evolution';
import {
  UNIMED_CG_NOTIFY_MAX_AGE_MS,
  getUnimedCgWhatsAppGroupRaw,
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
