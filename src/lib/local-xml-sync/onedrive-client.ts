import { promises as fs } from 'fs';
import path from 'path';

import type { OneDriveItemEntry, OneDriveChildrenResponse } from './sync-types';
import { isXmlFile, isPdfFile, normalizeOneDrivePath } from './sync-utils';

export async function oneDriveGraphJsonRequest<T>(accessToken: string, resourcePath: string): Promise<T> {
  const endpoint = resourcePath.startsWith('http')
    ? resourcePath
    : `https://graph.microsoft.com/v1.0${resourcePath}`;

  const response = await fetch(endpoint, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
    cache: 'no-store',
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = payload && typeof payload === 'object'
      ? JSON.stringify(payload).slice(0, 300)
      : `${response.status} ${response.statusText}`;
    throw new Error(`Falha na API do OneDrive: ${detail}`);
  }

  return payload as T;
}

export async function oneDriveGraphDownloadFile(accessToken: string, resourcePath: string): Promise<Buffer> {
  const endpoint = resourcePath.startsWith('http')
    ? resourcePath
    : `https://graph.microsoft.com/v1.0${resourcePath}`;

  const response = await fetch(endpoint, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => `${response.status} ${response.statusText}`);
    throw new Error(`Falha ao baixar arquivo do OneDrive: ${detail.slice(0, 300)}`);
  }

  const data = await response.arrayBuffer();
  return Buffer.from(data);
}

export async function listOneDriveChildrenAll(
  accessToken: string,
  driveId: string,
  itemId: string,
): Promise<OneDriveItemEntry[]> {
  const encodedDriveId = encodeURIComponent(driveId);
  const encodedItemId = encodeURIComponent(itemId);
  const select = '$select=id,name,size,lastModifiedDateTime,folder,file';
  let nextPath: string | null = `/drives/${encodedDriveId}/items/${encodedItemId}/children?$top=200&${select}`;
  const all: OneDriveItemEntry[] = [];

  while (nextPath) {
    const response: OneDriveChildrenResponse = await oneDriveGraphJsonRequest<OneDriveChildrenResponse>(
      accessToken,
      nextPath,
    );
    const chunk = Array.isArray(response.value) ? response.value : [];
    all.push(...chunk);
    nextPath = typeof response['@odata.nextLink'] === 'string' ? response['@odata.nextLink'] : null;
  }

  return all;
}

export async function resolveOneDriveItemByPath(
  accessToken: string,
  driveId: string,
  itemPath: string,
): Promise<OneDriveItemEntry> {
  const encodedDriveId = encodeURIComponent(driveId);
  const normalizedPath = normalizeOneDrivePath(itemPath);
  return oneDriveGraphJsonRequest<OneDriveItemEntry>(
    accessToken,
    `/drives/${encodedDriveId}/root:${encodeURI(normalizedPath)}?$select=id,name,size,lastModifiedDateTime,folder,file`,
  );
}

export async function copyOneDriveFileIfNeeded(
  accessToken: string,
  driveId: string,
  oneDriveItem: OneDriveItemEntry,
  targetFilePath: string,
): Promise<boolean> {
  if (!oneDriveItem.file) return false;

  const remoteSize = typeof oneDriveItem.size === 'number' ? oneDriveItem.size : null;
  const remoteMtimeMs = oneDriveItem.lastModifiedDateTime
    ? Date.parse(oneDriveItem.lastModifiedDateTime)
    : Number.NaN;

  let shouldDownload = true;
  try {
    const targetStats = await fs.stat(targetFilePath);
    const sameSize = remoteSize !== null ? targetStats.size === remoteSize : false;
    const targetMtimeMs = Math.floor(targetStats.mtimeMs);
    const remoteMtimeRounded = Number.isFinite(remoteMtimeMs) ? Math.floor(remoteMtimeMs) : null;
    if (sameSize && (remoteMtimeRounded === null || targetMtimeMs >= remoteMtimeRounded)) {
      shouldDownload = false;
    }
  } catch {
    // Destino ainda nao existe.
  }

  if (!shouldDownload) return false;

  const encodedDriveId = encodeURIComponent(driveId);
  const encodedItemId = encodeURIComponent(oneDriveItem.id);
  const buffer = await oneDriveGraphDownloadFile(
    accessToken,
    `/drives/${encodedDriveId}/items/${encodedItemId}/content`,
  );

  await fs.mkdir(path.dirname(targetFilePath), { recursive: true });
  await fs.writeFile(targetFilePath, buffer);

  if (Number.isFinite(remoteMtimeMs)) {
    const mtime = new Date(remoteMtimeMs);
    try {
      await fs.utimes(targetFilePath, mtime, mtime);
    } catch {
      // Alguns filesystems podem nao permitir ajuste de mtime.
    }
  }

  return true;
}

export async function copyOneDriveXmlFileIfNeeded(
  accessToken: string,
  driveId: string,
  oneDriveItem: OneDriveItemEntry,
  targetFilePath: string,
): Promise<boolean> {
  if (!isXmlFile(oneDriveItem.name || '')) return false;
  return copyOneDriveFileIfNeeded(accessToken, driveId, oneDriveItem, targetFilePath);
}

export async function copyOneDrivePdfFileIfNeeded(
  accessToken: string,
  driveId: string,
  oneDriveItem: OneDriveItemEntry,
  targetFilePath: string,
): Promise<boolean> {
  if (!isPdfFile(oneDriveItem.name || '')) return false;
  return copyOneDriveFileIfNeeded(accessToken, driveId, oneDriveItem, targetFilePath);
}
