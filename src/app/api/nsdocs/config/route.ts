import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireAdmin, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { NsdocsClient } from '@/lib/nsdocs-client';
import { getOrCreateSingleCompany } from '@/lib/single-company';
import { encrypt, decrypt } from '@/lib/crypto';
import { apiError } from '@/lib/api-error';

function maskToken(token: string): string {
  if (token.length <= 8) return '••••••••';
  return '••••••••' + token.slice(-4);
}

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

    if (!config) {
      return NextResponse.json({ config: null });
    }

    // Return masked token to frontend — never expose the raw token
    const decryptedToken = decrypt(config.apiToken);
    return NextResponse.json({
      config: {
        ...config,
        apiToken: maskToken(decryptedToken),
        hasToken: true,
      },
    });
  } catch (error) {
    return apiError(error, 'nsdocs/config');
  }
}

// POST - Salva/atualiza o token da API NSDocs
export async function POST(request: NextRequest) {
  let userId: string;
  try {
    const auth = await requireAdmin();
    userId = auth.userId;
  } catch (e: unknown) {
      if (e instanceof Error && e.message === 'FORBIDDEN') return forbiddenResponse();
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

    // Check if the token is the masked version (unchanged) or a new token
    const existingConfig = await prisma.nsdocsConfig.findUnique({
      where: { companyId },
    });

    let tokenToStore: string;
    if (existingConfig && apiToken.startsWith('••••')) {
      // User didn't change the token, keep the existing encrypted value
      tokenToStore = existingConfig.apiToken;
    } else {
      // New token — encrypt it
      tokenToStore = encrypt(apiToken);
    }

    const config = await prisma.nsdocsConfig.upsert({
      where: { companyId },
      update: {
        apiToken: tokenToStore,
        autoSync: autoSync ?? true,
        syncInterval: syncInterval ?? 60,
      },
      create: {
        companyId,
        apiToken: tokenToStore,
        autoSync: autoSync ?? true,
        syncInterval: syncInterval ?? 60,
      },
    });

    return NextResponse.json({
      config: { ...config, apiToken: maskToken(decrypt(config.apiToken)), hasToken: true },
      message: 'Configuração salva com sucesso',
    });
  } catch (error) {
    return apiError(error, 'nsdocs/config');
  }
}

// PUT - Testa conexão com a API NSDocs
export async function PUT(request: NextRequest) {
  try {
    await requireAdmin();
  } catch (e: unknown) {
      if (e instanceof Error && e.message === 'FORBIDDEN') return forbiddenResponse();
      return unauthorizedResponse();
    }

  try {
    const body = await request.json();
    const { apiToken } = body;

    if (!apiToken) {
      return NextResponse.json({ error: 'apiToken é obrigatório' }, { status: 400 });
    }

    // The test token comes directly from the user input (not encrypted)
    const client = new NsdocsClient(apiToken);
    const result = await client.testarConexao();

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ ok: false, error: 'Falha ao testar conexão' });
  }
}
