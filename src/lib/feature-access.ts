/**
 * feature-access.ts — Guarda profunda de autorização por página / funcionalidade.
 *
 * Consolida o ciclo canônico de RBAC:
 *   1. requireAuth() (com mapeamento de FORBIDDEN vs UNAUTHORIZED)
 *   2. Leitura do usuário no Prisma (role e allowedPages)
 *   3. canAccessPage() respeitando default-deny
 *   4. Resolução da empresa única (getOrCreateSingleCompany / getSingleCompany)
 *   5. Permissões de escrita / sincronização (canSync / canWrite)
 *
 * Substitui os 4 módulos rasos duplicados em cassems/access.ts,
 * impcg/access.ts, unimed-cg/access.ts e documentos/access.ts.
 */

import { NextResponse } from 'next/server';
import { forbiddenResponse, requireAuth, unauthorizedResponse } from '@/lib/auth';
import { canAccessPage } from '@/lib/navigation';
import { getOrCreateSingleCompany, getSingleCompany } from '@/lib/single-company';
import prisma from '@/lib/prisma';

export interface FeatureAccessSuccess {
  ok: true;
  userId: string;
  role: string;
  canSync: boolean;
  canWrite: boolean;
  companyId: string;
}

export interface FeatureAccessFailure {
  ok: false;
  response: NextResponse;
}

export type FeatureAccess = FeatureAccessSuccess | FeatureAccessFailure;

export interface RequireFeatureAccessOptions {
  pagePath: string;
  writeRoles?: string[];
  useGetOrCreateCompany?: boolean;
}

export function canWriteRole(role: string, writeRoles: string[] = ['admin', 'editor']): boolean {
  return writeRoles.includes(role);
}

export async function requireFeatureAccess(
  opts: RequireFeatureAccessOptions,
): Promise<FeatureAccess> {
  const writeRoles = opts.writeRoles ?? ['admin', 'editor'];
  let userId: string;

  try {
    userId = await requireAuth();
  } catch (error) {
    if (error instanceof Error && error.message === 'FORBIDDEN') {
      return { ok: false, response: forbiddenResponse() };
    }
    return { ok: false, response: unauthorizedResponse() };
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, allowedPages: true },
  });

  if (!user) {
    return { ok: false, response: unauthorizedResponse() };
  }

  if (!canAccessPage(user.role, user.allowedPages, opts.pagePath)) {
    return { ok: false, response: forbiddenResponse() };
  }

  const company = opts.useGetOrCreateCompany !== false
    ? await getOrCreateSingleCompany(userId)
    : await getSingleCompany();

  if (!company) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Empresa não encontrada' }, { status: 404 }),
    };
  }

  const canWrite = canWriteRole(user.role, writeRoles);

  return {
    ok: true,
    userId,
    role: user.role,
    canSync: canWrite,
    canWrite,
    companyId: company.id,
  };
}
