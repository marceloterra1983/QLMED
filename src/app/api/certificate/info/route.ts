import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, unauthorizedResponse } from '@/lib/auth';
import prisma from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    await requireAuth();
  } catch {
    return unauthorizedResponse();
  }

  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get('companyId');

  if (!companyId) return NextResponse.json({ error: 'Company ID required' }, { status: 400 });

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

export async function DELETE(request: NextRequest) {
  try {
    await requireAuth();
  } catch {
    return unauthorizedResponse();
  }

  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get('companyId');

  if (!companyId) return NextResponse.json({ error: 'Company ID required' }, { status: 400 });

  try {
    await prisma.certificateConfig.delete({
      where: { companyId }
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to delete certificate' }, { status: 500 });
  }
}
