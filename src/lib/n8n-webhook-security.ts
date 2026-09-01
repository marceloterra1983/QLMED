import { createHmac, timingSafeEqual } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { createLogger } from '@/lib/logger';

const log = createLogger('n8n-webhook-security');

export const DEFAULT_WEBHOOK_MAX_SKEW_SECONDS = 5 * 60;
const MAX_NONCE_LENGTH = 128;

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

/**
 * Consome um nonce, uma única vez em TODO o sistema.
 *
 * Era um `Map` em processo. Com mais de uma réplica cada uma tinha o seu, e o
 * mesmo nonce era aceite uma vez por réplica — a proteção contra repetição
 * valia 1/N. O `ponytail:` no código já admitia o teto; aqui ele é levantado.
 *
 * O `INSERT ... ON CONFLICT DO NOTHING` é a reivindicação atómica: a chave
 * primária resolve a corrida no banco, então duas réplicas a inserirem o mesmo
 * nonce no mesmo instante produzem exatamente um vencedor.
 *
 * Falha de banco RECUSA. Um nonce que não se consegue registar é um nonce que
 * não se consegue provar único, e aceitar nesse caso reintroduz a repetição.
 */
export async function consumeWebhookNonce(
  nonce: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
  maxSkewSeconds: number = DEFAULT_WEBHOOK_MAX_SKEW_SECONDS,
): Promise<boolean> {
  if (!nonce || nonce.length > MAX_NONCE_LENGTH) return false;

  const expiresAt = new Date((nowSeconds + maxSkewSeconds) * 1000);
  try {
    // Limpeza oportunista: a janela é de minutos, então a tabela é pequena e
    // não precisa de job dedicado.
    await prisma.$executeRaw`
      DELETE FROM "N8nWebhookNonce" WHERE "expiresAt" <= ${new Date(nowSeconds * 1000)}
    `;
    const inserted = await prisma.$executeRaw`
      INSERT INTO "N8nWebhookNonce" ("nonce", "expiresAt")
      VALUES (${nonce}, ${expiresAt})
      ON CONFLICT ("nonce") DO NOTHING
    `;
    return inserted === 1;
  } catch (err) {
    log.warn({ err }, 'webhook_nonce_store_unavailable');
    return false;
  }
}
