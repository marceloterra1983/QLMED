import { NextResponse } from 'next/server';
import { requireAdmin, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { apiError } from '@/lib/api-error';

/**
 * DELETE — soft-revoke an API key (sets revokedAt). Historical AccessLog
 * entries keep referring to this id; further auth attempts with the key
 * will fail because getApiKeyContext() filters on `revokedAt: null`.
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    try {
      await requireAdmin();
    } catch (e: unknown) {
      if (e instanceof Error && e.message === 'FORBIDDEN') return forbiddenResponse();
      return unauthorizedResponse();
    }

    const { id } = await params;
    const key = await prisma.apiKey.findUnique({ where: { id } });
    if (!key) {
      return NextResponse.json({ error: 'Chave não encontrada' }, { status: 404 });
    }
    if (key.revokedAt) {
      return NextResponse.json({ ok: true, alreadyRevoked: true });
    }

    await prisma.apiKey.update({
      where: { id },
      data: { revokedAt: new Date() },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error, 'admin/api-keys/:id:DELETE');
  }
}
