import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { timingSafeEqual } from 'crypto';
import { createLogger } from '@/lib/logger';
import { apiError, apiValidationError } from '@/lib/api-error';
import { consumeWebhookNonce, verifyWebhookSignature } from '@/lib/n8n-webhook-security';

const log = createLogger('webhooks/n8n');

const VALID_ACTIONS = ['sync-nfe', 'sync-cte', 'notify', 'process-xml', 'sync-ncm-bulk', 'backfill-tax-data', 'batch-cnpj-check'] as const;

const n8nWebhookSchema = z.object({
  action: z.enum(VALID_ACTIONS, {
    error: `Invalid action. Valid: ${VALID_ACTIONS.join(', ')}`,
  }),
  payload: z.record(z.string(), z.unknown()).optional(),
});
const DEFAULT_INTERNAL_BASE_URL = 'http://127.0.0.1:3000';

// Base64 expands by ~4/3; cap at 7MB so the decoded buffer cannot exceed the
// downstream 5MB per-file limit. Reject early before Buffer.from allocates.
const MAX_BASE64_XML_LENGTH = 7 * 1024 * 1024;

/**
 * Teto do corpo do webhook. Tem de caber `MAX_BASE64_XML_LENGTH` mais o
 * envelope JSON de `process-xml`, e nada além disso.
 */
const MAX_BODY_BYTES = 8 * 1024 * 1024;

/** Orçamento do forward interno; sem ele a rota fica presa a um handler travado. */
const FORWARD_TIMEOUT_MS = 30_000;

class PayloadTooLargeError extends Error {}

/**
 * Lê o corpo com teto, consumindo em pedaços.
 *
 * O `content-length` é do cliente e pode mentir (ou faltar, em chunked), então
 * a contagem real é aqui: passou do teto, aborta sem terminar de receber.
 */
async function readBodyCapped(req: NextRequest): Promise<string> {
  const body = req.body;
  if (!body) return req.text();

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BODY_BYTES) {
        await reader.cancel().catch(() => {});
        throw new PayloadTooLargeError();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks).toString('utf-8');
}

/** Forward interno com timeout — a versão anterior podia esperar para sempre. */
function forwardFetch(url: string, init: RequestInit): Promise<Response> {
  return fetch(url, { ...init, signal: AbortSignal.timeout(FORWARD_TIMEOUT_MS) });
}

function getApiKey(): string {
  const k = process.env.QLMED_API_KEY;
  if (!k) throw new Error('QLMED_API_KEY env var not set');
  return k;
}

function validateApiKey(req: NextRequest): boolean {
  const key = req.headers.get('x-api-key');
  const expected = process.env.QLMED_API_KEY;
  if (!key || !expected || key.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(key), Buffer.from(expected));
  } catch {
    return false;
  }
}

/**
 * Verifica a assinatura HMAC do corpo.
 *
 * Era fail-OPEN: sem `N8N_WEBHOOK_SECRET` no ambiente a função devolvia `true`
 * e QUALQUER corpo com a API key passava assinado. Um deploy que esquecesse a
 * variável perdia a proteção sem nenhum sinal — o pior modo de falha possível,
 * porque o sistema parece funcionar. Agora a ausência do segredo RECUSA.
 */
function validateWebhookSignature(req: NextRequest, body: string): boolean {
  const secret = process.env.N8N_WEBHOOK_SECRET;
  if (!secret) return false;

  const timestamp = req.headers.get('x-qlmed-timestamp') || '';
  const nonce = req.headers.get('x-qlmed-nonce') || '';
  const signature = req.headers.get('x-qlmed-signature') || '';
  if (!verifyWebhookSignature({ secret, timestamp, nonce, signature, body })) return false;

  return consumeWebhookNonce(nonce);
}

function getInternalBaseUrl(): string {
  return (
    process.env.QLMED_INTERNAL_URL ||
    process.env.QLMED_API_URL ||
    DEFAULT_INTERNAL_BASE_URL
  ).replace(/\/+$/, '');
}

