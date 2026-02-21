import { NextResponse } from 'next/server';
import { requireAuth, unauthorizedResponse } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { getOrCreateSingleCompany } from '@/lib/single-company';
import { markCompanyForSyncRecovery } from '@/lib/sync-recovery';
import { normalizeForSearch, flexMatch } from '@/lib/utils';

export async function GET(req: Request) {
  try {
    let userId: string;
    try {
      userId = await requireAuth();
    } catch {
      return unauthorizedResponse();
    }
    const company = await getOrCreateSingleCompany(userId);

    const { searchParams } = new URL(req.url);

    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');
    const search = (searchParams.get('search') || '').trim();
    const type = searchParams.get('type') || '';
    const status = searchParams.get('status') || '';
    const sort = searchParams.get('sort') || 'emission';
    const order = searchParams.get('order') || 'desc';

    const direction = searchParams.get('direction') || '';
    const dateFrom = searchParams.get('dateFrom') || '';
    const dateTo = searchParams.get('dateTo') || '';

    const where: any = { companyId: company.id };

    if (type) where.type = type;
    if (status) where.status = status;
    if (direction) where.direction = direction;

    if (dateFrom || dateTo) {
      where.issueDate = {};
      if (dateFrom) where.issueDate.gte = new Date(dateFrom);
      if (dateTo) where.issueDate.lte = new Date(dateTo + 'T23:59:59.999Z');
    }

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

    const selectFields = {
      id: true,
      accessKey: true,
      type: true,
      direction: true,
      number: true,
      series: true,
      issueDate: true,
      senderCnpj: true,
      senderName: true,
      recipientCnpj: true,
      recipientName: true,
      totalValue: true,
      status: true,
      createdAt: true,
    };

    if (search) {
      const normalizedSearch = normalizeForSearch(search);
      const searchDigits = search.replace(/\D/g, '');

      const allInvoices = await prisma.invoice.findMany({
        where,
        select: selectFields,
        orderBy: { [orderByField]: orderByDir },
      });

      const filtered = allInvoices.filter((inv) => {
        if (flexMatch(inv.senderName || '', normalizedSearch)) return true;
        if (flexMatch(inv.recipientName || '', normalizedSearch)) return true;
        if ((inv.accessKey || '').includes(search)) return true;
        if ((inv.number || '').includes(search)) return true;
        if ((inv.senderCnpj || '').includes(search)) return true;
        if ((inv.recipientCnpj || '').includes(search)) return true;
        if (searchDigits && searchDigits !== search) {
          if ((inv.senderCnpj || '').includes(searchDigits)) return true;
          if ((inv.recipientCnpj || '').includes(searchDigits)) return true;
        }
        return false;
      });

      const total = filtered.length;
      const paginated = filtered.slice((page - 1) * limit, (page - 1) * limit + limit);

      return NextResponse.json({
        invoices: paginated,
        pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      });
    }

    const [invoices, total] = await Promise.all([
      prisma.invoice.findMany({
        where,
        select: selectFields,
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

export async function DELETE(req: Request) {
  try {
    let userId: string;
    try {
      userId = await requireAuth();
    } catch {
      return unauthorizedResponse();
    }
    const company = await getOrCreateSingleCompany(userId);

    const body = await req.json();
    const { ids } = body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'IDs não fornecidos' }, { status: 400 });
    }

    const invoicesToDelete = await prisma.invoice.findMany({
      where: { id: { in: ids }, companyId: company.id },
      select: { id: true, issueDate: true },
    });

    if (invoicesToDelete.length === 0) {
      return NextResponse.json({ deleted: 0 });
    }

    const earliestIssueDate = invoicesToDelete.reduce((earliest, current) => (
      current.issueDate < earliest ? current.issueDate : earliest
    ), invoicesToDelete[0].issueDate);

    const result = await prisma.invoice.deleteMany({
      where: { id: { in: invoicesToDelete.map((invoice) => invoice.id) }, companyId: company.id },
    });

    let syncRecoveryMarked = false;
    try {
      await markCompanyForSyncRecovery(company.id, earliestIssueDate);
      syncRecoveryMarked = true;
    } catch (syncRecoveryError) {
      console.error('Error marking sync recovery after delete:', syncRecoveryError);
    }

    return NextResponse.json({ deleted: result.count, syncRecoveryMarked });
  } catch (error) {
    console.error('Error deleting invoices:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
