import path from 'path';
import type { Stats } from 'fs';

export function resolveConfiguredDir(input: string): string {
  const windowsPath = input.match(/^([a-zA-Z]):[\\/](.*)$/);
  if (windowsPath && process.platform !== 'win32') {
    const drive = windowsPath[1].toLowerCase();
    const rest = windowsPath[2].replace(/\\/g, '/');
    return path.posix.normalize(`/mnt/${drive}/${rest}`);
  }

  return path.resolve(input);
}

export function isXmlFile(filePath: string): boolean {
  return filePath.toLowerCase().endsWith('.xml');
}

export function isPdfFile(filePath: string): boolean {
  return filePath.toLowerCase().endsWith('.pdf');
}

export function shouldIgnoreByPath(targetPath: string, stats?: Stats): boolean {
  if (stats?.isDirectory()) return false;
  return !isXmlFile(targetPath);
}

export function getErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return undefined;
  if (!('code' in error)) return undefined;
  const value = (error as { code?: unknown }).code;
  return typeof value === 'string' ? value : undefined;
}

export function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

export function getDelayUntilNextHalfHourMs(nowDate = new Date()): number {
  const next = new Date(nowDate.getTime());

  if (nowDate.getMinutes() < 30) {
    next.setMinutes(30, 0, 0);
  } else {
    next.setHours(next.getHours() + 1, 0, 0, 0);
  }

  return Math.max(0, next.getTime() - nowDate.getTime());
}

export function extractAccessKeyFromFilePath(filePath: string): string | null {
  const fileName = path.basename(filePath);
  const match = fileName.match(/(\d{44})/);
  return match?.[1] || null;
}

export function normalizeOneDrivePath(rawPath: string): string {
  const trimmed = rawPath.trim().replace(/\\/g, '/');
  if (!trimmed) return '/';
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}
