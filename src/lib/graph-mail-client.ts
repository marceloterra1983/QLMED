import { createLogger } from '@/lib/logger';
import { IMPCG_MAILBOX_TIMEOUT_MS, IMPCG_SENDER_EMAIL } from '@/lib/impcg/constants';
import { assertAllowedHost } from '@/lib/http-allowlist';
import { GRAPH_ALLOWED_HOSTS } from '@/lib/onedrive-graph';

const log = createLogger('graph-mail');
const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';

export class GraphMailboxError extends Error {
  readonly status: number;

  constructor(code: string, status: number) {
    super(code);
    this.name = 'GraphMailboxError';
    this.status = status;
  }
}

export type ImpcgMailMessage = {
  graphMessageId: string;
  internetMessageId: string;
  subject: string;
  receivedAt: Date;
  hasAttachments: boolean;
};

export type ImpcgPdfAttachment = {
  name: string;
  content: Buffer;
};

type TokenCache = { value: string; expiresAt: number };
let tokenCache: TokenCache | null = null;

function requireAppConfig() {
  const tenantId = process.env.TENANT_ID;
  const clientId = process.env.CLIENT_ID;
  const clientSecret = process.env.CLIENT_SECRET;
  if (!tenantId || !clientId || !clientSecret) {
    throw new Error('TENANT_ID, CLIENT_ID e CLIENT_SECRET devem estar configurados');
  }
  return { tenantId, clientId, clientSecret };
}

function parseErrorDetails(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== 'object') return fallback;
  const parsed = payload as { error?: string | { message?: string; code?: string }; error_description?: string };
  if (typeof parsed.error_description === 'string' && parsed.error_description.trim()) {
    return parsed.error_description;
  }
  if (typeof parsed.error === 'string' && parsed.error.trim()) return parsed.error;
  if (parsed.error && typeof parsed.error === 'object' && typeof parsed.error.message === 'string') {
    return parsed.error.message;
  }
  return fallback;
}

export async function getGraphAppOnlyToken(): Promise<string> {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) {
    return tokenCache.value;
  }

  const { tenantId, clientId, clientSecret } = requireAppConfig();
  const response = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'client_credentials',
      scope: 'https://graph.microsoft.com/.default',
    }),
    cache: 'no-store',
    signal: AbortSignal.timeout(IMPCG_MAILBOX_TIMEOUT_MS),
  });

  const payload = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) {
    const detail = parseErrorDetails(payload, `${response.status}`);
    log.warn({ status: response.status }, 'graph_token_failed');
    throw new Error(`Falha ao obter token Graph: ${detail.slice(0, 180)}`);
  }

  const token = payload as { access_token?: string; expires_in?: number };
  if (!token.access_token) {
    throw new Error('Falha ao obter token Graph: resposta sem access_token');
  }
  tokenCache = {
    value: token.access_token,
    expiresAt: Date.now() + Math.max((token.expires_in ?? 3600) - 60, 60) * 1000,
  };
  return tokenCache.value;
}

/**
 * IMPCG_MAILBOX_TIMEOUT_MS é orçamento de uma requisição, não da caixa inteira:
 * um deadline compartilhado entre todas as páginas e anexos aborta o histórico
 * completo de uma caixa antiga antes de qualquer mensagem ser processada.
 */
function perRequestSignal(external?: AbortSignal): AbortSignal {
  const deadline = AbortSignal.timeout(IMPCG_MAILBOX_TIMEOUT_MS);
  return external ? AbortSignal.any([external, deadline]) : deadline;
}

async function graphJson<T>(
  accessToken: string,
  resourcePath: string,
  signal: AbortSignal,
): Promise<{ status: number; body: T }> {
  // `resourcePath` absoluto é o `@odata.nextLink` devolvido pelo Graph. Fixar o
  // host antes de anexar o Bearer: um nextLink forjado levaria o token embora.
  const url = /^https?:\/\//i.test(resourcePath)
    ? assertAllowedHost(resourcePath, GRAPH_ALLOWED_HOSTS).toString()
    : `${GRAPH_BASE}${resourcePath}`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
    cache: 'no-store',
    signal,
  });
  const body = (await response.json().catch(() => null)) as T;
  return { status: response.status, body };
}

