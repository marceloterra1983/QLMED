import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  apiKeyFindUnique: vi.fn(),
  apiKeyUpdate: vi.fn(),
  userFindFirst: vi.fn(),
  headers: vi.fn(),
}));

vi.mock('next/headers', () => ({ headers: mocks.headers }));
vi.mock('next-auth', () => ({ getServerSession: vi.fn() }));
vi.mock('@/lib/auth-options', () => ({ authOptions: {} }));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn() }),
}));
vi.mock('@/lib/prisma', () => {
  const mockPrisma = {
    apiKey: { findUnique: mocks.apiKeyFindUnique, update: mocks.apiKeyUpdate },
    accessLog: { create: vi.fn().mockResolvedValue({}) },
    user: { findFirst: mocks.userFindFirst, findUnique: vi.fn() },
  };
  return { default: mockPrisma, prisma: mockPrisma };
});

import {
  ALL_PAGES,
  canAccessApi,
  canAccessPage,
  isUngatedApi,
  resolvePanelPagePath,
} from '../navigation';

/**
 * AUTH-005 / AUTH-006 e os dois fail-open de prefixo não mapeado.
 *
 * O regime anterior era fail-open em três lugares independentes:
 *   1. `allowedPages` vazia significava "utilizador legado, libera tudo";
 *   2. prefixo de API sem entrada no mapa significava "não é page-gated";
 *   3. caminho de painel sem entrada em PAGE_GROUPS fazia o middleware pular
 *      a verificação inteira;
 * e o `QLMED_API_KEY` do ambiente concedia escopo `admin` sem linha em `ApiKey`.
 */

describe('AUTH-005 — allowedPages vazia nega tudo', () => {
  it('nega páginas para lista vazia ou ausente', () => {
    expect(canAccessPage('viewer', [], '/fiscal/dashboard')).toBe(false);
    expect(canAccessPage('viewer', undefined, '/fiscal/dashboard')).toBe(false);
    expect(canAccessPage('editor', [], '/financeiro/contas-pagar')).toBe(false);
  });

  it('nega APIs page-gated para lista vazia ou ausente', () => {
    expect(canAccessApi('viewer', [], '/api/invoices')).toBe(false);
    expect(canAccessApi('viewer', undefined, '/api/financeiro/contas-pagar')).toBe(false);
    expect(canAccessApi('editor', [], '/api/users')).toBe(false);
  });

  it('mantém o admin isento e a concessão explícita a funcionar', () => {
    expect(canAccessPage('admin', [], '/sistema/usuarios')).toBe(true);
    expect(canAccessApi('admin', [], '/api/users')).toBe(true);
    expect(canAccessApi('viewer', ['/fiscal/invoices'], '/api/invoices/123')).toBe(true);
  });

  it('deixa o próprio perfil acessível: sem isso o utilizador perde /api/users/me', () => {
    // /api/users é gated por /sistema/usuarios (admin). Sem a isenção, um viewer
    // não lia nem gravava as próprias preferências nem o push do seu aparelho.
    expect(isUngatedApi('/api/users/me')).toBe(true);
    expect(canAccessApi('viewer', [], '/api/users/me/notification-preferences')).toBe(true);
    expect(canAccessApi('viewer', [], '/api/users/me/push-subscription')).toBe(true);
    expect(canAccessApi('viewer', ['/fiscal/invoices'], '/api/health')).toBe(true);
    expect(canAccessApi('viewer', ['/fiscal/invoices'], '/api/auth/session')).toBe(true);
  });

  it('a isenção do próprio perfil não vaza para a listagem de utilizadores', () => {
    expect(isUngatedApi('/api/users')).toBe(false);
    expect(isUngatedApi('/api/users/mextra')).toBe(false);
    expect(canAccessApi('viewer', ['/fiscal/invoices'], '/api/users')).toBe(false);
    expect(canAccessApi('viewer', ['/fiscal/invoices'], '/api/users/abc123')).toBe(false);
  });
});

