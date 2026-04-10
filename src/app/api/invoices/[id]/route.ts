import { NextResponse } from 'next/server';
import { requireAuth, requireEditor, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { getOrCreateSingleCompany } from '@/lib/single-company';
import { markCompanyForSyncRecovery } from '@/lib/sync-recovery';
import { apiError, apiValidationError } from '@/lib/api-error';
import { createLogger } from '@/lib/logger';
import { invoiceUpdateStatusSchema } from '@/lib/schemas/invoice';
import { idParamSchema } from '@/lib/schemas/common';

const log = createLogger('invoices/:id');

export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    let userId: string;
    try {
      userId = await requireAuth();
    } catch {
      return unauthorizedResponse();
    }
    const company = await getOrCreateSingleCompany(userId);

    const invoice = await prisma.invoice.findFirst({
      where: {
        id: params.id,
        companyId: company.id,
      },
      include: { company: { select: { razaoSocial: true, cnpj: true } } },
    });

    if (!invoice) {
      return NextResponse.json({ error: 'Nota não encontrada' }, { status: 404 });
    }

    return NextResponse.json(invoice);
  } catch (error) {
    return apiError(error, 'invoices/:id');
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    let userId: string;
    try {
      const auth = await requireEditor();
      userId = auth.userId;
    } catch (e: unknown) {
      if (e instanceof Error && e.message === 'FORBIDDEN') return forbiddenResponse();
      return unauthorizedResponse();
    }
    const company = await getOrCreateSingleCompany(userId);

    const invoice = await prisma.invoice.findFirst({
      where: {
        id: params.id,
        companyId: company.id,
      },
    });

    if (!invoice) {
      return NextResponse.json({ error: 'Nota não encontrada' }, { status: 404 });
    }

    await prisma.invoice.delete({ where: { id: params.id } });

    let syncRecoveryMarked = false;
    try {
      await markCompanyForSyncRecovery(company.id, invoice.issueDate);
      syncRecoveryMarked = true;
    } catch (syncRecoveryError) {
      log.error({ err: syncRecoveryError }, 'Error marking sync recovery after delete');
    }

    return NextResponse.json({ message: 'Nota excluída com sucesso', syncRecoveryMarked });
  } catch (error) {
    return apiError(error, 'invoices/:id');
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    let userId: string;
    try {
      userId = await requireAuth();
    } catch {
      return unauthorizedResponse();
    }
    const company = await getOrCreateSingleCompany(userId);

    const body = await req.json();
    const parsed = invoiceUpdateStatusSchema.safeParse(body);
    if (!parsed.success) return apiValidationError(parsed.error);

    const invoice = await prisma.invoice.findFirst({
      where: {
        id: params.id,
        companyId: company.id,
      },
    });

    if (!invoice) {
      return NextResponse.json({ error: 'Nota não encontrada' }, { status: 404 });
    }

    const updated = await prisma.invoice.update({
      where: { id: params.id },
      data: { status: parsed.data.status },
    });

    return NextResponse.json(updated);
  } catch (error) {
    return apiError(error, 'invoices/:id');
  }
}
