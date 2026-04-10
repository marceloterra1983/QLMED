import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { createLogger } from '@/lib/logger';
import { apiError } from '@/lib/api-error';

const log = createLogger('webhooks/n8n');

const VALID_ACTIONS = ['sync-nfe', 'sync-cte', 'notify', 'process-xml', 'sync-ncm-bulk', 'backfill-tax-data', 'batch-cnpj-check'] as const;
type Action = (typeof VALID_ACTIONS)[number];
const DEFAULT_INTERNAL_BASE_URL = 'http://127.0.0.1:3000';

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

function getInternalBaseUrl(): string {
  return (
    process.env.QLMED_INTERNAL_URL ||
    process.env.QLMED_API_URL ||
    DEFAULT_INTERNAL_BASE_URL
  ).replace(/\/+$/, '');
}

export async function POST(req: NextRequest) {
  if (!validateApiKey(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { action?: string; payload?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { action, payload } = body;

  if (!action || !VALID_ACTIONS.includes(action as Action)) {
    return NextResponse.json(
      { error: `Invalid action. Valid: ${VALID_ACTIONS.join(', ')}` },
      { status: 400 },
    );
  }

  try {
    const baseUrl = getInternalBaseUrl();

    switch (action as Action) {
      case 'sync-nfe': {
        const res = await fetch(`${baseUrl}/api/nsdocs/sync`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.QLMED_API_KEY! },
          body: JSON.stringify(payload || {}),
        });
        const data = await res.json();
        return NextResponse.json({ ok: true, action, result: data });
      }

      case 'sync-cte': {
        const res = await fetch(`${baseUrl}/api/cte/sync`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.QLMED_API_KEY! },
          body: JSON.stringify(payload || {}),
        });
        const data = await res.json();
        return NextResponse.json({ ok: true, action, result: data });
      }

      case 'process-xml': {
        // Accepts base64-encoded XML in payload.xml
        if (!payload?.xml) {
          return NextResponse.json({ error: 'payload.xml is required' }, { status: 400 });
        }
        const formData = new FormData();
        const buffer = Buffer.from(payload.xml as string, 'base64');
        formData.append('file', new Blob([buffer], { type: 'text/xml' }), 'invoice.xml');
        const res = await fetch(`${baseUrl}/api/invoices/upload`, {
          method: 'POST',
          headers: { 'x-api-key': process.env.QLMED_API_KEY! },
          body: formData,
        });
        const data = await res.json();
        return NextResponse.json({ ok: true, action, result: data });
      }

      case 'sync-ncm-bulk': {
        const res = await fetch(`${baseUrl}/api/ncm/bulk-sync`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.QLMED_API_KEY! },
          body: JSON.stringify(payload || {}),
        });
        const data = await res.json();
        return NextResponse.json({ ok: true, action, result: data });
      }

      case 'backfill-tax-data': {
        const res = await fetch(`${baseUrl}/api/invoices/backfill-tax`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.QLMED_API_KEY! },
        });
        const data = await res.json();
        return NextResponse.json({ ok: true, action, result: data });
      }

      case 'batch-cnpj-check': {
        const res = await fetch(`${baseUrl}/api/contacts/cnpj-monitor`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.QLMED_API_KEY! },
          body: JSON.stringify(payload || {}),
        });
        const data = await res.json();
        return NextResponse.json({ ok: true, action, result: data });
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
