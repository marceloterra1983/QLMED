import { NextRequest, NextResponse } from 'next/server';
import { requireEditor, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { getOrCreateSingleCompany } from '@/lib/single-company';

type CteManifestTargetStatus = 'rejected' | 'confirmed';

function isManifestTargetStatus(value: unknown): value is CteManifestTargetStatus {
  return value === 'rejected' || value === 'confirmed';
}

export async function POST(request: NextRequest) {
  let userId: string;
  try {
    const auth = await requireEditor();
    userId = auth.userId;
  } catch (error: any) {
    if (error.message === 'FORBIDDEN') return forbiddenResponse();
    return unauthorizedResponse();
  }

  try {
    const body = await request.json();
    const ids = Array.isArray(body?.ids)
      ? body.ids.filter((id: unknown): id is string => typeof id === 'string' && id.trim().length > 0)
      : [];
    const targetStatus = body?.targetStatus;

    if (ids.length === 0) {
      return NextResponse.json({ error: 'Nenhum CT-e selecionado para manifestação.' }, { status: 400 });
    }

    if (!isManifestTargetStatus(targetStatus)) {
      return NextResponse.json({ error: 'Status de manifestação inválido.' }, { status: 400 });
    }

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
    console.error('[CTE Manifest] Error:', error);
    return NextResponse.json({ error: 'Erro interno ao manifestar CT-e.' }, { status: 500 });
  }
}
