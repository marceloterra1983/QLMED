import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, unauthorizedResponse } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { getOrCreateSingleCompany } from '@/lib/single-company';
import {
  startOfMonth,
  endOfMonth,
  startOfQuarter,
  endOfQuarter,
  startOfYear,
  endOfYear,
  format,
} from 'date-fns';
import { ptBR } from 'date-fns/locale';

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
    let periodLabel: string;

    switch (period) {
      case 'quarter':
        dateFrom = startOfQuarter(now);
        dateTo = endOfQuarter(now);
        periodLabel = `${Math.ceil((now.getMonth() + 1) / 3)}° Trimestre ${format(now, 'yyyy')}`;
        break;
      case 'year':
        dateFrom = startOfYear(now);
        dateTo = endOfYear(now);
        periodLabel = format(now, 'yyyy');
        break;
      default:
        dateFrom = startOfMonth(now);
        dateTo = endOfMonth(now);
        periodLabel = format(now, "MMMM 'de' yyyy", { locale: ptBR });
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
        label: periodLabel,
      },
      recentInvoices,
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
