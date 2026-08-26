import { NextResponse } from 'next/server';
import { requireSessionRole, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { getOrCreateSingleCompany } from '@/lib/single-company';
import { decrypt } from '@/lib/crypto';
import { apiError } from '@/lib/api-error';
import { fetchN8nWorkflows } from '@/lib/n8n-client';
import { getCachedN8nStatus } from '@/lib/n8n-status-cache';

/**
 * Papel exigido para ler o status das automações.
 *
 * PENDÊNCIA D4 DA SPEC-011, decisão do dono. Adotado aqui o default
 * conservador: 'admin'. A tela hoje não verifica papel algum, então isto MUDA
 * quem a enxerga — mas afrouxar depois é trivial, e apertar depois que as
 * pessoas passaram a depender do acesso, não. O status é estado operacional
 * atrelado a uma credencial.
 *
 * Trocar aqui é uma linha. Só não fica implícito.
 */
const REQUIRED_ROLE = 'admin' as const;

/**
 * GET — status agregado dos workflows.
 *
 * A rota autentica, autoriza e delega (Princípio IV). Ela não interpreta falha:
 * o cliente já devolve um dos três estados, e a rota apenas os repassa com 200.
 * Um 5xx aqui significaria falha DO QLMED, não do n8n — confundir as duas é o
 * defeito que a User Story 2 existe para impedir.
 */
export async function GET() {
  let userId: string;
  try {
    const auth = await requireSessionRole(REQUIRED_ROLE);
    userId = auth.userId;
  } catch (e: unknown) {
    if (e instanceof Error && e.message === 'FORBIDDEN') return forbiddenResponse();
    return unauthorizedResponse();
  }

  try {
    const company = await getOrCreateSingleCompany(userId);
    const config = await prisma.n8nIntegrationConfig.findUnique({
      where: { companyId: company.id },
      select: { baseUrl: true, apiToken: true },
    });

    const connection = config
      ? { baseUrl: config.baseUrl, apiToken: config.apiToken ? decrypt(config.apiToken) : null }
      : null;

    // A credencial só existe dentro desta closure e nunca entra na resposta
    // nem em log (Princípio V, FR-008).
    const status = await getCachedN8nStatus(() => fetchN8nWorkflows(connection));

    return NextResponse.json({ status });
  } catch (error) {
    return apiError(error, 'integrations/n8n/status');
  }
}
