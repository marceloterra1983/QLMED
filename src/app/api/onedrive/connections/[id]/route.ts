import { NextResponse } from 'next/server';
import { requireAdmin, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { getOrCreateSingleCompany } from '@/lib/single-company';

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  let userId: string;
  try {
    const auth = await requireAdmin();
    userId = auth.userId;
  } catch (e: any) {
    if (e.message === 'FORBIDDEN') return forbiddenResponse();
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
    return NextResponse.json({ error: 'Erro ao remover conexão OneDrive' }, { status: 500 });
  }
}
