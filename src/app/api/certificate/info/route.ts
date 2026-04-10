import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireAdmin, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { getOrCreateSingleCompany } from '@/lib/single-company';
import { apiError } from '@/lib/api-error';

export async function GET(_request: NextRequest) {
  let userId: string;
  try {
    userId = await requireAuth();
  } catch {
    return unauthorizedResponse();
  }

  const company = await getOrCreateSingleCompany(userId);
  const companyId = company.id;

  const certConfig = await prisma.certificateConfig.findUnique({
    where: { companyId },
    select: {
      id: true,
      companyId: true,
      issuer: true,
      subject: true,
      validFrom: true,
      validTo: true,
      cnpjCertificate: true,
      environment: true,
      lastSyncAt: true,
      lastNsu: true,
      // Não retornar pfxData e pfxPassword
    }
  });

  if (!certConfig) {
    return NextResponse.json({ hasCertificate: false });
  }

  const now = new Date();
  const validTo = certConfig.validTo ? new Date(certConfig.validTo) : null;
  const isExpired = validTo ? validTo < now : false;

  return NextResponse.json({
    hasCertificate: true,
    certificate: {
      ...certConfig,
      isExpired
    }
  });
}

export async function DELETE(_request: NextRequest) {
  let userId: string;
  try {
    const auth = await requireAdmin();
    userId = auth.userId;
  } catch (e: unknown) {
      if (e instanceof Error && e.message === 'FORBIDDEN') return forbiddenResponse();
      return unauthorizedResponse();
    }

  const company = await getOrCreateSingleCompany(userId);
  const companyId = company.id;

  try {
    await prisma.certificateConfig.delete({
      where: { companyId }
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    return apiError(error, 'certificate/info');
  }
}
