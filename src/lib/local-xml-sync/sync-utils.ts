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
  const match = fileName.match(/(?:^|\D)(\d{50}|\d{44})(?=\D|$)/);
  return match?.[1] || null;
}

/**
 * Junta segmentos vindos de fora (nomes de item do OneDrive) sob `baseDir`
 * sem deixar nenhum deles escapar do diretório (auditoria FILE-004).
 *
 * `path.join(base, '../../etc/cron.d/x')` resolve para fora de `base`: o nome
 * do arquivo/pasta vem do Graph, não do nosso código, então basta um item
 * renomeado no OneDrive para escrever em qualquer lugar que o processo
 * alcance. `basename` derruba tanto `..` quanto caminho absoluto; a checagem
 * final é o cinto de segurança contra separador de outra plataforma.
 */
export function safeJoinUnderDir(baseDir: string, ...segments: string[]): string | null {
  const base = path.resolve(baseDir);
  const safeSegments: string[] = [];

  for (const segment of segments) {
    const name = path.basename(String(segment ?? '').replace(/\\/g, '/').trim());
    if (!name || name === '.' || name === '..') return null;
    safeSegments.push(name);
  }

  if (safeSegments.length === 0) return null;

  const joined = path.resolve(base, ...safeSegments);
  if (joined !== base && !joined.startsWith(base + path.sep)) return null;
  return joined;
}
