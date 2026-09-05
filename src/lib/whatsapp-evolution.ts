import { createLogger } from '@/lib/logger';
import { assertAllowedHost } from '@/lib/http-allowlist';

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

  // Endereço inutilizável desliga o canal, como uma variável em falta — a
  // alternativa seria lançar dentro do envio de uma nota e derrubar o fluxo
  // fiscal por causa de configuração (SPEC-031 FR-006).
  if (!evolutionHost(baseUrl)) {
    log.warn('evolution_base_url_rejected');
    return null;
  }
  return { baseUrl: baseUrl.replace(/\/+$/, ''), instance, apiKey };
}

/**
 * Host da instância Evolution, ou `null` se o endereço não puder receber a
 * `apikey`.
 *
 * `EVO_API_URL` não tinha validação nenhuma: aceitava `http://` em claro e
 * qualquer host. Como a instância é auto-hospedada não há lista fixa — a
 * política é a mesma do n8n: o host que o operador configurou, e só ele.
 */
function evolutionHost(baseUrl: string): string | null {
  const trimmed = baseUrl.replace(/\/+$/, '');
  try {
    return assertAllowedHost(trimmed, [new URL(trimmed).hostname]).hostname;
  } catch {
    return null;
  }
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
  const host = evolutionHost(config.baseUrl);
  if (!host) throw new WhatsAppSendError('EVO_API_URL recusado pela política de egresso', 0);

  const url = assertAllowedHost(
    `${config.baseUrl}/message/sendMedia/${encodeURIComponent(config.instance)}`,
    [host],
  );

  const response = await fetch(url, {
    method: 'POST',
    // `fetch` segue redirect por omissão, e cabeçalhos personalizados como
    // `apikey` NÃO são removidos pelo spec num salto entre origens — só
    // Authorization/Cookie o são. Um 302 levaria a chave E o PDF para outro
    // host. Aqui um redirect vira erro, não um segundo pedido.
    redirect: 'error',
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

export type SendTextInput = {
  jid: string;
  text: string;
};

/**
 * Envia texto puro via Evolution sendText. Mesma política de egresso e
 * redirect:error que sendWhatsAppDocument (SPEC-046).
 */
export async function sendWhatsAppText(
  input: SendTextInput,
  config: EvolutionConfig,
): Promise<{ messageId: string | null }> {
  const host = evolutionHost(config.baseUrl);
  if (!host) throw new WhatsAppSendError('EVO_API_URL recusado pela política de egresso', 0);

  const url = assertAllowedHost(
    `${config.baseUrl}/message/sendText/${encodeURIComponent(config.instance)}`,
    [host],
  );

  const response = await fetch(url, {
    method: 'POST',
    redirect: 'error',
    headers: {
      apikey: config.apiKey,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      number: input.jid,
      text: input.text,
    }),
    cache: 'no-store',
    signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
  });

  if (response.status < 200 || response.status >= 300) {
    log.warn({ status: response.status }, 'whatsapp_send_text_failed');
    throw new WhatsAppSendError(`Evolution respondeu ${response.status}`, response.status);
  }

  const payload = (await response.json().catch(() => null)) as
    | { key?: { id?: string }; messageId?: string }
    | null;

  return { messageId: payload?.key?.id ?? payload?.messageId ?? null };
}
