import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { API_KEY_SCOPES } from '@/lib/api-key-scopes';

/**
 * POST /api/admin/api-keys valida os escopos com z.enum(API_KEY_SCOPES). Um
 * escopo que uma rota exige mas que não está na lista não pode ser emitido pela
 * tela — a integração só passa usando uma chave 'admin', que é o oposto de
 * menor privilégio. Foi assim que notifications:dispatch e notifications:assets
 * ficaram inalcançáveis.
 */
const SCOPE_CALL = /(?:requireApiKeyScope\(|apiKeyScope:\s*)'([^']+)'/g;

function collectRouteFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = path.join(dir, entry);
    if (statSync(fullPath).isDirectory()) files.push(...collectRouteFiles(fullPath));
    else if (entry === 'route.ts') files.push(fullPath);
  }
  return files;
}

describe('API key scopes required by routes', () => {
  it('are all mintable through POST /api/admin/api-keys', () => {
    const known = new Set<string>(API_KEY_SCOPES);
    const unmintable = new Map<string, string[]>();

    for (const file of collectRouteFiles(path.join(process.cwd(), 'src/app/api'))) {
      const source = readFileSync(file, 'utf8');
      for (const [, scope] of source.matchAll(SCOPE_CALL)) {
        if (known.has(scope)) continue;
        const rel = path.relative(process.cwd(), file).replaceAll(path.sep, '/');
        unmintable.set(scope, [...(unmintable.get(scope) ?? []), rel]);
      }
    }

    expect(Object.fromEntries(unmintable)).toEqual({});
  });
});
