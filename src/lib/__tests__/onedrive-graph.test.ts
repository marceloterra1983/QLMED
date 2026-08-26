import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  normalizeOneDrivePath,
  oneDriveGraphJsonRequest,
} from '@/lib/onedrive-graph';

describe('OneDrive Graph transport', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('normalizes paths and returns JSON from Graph', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 'item-1' }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    expect(normalizeOneDrivePath('\\BACKUP\\NFE')).toBe('/BACKUP/NFE');
    await expect(oneDriveGraphJsonRequest<{ id: string }>('token', '/me')).resolves.toEqual({ id: 'item-1' });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://graph.microsoft.com/v1.0/me',
      expect.objectContaining({ headers: { Authorization: 'Bearer token', Accept: 'application/json' } }),
    );
  });

  it('allows callers to treat a missing Graph item as absent', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 404 })));

    await expect(oneDriveGraphJsonRequest('token', '/missing', { allowNotFound: true })).resolves.toBeNull();
    await expect(oneDriveGraphJsonRequest('token', '/missing')).rejects.toThrow('Falha na API do OneDrive');
  });
});
