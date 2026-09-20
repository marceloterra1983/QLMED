import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const CONFIG_ROUTE = join(ROOT, 'src/app/api/integrations/n8n/config/route.ts');
const STATUS_ROUTE = join(ROOT, 'src/app/api/integrations/n8n/status/route.ts');

const read = (p: string) => readFileSync(p, 'utf8');

describe('SPEC-081 — n8n HTTP de configuração/status aposentado', () => {
  it('rotas não decifram nem cifram credencial', () => {
    expect(read(CONFIG_ROUTE)).not.toMatch(/decrypt\(|encrypt\(/);
    expect(read(STATUS_ROUTE)).not.toMatch(/decrypt\(|encrypt\(/);
  });

  it('rotas devolvem 410 e ainda autenticam', () => {
    expect(read(CONFIG_ROUTE)).toContain('status: 410');
    expect(read(STATUS_ROUTE)).toContain('status: 410');
    expect(read(CONFIG_ROUTE)).toMatch(/requireAuth|requireAdmin/);
    expect(read(STATUS_ROUTE)).toContain('requireSessionRole');
  });
});

const mocks = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  userFindUnique: vi.fn(),
}));

vi.mock('next/headers', () => ({ headers: async () => ({ get: () => null }) }));
vi.mock('next-auth', () => ({ getServerSession: mocks.getServerSession }));
vi.mock('@/lib/auth-options', () => ({ authOptions: {} }));
vi.mock('@/lib/prisma', () => ({
  default: { user: { findUnique: mocks.userFindUnique } },
}));

describe('GET /api/integrations/n8n/status', () => {
  beforeEach(() => {
    mocks.getServerSession.mockReset();
    mocks.userFindUnique.mockReset();
  });

  it('sem sessão → 401', async () => {
    mocks.getServerSession.mockResolvedValue(null);
    const { GET } = await import('@/app/api/integrations/n8n/status/route');
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('com sessão → 410', async () => {
    mocks.getServerSession.mockResolvedValue({
      user: { id: 'u1', role: 'viewer', tokenVersion: 1 },
    });
    mocks.userFindUnique.mockResolvedValue({
      role: 'viewer',
      status: 'active',
      tokenVersion: 1,
    });
    const { GET } = await import('@/app/api/integrations/n8n/status/route');
    const res = await GET();
    expect(res.status).toBe(410);
  });
});
