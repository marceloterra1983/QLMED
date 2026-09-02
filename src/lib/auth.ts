import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { createHash } from 'crypto';
import { authOptions } from '@/lib/auth-options';
import prisma from '@/lib/prisma';
import { createLogger } from '@/lib/logger';
import { effectiveApiKeyScopes } from '@/lib/api-key-scopes';

const log = createLogger('auth');

function hashApiKey(raw: string): string {
  return createHash('sha256').update(raw, 'utf8').digest('hex');
}

export interface ApiKeyContext {
  keyId: string;
  userId: string;
  scopes: string[];
}

/**
 * Resolves an incoming request's x-api-key header to a full ApiKey context
 * (keyId + creator userId + scopes) so callers can attribute audit events
 * and enforce per-scope authorization. Returns null when no valid key was
 * presented.
 *
 * Order of resolution:
 * 1. Re-read the header (middleware sets `x-api-key-validated: 1` on success,
 *    but we always re-check here so header-spoofing alone can't authorize).
 * 2. SHA-256 hash the key and look up an active `ApiKey` row. Updates
 *    `lastUsedAt` fire-and-forget.
 *
 * There is no env-var fallback: a key that is not a live, non-revoked `ApiKey`
 * row authorizes nothing.
 */
export async function getApiKeyContext(): Promise<ApiKeyContext | null> {
  let rawKey: string | null = null;
  try {
    const h = await headers();
    rawKey = h.get('x-api-key');
  } catch {
    return null;
  }
  if (!rawKey) return null;

  const hash = hashApiKey(rawKey);

  // Primary path: DB-backed scoped key lookup (by hash).
  try {
    const row = await prisma.apiKey.findUnique({
      where: { keyHash: hash },
      select: {
        id: true,
        createdById: true,
        scopes: true,
        revokedAt: true,
        createdBy: { select: { role: true, status: true } },
      },
    });
    if (row && !row.revokedAt) {
      const scopes = effectiveApiKeyScopes(row.scopes, row.createdBy.role, row.createdBy.status);
      if (scopes.length === 0) return null;
      prisma.apiKey
        .update({ where: { id: row.id }, data: { lastUsedAt: new Date() } })
        .catch((err) => log.warn({ err, keyId: row.id }, 'ApiKey lastUsedAt update failed'));
      return { keyId: row.id, userId: row.createdById, scopes };
    }
  } catch (err) {
    log.error({ err }, 'ApiKey lookup failed');
  }

  return null;
}

export async function requireApiKeyScope(scope: string): Promise<ApiKeyContext> {
  const apiCtx = await getApiKeyContext();
  if (!apiCtx) throw new Error('NOT_AUTHENTICATED');
  if (!apiCtx.scopes.includes(scope) && !apiCtx.scopes.includes('admin')) {
    throw new Error('FORBIDDEN');
  }
  prisma.accessLog
    .create({ data: { userId: apiCtx.userId, action: 'api_key_used', path: `keyId=${apiCtx.keyId};scope=${scope}` } })
    .catch((err) => log.warn({ err, scope }, 'AccessLog scoped api_key_used write failed'));
  return apiCtx;
}

const ROLE_HIERARCHY: Record<string, number> = {
  admin: 3,
  editor: 2,
  viewer: 1,
};

export async function requireAuth(options: { apiKeyScope?: string } = {}): Promise<string> {
  // API keys must be explicitly allowed by the route. This prevents a
  // narrowly-scoped integration key from inheriting generic session access.
  const apiCtx = await getApiKeyContext();
  if (apiCtx) {
    const requiredScope = options.apiKeyScope || 'admin';
    if (!apiCtx.scopes.includes(requiredScope) && !apiCtx.scopes.includes('admin')) {
      throw new Error('FORBIDDEN');
    }
    prisma.accessLog
      .create({ data: { userId: apiCtx.userId, action: 'api_key_used', path: `keyId=${apiCtx.keyId};scope=${requiredScope}` } })
      .catch((err) => log.warn({ err }, 'AccessLog api_key_used write failed'));
    return apiCtx.userId;
  }

  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) {
    throw new Error('NOT_AUTHENTICATED');
  }
  // Verify user is still active AND the session's tokenVersion matches the
  // DB — a mismatch means the user (or an admin) revoked this session via
  // /api/auth/logout or a role/status change. Reject without exposing which.
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { status: true, tokenVersion: true },
  });
  if (!user || user.status !== 'active') {
    throw new Error('NOT_AUTHENTICATED');
  }
  const sessionVersion = typeof session?.user?.tokenVersion === 'number' ? session.user.tokenVersion : 0;
  if (sessionVersion !== user.tokenVersion) {
    throw new Error('NOT_AUTHENTICATED');
  }
  return userId;
}