describe('prefixo de API não mapeado nega', () => {
  it.each([
    '/api/admin/api-keys',
    '/api/notification-clicks',
    '/api/notifications/outbox/claim',
    '/api/webhooks/n8n',
    '/api/rota-que-alguem-vai-criar-amanha',
  ])('nega %s para um não-admin com páginas concedidas', (apiPath) => {
    expect(canAccessApi('viewer', ['/fiscal/invoices', '/sistema/settings'], apiPath)).toBe(false);
    expect(canAccessApi('editor', ALL_PAGES.map((p) => p.path), apiPath)).toBe(false);
  });

  it('/api/integrations passou a ser gated por /sistema/settings', () => {
    expect(canAccessApi('viewer', ['/sistema/settings'], '/api/integrations/n8n/status')).toBe(true);
    expect(canAccessApi('viewer', ['/fiscal/invoices'], '/api/integrations/n8n/status')).toBe(false);
  });

  // AUTH-014, o caso exacto do brief: GET n8n/config só tem `requireAuth`, então
  // qualquer sessão activa lia a configuração da integração.
  it('viewer fiscal-only não alcança GET /api/integrations/n8n/config', () => {
    expect(canAccessApi('viewer', ['/fiscal/invoices'], '/api/integrations/n8n/config')).toBe(false);
  });
});

// AUTH-013 — só aparece DEPOIS de fechar o AUTH-005: enquanto `[]` liberava
// tudo, o gate grosso de `/api/users` estava mascarado.
describe('AUTH-013 — /api/users/me antes do prefixo grosso /api/users', () => {
  it('viewer só com /fiscal/invoices continua a gerir as próprias preferências', () => {
    expect(
      canAccessApi('viewer', ['/fiscal/invoices'], '/api/users/me/notification-preferences'),
    ).toBe(true);
    expect(canAccessApi('viewer', ['/fiscal/invoices'], '/api/users/me/push-subscription')).toBe(true);
  });

  it('e continua sem alcançar a administração de utilizadores', () => {
    expect(canAccessApi('viewer', ['/fiscal/invoices'], '/api/users')).toBe(false);
    expect(canAccessApi('viewer', ['/fiscal/invoices'], '/api/users/outro-id')).toBe(false);
  });
});

describe('página de painel não mapeada nega', () => {
  it('resolve os aliases em vez de devolver null (que virava fail-open)', () => {
    expect(resolvePanelPagePath('/cadastro/anvisa')).toBe('/cadastro/produtos');
    expect(resolvePanelPagePath('/sistema/companies')).toBe('/sistema/settings');
  });

  it('mantém as páginas canónicas e as suas sub-rotas', () => {
    expect(resolvePanelPagePath('/fiscal/issued/nova')).toBe('/fiscal/issued');
    expect(resolvePanelPagePath('/cadastro/clientes/detalhes')).toBe('/cadastro/clientes');
  });

  it('devolve null para caminho desconhecido — o middleware trata null como negar', () => {
    expect(resolvePanelPagePath('/sistema/pagina-nova-sem-mapa')).toBeNull();
    // e o middleware passa o pathname cru, que nunca está em allowedPages:
    expect(canAccessPage('viewer', ['/fiscal/invoices'], '/sistema/pagina-nova-sem-mapa')).toBe(false);
  });

  it('todo caminho de painel real resolve para uma página existente', () => {
    const known = new Set(ALL_PAGES.map((p) => p.path));
    for (const panelPath of ['/cadastro/anvisa', '/sistema/companies']) {
      const resolved = resolvePanelPagePath(panelPath);
      expect(resolved).not.toBeNull();
      expect(known.has(resolved as string)).toBe(true);
    }
  });
});

describe('AUTH-006 — QLMED_API_KEY do ambiente não concede mais escopo admin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.QLMED_API_KEY = 'legacy-env-key-value';
    mocks.headers.mockResolvedValue({
      get: (name: string) => (name === 'x-api-key' ? 'legacy-env-key-value' : null),
    });
    // Nenhuma linha em ApiKey casa este valor — só o env casava.
    mocks.apiKeyFindUnique.mockResolvedValue(null);
    mocks.userFindFirst.mockResolvedValue({ id: 'admin-1' });
  });

  it('a chave do ambiente não resolve contexto nenhum', async () => {
    const { getApiKeyContext } = await import('@/lib/auth');
    await expect(getApiKeyContext()).resolves.toBeNull();
  });

  it('não procura um admin no banco para lhe emprestar a identidade', async () => {
    const { getApiKeyContext } = await import('@/lib/auth');
    await getApiKeyContext();
    expect(mocks.userFindFirst).not.toHaveBeenCalled();
  });

  it('requireApiKeyScope recusa a chave do ambiente', async () => {
    const { requireApiKeyScope } = await import('@/lib/auth');
    await expect(requireApiKeyScope('notifications:dispatch')).rejects.toThrow('NOT_AUTHENTICATED');
  });
});
