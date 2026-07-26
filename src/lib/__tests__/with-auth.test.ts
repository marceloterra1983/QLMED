import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth', () => ({
  requireRole: vi.fn(),
  requireApiKeyScope: vi.fn(),
  unauthorizedResponse: () =>
    new Response(JSON.stringify({ error: 'Não autorizado' }), { status: 401 }),
  forbiddenResponse: () =>
    new Response(JSON.stringify({ error: 'Sem permissão' }), { status: 403 }),
}));

import { requireRole } from '@/lib/auth';
import { withAuth } from '@/lib/with-auth';

describe('withAuth', () => {
  beforeEach(() => {
    vi.mocked(requireRole).mockReset();
  });

  it('viewer em rota editor → 403', async () => {
    vi.mocked(requireRole).mockRejectedValue(new Error('FORBIDDEN'));
    const handler = withAuth({ role: 'editor' }, async () => new Response('ok'));
    const res = await handler(new Request('http://localhost/api/x', { method: 'POST' }));
    expect(res.status).toBe(403);
  });

  it('editor autorizado chama handler', async () => {
    vi.mocked(requireRole).mockResolvedValue({ userId: 'u1', role: 'editor' });
    const handler = withAuth({ role: 'editor' }, async (_req, auth) =>
      Response.json({ userId: auth.userId }),
    );
    const res = await handler(new Request('http://localhost/api/x', { method: 'POST' }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ userId: 'u1' });
  });

  it('não autenticado → 401', async () => {
    vi.mocked(requireRole).mockRejectedValue(new Error('NOT_AUTHENTICATED'));
    const handler = withAuth({ role: 'viewer' }, async () => new Response('ok'));
    const res = await handler(new Request('http://localhost/api/x'));
    expect(res.status).toBe(401);
  });
});
