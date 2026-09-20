import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  update: vi.fn(),
  decrypt: vi.fn(),
  encrypt: vi.fn(),
  refreshOneDriveAccessToken: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  default: {
    oneDriveConnection: {
      findFirst: mocks.findFirst,
      update: mocks.update,
    },
  },
}));

vi.mock('@/lib/crypto', () => ({
  decrypt: mocks.decrypt,
  encrypt: mocks.encrypt,
}));

vi.mock('@/lib/onedrive-client', () => ({
  refreshOneDriveAccessToken: mocks.refreshOneDriveAccessToken,
}));

describe('onedrive-connections / resolveAccountOneDrive', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('retorna accessToken e driveId da conta encontrada', async () => {
    mocks.findFirst.mockResolvedValueOnce({
      id: 'conn-1',
      companyId: 'comp-1',
      accountEmail: 'cassems@qlmed.com.br',
      accessToken: 'enc-token',
      driveId: 'drive-cassems',
      tokenExpiresAt: new Date(Date.now() + 3600 * 1000),
    });
    mocks.decrypt.mockReturnValue('decrypted-access-token');

    const { resolveAccountOneDrive } = await import('@/lib/onedrive-connections');
    const result = await resolveAccountOneDrive('comp-1', 'cassems@qlmed.com.br');

    expect(result).toEqual({
      accessToken: 'decrypted-access-token',
      driveId: 'drive-cassems',
    });
    expect(mocks.findFirst).toHaveBeenCalledWith({
      where: { companyId: 'comp-1', accountEmail: 'cassems@qlmed.com.br' },
    });
  });

  it('faz fallback para a conexão mais recente da empresa quando a conta específica não for encontrada', async () => {
    // 1st query: with accountEmail -> returns null
    mocks.findFirst.mockResolvedValueOnce(null);
    // 2nd query: fallback by updatedAt desc -> returns generic connection
    mocks.findFirst.mockResolvedValueOnce({
      id: 'conn-fallback',
      companyId: 'comp-1',
      accountEmail: 'fallback@qlmed.com.br',
      accessToken: 'enc-token-fallback',
      driveId: 'drive-fallback',
      tokenExpiresAt: new Date(Date.now() + 3600 * 1000),
    });
    mocks.decrypt.mockReturnValue('decrypted-fallback-token');

    const { resolveAccountOneDrive } = await import('@/lib/onedrive-connections');
    const result = await resolveAccountOneDrive('comp-1', 'specific@qlmed.com.br');

    expect(result.driveId).toBe('drive-fallback');
    expect(result.accessToken).toBe('decrypted-fallback-token');
    expect(mocks.findFirst).toHaveBeenCalledTimes(2);
  });

  it('lança erro quando allowFallback é falso e a conta não existe', async () => {
    mocks.findFirst.mockResolvedValueOnce(null);

    const { resolveAccountOneDrive } = await import('@/lib/onedrive-connections');
    await expect(
      resolveAccountOneDrive('comp-1', 'faturamento@qlmed.com.br', {
        allowFallback: false,
        errorMessage: 'conta faturamento@ não conectada',
      }),
    ).rejects.toThrow('conta faturamento@ não conectada');

    expect(mocks.findFirst).toHaveBeenCalledTimes(1);
  });

  it('renova o access token quando o Graph ainda está dentro da janela local mas force=true', async () => {
    mocks.decrypt.mockImplementation((value: string) => {
      if (value === 'enc-access') return 'old-access';
      if (value === 'enc-refresh') return 'refresh-token';
      return value;
    });
    mocks.encrypt.mockImplementation((value: string) => `enc-${value}`);
    mocks.refreshOneDriveAccessToken.mockResolvedValue({
      access_token: 'new-access',
      expires_in: 3600,
      refresh_token: 'refresh-token-2',
    });
    mocks.update.mockResolvedValue({});

    const { ensureValidOneDriveAccessToken } = await import('@/lib/onedrive-connections');
    const token = await ensureValidOneDriveAccessToken({
      id: 'conn-1',
      companyId: 'comp-1',
      accessToken: 'enc-access',
      refreshToken: 'enc-refresh',
      tokenExpiresAt: new Date(Date.now() + 3600 * 1000),
      scope: 'Files.ReadWrite',
    } as never, { force: true });

    expect(token).toBe('new-access');
    expect(mocks.refreshOneDriveAccessToken).toHaveBeenCalledWith('refresh-token');
    expect(mocks.update).toHaveBeenCalledTimes(1);
  });

  it('não chama o IdP quando o token ainda tem mais de 5 minutos', async () => {
    mocks.decrypt.mockReturnValue('still-valid');

    const { ensureValidOneDriveAccessToken } = await import('@/lib/onedrive-connections');
    const token = await ensureValidOneDriveAccessToken({
      id: 'conn-1',
      companyId: 'comp-1',
      accessToken: 'enc-access',
      refreshToken: 'enc-refresh',
      tokenExpiresAt: new Date(Date.now() + 3600 * 1000),
      scope: 'Files.ReadWrite',
    } as never);

    expect(token).toBe('still-valid');
    expect(mocks.refreshOneDriveAccessToken).not.toHaveBeenCalled();
  });

  it('Graph 401 após resolveAccountOneDrive renova e conclui a chamada', async () => {
    mocks.findFirst.mockResolvedValueOnce({
      id: 'conn-1',
      companyId: 'comp-1',
      accountEmail: 'docs@qlmed.com.br',
      accessToken: 'enc-access',
      refreshToken: 'enc-refresh',
      driveId: 'drive-1',
      tokenExpiresAt: new Date(Date.now() + 3600 * 1000),
      scope: 'Files.ReadWrite',
    });
    mocks.decrypt.mockImplementation((value: string) => {
      if (value === 'enc-access') return 'stale-access';
      if (value === 'enc-refresh') return 'refresh-token';
      return value;
    });
    mocks.encrypt.mockImplementation((value: string) => `enc-${value}`);
    mocks.refreshOneDriveAccessToken.mockResolvedValue({
      access_token: 'fresh-access',
      expires_in: 3600,
      refresh_token: 'refresh-token',
    });
    mocks.update.mockResolvedValue({});

    const expired = {
      error: {
        code: 'InvalidAuthenticationToken',
        message: 'Lifetime validation failed, the token is expired.',
      },
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(expired), { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'item-1' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const { resolveAccountOneDrive } = await import('@/lib/onedrive-connections');
    const { oneDriveGraphJsonRequest } = await import('@/lib/onedrive-graph');
    const { accessToken } = await resolveAccountOneDrive('comp-1', 'docs@qlmed.com.br');
    await expect(oneDriveGraphJsonRequest<{ id: string }>(accessToken, '/me')).resolves.toEqual({
      id: 'item-1',
    });
    expect(mocks.refreshOneDriveAccessToken).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
