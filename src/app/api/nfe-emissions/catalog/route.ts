import { NextResponse } from 'next/server';
import { requireAuth, unauthorizedResponse } from '@/lib/auth';
import { apiError } from '@/lib/api-error';
import { listSaidaOperations } from '@/lib/nfe-emission/operations';
import { getOrCreateSingleCompany } from '@/lib/single-company';
import prisma from '@/lib/prisma';

export async function GET() {
  try {
    const userId = await requireAuth();
    const company = await getOrCreateSingleCompany(userId);
    const cert = await prisma.certificateConfig.findUnique({
      where: { companyId: company.id },
      select: { environment: true, validTo: true },
    });
    return NextResponse.json({
      operations: listSaidaOperations(),
      certificate: cert
        ? {
            environment: cert.environment === 'homologation' ? 'homologation' : 'production',
            expired: Boolean(cert.validTo && cert.validTo.getTime() < Date.now()),
          }
        : null,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') return unauthorizedResponse();
    return apiError(error, 'GET /api/nfe-emissions/catalog');
  }
}
