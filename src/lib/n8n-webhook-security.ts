import { createHmac, timingSafeEqual } from 'node:crypto';

export const DEFAULT_WEBHOOK_MAX_SKEW_SECONDS = 5 * 60;
const MAX_NONCE_LENGTH = 128;
const MAX_NONCE_CACHE_SIZE = 10_000;

export interface WebhookSignatureInput {
  secret: string;
  timestamp: string;
  nonce: string;
  signature: string;
  body: string;
  nowSeconds?: number;
  maxSkewSeconds?: number;
}

export function createWebhookSignature(
  secret: string,
  timestamp: string,
  nonce: string,
  body: string,
): string {
  return createHmac('sha256', secret)
    .update(`${timestamp}.${nonce}.${body}`, 'utf8')
    .digest('hex');
}

export function verifyWebhookSignature(input: WebhookSignatureInput): boolean {
  const {
    secret,
    timestamp,
    nonce,
    signature,
    body,
    nowSeconds = Math.floor(Date.now() / 1000),
    maxSkewSeconds = DEFAULT_WEBHOOK_MAX_SKEW_SECONDS,
  } = input;

  if (!secret || !/^\d+$/.test(timestamp) || !/^[A-Za-z0-9._~-]{1,128}$/.test(nonce)) return false;
  if (!/^[0-9a-f]{64}$/i.test(signature)) return false;

  const timestampSeconds = Number(timestamp);
  if (
    !Number.isSafeInteger(timestampSeconds) ||
    !Number.isFinite(maxSkewSeconds) ||
    maxSkewSeconds < 1 ||
    Math.abs(nowSeconds - timestampSeconds) > maxSkewSeconds
  ) {
    return false;
  }

  const expected = createWebhookSignature(secret, timestamp, nonce, body);
  return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(signature, 'hex'));
}

// ponytail: process-local replay cache; use a shared store when webhook consumers scale horizontally.
const consumedNonces = new Map<string, number>();

export function consumeWebhookNonce(
  nonce: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
  maxSkewSeconds: number = DEFAULT_WEBHOOK_MAX_SKEW_SECONDS,
): boolean {
  for (const [cachedNonce, expiresAt] of consumedNonces) {
    if (expiresAt <= nowSeconds) consumedNonces.delete(cachedNonce);
  }

  if (nonce.length > MAX_NONCE_LENGTH || consumedNonces.has(nonce) || consumedNonces.size >= MAX_NONCE_CACHE_SIZE) {
    return false;
  }

  consumedNonces.set(nonce, nowSeconds + maxSkewSeconds);
  return true;
}
