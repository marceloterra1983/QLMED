import { NextRequest, NextResponse } from 'next/server';
import { requireEditor, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { getOrCreateSingleCompany } from '@/lib/single-company';
import { z } from 'zod';
import { createLogger } from '@/lib/logger';
import { apiError, apiValidationError } from '@/lib/api-error';

const log = createLogger('cte/manifest');

const cteManifestSchema = z.object({
  ids: z.array(z.string().min(1)).min(1, 'Selecione ao menos um CT-e'),
  targetStatus: z.enum(['rejected', 'confirmed'], {
    error: 'Status de manifestacao invalido',
  }),
});

export async function POST(request: NextRequest) {
  let userId: string;
  try {
    const auth = await requireEditor();
    userId = auth.userId;
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'FORBIDDEN') return forbiddenResponse();
    return unauthorizedResponse();
  }

  try {
    const body = await request.json();
    const parsed = cteManifestSchema.safeParse(body);
    if (!parsed.success) return apiValidationError(parsed.error);

    const { ids, targetStatus } = parsed.data;

    const company = await getOrCreateSingleCompany(userId);

    const ctes = await prisma.invoice.findMany({
      where: {
        companyId: company.id,
        type: 'CTE',
        id: { in: ids },
      },
      select: {
        id: true,
      },
    });

    if (ctes.length === 0) {
      return NextResponse.json({ error: 'Nenhum CT-e elegível encontrado.' }, { status: 404 });
    }

    await prisma.invoice.updateMany({
      where: {
        companyId: company.id,
        id: { in: ctes.map((cte) => cte.id) },
      },
      data: {
        status: targetStatus,
      },
    });

    return NextResponse.json({
      updated: ctes.length,
      skipped: Math.max(0, ids.length - ctes.length),
      targetStatus,
      provider: 'local',
      providerNote: 'A API pública NSDocs v2 não expõe endpoint de escrita para manifestação de CT-e. A manifestação foi aplicada no sistema local.',
    });
  } catch (error) {
    return apiError(error, 'cte/manifest');
  }
}
