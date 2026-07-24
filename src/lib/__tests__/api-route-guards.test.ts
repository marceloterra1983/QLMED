import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const PUBLIC_OR_DISABLED_ROUTES = new Set([
  'src/app/api/auth/[...nextauth]/route.ts',
  'src/app/api/register/route.ts',
]);

const GUARD_PATTERN =
  /\b(requireAuth|requireRole|requireEditor|requireAdmin|requireSessionRole|requireSessionAdmin|requireApiKeyScope|validateApiKey|getServerSession|getApiKeyContext)\s*\(/;

function collectRouteFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];

  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = path.join(dir, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      files.push(...collectRouteFiles(fullPath));
    } else if (entry === 'route.ts') {
      files.push(fullPath);
    }
  }
  return files;
}

describe('API route guards', () => {
  it('keeps every non-public API route behind a local auth or API-key guard', () => {
    const root = process.cwd();
    const routeFiles = collectRouteFiles(path.join(root, 'src/app/api'));

    const unguarded = routeFiles
      .map((file) => path.relative(root, file).replaceAll(path.sep, '/'))
      .filter((file) => !PUBLIC_OR_DISABLED_ROUTES.has(file))
      .filter((file) => !GUARD_PATTERN.test(readFileSync(path.join(root, file), 'utf8')));

    expect(unguarded).toEqual([]);
  });
});
