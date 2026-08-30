import { NextResponse } from 'next/server';
import { requireAdmin, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { getOrCreateSingleCompany } from '@/lib/single-company';
import { apiError } from '@/lib/api-error';
import { decrypt } from '@/lib/crypto';
import { CertificateManager } from '@/lib/certificate-manager';
import { UF_TO_CODE } from '@/lib/constants';
import { resolveEmissionEnvironment } from '@/lib/nfe-emission/environment';
import { emitenteFromIssuedXml } from '@/lib/nfe-emission/emitente';
import {
  assertCertificateReadyForSefaz,
  consultarStatusServico,
} from '@/lib/nfe-emission/status-servico-client';

async function resolveCuf(companyId: string, companyCnpj: string): Promise<string> {
  const lastIssued = await prisma.invoice.findFirst({
    where: { companyId, type: 'NFE', direction: 'issued' },
    orderBy: { issueDate: 'desc' },
    select: { xmlContent: true },
  });
  if (lastIssued?.xmlContent) {
    try {
      const emit = await emitenteFromIssuedXml(lastIssued.xmlContent, companyCnpj);
      const cUf = UF_TO_CODE[emit.ender.UF];
      if (cUf) return cUf;
    } catch {
      // Sem emitente completo ainda dá para pingar o autorizador do MS.
    }
  }
  return '50';
}

export async function POST() {
  let userId: string;
  try {
    const auth = await requireAdmin();
    userId = auth.userId;
  } catch (e: unknown) {
    if (e instanceof Error && e.message === 'FORBIDDEN') return forbiddenResponse();
    return unauthorizedResponse();
  }

  try {
    const company = await getOrCreateSingleCompany(userId);
    const cert = await prisma.certificateConfig.findUnique({
      where: { companyId: company.id },
      select: { pfxData: true, pfxPassword: true, validTo: true, environment: true },
    });
    assertCertificateReadyForSefaz(cert);
    const password = decrypt(cert.pfxPassword);
    const pems = CertificateManager.extractPems(Buffer.from(cert.pfxData), password);
    const environment = resolveEmissionEnvironment(cert.environment);
    const cUf = await resolveCuf(company.id, company.cnpj);
    const status = await consultarStatusServico({
      cUf,
      environment,
      certPem: pems.cert,
      keyPem: pems.key,
    });
    return NextResponse.json({
      environment,
      cUf,
      cStat: status.cStat,
      xMotivo: status.xMotivo,
      tMed: status.tMed,
      dhRecbto: status.dhRecbto,
      online: status.cStat === '107',
    });
  } catch (error) {
    if (error instanceof Error && (
      error.message === 'Certificado digital não configurado'
      || error.message === 'Certificado digital vencido'
    )) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return apiError(error, 'POST /api/certificate/status-servico');
  }
}
