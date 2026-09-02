import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * AUTH-007. A versão anterior deste teste casava o regex contra o TEXTO INTEIRO
 * do ficheiro. Isso aprovava dois buracos reais:
 *
 *  1. um `requireAuth(` dentro de comentário ou de código morto;
 *  2. um ficheiro com `GET` guardado e `POST` sem guarda nenhuma — basta um
 *     handler citar o guarda para o ficheiro todo passar.
 *
 * Agora: comentários são removidos primeiro, e cada handler HTTP exportado é
 * verificado no SEU corpo. Guardas alcançadas por um auxiliar do próprio módulo
 * (padrão `sessionUserId()` em users/me/*) contam, resolvendo essa indirecção.
 */

const PUBLIC_OR_DISABLED_ROUTES = new Set([
  'src/app/api/auth/[...nextauth]/route.ts',
  'src/app/api/register/route.ts',
]);

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] as const;

const GUARD_NAMES = [
  'requireAuth',
  'requireRole',
  'requireEditor',
  'requireAdmin',
  'requireSessionRole',
  'requireSessionAdmin',
  'requireApiKeyScope',
  'validateApiKey',
  'getServerSession',
  'getApiKeyContext',
];

function collectRouteFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];

  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = path.join(dir, entry);
    if (statSync(fullPath).isDirectory()) {
      files.push(...collectRouteFiles(fullPath));
    } else if (entry === 'route.ts') {
      files.push(fullPath);
    }
  }
  return files;
}

/** Remove comentários de bloco e de linha, para que uma guarda comentada não conte. */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}

function guardRegex(names: string[]): RegExp {
  return new RegExp(`\\b(?:${names.join('|')})\\s*\\(`);
}

/**
 * Devolve o corpo `{...}` da função que começa em `signatureStart`, saltando a
 * lista de parâmetros — `{ params }` desestruturado tem chavetas que não são o
 * corpo e enganam um contador ingénuo.
 */
function functionBody(source: string, signatureStart: number): string {
  let parens = 0;
  let i = signatureStart;
  for (; i < source.length; i++) {
    if (source[i] === '(') parens++;
    else if (source[i] === ')') {
      parens--;
      if (parens === 0) {
        i++;
        break;
      }
    }
  }
  const open = source.indexOf('{', i);
  if (open < 0) return '';
  let depth = 0;
  for (let j = open; j < source.length; j++) {
    if (source[j] === '{') depth++;
    else if (source[j] === '}') {
      depth--;
      if (depth === 0) return source.slice(open, j + 1);
    }
  }
  return source.slice(open);
}

/**
 * Nomes de auxiliares declarados no próprio módulo que chamam uma guarda.
 * Iterado até estabilizar, para cobrir auxiliar que chama auxiliar.
 */
function localGuardNames(source: string): string[] {
  const names = [...GUARD_NAMES];
  for (let pass = 0; pass < 3; pass++) {
    const guard = guardRegex(names);
    let grew = false;
    const decl = /(?:^|\n)\s*(?:export\s+)?(?:async\s+)?function\s+([A-Za-z0-9_$]+)\s*\(/g;
    let match: RegExpExecArray | null;
    while ((match = decl.exec(source))) {
      const name = match[1];
      if (names.includes(name)) continue;
      if (guard.test(functionBody(source, match.index))) {
        names.push(name);
        grew = true;
      }
    }
    if (!grew) break;
  }
  return names;
}

function unguardedHandlers(relPath: string, rawSource: string): string[] {
  const source = stripComments(rawSource);
  const guard = guardRegex(localGuardNames(source));
  const missing: string[] = [];

  for (const method of HTTP_METHODS) {
    const decl = new RegExp(`export\\s+(?:async\\s+)?function\\s+${method}\\s*\\(`, 'g');
    let match: RegExpExecArray | null;
    while ((match = decl.exec(source))) {
      if (!guard.test(functionBody(source, match.index))) {
        missing.push(`${relPath}#${method}`);
      }
    }
  }
  return missing;
}

describe('API route guards', () => {
  const root = process.cwd();
  const routeFiles = collectRouteFiles(path.join(root, 'src/app/api'))
    .map((file) => path.relative(root, file).replaceAll(path.sep, '/'))
    .filter((file) => !PUBLIC_OR_DISABLED_ROUTES.has(file));

  it('guards EVERY exported HTTP handler, not just the file as a whole', () => {
    const unguarded = routeFiles.flatMap((file) =>
      unguardedHandlers(file, readFileSync(path.join(root, file), 'utf8')),
    );

    expect(unguarded).toEqual([]);
  });

  it('actually inspects handlers (a route set that is not empty)', () => {
    expect(routeFiles.length).toBeGreaterThan(100);
  });

  describe('the detector itself', () => {
    it('rejects a guard that only exists inside a comment', () => {
      const source = [
        "import { requireAdmin } from '@/lib/auth';",
        'export async function GET() {',
        '  // await requireAdmin();',
        '  return Response.json({ ok: true });',
        '}',
      ].join('\n');
      expect(unguardedHandlers('fake/route.ts', source)).toEqual(['fake/route.ts#GET']);
    });

    it('rejects an unguarded sibling method in an otherwise guarded file', () => {
      const source = [
        'export async function GET() {',
        '  await requireAdmin();',
        '  return Response.json({ ok: true });',
        '}',
        'export async function POST() {',
        '  return Response.json({ ok: true });',
        '}',
      ].join('\n');
      expect(unguardedHandlers('fake/route.ts', source)).toEqual(['fake/route.ts#POST']);
    });

    it('accepts a guard reached through a module-local helper', () => {
      const source = [
        'async function sessionUserId() {',
        "  const { userId } = await requireSessionRole('viewer');",
        '  return userId;',
        '}',
        'export async function GET() {',
        '  const userId = await sessionUserId();',
        '  return Response.json({ userId });',
        '}',
      ].join('\n');
      expect(unguardedHandlers('fake/route.ts', source)).toEqual([]);
    });

    it('is not fooled by a destructured params argument', () => {
      const source = [
        'export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {',
        '  await requireAdmin();',
        '  return Response.json(await params);',
        '}',
      ].join('\n');
      expect(unguardedHandlers('fake/route.ts', source)).toEqual([]);
    });
  });
});
