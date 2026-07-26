import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@/lib/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth')>();
  return {
    ...actual,
    requireRole: vi.fn(),
    requireAuth: vi.fn(),
    requireEditor: vi.fn(),
  };
});

vi.mock('@/lib/single-company', () => ({
  getOrCreateSingleCompany: vi.fn(async () => ({ id: 'co1' })),
}));

vi.mock('@/lib/cnpj-monitor', () => ({
  runBatchCnpjCheck: vi.fn(async () => ({ checked: 0, changes: 0 })),
  getRecentCnpjChanges: vi.fn(async () => []),
}));

import { requireRole } from '@/lib/auth';
import { POST as cnpjMonitorPost } from '@/app/api/contacts/cnpj-monitor/route';

describe('mutation roles', () => {
  beforeEach(() => {
    vi.mocked(requireRole).mockReset();
  });

  it('POST cnpj-monitor rejeita viewer (403)', async () => {
    vi.mocked(requireRole).mockRejectedValue(new Error('FORBIDDEN'));
    const res = await cnpjMonitorPost(
      new Request('http://localhost/api/contacts/cnpj-monitor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }) as never,
    );
    expect(res.status).toBe(403);
  });

  it('POST cnpj-monitor aceita editor', async () => {
    vi.mocked(requireRole).mockResolvedValue({ userId: 'u1', role: 'editor' });
    const res = await cnpjMonitorPost(
      new Request('http://localhost/api/contacts/cnpj-monitor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batchSize: 5 }),
      }) as never,
    );
    expect(res.status).toBe(200);
  });
});
