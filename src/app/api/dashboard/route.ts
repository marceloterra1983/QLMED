import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, unauthorizedResponse } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { getOrCreateSingleCompany } from '@/lib/single-company';

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
}

function startOfQuarter(date: Date): Date {
  const q = Math.floor(date.getMonth() / 3) * 3;
  return new Date(date.getFullYear(), q, 1);
}

function endOfQuarter(date: Date): Date {
  const q = Math.floor(date.getMonth() / 3) * 3 + 2;
  return new Date(date.getFullYear(), q + 1, 0, 23, 59, 59, 999);
}

function startOfYear(date: Date): Date {
  return new Date(date.getFullYear(), 0, 1);
}

function endOfYear(date: Date): Date {
  return new Date(date.getFullYear(), 11, 31, 23, 59, 59, 999);
}

function formatPeriodLabel(now: Date, period: string): string {
  switch (period) {
    case 'quarter': {
      const q = Math.ceil((now.getMonth() + 1) / 3);
      return `${q}° Trimestre ${now.getFullYear()}`;
    }
    case 'year':
      return String(now.getFullYear());
    default: {
      const monthName = now.toLocaleDateString('pt-BR', { month: 'long' });
      return `${monthName} de ${now.getFullYear()}`;
    }
  }
}

export async function GET(request: NextRequest) {
  try {
    let userId: string;
    try {
      userId = await requireAuth();
    } catch {
      return unauthorizedResponse();
    }

    const company = await getOrCreateSingleCompany(userId);
    const companyId = company.id;

    const period = (request.nextUrl.searchParams.get('period') || 'month') as
      | 'month'
      | 'quarter'
      | 'year';

    const now = new Date();
    let dateFrom: Date;
    let dateTo: Date;

    switch (period) {
      case 'quarter':
        dateFrom = startOfQuarter(now);
        dateTo = endOfQuarter(now);
        break;
      case 'year':
        dateFrom = startOfYear(now);
        dateTo = endOfYear(now);
        break;
      default:
        dateFrom = startOfMonth(now);
        dateTo = endOfMonth(now);
        break;
    }

    const periodFilter = {
      companyId,
      issueDate: { gte: dateFrom, lte: dateTo },
    };

    const [nfeReceived, nfeIssued, cte, pendingManifest, errors, recentInvoices] =
      await Promise.all([
        prisma.invoice.aggregate({
          where: { ...periodFilter, type: 'NFE', direction: 'received' },
          _count: true,
          _sum: { totalValue: true },
        }),
        prisma.invoice.aggregate({
          where: { ...periodFilter, type: 'NFE', direction: 'issued' },
          _count: true,
          _sum: { totalValue: true },
        }),
        prisma.invoice.aggregate({
          where: { ...periodFilter, type: 'CTE' },
          _count: true,
          _sum: { totalValue: true },
        }),
        prisma.invoice.count({
          where: { ...periodFilter, status: 'received' },
        }),
        prisma.invoice.count({
          where: { ...periodFilter, status: 'rejected' },
        }),
        prisma.invoice.findMany({
          where: { companyId, issueDate: { gte: dateFrom, lte: dateTo } },
          orderBy: { issueDate: 'desc' },
          take: 10,
          select: {
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
          },
        }),
      ]);

    return NextResponse.json({
      nfeReceived: {
        count: nfeReceived._count,
        totalValue: nfeReceived._sum.totalValue || 0,
      },
      nfeIssued: {
        count: nfeIssued._count,
        totalValue: nfeIssued._sum.totalValue || 0,
      },
      cte: {
        count: cte._count,
        totalValue: cte._sum.totalValue || 0,
      },
      pendingManifest,
      errors,
      period: {
        type: period,
        label: formatPeriodLabel(now, period),
      },
      recentInvoices,
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