export async function listMailboxMessagesBySender(
  mailbox: string,
  senderEmail: string,
  options: { signal?: AbortSignal } = {},
): Promise<ImpcgMailMessage[]> {
  const accessToken = await getGraphAppOnlyToken();
  const filter = `hasAttachments eq true and from/emailAddress/address eq '${senderEmail}'`;
  const select = 'id,subject,receivedDateTime,from,hasAttachments,internetMessageId';
  let next: string | null =
    `/users/${encodeURIComponent(mailbox)}/messages?$select=${select}&$filter=${encodeURIComponent(filter)}&$top=50`;

  type MessageListResponse = {
    value?: Array<{
      id?: string;
      subject?: string;
      receivedDateTime?: string;
      hasAttachments?: boolean;
      internetMessageId?: string;
    }>;
    '@odata.nextLink'?: string;
    error?: { message?: string; code?: string };
  };

  const messages: ImpcgMailMessage[] = [];
  while (next) {
    const listed = await graphJson<MessageListResponse>(
      accessToken,
      next,
      perRequestSignal(options.signal),
    );
    const status = listed.status;
    const body: MessageListResponse = listed.body;

    if (status === 403 || status === 401) {
      throw new GraphMailboxError('mailbox_forbidden', status);
    }
    if (status < 200 || status >= 300) {
      throw new GraphMailboxError('mailbox_unavailable', status);
    }

    for (const row of body.value ?? []) {
      if (!row.id || !row.internetMessageId) continue;
      messages.push({
        graphMessageId: row.id,
        internetMessageId: row.internetMessageId,
        subject: row.subject || '',
        receivedAt: row.receivedDateTime ? new Date(row.receivedDateTime) : new Date(),
        hasAttachments: Boolean(row.hasAttachments),
      });
    }
    next = typeof body['@odata.nextLink'] === 'string' ? body['@odata.nextLink'] : null;
  }

  messages.sort((a, b) => b.receivedAt.getTime() - a.receivedAt.getTime());
  return messages;
}

export async function listMailboxMessagesBySenders(
  mailbox: string,
  senderEmails: readonly string[],
  options: { signal?: AbortSignal } = {},
): Promise<ImpcgMailMessage[]> {
  const uniqueSenders = [...new Set(senderEmails.map((email) => email.trim()).filter(Boolean))];
  const byInternetMessageId = new Map<string, ImpcgMailMessage>();
  for (const sender of uniqueSenders) {
    const rows = await listMailboxMessagesBySender(mailbox, sender, options);
    for (const row of rows) {
      if (!byInternetMessageId.has(row.internetMessageId)) {
        byInternetMessageId.set(row.internetMessageId, row);
      }
    }
  }
  return [...byInternetMessageId.values()].sort(
    (a, b) => b.receivedAt.getTime() - a.receivedAt.getTime(),
  );
}

export async function listImpcgMailboxMessages(
  mailbox: string,
  options: { signal?: AbortSignal } = {},
): Promise<ImpcgMailMessage[]> {
  return listMailboxMessagesBySender(mailbox, IMPCG_SENDER_EMAIL, options);
}

export async function listImpcgPdfAttachments(
  mailbox: string,
  graphMessageId: string,
  signal?: AbortSignal,
): Promise<ImpcgPdfAttachment[]> {
  const accessToken = await getGraphAppOnlyToken();
  const { status, body } = await graphJson<{
    value?: Array<{
      '@odata.type'?: string;
      name?: string;
      contentType?: string;
      contentBytes?: string;
    }>;
  }>(
    accessToken,
    `/users/${encodeURIComponent(mailbox)}/messages/${encodeURIComponent(graphMessageId)}/attachments`,
    perRequestSignal(signal),
  );

  if (status === 403 || status === 401) {
    throw new GraphMailboxError('mailbox_forbidden', status);
  }
  if (status < 200 || status >= 300) {
    throw new GraphMailboxError('mailbox_unavailable', status);
  }

  const pdfs: ImpcgPdfAttachment[] = [];
  for (const attachment of body.value ?? []) {
    const isFile = (attachment['@odata.type'] || '').toLowerCase().includes('fileattachment');
    const name = attachment.name || 'anexo.pdf';
    const isPdf = (attachment.contentType || '').toLowerCase().includes('pdf') || name.toLowerCase().endsWith('.pdf');
    if (!isFile || !isPdf || !attachment.contentBytes) continue;
    pdfs.push({ name, content: Buffer.from(attachment.contentBytes, 'base64') });
  }
  return pdfs;
}
