import { describe, expect, it, vi, beforeEach } from 'vitest';

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
});
