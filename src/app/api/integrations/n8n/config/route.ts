import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin, requireAuth, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { getOrCreateSingleCompany } from '@/lib/single-company';
import { encrypt, decrypt } from '@/lib/crypto';
import { apiError, apiValidationError } from '@/lib/api-error';
import { resolveN8nHost } from '@/lib/n8n-client';

/** Mesmo mascaramento usado em nsdocs/config: o token cru nunca sai daqui. */
function maskToken(token: string): string {
  if (token.length <= 8) return '••••••••';
  return '••••••••' + token.slice(-4);
}

const configSchema = z
  .object({
    // `z.string().url()` aceitava http:// em claro, `http://169.254.169.254/` e
    // credenciais na própria URL — e a chave do n8n seguia para lá. A regra de
    // egresso é a mesma usada na hora de chamar (Princípio: uma política só).
    baseUrl: z
      .string()
      .refine((value) => resolveN8nHost(value) !== null, {
        message: 'baseUrl deve ser https, sem credenciais na URL e fora de faixas privadas',
      }),
    apiToken: z.string().min(1).optional(),
  })
  .strict();

/** GET — configuração atual, com o token SEMPRE mascarado. */
export async function GET(_request: NextRequest) {
  let userId: string;
  try {
    userId = await requireAuth();
  } catch {
    return unauthorizedResponse();
  }

  try {
    const company = await getOrCreateSingleCompany(userId);
    const config = await prisma.n8nIntegrationConfig.findUnique({
      where: { companyId: company.id },
    });

    if (!config) return NextResponse.json({ config: null });

    return NextResponse.json({
      config: {
        baseUrl: config.baseUrl,
        apiToken: config.apiToken ? maskToken(decrypt(config.apiToken)) : null,
        hasToken: Boolean(config.apiToken),
        updatedAt: config.updatedAt,
      },
    });
  } catch (error) {
    return apiError(error, 'integrations/n8n/config');
  }
}

/** PUT — grava endereço e chave. Só admin, como em nsdocs/config. */
export async function PUT(request: NextRequest) {
  let userId: string;
  try {
    const auth = await requireAdmin();
    userId = auth.userId;
  } catch (e: unknown) {
    if (e instanceof Error && e.message === 'FORBIDDEN') return forbiddenResponse();
    return unauthorizedResponse();
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Dados invalidos' }, { status: 400 });
  }

  const parsed = configSchema.safeParse(body);
  if (!parsed.success) return apiValidationError(parsed.error);

  try {
    const company = await getOrCreateSingleCompany(userId);
    // apiToken ausente no corpo significa "manter o que já está gravado" —
    // a tela envia o valor mascarado de volta e ele nunca deve virar credencial.
    const data = {
      baseUrl: parsed.data.baseUrl,
      ...(parsed.data.apiToken ? { apiToken: encrypt(parsed.data.apiToken) } : {}),
    };

    await prisma.n8nIntegrationConfig.upsert({
      where: { companyId: company.id },
      create: { companyId: company.id, ...data },
      update: data,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error, 'integrations/n8n/config');
  }
}
