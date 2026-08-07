import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
}));

vi.mock('@/lib/auth', async () => {
  const { NextResponse } = await import('next/server');
  return {
    requireAuth: mocks.requireAuth,
    unauthorizedResponse: () => NextResponse.json({ error: 'Não autorizado' }, { status: 401 }),
  };
});

import { GET } from '@/app/api/products/route';

describe('GET /api/products (legacy gone)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuth.mockResolvedValue({ userId: 'user-1', role: 'editor' });
  });

  it('returns 401 when authentication is absent', async () => {
    mocks.requireAuth.mockRejectedValue(new Error('NOT_AUTHENTICATED'));

    const response = await GET();

    expect(response.status).toBe(401);
  });

  it('returns 410 Gone pointing to /api/products/list when authenticated', async () => {
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(410);
    expect(body).toEqual({
      error: 'Rota descontinuada. Use GET /api/products/list',
      code: 'GONE',
    });
    expect(response.headers.get('X-Deprecated')).toBe('Use /api/products/list instead');
  });
});
