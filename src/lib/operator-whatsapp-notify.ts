/**
 * operator-whatsapp-notify.ts — Motor profundo de notificações WhatsApp para operadoras de saúde.
 *
 * Consolida:
 *   1. Resolução segura de destino (enabled, grupo JID @g.us, Evolution config)
 *   2. Validação da janela temporal de disparo (anti-backlog)
 *   3. Montagem canônica de legenda (Paciente, Matrícula, Médico/CRM, Hospital)
 *   4. Disparo resiliente de documento com isolamento de falha (fail-safe)
 */

import { createLogger } from '@/lib/logger';
import { getConfiguredWhatsAppGroup } from '@/lib/notification-outbox';
import {
  getEvolutionConfig,
  sendWhatsAppDocument,
  type EvolutionConfig,
} from '@/lib/whatsapp-evolution';

const log = createLogger('operator-whatsapp-notify');

export type OperatorNotifyFields = {
  oficioNumber: string;
  patientName: string;
  patientRegistry: string | null;
  doctorName: string | null;
  doctorCrm: string | null;
  hospitalName: string | null;
};

export type OperatorWhatsAppPort = {
  sendDocument(input: {
    jid: string;
    fileName: string;
    content: Buffer;
    caption?: string;
  }): Promise<{ messageId: string | null }>;
};

export type OperatorWhatsAppTarget = {
  jid: string;
  port: OperatorWhatsAppPort;
};

export type NotifyResult = {
  sent: boolean;
  messageId: string | null;
};

export interface ResolveOperatorTargetOptions {
  isEnabled: boolean;
  groupRaw: string | null | undefined;
  config?: EvolutionConfig | null;
}

export function resolveOperatorWhatsAppTarget(
  opts: ResolveOperatorTargetOptions,
): OperatorWhatsAppTarget | null {
  if (!opts.isEnabled) return null;
  const jid = getConfiguredWhatsAppGroup(opts.groupRaw);
  if (!jid) return null;
  const config = opts.config !== undefined ? opts.config : getEvolutionConfig();
  if (!config) return null;

  return {
    jid,
    port: {
      sendDocument: (input) => sendWhatsAppDocument(input, config),
    },
  };
}

export function isWithinOperatorNotifyWindow(
  receivedAt: Date,
  maxAgeMs: number,
  now: Date = new Date(),
): boolean {
  return now.getTime() - receivedAt.getTime() <= maxAgeMs;
}

function line(label: string, value: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? `${label}: ${trimmed}` : null;
}

export function buildOperatorWhatsAppCaption(
  operatorName: string,
  fields: OperatorNotifyFields,
): string {
  const doctor = fields.doctorName
    ? `${fields.doctorName}${fields.doctorCrm ? ` (CRM ${fields.doctorCrm})` : ''}`
    : null;

  return [
    `Autorização ${operatorName} — Ofício ${fields.oficioNumber}`,
    '',
    `Paciente: ${fields.patientName}`,
    line('Matrícula', fields.patientRegistry),
    line('Médico', doctor),
    `Local de entrega: ${fields.hospitalName?.trim() || 'não identificado no ofício'}`,
  ]
    .filter((row): row is string => row !== null)
    .join('\n');
}

export async function notifyOperatorAuthorization(input: {
  operatorName: string;
  target: OperatorWhatsAppTarget;
  fields: OperatorNotifyFields;
  fileName: string;
  content: Buffer;
}): Promise<NotifyResult> {
  try {
    const { messageId } = await input.target.port.sendDocument({
      jid: input.target.jid,
      fileName: input.fileName,
      content: input.content,
      caption: buildOperatorWhatsAppCaption(input.operatorName, input.fields),
    });
    log.info(
      { operator: input.operatorName, oficio: input.fields.oficioNumber },
      'operator_whatsapp_sent',
    );
    return { sent: true, messageId };
  } catch (error) {
    log.warn(
      {
        operator: input.operatorName,
        oficio: input.fields.oficioNumber,
        err: error instanceof Error ? error.message.slice(0, 200) : 'envio',
      },
      'operator_whatsapp_failed',
    );
    return { sent: false, messageId: null };
  }
}
