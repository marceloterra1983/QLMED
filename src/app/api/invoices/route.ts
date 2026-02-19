import { NextResponse } from 'next/server';
import { requireAuth, unauthorizedResponse } from '@/lib/auth';
import prisma from '@/lib/prisma';

export async function GET(req: Request) {
  try {
    let userId: string;
    try {
      userId = await requireAuth();
    } catch {
      return unauthorizedResponse();
    }

    const { searchParams } = new URL(req.url);

    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const search = searchParams.get('search') || '';
    const type = searchParams.get('type') || '';
    const status = searchParams.get('status') || '';
    const companyId = searchParams.get('companyId') || '';
    const sort = searchParams.get('sort') || 'emission';
    const order = searchParams.get('order') || 'desc';

    const direction = searchParams.get('direction') || '';

    const where: any = {
      company: { userId },
    };

    if (search) {
      where.OR = [
        { accessKey: { contains: search } },
        { number: { contains: search } },
        { senderName: { contains: search } },
        { senderCnpj: { contains: search } },
        { recipientName: { contains: search } },
        { recipientCnpj: { contains: search } },
      ];
    }

    if (type) where.type = type;
    if (status) where.status = status;
    if (companyId) where.companyId = companyId;
    if (direction) where.direction = direction;

    const sortMapping: Record<string, string> = {
      emission: 'issueDate',
      number: 'number',
      sender: 'senderName',
      recipient: 'recipientName',
      value: 'totalValue',
      status: 'status',
    };

    const orderByField = sortMapping[sort] || 'issueDate';
    const orderByDir = order === 'asc' ? 'asc' : 'desc';

    const [invoices, total] = await Promise.all([
      prisma.invoice.findMany({
        where,
        include: { company: { select: { razaoSocial: true, cnpj: true } } },
        orderBy: { [orderByField]: orderByDir },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.invoice.count({ where }),
    ]);

    return NextResponse.json({
      invoices,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Error fetching invoices:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
