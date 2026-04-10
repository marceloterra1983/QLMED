import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireAdmin, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { CertificateManager } from '@/lib/certificate-manager';
import { decrypt, encrypt } from '@/lib/crypto';
import { getOrCreateSingleCompany } from '@/lib/single-company';
import { incrementNsu, ReceitaNfseClient } from '@/lib/receita-nfse-client';
import { apiError, apiValidationError } from '@/lib/api-error';
import { createLogger } from '@/lib/logger';
import { receitaNfseConfigSchema, receitaNfseTestSchema } from '@/lib/schemas/receita';

const log = createLogger('receita/nfse/config');

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
    return apiError(error, 'receita/nfse/config');
  }
}

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
    const parsed = receitaNfseConfigSchema.safeParse(body);
    if (!parsed.success) return apiValidationError(parsed.error);

    const company = await getOrCreateSingleCompany(userId);
    const existing = await prisma.receitaNfseConfig.findUnique({
      where: { companyId: company.id },
    });

    const apiTokenInput = normalizeNullableString(parsed.data.apiToken);
    const isMaskedInput = Boolean(apiTokenInput && apiTokenInput.startsWith('••••'));

    let apiTokenToStore: string | null = existing?.apiToken ?? null;
    if (apiTokenInput !== null && !isMaskedInput) {
      apiTokenToStore = apiTokenInput ? encrypt(apiTokenInput) : null;
    }

    const cnpjConsultaRaw = normalizeNullableString(parsed.data.cnpjConsulta);
    const cnpjConsulta = cnpjConsultaRaw ? cnpjConsultaRaw.replace(/\D/g, '') : null;
    if (cnpjConsulta && cnpjConsulta.length !== 14) {
      return NextResponse.json({ error: 'CNPJ de consulta deve conter 14 dígitos' }, { status: 400 });
    }

    const baseUrl = normalizeNullableString(parsed.data.baseUrl);
    const environment = normalizeEnvironment(parsed.data.environment);
    const autoSync = parsed.data.autoSync;
    const syncIntervalRaw = parsed.data.syncInterval;
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
    return apiError(error, 'receita/nfse/config');
  }
}

export async function PUT(request: NextRequest) {
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
    const parsedPut = receitaNfseTestSchema.safeParse(body);
    if (!parsedPut.success) return apiValidationError(parsedPut.error);

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

    const cnpjConsultaRaw = normalizeNullableString(parsedPut.data.cnpjConsulta);
    const cnpjConsulta = (cnpjConsultaRaw || company.cnpj).replace(/\D/g, '');
    if (!cnpjConsulta || cnpjConsulta.length !== 14) {
      return NextResponse.json({ ok: false, error: 'CNPJ de consulta inválido' }, { status: 400 });
    }

    const environment = normalizeEnvironment(parsedPut.data.environment);
    const baseUrl = getBaseUrl(environment, normalizeNullableString(parsedPut.data.baseUrl));
    const apiTokenRaw = normalizeNullableString(parsedPut.data.apiToken);
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
  } catch (error: unknown) {
    log.error({ err: error }, '[ReceitaNfseConfig][PUT] Error');
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'Falha ao testar conexão Receita NFS-e' }, { status: 500 });
  }
}
