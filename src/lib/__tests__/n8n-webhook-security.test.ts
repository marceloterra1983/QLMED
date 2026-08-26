import { describe, expect, it } from 'vitest';
import {
  consumeWebhookNonce,
  createWebhookSignature,
  verifyWebhookSignature,
} from '@/lib/n8n-webhook-security';

describe('n8n webhook security', () => {
  it('accepts a correct signature and rejects tampering or stale timestamps', () => {
    const body = JSON.stringify({ action: 'notify' });
    const timestamp = '1720000000';
    const nonce = 'nonce-1';
    const signature = createWebhookSignature('shared-secret', timestamp, nonce, body);

    expect(verifyWebhookSignature({
      secret: 'shared-secret', timestamp, nonce, signature, body, nowSeconds: 1720000000,
    })).toBe(true);
    expect(verifyWebhookSignature({
      secret: 'shared-secret', timestamp, nonce, signature, body: `${body} `, nowSeconds: 1720000000,
    })).toBe(false);
    expect(verifyWebhookSignature({
      secret: 'shared-secret', timestamp, nonce, signature, body, nowSeconds: 1720000361,
    })).toBe(false);
  });

  it('accepts a nonce once and again after expiration', () => {
    expect(consumeWebhookNonce('nonce-2', 100, 300)).toBe(true);
    expect(consumeWebhookNonce('nonce-2', 101, 300)).toBe(false);
    expect(consumeWebhookNonce('nonce-2', 401, 300)).toBe(true);
  });
});
