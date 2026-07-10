import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { timingSafeEqual, createHash } from 'crypto';
import { authOptions } from '@/lib/auth-options';
import prisma from '@/lib/prisma';
import { createLogger } from '@/lib/logger';
import {
  allowsApiKeyRequest,
  apiKeyRoleFromScopes,
  API_KEY_REQUEST_METHOD_HEADER,
  API_KEY_REQUEST_PATH_HEADER,
} from '@/lib/api-key-scopes';

const log = createLogger('auth');

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false;
  }
}

function hashApiKey(raw: string): string {
  return createHash('sha256').update(raw, 'utf8').digest('hex');
}

export interface ApiKeyContext {
  keyId: string;
  userId: string;
  scopes: string[];
}

type HeaderReader = { get(name: string): string | null };

function getApiRequestContextFromHeaders(h: HeaderReader) {
  const pathname = h.get(API_KEY_REQUEST_PATH_HEADER);
  const method = h.get(API_KEY_REQUEST_METHOD_HEADER);
  if (!pathname || !method) return null;
  return { pathname, method };
}

function assertApiKeyRequestAllowed(ctx: ApiKeyContext, h: HeaderReader) {
  const requestContext = getApiRequestContextFromHeaders(h);
  if (!requestContext) {
    log.warn({ keyId: ctx.keyId }, 'ApiKey rejected without route context');
    throw new Error('FORBIDDEN');
  }
  if (!allowsApiKeyRequest(ctx.scopes, requestContext.method, requestContext.pathname)) {
    log.warn({
      keyId: ctx.keyId,
      scopes: ctx.scopes,
      method: requestContext.method,
      pathname: requestContext.pathname,
    }, 'ApiKey rejected by request scope');
    throw new Error('FORBIDDEN');
  }
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
 * 3. Fallback: constant-time compare against the legacy QLMED_API_KEY env
 *    var for n8n/internal integrations. This deliberately grants only
 *    integration/editor-level access, not admin access.
 */
export async function getApiKeyContext(): Promise<ApiKeyContext | null> {
  let rawKey: string | null = null;
  let h: HeaderReader;
  try {
    h = await headers();
    rawKey = h.get('x-api-key');
  } catch {
    return null;
  }
  if (!rawKey) return null;

  const hash = hashApiKey(rawKey);

  // Primary path: DB-backed scoped key lookup (by hash).
  let row: { id: string; createdById: string; scopes: string[]; revokedAt: Date | null } | null = null;
  try {
    row = await prisma.apiKey.findUnique({
      where: { keyHash: hash },
      select: { id: true, createdById: true, scopes: true, revokedAt: true },
    });
  } catch (err) {
    log.error({ err }, 'ApiKey lookup failed');
  }
  if (row && !row.revokedAt) {
    const ctx = { keyId: row.id, userId: row.createdById, scopes: row.scopes };
    assertApiKeyRequestAllowed(ctx, h);
    prisma.apiKey
      .update({ where: { id: row.id }, data: { lastUsedAt: new Date() } })
      .catch((err) => log.warn({ err, keyId: row.id }, 'ApiKey lastUsedAt update failed'));
    return ctx;
  }

  // Legacy path: env-based compare (back-compat until integrations rotate).
  const expectedEnv = process.env.QLMED_API_KEY;
  if (expectedEnv && safeEqual(rawKey, expectedEnv)) {
    const admin = await prisma.user.findFirst({
      where: { role: 'admin', status: 'active' },
      select: { id: true },
    });
    if (admin) {
      const ctx = { keyId: 'legacy-env', userId: admin.id, scopes: ['integration'] };
      assertApiKeyRequestAllowed(ctx, h);
      return ctx;
    }
  }
  return null;
}

/**
 * Thin wrapper preserving the pre-refactor signature. Returns the user id
 * associated with a valid api key, or null. Use `getApiKeyContext()` when
 * you need keyId/scopes for audit or scope checks.
 */
export async function getApiKeyUserId(): Promise<string | null> {
  const ctx = await getApiKeyContext();
  return ctx?.userId ?? null;
}

const ROLE_HIERARCHY: Record<string, number> = {
  admin: 3,
  editor: 2,
  viewer: 1,
};

export async function getSession() {
  return await getServerSession(authOptions);
}

export async function getCurrentUser() {
  const session = await getSession();
  return session?.user;
}

export async function getAuthUserId(): Promise<string | null> {
  const session = await getServerSession(authOptions);
  return session?.user?.id ?? null;
}

export async function requireAuth(): Promise<string> {
  // API key auth (n8n / external integrations)
  const apiCtx = await getApiKeyContext();
  if (apiCtx) {
    prisma.accessLog
      .create({ data: { userId: apiCtx.userId, action: 'api_key_used', path: `keyId=${apiCtx.keyId}` } })
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

export async function requireRole(minRole: 'viewer' | 'editor' | 'admin'): Promise<{ userId: string; role: string }> {
  // API key auth — scopes decide. Legacy integration keys intentionally cap at editor.
  const apiCtx = await getApiKeyContext();
  if (apiCtx) {
    const effectiveRole = apiKeyRoleFromScopes(apiCtx.scopes);
    const actualLevel = ROLE_HIERARCHY[effectiveRole] ?? 0;
    const requiredLevel = ROLE_HIERARCHY[minRole] ?? 0;
    if (actualLevel < requiredLevel) {
      throw new Error('FORBIDDEN');
    }
    prisma.accessLog
      .create({ data: { userId: apiCtx.userId, action: 'api_key_used', path: `keyId=${apiCtx.keyId}` } })
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

export async function requireSessionRole(minRole: 'viewer' | 'editor' | 'admin'): Promise<{ userId: string; role: string }> {
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
  const sessionVersion = typeof session?.user?.tokenVersion === 'number' ? session.user.tokenVersion : 0;
  if (sessionVersion !== user.tokenVersion) {
    throw new Error('NOT_AUTHENTICATED');
  }

  const actualLevel = ROLE_HIERARCHY[user.role] ?? 0;
  const requiredLevel = ROLE_HIERARCHY[minRole] ?? 0;
  if (actualLevel < requiredLevel) {
    prisma.accessLog
      .create({ data: { userId, action: 'permission_denied', path: `required=session:${minRole}` } })
      .catch((err) => log.warn({ err }, 'AccessLog permission_denied write failed'));
    throw new Error('FORBIDDEN');
  }
  return { userId, role: user.role };
}

export async function requireEditor(): Promise<{ userId: string; role: string }> {
  return requireRole('editor');
}

export async function requireAdmin(): Promise<{ userId: string; role: string }> {
  return requireRole('admin');
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
