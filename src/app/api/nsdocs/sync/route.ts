import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireEditor, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { getOrCreateSingleCompany } from '@/lib/single-company';
import { syncViaSefaz, syncViaNsdocs, syncViaReceitaNfse } from '@/lib/auto-sync';

export async function POST(request: NextRequest) {
  let userId: string;
  try {
    const auth = await requireEditor();
    userId = auth.userId;
  } catch (e: any) {
    if (e.message === 'FORBIDDEN') return forbiddenResponse();
    return unauthorizedResponse();
  }

  try {
    const body = await request.json();
    const { method } = body;
    const baseCompany = await getOrCreateSingleCompany(userId);
    const company = await prisma.company.findUnique({
      where: { id: baseCompany.id },
      include: {
        nsdocsConfig: true,
        receitaNfseConfig: true,
        certificateConfig: true
      }
    });

    if (!company) {
      return NextResponse.json({ error: 'Empresa não encontrada' }, { status: 404 });
    }

    const companyId = company.id;

    // Se method foi especificado, validar disponibilidade
    if (method === 'sefaz' && !company.certificateConfig) {
      return NextResponse.json({ error: 'Certificado digital não configurado para esta empresa' }, { status: 400 });
    }
    if (method === 'nsdocs' && !company.nsdocsConfig) {
      return NextResponse.json({ error: 'Integração NSDocs não configurada para esta empresa' }, { status: 400 });
    }
    if (method === 'receita_nfse' && !company.receitaNfseConfig) {
      return NextResponse.json({ error: 'Integração Receita NFS-e não configurada para esta empresa' }, { status: 400 });
    }
    if (method === 'receita_nfse' && !company.certificateConfig) {
      return NextResponse.json({ error: 'Certificado digital não configurado para integrar com Receita NFS-e' }, { status: 400 });
    }

    // SEFAZ: se method='sefaz' explícito OU fallback automático (sem method)
    if ((method === 'sefaz' || !method) && company.certificateConfig) {
      const cert = company.certificateConfig;

      const syncLog = await prisma.syncLog.create({
        data: {
          companyId,
          syncMethod: 'sefaz',
          status: 'running',
          errorMessage: null
        }
      });

      // Processamento Assíncrono (Fire and forget para não bloquear request)
      syncViaSefaz(companyId, company.cnpj, company.razaoSocial, {
        id: cert.id,
        pfxData: cert.pfxData,
        pfxPassword: cert.pfxPassword,
        lastNsu: cert.lastNsu,
        environment: cert.environment,
        subject: cert.subject,
      }, syncLog.id).catch((err) => {
        console.error('[SEFAZ Sync] Unhandled error in fire-and-forget:', (err as Error).message);
      });

      return NextResponse.json({
        message: 'Sincronização SEFAZ iniciada',
        syncMethod: 'sefaz',
        syncLogId: syncLog.id
      });
    }

    // NSDocs: se method='nsdocs' explícito OU fallback automático (sem method)
    if ((method === 'nsdocs' || !method) && company.nsdocsConfig) {
      const syncLog = await prisma.syncLog.create({
        data: {
          companyId,
          syncMethod: 'nsdocs',
          status: 'running'
        }
      });

      // Fire-and-forget: delegate to shared sync function
      syncViaNsdocs(companyId, company.cnpj, company.razaoSocial, company.nsdocsConfig, syncLog.id).catch((err) => {
        console.error('[NSDocs Sync] Unhandled error in fire-and-forget:', (err as Error).message);
      });

      return NextResponse.json({
        message: 'Sincronização NSDocs iniciada',
        syncMethod: 'nsdocs',
        syncLogId: syncLog.id,
      });
    }

    // Receita NFS-e (ADN): apenas quando solicitado explicitamente.
    if (method === 'receita_nfse' && company.receitaNfseConfig && company.certificateConfig) {
      const syncLog = await prisma.syncLog.create({
        data: {
          companyId,
          syncMethod: 'receita_nfse',
          status: 'running'
        }
      });

      // Fire-and-forget: delegate to shared sync function
      syncViaReceitaNfse(
        companyId,
        company.cnpj,
        company.razaoSocial,
        company.receitaNfseConfig,
        company.certificateConfig,
        syncLog.id,
      ).catch((err) => {
        console.error('[Receita NFS-e Sync] Unhandled error in fire-and-forget:', (err as Error).message);
      });

      return NextResponse.json({
        message: 'Sincronização Receita NFS-e iniciada',
        syncMethod: 'receita_nfse',
        syncLogId: syncLog.id,
      });
    }

    return NextResponse.json({ error: 'Nenhuma configuração de integração encontrada (SEFAZ, NSDocs ou Receita NFS-e)' }, { status: 400 });

  } catch (error) {
    console.error('Erro geral no sync:', error);
    return NextResponse.json({ error: 'Erro interno no servidor' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  let userId: string;
  try {
    userId = await requireAuth();
  } catch {
    return unauthorizedResponse();
  }

  const { searchParams } = new URL(request.url);
  const syncLogId = searchParams.get('syncLogId');
  const company = await getOrCreateSingleCompany(userId);
  const companyId = company.id;

  // Se tem syncLogId, verificar status específico
  if (syncLogId) {
    const log = await prisma.syncLog.findUnique({ where: { id: syncLogId } });
    if (log && log.companyId !== companyId) {
      return NextResponse.json({ error: 'Log de sincronização não encontrado' }, { status: 404 });
    }

    return NextResponse.json({
      status: log?.status || 'unknown',
      newDocs: log?.newDocs || 0,
      updatedDocs: log?.updatedDocs || 0,
      error: log?.errorMessage,
      syncMethod: log?.syncMethod
    });
  }

  // Se não tem syncLogId, retornar histórico (logs)
  // Trazemos fatias por método para evitar que um método "esconda" os demais.
  const [nsdocsLogs, sefazLogs, receitaLogs] = await Promise.all([
    prisma.syncLog.findMany({
      where: { companyId, syncMethod: 'nsdocs' },
      orderBy: { startedAt: 'desc' },
      take: 20,
    }),
    prisma.syncLog.findMany({
      where: { companyId, syncMethod: 'sefaz' },
      orderBy: { startedAt: 'desc' },
      take: 20,
    }),
    prisma.syncLog.findMany({
      where: { companyId, syncMethod: 'receita_nfse' },
      orderBy: { startedAt: 'desc' },
      take: 20,
    }),
  ]);

  const logs = [...nsdocsLogs, ...sefazLogs, ...receitaLogs].sort(
    (a, b) => b.startedAt.getTime() - a.startedAt.getTime()
  );

  return NextResponse.json({ logs });
}
