import { NextResponse } from 'next/server';
import { forbiddenResponse, requireAuth, unauthorizedResponse } from '@/lib/auth';
import { canAccessPage } from '@/lib/navigation';
import { getSingleCompany } from '@/lib/single-company';
import prisma from '@/lib/prisma';
import { DOCUMENTOS_PAGE_PATH } from './constants';

export function canWriteDocumentos(role: string): boolean {
  return role === 'admin' || role === 'editor';
}

export type DocumentosAccess =
  | { ok: true; userId: string; role: string; companyId: string }
  | { ok: false; response: NextResponse };

export async function requireDocumentosPage(): Promise<DocumentosAccess> {
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
  if (!canAccessPage(user.role, user.allowedPages, DOCUMENTOS_PAGE_PATH)) {
    return { ok: false, response: forbiddenResponse() };
  }

  const company = await getSingleCompany();
  if (!company) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Empresa não encontrada' }, { status: 404 }),
    };
  }

  return {
    ok: true,
    userId,
    role: user.role,
    companyId: company.id,
  };
}
