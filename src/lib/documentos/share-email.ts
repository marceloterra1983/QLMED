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

/** Destinatários do aviso automático de renovação (FR-011) — equipe operacional. */
export const DOCUMENTOS_RENEWAL_EMAIL_RECIPIENTS = [
  'marcelo@qlmed.com.br',
  'daniele@qlmed.com.br',
  'flavio@qlmed.com.br',
  'joseroberto@qlmed.com.br',
] as const;

export type DocumentosShareRecipient = (typeof DOCUMENTOS_SHARE_RECIPIENTS)[number];

/** Teto por pedido: editor autenticado ainda não pode virar spammer. */
export const DOCUMENTOS_SHARE_MAX_RECIPIENTS = 10;

const EMAIL_RE = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,24}$/;

export type ShareResult = { sent: string[]; messageId: string | null };

export type MailTransport = {
  sendMail: (mail: {
    from: string;
    to: string | string[];
    subject: string;
    text: string;
    html?: string;
    attachments?: Array<{
      filename: string;
      content: Buffer;
      contentType: string;
    }>;
  }) => Promise<{ messageId?: string }>;
};

/** Linha da tabela resumo enviada nos e-mails de atualização (FR-046). */
export type DocumentosSummaryRow = {
  categoryLabel: string;
  label: string;
  fileName: string | null;
  validUntil: string | null;
  statusLabel: string;
};

const CATEGORY_LABELS: Record<string, string> = {
  certidao: 'Certidões',
  sanitaria: 'Sanitária',
  carta: 'Cartas',
  societario: 'Societário',
  basicos: 'Básicos',
  balanco: 'Balanços',
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function categoryLabelForSummary(category: string): string {
  return CATEGORY_LABELS[category] ?? category;
}

/** Texto plano da tabela (clientes sem HTML). */
export function buildDocumentosSummaryText(rows: readonly DocumentosSummaryRow[]): string {
  if (rows.length === 0) return 'Nenhum documento vigente listado.';
  const lines = ['Resumo dos documentos QLMED:', ''];
  for (const row of rows) {
    const validade = formatValidUntilPtBr(row.validUntil) ?? 'sem data';
    const arquivo = row.fileName ?? '—';
    lines.push(
      `- [${row.categoryLabel}] ${row.label} | ${arquivo} | validade ${validade} | ${row.statusLabel}`,
    );
  }
  return lines.join('\n');
}

/** Tabela HTML do resumo (corpo do e-mail de atualização). */
export function buildDocumentosSummaryHtml(rows: readonly DocumentosSummaryRow[]): string {
  if (rows.length === 0) {
    return '<p>Nenhum documento vigente listado.</p>';
  }
  const body = rows
    .map((row) => {
      const validade = formatValidUntilPtBr(row.validUntil) ?? 'sem data';
      const arquivo = row.fileName ?? '—';
      return (
        '<tr>' +
        `<td>${escapeHtml(row.categoryLabel)}</td>` +
        `<td>${escapeHtml(row.label)}</td>` +
        `<td>${escapeHtml(arquivo)}</td>` +
        `<td>${escapeHtml(validade)}</td>` +
        `<td>${escapeHtml(row.statusLabel)}</td>` +
        '</tr>'
      );
    })
    .join('');
  return (
    '<table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;font-family:sans-serif;font-size:13px">' +
    '<thead><tr>' +
    '<th>Categoria</th><th>Documento</th><th>Arquivo</th><th>Validade</th><th>Status</th>' +
    '</tr></thead>' +
    `<tbody>${body}</tbody></table>`
  );
}

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
 * Aceita índices `"0"`… da allowlist, e-mails da lista, e e-mail escrito à
 * mão (FR-042). Formato inválido ou mais de 10 recusa o pedido inteiro.
 */
export function normalizeShareEmail(raw: string): string | null {
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed || trimmed.length > 254) return null;
  if (trimmed.includes('..') || trimmed.startsWith('.') || trimmed.endsWith('.')) return null;
  if (!EMAIL_RE.test(trimmed)) return null;
  return trimmed;
}

export function resolveDocumentosShareRecipients(
  raw: readonly string[],
): { ok: true; emails: string[] } | { ok: false } {
  if (raw.length === 0 || raw.length > DOCUMENTOS_SHARE_MAX_RECIPIENTS) return { ok: false };
  const emails: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const trimmed = item.trim();
    let email: string | undefined;
    if (/^\d+$/.test(trimmed)) {
      email = DOCUMENTOS_SHARE_RECIPIENTS[Number.parseInt(trimmed, 10)]?.email;
    } else {
      const lower = trimmed.toLowerCase();
      email = ALLOWED_BY_EMAIL.get(lower) ?? normalizeShareEmail(trimmed) ?? undefined;
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
    /** Corpo HTML adicional (ex.: tabela resumo FR-046). */
    htmlExtra?: string;
    /** Texto adicional após a introdução (ex.: tabela em texto). */
    textExtra?: string;
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

  if (input.textExtra) {
    textLines.push('', input.textExtra);
  }

  // HTML só com tabela resumo (FR-046). Compartilhar manual (FR-042) permanece
  // texto puro — nota do usuário não vira HTML.
  const html = input.htmlExtra
    ? [
        `<p>${escapeHtml(textLines[0] ?? '')}</p>`,
        `<p>${escapeHtml(textLines[1] ?? '')}</p>`,
        note ? `<p>${escapeHtml(note)}</p>` : '',
        '<h3>Resumo dos documentos QLMED</h3>',
        input.htmlExtra,
      ]
        .filter(Boolean)
        .join('\n')
    : undefined;

  const fromUser = process.env.SMTP_USER || 'adm@qlmed.com.br';
  const info = await transport.sendMail({
    from: `"QL MED" <${fromUser}>`,
    to: resolved.emails,
    subject,
    text: textLines.join('\n'),
    html,
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
