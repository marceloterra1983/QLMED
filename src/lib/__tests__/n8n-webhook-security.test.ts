import { describe, expect, it } from 'vitest';
import {
  consumeWebhookNonce,
  createWebhookSignature,
  verifyWebhookSignature,
} from '@/lib/n8n-webhook-security';

describe('n8n webhook security', () => {
  it('accepts a correctly signed request within the freshness window', () => {
    const body = JSON.stringify({ action: 'notify', payload: { id: '1' } });
    const timestamp = '1720000000';
    const nonce = 'nonce-1';
    const signature = createWebhookSignature('shared-secret', timestamp, nonce, body);

    expect(verifyWebhookSignature({
      secret: 'shared-secret',
      timestamp,
      nonce,
      signature,
      body,
      nowSeconds: 1720000000,
    })).toBe(true);
  });

  it('rejects stale, tampered, and malformed signatures', () => {
    const body = JSON.stringify({ action: 'notify' });
    const signature = createWebhookSignature('shared-secret', '1720000000', 'nonce-2', body);

    expect(verifyWebhookSignature({
      secret: 'shared-secret',
      timestamp: '1720000000',
      nonce: 'nonce-2',
      signature,
      body: `${body} `,
      nowSeconds: 1720000361,
    })).toBe(false);
    expect(verifyWebhookSignature({
      secret: 'shared-secret',
      timestamp: '1720000000',
      nonce: 'nonce-2',
      signature: signature.slice(0, -1) + '0',
      body,
      nowSeconds: 1720000000,
    })).toBe(false);
    expect(verifyWebhookSignature({
      secret: 'shared-secret',
      timestamp: 'not-a-timestamp',
      nonce: 'nonce-2',
      signature,
      body,
      nowSeconds: 1720000000,
    })).toBe(false);
  });

  it('consumes a nonce once and allows it again after expiration', () => {
    const cache = new Map<string, number>();

    expect(consumeWebhookNonce(cache, 'nonce-3', 100, 300)).toBe(true);
    expect(consumeWebhookNonce(cache, 'nonce-3', 101, 300)).toBe(false);
    expect(consumeWebhookNonce(cache, 'nonce-3', 401, 300)).toBe(true);
  });
});
