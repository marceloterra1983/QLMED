import { NextResponse } from 'next/server';
import { requireAdmin, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';
import prisma from '@/lib/prisma';

export async function GET() {
  try {
    try {
      await requireAdmin();
    } catch (e: any) {
      if (e.message === 'FORBIDDEN') return forbiddenResponse();
      return unauthorizedResponse();
    }

    const count = await prisma.user.count({
      where: { status: 'pending' },
    });

    return NextResponse.json({ count });
  } catch (error) {
    console.error('Error counting pending users:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
