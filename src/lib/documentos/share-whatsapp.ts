import {
  getEvolutionConfig,
  sendWhatsAppDocument,
  WhatsAppSendError,
  type EvolutionConfig,
} from '@/lib/whatsapp-evolution';

/**
 * Destinatários internos do diálogo WhatsApp (FR-043).
 * Números da ficha de usuário QLMED — pessoa a pessoa, sem grupo.
 */
export const DOCUMENTOS_WHATSAPP_RECIPIENTS = [
  { phone: '6791908000', label: 'Marcelo' },
  { phone: '6792979419', label: 'Daniele' },
  { phone: '6792979412', label: 'Flavio' },
  { phone: '67981119221', label: 'José Roberto' },
] as const;

export type DocumentosWhatsAppRecipient = (typeof DOCUMENTOS_WHATSAPP_RECIPIENTS)[number];

/** Teto por pedido — alinhado ao compartilhar por e-mail. */
export const DOCUMENTOS_WHATSAPP_MAX_RECIPIENTS = 10;

export class ShareWhatsAppNumberError extends Error {
  constructor() {
    super('Número de WhatsApp inválido');
    this.name = 'ShareWhatsAppNumberError';
  }
}

export class ShareWhatsAppUnavailableError extends Error {
  constructor() {
    super('WhatsApp não está configurado no servidor');
    this.name = 'ShareWhatsAppUnavailableError';
  }
}

/**
 * Aceita (67) 99999-9999, 67999999999, +55 67 99999-9999.
 * Devolve dígitos com DDI 55 para a Evolution. Recusa grupo (@g.us) —
 * o botão de compartilhar é pessoa a pessoa.
 */
export function toDocumentosWhatsAppJid(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return null;
  if (digits.length === 11 && digits[2] === '9') return `55${digits}`;
  if (digits.length === 10) return `55${digits}`;
  if (digits.length === 13 && digits.startsWith('55')) return digits;
  if (digits.length === 12 && digits.startsWith('55')) return digits;
  return null;
}

const ALLOWED_BY_DIGITS = new Map<string, string>(
  DOCUMENTOS_WHATSAPP_RECIPIENTS.map((row) => [row.phone.replace(/\D/g, ''), row.phone]),
);

/**
 * Aceita índices `"0"`… da allowlist, telefone da lista (com ou sem máscara)
 * e número escrito à mão (FR-043). Inválido ou >10 recusa o pedido inteiro.
 */
export function resolveDocumentosWhatsAppPhones(
  raw: readonly string[],
): { ok: true; phones: string[] } | { ok: false } {
  if (raw.length === 0 || raw.length > DOCUMENTOS_WHATSAPP_MAX_RECIPIENTS) return { ok: false };
  const phones: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const trimmed = item.trim();
    let phone: string | undefined;
    if (/^\d+$/.test(trimmed) && trimmed.length <= 2) {
      phone = DOCUMENTOS_WHATSAPP_RECIPIENTS[Number.parseInt(trimmed, 10)]?.phone;
    } else {
      const digits = trimmed.replace(/\D/g, '');
      phone = ALLOWED_BY_DIGITS.get(digits);
      if (!phone) {
        const jid = toDocumentosWhatsAppJid(trimmed);
        if (jid) phone = trimmed;
      }
    }
    if (!phone || !toDocumentosWhatsAppJid(phone)) return { ok: false };
    const jid = toDocumentosWhatsAppJid(phone)!;
    if (seen.has(jid)) continue;
    seen.add(jid);
    phones.push(phone);
  }
  return { ok: true, phones };
}

function noteForCaption(note: string | undefined): string | null {
  if (!note) return null;
  const trimmed = note.replace(/\0/g, '').trim();
  if (!trimmed) return null;
  return trimmed.slice(0, 500);
}

export function buildDocumentosWhatsAppCaption(input: {
  kindLabel: string;
  validUntil: string | null;
  note?: string;
}): string {
  const pretty = input.validUntil
    ? input.validUntil.replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$3/$2/$1')
    : null;
  const lines = [
    `QL MED — ${input.kindLabel}`,
    pretty ? `Validade: ${pretty}.` : 'Validade: sem data.',
  ];
  const note = noteForCaption(input.note);
  if (note) lines.push(note);
  return lines.join('\n');
}

export async function shareDocumentByWhatsApp(
  input: {
    phone: string;
    fileName: string;
    pdf: Buffer;
    kindLabel: string;
    validUntil: string | null;
    note?: string;
  },
  deps?: {
    send?: typeof sendWhatsAppDocument;
    config?: EvolutionConfig | null;
  },
): Promise<{ jid: string }> {
  const jid = toDocumentosWhatsAppJid(input.phone);
  if (!jid) throw new ShareWhatsAppNumberError();

  const config = deps?.config === undefined ? getEvolutionConfig() : deps.config;
  if (!config) throw new ShareWhatsAppUnavailableError();

  const send = deps?.send ?? sendWhatsAppDocument;
  await send(
    {
      jid,
      fileName: input.fileName,
      content: input.pdf,
      caption: buildDocumentosWhatsAppCaption(input),
    },
    config,
  );
  return { jid };
}

export { WhatsAppSendError };
