import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  bindOneDriveAccessTokenRefresh,
  resetOneDriveAuthBindingsForTests,
} from '@/lib/onedrive-auth';
import {
  ONEDRIVE_RECONNECT_MESSAGE,
  normalizeOneDrivePath,
  oneDriveGraphJsonRequest,
} from '@/lib/onedrive-graph';

function authorizationOf(init: RequestInit | undefined): string | null {
  return new Headers(init?.headers).get('Authorization');
}

describe('OneDrive Graph transport', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetOneDriveAuthBindingsForTests();
  });

  it('normalizes paths and returns JSON from Graph', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 'item-1' }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    expect(normalizeOneDrivePath('\\BACKUP\\NFE')).toBe('/BACKUP/NFE');
    await expect(oneDriveGraphJsonRequest<{ id: string }>('token', '/me')).resolves.toEqual({ id: 'item-1' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://graph.microsoft.com/v1.0/me');
    expect(authorizationOf(fetchMock.mock.calls[0]?.[1] as RequestInit)).toBe('Bearer token');
  });

  it('allows callers to treat a missing Graph item as absent', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 404 })));

    await expect(oneDriveGraphJsonRequest('token', '/missing', { allowNotFound: true })).resolves.toBeNull();
    await expect(oneDriveGraphJsonRequest('token', '/missing')).rejects.toThrow('Falha na API do OneDrive');
  });

  it('retries once after Graph 401 when a refresh is bound', async () => {
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

    const refresh = vi.fn(async () => {
      bindOneDriveAccessTokenRefresh('fresh-token', 'conn-1', async () => 'fresh-token');
      return 'fresh-token';
    });
    bindOneDriveAccessTokenRefresh('stale-token', 'conn-1', refresh);

    await expect(oneDriveGraphJsonRequest<{ id: string }>('stale-token', '/me')).resolves.toEqual({
      id: 'item-1',
    });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(authorizationOf(fetchMock.mock.calls[0]?.[1] as RequestInit)).toBe('Bearer stale-token');
    expect(authorizationOf(fetchMock.mock.calls[1]?.[1] as RequestInit)).toBe('Bearer fresh-token');
  });

  it('does not loop on Graph 401 without a bound refresh', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: { code: 'InvalidAuthenticationToken', message: 'Lifetime validation failed, the token is expired.' },
        }),
        { status: 401 },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(oneDriveGraphJsonRequest('stale-token', '/me')).rejects.toThrow(ONEDRIVE_RECONNECT_MESSAGE);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('reuses the refreshed token on later Graph calls without another IdP refresh', async () => {
    const expired = {
      error: {
        code: 'InvalidAuthenticationToken',
        message: 'Lifetime validation failed, the token is expired.',
      },
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(expired), { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'item-1' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'item-2' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const refresh = vi.fn(async () => {
      bindOneDriveAccessTokenRefresh('fresh-token', 'conn-1', async () => 'fresh-token');
      return 'fresh-token';
    });
    bindOneDriveAccessTokenRefresh('stale-token', 'conn-1', refresh);

    await expect(oneDriveGraphJsonRequest<{ id: string }>('stale-token', '/me')).resolves.toEqual({
      id: 'item-1',
    });
    await expect(oneDriveGraphJsonRequest<{ id: string }>('stale-token', '/drive')).resolves.toEqual({
      id: 'item-2',
    });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(authorizationOf(fetchMock.mock.calls[2]?.[1] as RequestInit)).toBe('Bearer fresh-token');
  });
});
