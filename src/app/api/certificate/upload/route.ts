import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, unauthorizedResponse } from '@/lib/auth';
import prisma from '@/lib/prisma'; // Assumindo que existe
import { CertificateManager } from '@/lib/certificate-manager';
import { encrypt } from '@/lib/crypto';
import { getOrCreateSingleCompany } from '@/lib/single-company';

export async function POST(request: NextRequest) {
  let userId: string;
  try {
    userId = await requireAuth();
  } catch {
    return unauthorizedResponse();
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const password = formData.get('password') as string;
    const baseCompany = await getOrCreateSingleCompany(userId);
    const companyId = baseCompany.id;

    if (!file || !password) {
      return NextResponse.json({ error: 'Arquivo e senha são obrigatórios' }, { status: 400 });
    }

    // Validate file type
    const fileName = file.name?.toLowerCase() || '';
    if (!fileName.endsWith('.pfx') && !fileName.endsWith('.p12')) {
      return NextResponse.json({ error: 'Formato inválido. Envie um arquivo .pfx ou .p12' }, { status: 400 });
    }

    // Validate file size (max 1MB)
    const MAX_CERT_SIZE = 1 * 1024 * 1024;
    if (file.size > MAX_CERT_SIZE) {
      return NextResponse.json({ error: 'Arquivo muito grande. Limite: 1MB' }, { status: 400 });
    }

    // Verificar permissão
    const company = await prisma.company.findUnique({
      where: { id: companyId },
    });

    if (!company) {
      return NextResponse.json({ error: 'Empresa não encontrada' }, { status: 404 });
    }

    // Processar arquivo
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    let certInfo;
    try {
      certInfo = CertificateManager.processPfx(buffer, password);
    } catch (e: any) {
      console.error('[Certificate] Processing error:', e);
      return NextResponse.json({ error: 'Certificado inválido ou senha incorreta' }, { status: 400 });
    }

    // Salvar no banco
    const encryptedPassword = encrypt(password);
    const certConfig = await prisma.certificateConfig.upsert({
      where: { companyId },
      create: {
        companyId,
        pfxData: buffer,
        pfxPassword: encryptedPassword,
        serialNumber: certInfo.serialNumber,
        issuer: certInfo.issuer,
        subject: certInfo.subject,
        validFrom: certInfo.validFrom,
        validTo: certInfo.validTo,
        cnpjCertificate: certInfo.cnpj,
        environment: 'production'
      },
      update: {
        pfxData: buffer,
        pfxPassword: encryptedPassword,
        serialNumber: certInfo.serialNumber,
        issuer: certInfo.issuer,
        subject: certInfo.subject,
        validFrom: certInfo.validFrom,
        validTo: certInfo.validTo,
        cnpjCertificate: certInfo.cnpj
      }
    });

    // Retornar suceso (sem dados sensíveis)
    return NextResponse.json({
      success: true,
      info: {
        issuer: certInfo.issuer,
        validTo: certInfo.validTo,
        cnpj: certInfo.cnpj
      }
    });

  } catch (error: any) {
    console.error('Erro no upload de certificado:', error);
    return NextResponse.json({ error: 'Erro interno ao processar upload' }, { status: 500 });
  }
}
