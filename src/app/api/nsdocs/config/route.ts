import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, unauthorizedResponse } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { NsdocsClient } from '@/lib/nsdocs-client';

// GET - Retorna configuração NSDocs de uma empresa
export async function GET(request: NextRequest) {
  try {
    await requireAuth();
  } catch {
    return unauthorizedResponse();
  }

  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get('companyId');

  if (!companyId) {
    return NextResponse.json({ error: 'companyId é obrigatório' }, { status: 400 });
  }

  try {
    const config = await prisma.nsdocsConfig.findUnique({
      where: { companyId },
    });

    return NextResponse.json({ config });
  } catch (error) {
    return NextResponse.json({ error: 'Erro ao buscar configuração' }, { status: 500 });
  }
}

// POST - Salva/atualiza o token da API NSDocs
export async function POST(request: NextRequest) {
  try {
    await requireAuth();
  } catch {
    return unauthorizedResponse();
  }

  try {
    const body = await request.json();
    const { companyId, apiToken, autoSync, syncInterval } = body;

    if (!companyId || !apiToken) {
      return NextResponse.json({ error: 'companyId e apiToken são obrigatórios' }, { status: 400 });
    }

    const company = await prisma.company.findFirst({
      where: { id: companyId },
    });

    if (!company) {
      return NextResponse.json({ error: 'Empresa não encontrada' }, { status: 404 });
    }

    // Upsert da configuração
    const config = await prisma.nsdocsConfig.upsert({
      where: { companyId },
      update: {
        apiToken,
        autoSync: autoSync ?? true,
        syncInterval: syncInterval ?? 60,
      },
      create: {
        companyId,
        apiToken,
        autoSync: autoSync ?? true,
        syncInterval: syncInterval ?? 60,
      },
    });

    return NextResponse.json({ config, message: 'Configuração salva com sucesso' });
  } catch (error) {
    return NextResponse.json({ error: 'Erro ao salvar configuração' }, { status: 500 });
  }
}

// PUT - Testa conexão com a API NSDocs
export async function PUT(request: NextRequest) {
  try {
    await requireAuth();
  } catch {
    return unauthorizedResponse();
  }

  try {
    const body = await request.json();
    const { apiToken } = body;

    if (!apiToken) {
      return NextResponse.json({ error: 'apiToken é obrigatório' }, { status: 400 });
    }

    const client = new NsdocsClient(apiToken);
    const result = await client.testarConexao();

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ ok: false, error: (error as Error).message });
  }
}
