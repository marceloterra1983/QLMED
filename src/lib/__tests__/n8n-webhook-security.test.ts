import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  consumeWebhookNonce,
  createWebhookSignature,
  verifyWebhookSignature,
} from '@/lib/n8n-webhook-security';

/**
 * Tabela partilhada simulada.
 *
 * Vive FORA do módulo sob teste de propósito: é exatamente isso que o Postgres
 * é para duas réplicas. O `Map` local que existia antes morria com o processo,
 * e era esse o defeito (INT-003).
 */
const table = new Map<string, number>();

vi.mock('@/lib/prisma', () => ({
  prisma: {
    // Reproduz a semântica das duas instruções: expiração por TTL e
    // reivindicação atómica pela chave primária.
    $executeRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const sql = strings.join('?');
      if (sql.includes('DELETE')) {
        const cutoff = Math.floor((values[0] as Date).getTime() / 1000);
        let removed = 0;
        for (const [nonce, expiresAt] of table) {
          if (expiresAt <= cutoff) {
            table.delete(nonce);
            removed++;
          }
        }
        return removed;
      }
      const nonce = values[0] as string;
      const expiresAt = values[1] as Date;
      if (table.has(nonce)) return 0; // ON CONFLICT DO NOTHING
      table.set(nonce, Math.floor(expiresAt.getTime() / 1000));
      return 1;
    },
  },
}));

describe('n8n webhook security', () => {
  beforeEach(() => table.clear());

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

  it('accepts a nonce once and again after expiration', async () => {
    expect(await consumeWebhookNonce('nonce-2', 100, 300)).toBe(true);
    expect(await consumeWebhookNonce('nonce-2', 101, 300)).toBe(false);
    expect(await consumeWebhookNonce('nonce-2', 401, 300)).toBe(true);
  });
});

describe('INT-003 — o nonce é único no SISTEMA, não no processo', () => {
  beforeEach(() => table.clear());

  it('uma segunda réplica, sem estado local nenhum, recusa o mesmo nonce', async () => {
    expect(await consumeWebhookNonce('nonce-replica', 100, 300)).toBe(true);

    // Descarta o módulo e reimporta: a instância nova não partilha NADA em
    // memória com a anterior — é o que distingue duas réplicas. Só o store
    // partilhado sobrevive, e é ele que tem de recusar.
    vi.resetModules();
    const segundaReplica = await import('@/lib/n8n-webhook-security');

    expect(await segundaReplica.consumeWebhookNonce('nonce-replica', 101, 300)).toBe(false);
  });

  it('réplicas concorrentes no mesmo nonce produzem exatamente um vencedor', async () => {
    const resultados = await Promise.all(
      Array.from({ length: 8 }, () => consumeWebhookNonce('nonce-corrida', 100, 300)),
    );

    expect(resultados.filter(Boolean)).toHaveLength(1);
  });

  it('recusa quando o store está indisponível (fail-closed)', async () => {
    const { prisma } = await import('@/lib/prisma');
    const original = prisma.$executeRaw;
    (prisma as { $executeRaw: unknown }).$executeRaw = async () => {
      throw new Error('connection refused');
    };

    expect(await consumeWebhookNonce('nonce-db-caido', 100, 300)).toBe(false);

    (prisma as { $executeRaw: unknown }).$executeRaw = original;
  });

  it('recusa nonce vazio ou acima do comprimento máximo', async () => {
    expect(await consumeWebhookNonce('', 100, 300)).toBe(false);
    expect(await consumeWebhookNonce('x'.repeat(129), 100, 300)).toBe(false);
  });
});
