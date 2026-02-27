import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireAdmin, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { CertificateManager } from '@/lib/certificate-manager';
import { decrypt, encrypt } from '@/lib/crypto';
import { getOrCreateSingleCompany } from '@/lib/single-company';
import { incrementNsu, ReceitaNfseClient } from '@/lib/receita-nfse-client';

function maskToken(token: string): string {
  if (token.length <= 8) return '••••••••';
  return '••••••••' + token.slice(-4);
}

function normalizeNullableString(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeEnvironment(value: unknown): 'production' | 'production-restricted' {
  const env = String(value || 'production').trim().toLowerCase();
  return env === 'production-restricted' ? 'production-restricted' : 'production';
}

function getBaseUrl(environment: 'production' | 'production-restricted', customUrl: string | null): string {
  if (customUrl) return customUrl.replace(/\/+$/, '');
  return environment === 'production-restricted'
    ? 'https://adn.producaorestrita.nfse.gov.br/contribuintes'
    : 'https://adn.nfse.gov.br/contribuintes';
}

export async function GET(_request: NextRequest) {
  let userId: string;
  try {
    userId = await requireAuth();
  } catch {
    return unauthorizedResponse();
  }

  try {
    const company = await getOrCreateSingleCompany(userId);
    const config = await prisma.receitaNfseConfig.findUnique({
      where: { companyId: company.id },
    });

    if (!config) {
      return NextResponse.json({ config: null });
    }

    const token = config.apiToken ? decrypt(config.apiToken) : '';

    return NextResponse.json({
      config: {
        ...config,
        apiToken: token ? maskToken(token) : '',
        hasToken: Boolean(token),
      },
    });
  } catch (error) {
    console.error('[ReceitaNfseConfig][GET] Error:', error);
    return NextResponse.json({ error: 'Erro ao buscar configuração Receita NFS-e' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  let userId: string;
  try {
    const auth = await requireAdmin();
    userId = auth.userId;
  } catch (e: any) {
    if (e.message === 'FORBIDDEN') return forbiddenResponse();
    return unauthorizedResponse();
  }

  try {
    const body = await request.json();
    const company = await getOrCreateSingleCompany(userId);
    const existing = await prisma.receitaNfseConfig.findUnique({
      where: { companyId: company.id },
    });

    const apiTokenInput = normalizeNullableString(body.apiToken);
    const isMaskedInput = Boolean(apiTokenInput && apiTokenInput.startsWith('••••'));

    let apiTokenToStore: string | null = existing?.apiToken ?? null;
    if (apiTokenInput !== null && !isMaskedInput) {
      apiTokenToStore = apiTokenInput ? encrypt(apiTokenInput) : null;
    }

    const cnpjConsultaRaw = normalizeNullableString(body.cnpjConsulta);
    const cnpjConsulta = cnpjConsultaRaw ? cnpjConsultaRaw.replace(/\D/g, '') : null;
    if (cnpjConsulta && cnpjConsulta.length !== 14) {
      return NextResponse.json({ error: 'CNPJ de consulta deve conter 14 dígitos' }, { status: 400 });
    }

    const baseUrl = normalizeNullableString(body.baseUrl);
    const environment = normalizeEnvironment(body.environment);
    const autoSync = body.autoSync === undefined ? true : Boolean(body.autoSync);
    const syncIntervalRaw = Number(body.syncInterval ?? 60);
    const syncInterval = Number.isFinite(syncIntervalRaw) && syncIntervalRaw > 0
      ? Math.max(5, Math.min(1440, Math.round(syncIntervalRaw)))
      : 60;

    const config = await prisma.receitaNfseConfig.upsert({
      where: { companyId: company.id },
      update: {
        apiToken: apiTokenToStore,
        autoSync,
        syncInterval,
        environment,
        baseUrl,
        cnpjConsulta,
      },
      create: {
        companyId: company.id,
        apiToken: apiTokenToStore,
        autoSync,
        syncInterval,
        environment,
        baseUrl,
        cnpjConsulta,
      },
    });

    const token = config.apiToken ? decrypt(config.apiToken) : '';

    return NextResponse.json({
      config: {
        ...config,
        apiToken: token ? maskToken(token) : '',
        hasToken: Boolean(token),
      },
      message: 'Configuração Receita NFS-e salva com sucesso',
    });
  } catch (error) {
    console.error('[ReceitaNfseConfig][POST] Error:', error);
    return NextResponse.json({ error: 'Erro ao salvar configuração Receita NFS-e' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  let userId: string;
  try {
    const auth = await requireAdmin();
    userId = auth.userId;
  } catch (e: any) {
    if (e.message === 'FORBIDDEN') return forbiddenResponse();
    return unauthorizedResponse();
  }

  try {
    const body = await request.json();
    const company = await getOrCreateSingleCompany(userId);

    const certConfig = await prisma.certificateConfig.findUnique({
      where: { companyId: company.id },
      select: {
        pfxData: true,
        pfxPassword: true,
      },
    });
    if (!certConfig) {
      return NextResponse.json({ ok: false, error: 'Certificado digital não configurado para esta empresa' }, { status: 400 });
    }

    const cnpjConsultaRaw = normalizeNullableString(body.cnpjConsulta);
    const cnpjConsulta = (cnpjConsultaRaw || company.cnpj).replace(/\D/g, '');
    if (!cnpjConsulta || cnpjConsulta.length !== 14) {
      return NextResponse.json({ ok: false, error: 'CNPJ de consulta inválido' }, { status: 400 });
    }

    const environment = normalizeEnvironment(body.environment);
    const baseUrl = getBaseUrl(environment, normalizeNullableString(body.baseUrl));
    const apiTokenRaw = normalizeNullableString(body.apiToken);
    const existingConfig = await prisma.receitaNfseConfig.findUnique({
      where: { companyId: company.id },
      select: { apiToken: true },
    });
    const apiToken = apiTokenRaw && !apiTokenRaw.startsWith('••••')
      ? apiTokenRaw
      : (existingConfig?.apiToken ? decrypt(existingConfig.apiToken) : null);

    const { cert, key } = CertificateManager.extractPems(
      certConfig.pfxData,
      decrypt(certConfig.pfxPassword),
    );

    const client = new ReceitaNfseClient({
      baseUrl,
      apiToken,
      certPem: cert,
      keyPem: key,
      rejectUnauthorized: process.env.RECEITA_NFSE_VERIFY_SSL !== 'false',
    });

    const probeNsu = incrementNsu('000000000000000');
    const response = await client.fetchDfeByNsu(probeNsu, cnpjConsulta);
    if (response.statusCode === 401 || response.statusCode === 403 || response.statusCode === 496) {
      return NextResponse.json({ ok: false, error: 'Falha de autenticação (token/certificado/permissão).' }, { status: 400 });
    }
    if (response.statusCode >= 500) {
      return NextResponse.json({ ok: false, error: `API indisponível (HTTP ${response.statusCode})` }, { status: 502 });
    }

    return NextResponse.json({
      ok: true,
      statusCode: response.statusCode,
      message: `Conexão válida com a Receita NFS-e (${environment === 'production' ? 'produção' : 'produção restrita'}).`,
    });
  } catch (error: any) {
    console.error('[ReceitaNfseConfig][PUT] Error:', error);
    return NextResponse.json({ ok: false, error: error?.message || 'Falha ao testar conexão Receita NFS-e' }, { status: 500 });
  }
}