export async function requireRole(
  minRole: 'viewer' | 'editor' | 'admin',
  options: { apiKeyScope?: string } = {},
): Promise<{ userId: string; role: string }> {
  // API key auth — scopes decide. `admin` cobre tudo. Uma rota pode nomear o
  // escopo que a satisfaz (`apiKeyScope`): a chave que o tem cumpre `minRole`
  // sem precisar de `admin`. Sem a opção, só `admin` passa de viewer — foi
  // por isso que o sync de CT-e ficou com uma chave admin para chegar a um
  // `requireEditor` (auditoria b177b07, pós-deploy).
  const apiCtx = await getApiKeyContext();
  if (apiCtx) {
    const scoped = Boolean(options.apiKeyScope && apiCtx.scopes.includes(options.apiKeyScope));
    const effectiveRole = apiCtx.scopes.includes('admin') ? 'admin' : scoped ? minRole : 'viewer';
    const actualLevel = ROLE_HIERARCHY[effectiveRole] ?? 0;
    const requiredLevel = ROLE_HIERARCHY[minRole] ?? 0;
    if (actualLevel < requiredLevel) {
      throw new Error('FORBIDDEN');
    }
    const usedScope = scoped ? options.apiKeyScope : 'admin';
    prisma.accessLog
      .create({ data: { userId: apiCtx.userId, action: 'api_key_used', path: `keyId=${apiCtx.keyId};scope=${usedScope}` } })
      .catch((err) => log.warn({ err }, 'AccessLog api_key_used write failed'));
    return { userId: apiCtx.userId, role: effectiveRole };
  }

  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  const role = session?.user?.role;
  if (!userId || !role) {
    throw new Error('NOT_AUTHENTICATED');
  }
  // Verify user is still active AND the session's tokenVersion matches the DB.
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, status: true, tokenVersion: true },
  });
  if (!user || user.status !== 'active') {
    throw new Error('NOT_AUTHENTICATED');
  }
  const sessionVersion = typeof session?.user?.tokenVersion === 'number' ? session.user.tokenVersion : 0;
  if (sessionVersion !== user.tokenVersion) {
    throw new Error('NOT_AUTHENTICATED');
  }
  const actualLevel = ROLE_HIERARCHY[user.role] ?? 0;
  const requiredLevel = ROLE_HIERARCHY[minRole] ?? 0;
  if (actualLevel < requiredLevel) {
    prisma.accessLog
      .create({ data: { userId, action: 'permission_denied', path: `required=${minRole}` } })
      .catch((err) => log.warn({ err }, 'AccessLog permission_denied write failed'));
    throw new Error('FORBIDDEN');
  }
  return { userId, role: user.role };
}

export async function requireSessionRole(
  minRole: 'viewer' | 'editor' | 'admin',
): Promise<{ userId: string; role: string }> {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  const role = session?.user?.role;
  if (!userId || !role) {
    throw new Error('NOT_AUTHENTICATED');
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, status: true, tokenVersion: true },
  });
  if (!user || user.status !== 'active') {
    throw new Error('NOT_AUTHENTICATED');
  }
  const sessionVersion =
    typeof session.user.tokenVersion === 'number' ? session.user.tokenVersion : 0;
  if (sessionVersion !== user.tokenVersion) {
    throw new Error('NOT_AUTHENTICATED');
  }

  const actualLevel = ROLE_HIERARCHY[user.role] ?? 0;
  const requiredLevel = ROLE_HIERARCHY[minRole] ?? 0;
  if (actualLevel < requiredLevel) {
    prisma.accessLog
      .create({
        data: {
          userId,
          action: 'permission_denied',
          path: `required=session:${minRole}`,
        },
      })
      .catch((err) => log.warn({ err }, 'AccessLog permission_denied write failed'));
    throw new Error('FORBIDDEN');
  }
  return { userId, role: user.role };
}

export async function requireEditor(options: { apiKeyScope?: string } = {}): Promise<{ userId: string; role: string }> {
  return requireRole('editor', options);
}

export async function requireAdmin(options: { apiKeyScope?: string } = {}): Promise<{ userId: string; role: string }> {
  return requireRole('admin', options);
}

export async function requireSessionAdmin(): Promise<{ userId: string; role: string }> {
  return requireSessionRole('admin');
}

export function unauthorizedResponse() {
  return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
}

export function forbiddenResponse() {
  return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
}

/**
 * Utility for admin flows that need to invalidate all outstanding sessions
 * for a user (logout-everywhere, role demotion, status change). Bumps
 * tokenVersion so the next JWT refresh fails the check in requireAuth.
 */
export async function revokeUserSessions(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { tokenVersion: { increment: 1 } },
  });
}
