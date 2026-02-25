import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';

const VALID_ACTIONS = ['sync-nfe', 'sync-cte', 'notify', 'process-xml'] as const;
type Action = (typeof VALID_ACTIONS)[number];

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
    switch (action as Action) {
      case 'sync-nfe': {
        const baseUrl = process.env.QLMED_INTERNAL_URL || 'http://0.0.0.0:3000';
        const res = await fetch(`${baseUrl}/api/nsdocs/sync`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.QLMED_API_KEY! },
          body: JSON.stringify(payload || {}),
        });
        const data = await res.json();
        return NextResponse.json({ ok: true, action, result: data });
      }

      case 'sync-cte': {
        const baseUrl = process.env.QLMED_INTERNAL_URL || 'http://0.0.0.0:3000';
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
        const baseUrl = process.env.QLMED_INTERNAL_URL || 'http://0.0.0.0:3000';
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

      case 'notify': {
        // Log notification; extend with email/WhatsApp integration as needed
        console.log('[n8n webhook] Notification:', payload);
        return NextResponse.json({ ok: true, action, message: 'Notification received' });
      }

      default:
        return NextResponse.json({ error: 'Unhandled action' }, { status: 400 });
    }
  } catch (err) {
    console.error('[n8n webhook] Error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
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
