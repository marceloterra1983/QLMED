/**
 * Achados REAUD-B-01 (crítico) e REAUD-B-02 da re-auditoria adversarial.
 *
 * B-02 era a ausência: **nenhum teste invocava `middleware()`**. Os testes que
 * existiam importavam só os helpers puros, então dava para apagar o 403 do
 * `canAccessApi`, repor o fail-open de página e remover o portão de
 * `tokenVersion` — e a suíte inteira continuava verde nos quatro casos.
 *
 * B-01 era o defeito que essa cegueira escondia: o ramo de passagem por
 * `x-api-key` devolvia antes do `getToken()`, então uma sessão de viewer com um
 * header inventado saltava a ACL inteira.
 */
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getToken = vi.fn();
vi.mock('next-auth/jwt', () => ({ getToken: (...args: unknown[]) => getToken(...args) }));

const SESSION_COOKIE = 'next-auth.session-token';

function request(
  path: string,
  opts: { apiKey?: string; session?: boolean; method?: string } = {},
): NextRequest {
  const headers = new Headers();
  if (opts.apiKey) headers.set('x-api-key', opts.apiKey);
  if (opts.session !== false) headers.set('cookie', `${SESSION_COOKIE}=abc123`);
  return new NextRequest(`http://localhost${path}`, {
    method: opts.method || 'GET',
    headers,
  });
}

/** Viewer autenticado que só pode ver as notas fiscais. */
function viewerToken() {
  return {
    sub: 'u1',
    role: 'viewer',
    status: 'active',
    tokenVersion: 1,
    allowedPages: ['/fiscal/invoices'],
  };
}

async function run(req: NextRequest) {
  const { middleware } = await import('@/middleware');
  return middleware(req);
}

beforeEach(() => {
  vi.resetModules();
  getToken.mockReset();
  process.env.NEXTAUTH_SECRET = 'test-secret-for-middleware';
});

describe('REAUD-B-01 — header de api key não desliga a ACL', () => {
  it('viewer sem permissão recebe 403 na rota fora da sua lista', async () => {
    getToken.mockResolvedValue(viewerToken());

    const res = await run(request('/api/financeiro/contas-pagar'));

    expect(res.status).toBe(403);
  });

  it('o MESMO viewer com x-api-key inventado continua a receber 403', async () => {
    getToken.mockResolvedValue(viewerToken());

    const res = await run(
      request('/api/financeiro/contas-pagar', { apiKey: 'qualquer-lixo' }),
    );

    // Antes: o ramo de passagem devolvia `next()` antes do getToken, e a rota
    // caía na sessão do cookie. A ACL nunca corria.
    expect(res.status).toBe(403);
    expect(getToken).toHaveBeenCalled();
  });

  it('worker sem sessão continua a passar pela chave, como sempre passou', async () => {
    getToken.mockResolvedValue(null);

    const res = await run(
      request('/api/invoices', { apiKey: 'chave-do-worker', session: false }),
    );

    expect(res.status).toBe(200);
    expect(res.headers.get('x-middleware-next')).toBe('1');
    // O marcador forjável é sempre apagado.
    expect(res.headers.get('x-api-key-validated')).toBeNull();
  });

  it('a rota que o viewer PODE ver continua a passar', async () => {
    getToken.mockResolvedValue(viewerToken());

    const res = await run(request('/api/invoices'));

    expect(res.status).toBe(200);
  });
});

describe('REAUD-B-02 — o middleware passa a ter controlo positivo', () => {
  it('token sem tokenVersion numérico é recusado (portão de revogação)', async () => {
    getToken.mockResolvedValue({ ...viewerToken(), tokenVersion: undefined });

    const res = await run(request('/api/invoices'));

    expect(res.status).not.toBe(200);
  });

  it('/api/users/me é exceção estreita: /api/users/me-outra-coisa não é', async () => {
    getToken.mockResolvedValue(viewerToken());

    const permitido = await run(request('/api/users/me'));
    const negado = await run(request('/api/users/me-outra-coisa'));

    expect(permitido.status).toBe(200);
    expect(negado.status).toBe(403);
  });
});
