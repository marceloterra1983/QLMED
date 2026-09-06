import { getEvolutionConfig, type EvolutionConfig } from '@/lib/whatsapp-evolution';
import {
  resolveOperatorWhatsAppTarget,
  isWithinOperatorNotifyWindow,
  buildOperatorWhatsAppCaption,
  notifyOperatorAuthorization,
  type OperatorNotifyFields,
  type OperatorWhatsAppPort,
  type OperatorWhatsAppTarget,
  type NotifyResult,
} from '@/lib/operator-whatsapp-notify';
import {
  IMPCG_NOTIFY_MAX_AGE_MS,
  getImpcgWhatsAppGroupRaw,
  isImpcgWhatsAppEnabled,
} from './constants';

export type ImpcgNotifyFields = OperatorNotifyFields;
export type ImpcgWhatsAppPort = OperatorWhatsAppPort;
export type ImpcgWhatsAppTarget = OperatorWhatsAppTarget;
export type { NotifyResult };

export function resolveImpcgWhatsAppTarget(
  config: EvolutionConfig | null = getEvolutionConfig(),
): ImpcgWhatsAppTarget | null {
  return resolveOperatorWhatsAppTarget({
    isEnabled: isImpcgWhatsAppEnabled(),
    groupRaw: getImpcgWhatsAppGroupRaw(),
    config,
  });
}

export function isWithinImpcgNotifyWindow(receivedAt: Date, now: Date = new Date()): boolean {
  return isWithinOperatorNotifyWindow(receivedAt, IMPCG_NOTIFY_MAX_AGE_MS, now);
}

export function buildImpcgWhatsAppCaption(fields: ImpcgNotifyFields): string {
  return buildOperatorWhatsAppCaption('IMPCG', fields);
}

export async function notifyImpcgAuthorization(input: {
  target: ImpcgWhatsAppTarget;
  fields: ImpcgNotifyFields;
  fileName: string;
  content: Buffer;
}): Promise<NotifyResult> {
  return notifyOperatorAuthorization({
    operatorName: 'IMPCG',
    target: input.target,
    fields: input.fields,
    fileName: input.fileName,
    content: input.content,
  });
}
