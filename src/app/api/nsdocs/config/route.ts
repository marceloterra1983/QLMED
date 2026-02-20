import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, unauthorizedResponse } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { NsdocsClient } from '@/lib/nsdocs-client';
import { getOrCreateSingleCompany } from '@/lib/single-company';

// GET - Retorna configuração NSDocs de uma empresa
export async function GET(_request: NextRequest) {
  let userId: string;
  try {
    userId = await requireAuth();
  } catch {
    return unauthorizedResponse();
  }

  try {
    const company = await getOrCreateSingleCompany(userId);
    const config = await prisma.nsdocsConfig.findUnique({
      where: { companyId: company.id },
    });

    return NextResponse.json({ config });
  } catch (error) {
    return NextResponse.json({ error: 'Erro ao buscar configuração' }, { status: 500 });
  }
}

// POST - Salva/atualiza o token da API NSDocs
export async function POST(request: NextRequest) {
  let userId: string;
  try {
    userId = await requireAuth();
  } catch {
    return unauthorizedResponse();
  }

  try {
    const body = await request.json();
    const { apiToken, autoSync, syncInterval } = body;

    if (!apiToken) {
      return NextResponse.json({ error: 'apiToken é obrigatório' }, { status: 400 });
    }

    const company = await getOrCreateSingleCompany(userId);
    const companyId = company.id;

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
