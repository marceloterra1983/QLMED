/**
 * REAUD-B-15. `/r/[deliveryId]` fica fora do `matcher` do middleware de
 * propósito — é o link público das notificações — e por isso não herdava
 * limite nenhum: cada pedido fazia `findUnique` + `create` no banco. O limite
 * vive na própria rota; o matcher não muda, senão arrastava `/r` para a
 * exigência de sessão.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  deliveryFindUnique: vi.fn(),
  clickCreate: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  default: {
    notificationDelivery: { findUnique: mocks.deliveryFindUnique },
    notificationClick: { create: mocks.clickCreate },
  },
}));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));

import { GET } from '@/app/r/[deliveryId]/route';
import { RATE_LIMITS } from '@/lib/rate-limit';

function hit(ip: string) {
  return GET(new Request('http://localhost/r/d1', { headers: { 'x-forwarded-for': ip } }), {
    params: Promise.resolve({ deliveryId: 'd1' }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.deliveryFindUnique.mockResolvedValue({ id: 'd1', event: { invoice: { type: 'NFE' } } });
  mocks.clickCreate.mockResolvedValue({});
});

describe('REAUD-B-15 — /r/[deliveryId] tem limite por IP na própria rota', () => {
  it('N pedidos redirecionam; o N+1 do mesmo IP leva 429 e não grava clique', async () => {
    const limit = RATE_LIMITS.notificationClick.maxRequests;
    for (let i = 0; i < limit; i++) {
      expect((await hit('203.0.113.10')).status).toBe(302);
    }
    expect(mocks.clickCreate).toHaveBeenCalledTimes(limit);

    const blocked = await hit('203.0.113.10');

    expect(blocked.status).toBe(429);
    expect(blocked.headers.get('X-RateLimit-Remaining')).toBe('0');
    expect(mocks.clickCreate).toHaveBeenCalledTimes(limit);
    expect(mocks.deliveryFindUnique).toHaveBeenCalledTimes(limit);
  });

  it('outro IP tem o seu próprio balde', async () => {
    expect((await hit('203.0.113.11')).status).toBe(302);
    expect(mocks.clickCreate).toHaveBeenCalledTimes(1);
  });
});
