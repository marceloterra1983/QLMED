import { createLogger } from '@/lib/logger';

const log = createLogger('whatsapp-evolution');

/** Mesmo contrato já usado em produção por scripts/notification-outbox-worker.py. */
const SEND_TIMEOUT_MS = 60_000;

export class WhatsAppSendError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'WhatsAppSendError';
    this.status = status;
  }
}

export type EvolutionConfig = {
  baseUrl: string;
  instance: string;
  apiKey: string;
};

/**
 * A credencial vive no ambiente, nunca no repositório (ver .env.example). Sem
 * qualquer uma das três variáveis o canal fica desligado em vez de falhar
 * (SPEC-031 FR-006).
 */
export function getEvolutionConfig(): EvolutionConfig | null {
  const baseUrl = (process.env.EVO_API_URL ?? process.env.QLMED_EVOLUTION_BASE_URL ?? '').trim();
  const instance = (process.env.EVO_INSTANCE ?? '').trim();
  const apiKey = (process.env.EVO_API_KEY ?? '').trim();
  if (!baseUrl || !instance || !apiKey) return null;
  return { baseUrl: baseUrl.replace(/\/+$/, ''), instance, apiKey };
}

export type SendDocumentInput = {
  jid: string;
  fileName: string;
  content: Buffer;
  caption: string;
};

/**
 * Envia um PDF como documento. O corpo da mensagem é dado de negócio e nunca
 * entra em log; só o resultado da chamada é registrado (SPEC-031 FR-009).
 */
export async function sendWhatsAppDocument(
  input: SendDocumentInput,
  config: EvolutionConfig,
): Promise<{ messageId: string | null }> {
  const response = await fetch(`${config.baseUrl}/message/sendMedia/${encodeURIComponent(config.instance)}`, {
    method: 'POST',
    headers: {
      apikey: config.apiKey,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      number: input.jid,
      mediatype: 'document',
      media: input.content.toString('base64'),
      mimetype: 'application/pdf',
      fileName: input.fileName,
      caption: input.caption,
    }),
    cache: 'no-store',
    signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
  });

  if (response.status < 200 || response.status >= 300) {
    log.warn({ status: response.status }, 'whatsapp_send_failed');
    throw new WhatsAppSendError(`Evolution respondeu ${response.status}`, response.status);
  }

  const payload = (await response.json().catch(() => null)) as
    | { key?: { id?: string }; messageId?: string }
    | null;

  return { messageId: payload?.key?.id ?? payload?.messageId ?? null };
}
