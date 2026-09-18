import { promises as fs } from 'fs';
import path from 'path';

import type { OneDriveItemEntry, OneDriveChildrenResponse } from './sync-types';
import { isXmlFile, isPdfFile } from './sync-utils';
import {
  normalizeOneDrivePath,
  oneDriveGraphDownloadFile,
  oneDriveGraphJsonRequest,
} from '@/lib/onedrive-graph';

export { normalizeOneDrivePath, oneDriveGraphDownloadFile, oneDriveGraphJsonRequest } from '@/lib/onedrive-graph';

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

export function shouldDownloadRemoteFile(opts: {
  remoteSize: number | null;
  remoteMtimeMs: number;
  localSize?: number;
  localMtimeMs?: number;
}): boolean {
  if (opts.localSize === undefined || opts.localMtimeMs === undefined) return true;
  if (opts.localSize <= 0) return true;

  const sameSize = opts.remoteSize !== null ? opts.localSize === opts.remoteSize : true;
  const remoteMtimeRounded = Number.isFinite(opts.remoteMtimeMs) ? Math.floor(opts.remoteMtimeMs) : null;
  if (sameSize && (remoteMtimeRounded === null || opts.localMtimeMs >= remoteMtimeRounded)) {
    return false;
  }
  return true;
}

async function copyOneDriveFileIfNeeded(
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
    shouldDownload = shouldDownloadRemoteFile({
      remoteSize,
      remoteMtimeMs,
      localSize: targetStats.size,
      localMtimeMs: Math.floor(targetStats.mtimeMs),
    });
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
