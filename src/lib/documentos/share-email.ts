import nodemailer from 'nodemailer';

/**
 * Destinatários internos que o diálogo de compartilhar pode marcar.
 * Origem do e-mail é sempre adm@qlmed.com.br (SMTP_USER).
 * A rota recusa qualquer endereço fora desta lista — sem isto vira relay aberto.
 */
export const DOCUMENTOS_SHARE_RECIPIENTS = [
  { email: 'faturamento@qlmed.com.br', label: 'Faturamento' },
  { email: 'marcelo@qlmed.com.br', label: 'Marcelo' },
  // a confirmar com o dono
  { email: 'daniele@qlmed.com.br', label: 'Daniele' },
  { email: 'flavio@qlmed.com.br', label: 'Flavio' },
  { email: 'joseroberto@qlmed.com.br', label: 'José Roberto' },
] as const;

export type DocumentosShareRecipient = (typeof DOCUMENTOS_SHARE_RECIPIENTS)[number];

export type ShareResult = { sent: string[]; messageId: string | null };

export type MailTransport = {
  sendMail: (mail: {
    from: string;
    to: string | string[];
    subject: string;
    text: string;
    attachments?: Array<{
      filename: string;
      content: Buffer;
      contentType: string;
    }>;
  }) => Promise<{ messageId?: string }>;
};

export class ShareRecipientsNotAllowedError extends Error {
  constructor() {
    super('Destinatário não permitido');
    this.name = 'ShareRecipientsNotAllowedError';
  }
}

const ALLOWED_BY_EMAIL = new Map<string, string>(
  DOCUMENTOS_SHARE_RECIPIENTS.map((row) => [row.email.toLowerCase(), row.email]),
);

/**
 * Aceita e-mails da allowlist (qualquer caixa) ou índices `"0"`… da constante.
 * Qualquer outro valor recusa o pedido inteiro — não envia só os válidos.
 */
export function resolveDocumentosShareRecipients(
  raw: readonly string[],
): { ok: true; emails: string[] } | { ok: false } {
  if (raw.length === 0) return { ok: false };
  const emails: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const trimmed = item.trim();
    let email: string | undefined;
    if (/^\d+$/.test(trimmed)) {
      email = DOCUMENTOS_SHARE_RECIPIENTS[Number.parseInt(trimmed, 10)]?.email;
    } else {
      email = ALLOWED_BY_EMAIL.get(trimmed.toLowerCase());
    }
    if (!email) return { ok: false };
    if (seen.has(email)) continue;
    seen.add(email);
    emails.push(email);
  }
  return { ok: true, emails };
}

function formatValidUntilPtBr(validUntil: string | null): string | null {
  if (!validUntil) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(validUntil);
  if (!match) return null;
  return `${match[3]}/${match[2]}/${match[1]}`;
}

function createSmtpTransport(): MailTransport {
  if (!process.env.SMTP_PASS) {
    throw new Error('SMTP_PASS não configurado no servidor');
  }

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.office365.com',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: false,
    auth: {
      user: process.env.SMTP_USER || 'adm@qlmed.com.br',
      pass: process.env.SMTP_PASS || '',
    },
  });

  return {
    sendMail: (mail) => transporter.sendMail(mail),
  };
}

function noteForBody(note: string | undefined): string | null {
  if (!note) return null;
  const trimmed = note.replace(/\0/g, '').trim();
  if (!trimmed) return null;
  return trimmed.slice(0, 500);
}

export async function shareDocumentByEmail(
  input: {
    recipients: string[];
    fileName: string;
    pdf: Buffer;
    kindLabel: string;
    validUntil: string | null;
    note?: string;
  },
  deps?: { transport?: MailTransport },
): Promise<ShareResult> {
  const resolved = resolveDocumentosShareRecipients(input.recipients);
  if (!resolved.ok) {
    throw new ShareRecipientsNotAllowedError();
  }

  const transport = deps?.transport ?? createSmtpTransport();
  const prettyDate = formatValidUntilPtBr(input.validUntil);
  const subject = prettyDate
    ? `[QL MED] ${input.kindLabel} — validade ${prettyDate}`
    : `[QL MED] ${input.kindLabel} — sem data`;

  const note = noteForBody(input.note);
  const textLines = [
    `Segue em anexo o documento ${input.kindLabel}.`,
    prettyDate ? `Validade: ${prettyDate}.` : 'Validade: sem data.',
  ];
  if (note) {
    textLines.push('', note);
  }

  const fromUser = process.env.SMTP_USER || 'adm@qlmed.com.br';
  const info = await transport.sendMail({
    from: `"QL MED" <${fromUser}>`,
    to: resolved.emails,
    subject,
    text: textLines.join('\n'),
    attachments: [
      {
        filename: input.fileName,
        content: input.pdf,
        contentType: 'application/pdf',
      },
    ],
  });

  return {
    sent: resolved.emails,
    messageId: info.messageId ?? null,
  };
}