async function forwardResponse(action: string, response: Response): Promise<NextResponse> {
  const result = await response.json().catch(() => ({ error: 'Downstream response was not valid JSON' }));
  return NextResponse.json(
    { ok: response.ok, action, result },
    { status: response.ok ? 200 : response.status },
  );
}

export async function POST(req: NextRequest) {
  if (!validateApiKey(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // `req.text()` materializa o corpo INTEIRO na heap antes de qualquer
  // validação. Sem teto, um POST autenticado de 2 GB derruba o processo.
  const declaredLength = Number(req.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
  }

  let rawBody: string;
  try {
    rawBody = await readBodyCapped(req);
  } catch (err) {
    if (err instanceof PayloadTooLargeError) {
      return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
    }
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!validateWebhookSignature(req, rawBody)) {
    return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 401 });
  }

  let payloadBody: unknown;
  try {
    payloadBody = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = n8nWebhookSchema.safeParse(payloadBody);
  if (!parsed.success) return apiValidationError(parsed.error);

  const { action, payload } = parsed.data;

  try {
    const baseUrl = getInternalBaseUrl();

    switch (action) {
      case 'sync-nfe': {
        const res = await forwardFetch(`${baseUrl}/api/nsdocs/sync`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': getApiKey() },
          body: JSON.stringify({ ...(payload || {}), method: 'nsdocs' }),
        });
        return forwardResponse(action, res);
      }

      case 'sync-cte': {
        const res = await forwardFetch(`${baseUrl}/api/nsdocs/sync`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': getApiKey() },
          body: JSON.stringify({ ...(payload || {}), method: 'nsdocs' }),
        });
        return forwardResponse(action, res);
      }

      case 'process-xml': {
        // Accepts base64-encoded XML in payload.xml
        if (!payload?.xml) {
          return NextResponse.json({ error: 'payload.xml is required' }, { status: 400 });
        }
        if (typeof payload.xml !== 'string') {
          return NextResponse.json({ error: 'payload.xml must be a base64 string' }, { status: 400 });
        }
        if (payload.xml.length > MAX_BASE64_XML_LENGTH) {
          return NextResponse.json({ error: 'payload.xml too large' }, { status: 413 });
        }
        const formData = new FormData();
        const buffer = Buffer.from(payload.xml, 'base64');
        formData.append('files', new Blob([buffer], { type: 'text/xml' }), 'invoice.xml');
        const res = await forwardFetch(`${baseUrl}/api/invoices/upload`, {
          method: 'POST',
          headers: { 'x-api-key': getApiKey() },
          body: formData,
        });
        return forwardResponse(action, res);
      }

      case 'sync-ncm-bulk': {
        const res = await forwardFetch(`${baseUrl}/api/ncm/bulk-sync`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': getApiKey() },
          body: JSON.stringify(payload || {}),
        });
        return forwardResponse(action, res);
      }

      case 'backfill-tax-data': {
        const res = await forwardFetch(`${baseUrl}/api/invoices/backfill-tax`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': getApiKey() },
        });
        return forwardResponse(action, res);
      }

      case 'batch-cnpj-check': {
        const res = await forwardFetch(`${baseUrl}/api/contacts/cnpj-monitor`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': getApiKey() },
          body: JSON.stringify(payload || {}),
        });
        return forwardResponse(action, res);
      }

      case 'notify': {
        // Log notification; extend with email/WhatsApp integration as needed
        log.info({ payload }, '[n8n webhook] Notification');
        return NextResponse.json({ ok: true, action, message: 'Notification received' });
      }

      default:
        return NextResponse.json({ error: 'Unhandled action' }, { status: 400 });
    }
  } catch (err) {
    return apiError(err, 'POST /api/webhooks/n8n');
  }
}

export async function GET(req: NextRequest) {
  if (!validateApiKey(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return NextResponse.json({
    ok: true,
    actions: VALID_ACTIONS,
    message: 'QLMED n8n webhook endpoint. POST with { action, payload }.',
  });
}
