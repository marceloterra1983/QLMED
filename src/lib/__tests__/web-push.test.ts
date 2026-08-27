import { describe, expect, it } from 'vitest';
import {
  assertSafePushPayload,
  buildInvoicePushPayload,
  isWebPushConfigured,
} from '@/lib/web-push';
import { normalizePushEndpoint, normalizePushKey } from '@/lib/push-subscriptions';

describe('web push payload', () => {
  it('names the invoice without access key or XML', () => {
    const payload = buildInvoicePushPayload(
      { type: 'NFE', number: '123', senderName: 'Hospital Exemplo' },
      'delivery-1',
    );
    expect(payload.title).toBe('QLMED — nova NF-e');
    expect(payload.body).toBe('Hospital Exemplo • nº 123');
    expect(payload.url).toBe('/r/delivery-1');
    expect(payload.body).not.toMatch(/\d{44}/);
    expect(`${payload.title}${payload.body}${payload.url}`).not.toMatch(/xml|infNFe|nfeProc/i);
    expect(() => assertSafePushPayload(payload)).not.toThrow();
  });

  it('rejects a payload that leaks an access key or XML', () => {
    expect(() => assertSafePushPayload({
      title: 'QLMED',
      body: '35260812345678901234567890123456789012345678',
      url: '/fiscal/invoices',
    })).toThrow(/must not include/);
    expect(() => assertSafePushPayload({
      title: 'QLMED',
      body: '<?xml version="1.0"?><nfeProc>',
      url: '/fiscal/invoices',
    })).toThrow(/must not include/);
  });

  it('requires HTTPS endpoints and url-safe keys', () => {
    expect(normalizePushEndpoint('https://updates.push.services.mozilla.com/wpush/v2/abc'))
      .toBe('https://updates.push.services.mozilla.com/wpush/v2/abc');
    expect(() => normalizePushEndpoint('http://localhost/push')).toThrow(/HTTPS/);
    expect(normalizePushKey('abcDEF012_-', 'auth')).toBe('abcDEF012_-');
    expect(() => normalizePushKey('not/a+key=', 'p256dh')).toThrow(/invalid/);
  });

  it('treats missing VAPID as unconfigured', () => {
    expect(isWebPushConfigured({})).toBe(false);
    expect(isWebPushConfigured({
      VAPID_PUBLIC_KEY: 'pub',
      VAPID_PRIVATE_KEY: 'priv',
    })).toBe(true);
  });
});
