import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { authOptions } from '@/lib/auth-options';
import prisma from '@/lib/prisma';

function isValidApiKey(): boolean {
  try {
    const h = headers();
    // Check direct api-key header or middleware-validated flag
    const validated = h.get('x-api-key-validated');
    if (validated === '1') return true;
    const key = h.get('x-api-key');
    const expected = process.env.QLMED_API_KEY;
    return !!key && !!expected && key === expected;
  } catch {
    return false;
  }
}

async function getApiKeyUserId(): Promise<string | null> {
  if (!isValidApiKey()) return null;
  const admin = await prisma.user.findFirst({
    where: { role: 'admin', status: 'active' },
    select: { id: true },
  });
  return admin?.id ?? null;
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
  const apiUserId = await getApiKeyUserId();
  if (apiUserId) return apiUserId;

  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) {
    throw new Error('NOT_AUTHENTICATED');
  }
  // Verify user is still active in DB
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { status: true },
  });
  if (!user || user.status !== 'active') {
    throw new Error('NOT_AUTHENTICATED');
  }
  return userId;
}

export async function requireRole(minRole: 'viewer' | 'editor' | 'admin'): Promise<{ userId: string; role: string }> {
  // API key auth — treated as admin
  const apiUserId = await getApiKeyUserId();
  if (apiUserId) return { userId: apiUserId, role: 'admin' };

  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  const role = session?.user?.role;
  if (!userId || !role) {
    throw new Error('NOT_AUTHENTICATED');
  }
  // Verify user is still active in DB
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, status: true },
  });
  if (!user || user.status !== 'active') {
    throw new Error('NOT_AUTHENTICATED');
  }
  const actualLevel = ROLE_HIERARCHY[user.role] ?? 0;
  const requiredLevel = ROLE_HIERARCHY[minRole] ?? 0;
  if (actualLevel < requiredLevel) {
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

export function unauthorizedResponse() {
  return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
}

export function forbiddenResponse() {
  return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
}
