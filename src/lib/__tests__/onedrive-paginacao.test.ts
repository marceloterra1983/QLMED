import { afterEach, describe, expect, it, vi } from 'vitest';
import { listOneDriveChildren } from '@/lib/onedrive-client';

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function items(prefix: string, count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `${prefix}-${index}`,
    name: `${prefix}-${index}.pdf`,
  }));
}

describe('listOneDriveChildren pagina via @odata.nextLink', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('200 itens + nextLink e depois 30 sem nextLink → 230', async () => {
    const page1 = items('p1', 200);
    const page2 = items('p2', 30);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          value: page1,
          '@odata.nextLink':
            'https://graph.microsoft.com/v1.0/drives/drive-1/items/folder-1/children?$skiptoken=page2',
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ value: page2 }));
    vi.stubGlobal('fetch', fetchMock);

    const listed = await listOneDriveChildren('token', 'drive-1', 'folder-1');

    expect(listed).toHaveLength(230);
    expect(listed[0]?.id).toBe('p1-0');
    expect(listed[199]?.id).toBe('p1-199');
    expect(listed[200]?.id).toBe('p2-0');
    expect(listed[229]?.id).toBe('p2-29');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
