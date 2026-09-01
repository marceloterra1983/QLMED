/**
 * REAUD-B-06. O portão estático (api-route-guards.test.ts) só pergunta se o
 * corpo do handler CITA um guarda; não verifica que a rejeição corta o fluxo.
 * Prova do auditor: trocar em `GET /api/users` o `catch` que devolve 401/403
 * por um `catch {}` vazio — a listagem de utilizadores (e-mails, papéis,
 * allowedPages) passa a responder a qualquer sessão, e a suíte fica verde.
 *
 * Aqui cada handler de /api/users, /api/admin e /api/integrations é chamado
 * de verdade com o guarda REAL de `@/lib/auth`: só a sessão (next-auth), o
 * `headers()` do Next e o Prisma são substituídos. Mede-se o código de
 * resposta e que nenhum modelo de dados foi tocado depois do guarda.
 *
 * `/api/sistema` não existe neste repositório.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  userFindUnique: vi.fn(),
}));

/**
 * Todo acesso a dados que um handler faria DEPOIS do guarda. Se um destes for
 * chamado num negativo, o guarda não cortou o fluxo — é o buraco do achado.
 */
const data = vi.hoisted(() => ({
  user: { findMany: vi.fn(), count: vi.fn(), create: vi.fn(), update: vi.fn() },
  apiKey: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
  userNotificationPreference: { findMany: vi.fn(), upsert: vi.fn() },
  pushSubscription: { count: vi.fn(), upsert: vi.fn(), deleteMany: vi.fn() },
  n8nIntegrationConfig: { findUnique: vi.fn(), upsert: vi.fn() },
  $transaction: vi.fn(),
  singleCompany: vi.fn(),
}));

vi.mock('next/headers', () => ({ headers: async () => ({ get: () => null }) }));
vi.mock('next-auth', () => ({ getServerSession: mocks.getServerSession }));
vi.mock('@/lib/auth-options', () => ({ authOptions: {} }));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}));
vi.mock('@/lib/single-company', () => ({ getOrCreateSingleCompany: data.singleCompany }));
vi.mock('@/lib/prisma', () => {
  const { singleCompany: _ignored, ...models } = data;
  const prisma = {
    ...models,
    user: { ...data.user, findUnique: mocks.userFindUnique },
    accessLog: { create: vi.fn().mockResolvedValue({}) },
  };
  return { default: prisma, prisma };
});

type Handler = (req: Request, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;

interface Route {
  name: string;
  /** true = exige admin (viewer → 403); false = viewer é o piso (só o anónimo é negativo). */
  admin: boolean;
  load: () => Promise<unknown>;
  method: string;
  body?: unknown;
}

const ROUTES: Route[] = [
  { name: 'GET /api/users', admin: true, load: () => import('@/app/api/users/route'), method: 'GET' },
  { name: 'POST /api/users', admin: true, load: () => import('@/app/api/users/route'), method: 'POST', body: {} },
  { name: 'PATCH /api/users/[id]', admin: true, load: () => import('@/app/api/users/[id]/route'), method: 'PATCH', body: { role: 'admin' } },
  { name: 'GET /api/users/pending-count', admin: true, load: () => import('@/app/api/users/pending-count/route'), method: 'GET' },
  { name: 'GET /api/users/me/notification-preferences', admin: false, load: () => import('@/app/api/users/me/notification-preferences/route'), method: 'GET' },
  { name: 'PUT /api/users/me/notification-preferences', admin: false, load: () => import('@/app/api/users/me/notification-preferences/route'), method: 'PUT', body: { preferences: [] } },
  { name: 'GET /api/users/me/push-subscription', admin: false, load: () => import('@/app/api/users/me/push-subscription/route'), method: 'GET' },
  { name: 'POST /api/users/me/push-subscription', admin: false, load: () => import('@/app/api/users/me/push-subscription/route'), method: 'POST', body: {} },
  { name: 'DELETE /api/users/me/push-subscription', admin: false, load: () => import('@/app/api/users/me/push-subscription/route'), method: 'DELETE', body: {} },
  { name: 'GET /api/admin/api-keys', admin: true, load: () => import('@/app/api/admin/api-keys/route'), method: 'GET' },
  { name: 'POST /api/admin/api-keys', admin: true, load: () => import('@/app/api/admin/api-keys/route'), method: 'POST', body: {} },
  { name: 'DELETE /api/admin/api-keys/[id]', admin: true, load: () => import('@/app/api/admin/api-keys/[id]/route'), method: 'DELETE' },
  { name: 'GET /api/integrations/n8n/config', admin: false, load: () => import('@/app/api/integrations/n8n/config/route'), method: 'GET' },
  { name: 'PUT /api/integrations/n8n/config', admin: true, load: () => import('@/app/api/integrations/n8n/config/route'), method: 'PUT', body: {} },
  { name: 'GET /api/integrations/n8n/status', admin: false, load: () => import('@/app/api/integrations/n8n/status/route'), method: 'GET' },
];

async function call(route: Route): Promise<Response> {
  const mod = (await route.load()) as Record<string, Handler>;
  const req = new Request('http://localhost/api/x', {
    method: route.method,
    headers: { 'content-type': 'application/json' },
    body: route.body === undefined ? undefined : JSON.stringify(route.body),
  });
  return mod[route.method](req, { params: Promise.resolve({ id: 'alvo-1' }) });
}

function touchedData(): string[] {
  const touched: string[] = [];
  for (const [model, ops] of Object.entries(data)) {
    if (typeof ops === 'function') {
      if (ops.mock.calls.length > 0) touched.push(model);
      continue;
    }
    for (const [op, fn] of Object.entries(ops)) {
      if (fn.mock.calls.length > 0) touched.push(`${model}.${op}`);
    }
  }
  return touched;
}

function viewerSession() {
  mocks.getServerSession.mockResolvedValue({
    user: { id: 'viewer-1', role: 'viewer', tokenVersion: 1 },
  });
  mocks.userFindUnique.mockResolvedValue({ role: 'viewer', status: 'active', tokenVersion: 1 });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('REAUD-B-06 — sem sessão, cada handler devolve 401 e não toca em dados', () => {
  it.each(ROUTES)('$name', async (route) => {
    mocks.getServerSession.mockResolvedValue(null);

    const res = await call(route);

    expect(res.status).toBe(401);
    expect(touchedData()).toEqual([]);
  });
});

describe('REAUD-B-06 — sessão de viewer, cada handler de admin devolve 403 e não toca em dados', () => {
  it.each(ROUTES.filter((route) => route.admin))('$name', async (route) => {
    viewerSession();

    const res = await call(route);

    expect(res.status).toBe(403);
    // O guarda real consultou o utilizador uma vez — é a única leitura permitida.
    expect(mocks.userFindUnique).toHaveBeenCalledTimes(1);
    expect(touchedData()).toEqual([]);
  });
});

describe('REAUD-B-06 — o harness é sensível: o guarda real deixa o admin passar', () => {
  it('GET /api/users/pending-count responde 200 a um admin', async () => {
    mocks.getServerSession.mockResolvedValue({
      user: { id: 'admin-1', role: 'admin', tokenVersion: 1 },
    });
    mocks.userFindUnique.mockResolvedValue({ role: 'admin', status: 'active', tokenVersion: 1 });
    data.user.count.mockResolvedValue(3);

    const res = await call(ROUTES[3]);

    expect(res.status).toBe(200);
    expect(touchedData()).toEqual(['user.count']);
  });
});
