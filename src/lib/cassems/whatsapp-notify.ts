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
  CASSEMS_NOTIFY_MAX_AGE_MS,
  getCassemsWhatsAppGroupRaw,
  isCassemsWhatsAppEnabled,
} from './constants';

export type CassemsNotifyFields = OperatorNotifyFields;
export type CassemsWhatsAppPort = OperatorWhatsAppPort;
export type CassemsWhatsAppTarget = OperatorWhatsAppTarget;
export type { NotifyResult };

export function resolveCassemsWhatsAppTarget(
  config: EvolutionConfig | null = getEvolutionConfig(),
): CassemsWhatsAppTarget | null {
  return resolveOperatorWhatsAppTarget({
    isEnabled: isCassemsWhatsAppEnabled(),
    groupRaw: getCassemsWhatsAppGroupRaw(),
    config,
  });
}

export function isWithinCassemsNotifyWindow(receivedAt: Date, now: Date = new Date()): boolean {
  return isWithinOperatorNotifyWindow(receivedAt, CASSEMS_NOTIFY_MAX_AGE_MS, now);
}

export function buildCassemsWhatsAppCaption(fields: CassemsNotifyFields): string {
  return buildOperatorWhatsAppCaption('CASSEMS', fields);
}

export async function notifyCassemsAuthorization(input: {
  target: CassemsWhatsAppTarget;
  fields: CassemsNotifyFields;
  fileName: string;
  content: Buffer;
}): Promise<NotifyResult> {
  return notifyOperatorAuthorization({
    operatorName: 'CASSEMS',
    target: input.target,
    fields: input.fields,
    fileName: input.fileName,
    content: input.content,
  });
}
