import { createLogger } from '@/lib/logger';
import { getConfiguredWhatsAppGroup } from '@/lib/notification-outbox';
import {
  getEvolutionConfig,
  sendWhatsAppDocument,
  type EvolutionConfig,
} from '@/lib/whatsapp-evolution';
import {
  IMPCG_NOTIFY_MAX_AGE_MS,
  getImpcgWhatsAppGroupRaw,
  isImpcgWhatsAppEnabled,
} from './constants';

const log = createLogger('impcg/whatsapp');

export type ImpcgNotifyFields = {
  oficioNumber: string;
  patientName: string;
  patientRegistry: string | null;
  doctorName: string | null;
  doctorCrm: string | null;
  hospitalName: string | null;
};

export type ImpcgWhatsAppPort = {
  sendDocument(input: {
    jid: string;
    fileName: string;
    content: Buffer;
    caption: string;
  }): Promise<{ messageId: string | null }>;
};

export type ImpcgWhatsAppTarget = {
  jid: string;
  port: ImpcgWhatsAppPort;
};

/**
 * Só existe destino quando o recurso está ligado, o grupo é um JID `@g.us` e as
 * credenciais Evolution estão no ambiente. Faltando qualquer peça o canal fica
 * silencioso, sem erro (SPEC-031 FR-006, FR-008).
 */
export function resolveImpcgWhatsAppTarget(
  config: EvolutionConfig | null = getEvolutionConfig(),
): ImpcgWhatsAppTarget | null {
  if (!isImpcgWhatsAppEnabled()) return null;
  const jid = getConfiguredWhatsAppGroup(getImpcgWhatsAppGroupRaw());
  if (!jid) return null;
  if (!config) return null;

  return {
    jid,
    port: {
      sendDocument: (input) => sendWhatsAppDocument(input, config),
    },
  };
}

/** Recorta o backfill: ofício antigo é histórico, não aviso operacional. */
export function isWithinImpcgNotifyWindow(receivedAt: Date, now: Date = new Date()): boolean {
  return now.getTime() - receivedAt.getTime() <= IMPCG_NOTIFY_MAX_AGE_MS;
}

function line(label: string, value: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? `${label}: ${trimmed}` : null;
}

/**
 * O local de entrega é a informação que decide a ação do operador, então quando
 * o parser não o encontrou a legenda diz isso em vez de omitir (FR-003).
 * O procedimento ficou fora do corpo por decisão do dono (FR-002).
 */
export function buildImpcgWhatsAppCaption(fields: ImpcgNotifyFields): string {
  const doctor = fields.doctorName
    ? `${fields.doctorName}${fields.doctorCrm ? ` (CRM ${fields.doctorCrm})` : ''}`
    : null;

  return [
    `Autorização IMPCG — Ofício ${fields.oficioNumber}`,
    '',
    `Paciente: ${fields.patientName}`,
    line('Matrícula', fields.patientRegistry),
    line('Médico', doctor),
    `Local de entrega: ${fields.hospitalName?.trim() || 'não identificado no ofício'}`,
  ]
    .filter((row): row is string => row !== null)
    .join('\n');
}

export type NotifyResult = { sent: boolean; messageId: string | null };

/**
 * Nunca lança: uma falha de aviso não pode desfazer a autorização já
 * persistida (FR-007). Log carrega só o ofício e o resultado (FR-009).
 */
export async function notifyImpcgAuthorization(input: {
  target: ImpcgWhatsAppTarget;
  fields: ImpcgNotifyFields;
  fileName: string;
  content: Buffer;
}): Promise<NotifyResult> {
  try {
    const { messageId } = await input.target.port.sendDocument({
      jid: input.target.jid,
      fileName: input.fileName,
      content: input.content,
      caption: buildImpcgWhatsAppCaption(input.fields),
    });
    log.info({ oficio: input.fields.oficioNumber }, 'impcg_whatsapp_sent');
    return { sent: true, messageId };
  } catch (error) {
    log.warn(
      {
        oficio: input.fields.oficioNumber,
        err: error instanceof Error ? error.message.slice(0, 200) : 'envio',
      },
      'impcg_whatsapp_failed',
    );
    return { sent: false, messageId: null };
  }
}
