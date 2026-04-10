import { NextResponse } from 'next/server';
import { requireAdmin, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { getOrCreateSingleCompany } from '@/lib/single-company';
import { apiError } from '@/lib/api-error';

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  let userId: string;
  try {
    const auth = await requireAdmin();
    userId = auth.userId;
  } catch (e: unknown) {
      if (e instanceof Error && e.message === 'FORBIDDEN') return forbiddenResponse();
      return unauthorizedResponse();
    }

  try {
    const company = await getOrCreateSingleCompany(userId);

    const connection = await prisma.oneDriveConnection.findFirst({
      where: {
        id: params.id,
        companyId: company.id,
      },
      select: { id: true },
    });

    if (!connection) {
      return NextResponse.json({ error: 'Conexão OneDrive não encontrada' }, { status: 404 });
    }

    await prisma.oneDriveConnection.delete({
      where: { id: connection.id },
    });

    return NextResponse.json({ message: 'Conexão removida com sucesso' });
  } catch (error) {
    return apiError(error, 'onedrive/connections/:id');
  }
}
