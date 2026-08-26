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
 * D4 da SPEC-011, DECIDIDO pelo dono em 2026-08-26: `viewer`, o piso da
 * hierarquia. Preserva quem enxerga a tela hoje — ela nunca verificou papel —
 * enquanto move a autorização para o servidor, onde o Princípio II a exige.
 *
 * O que está protegido não é o status em si, e sim a CREDENCIAL: ela é lida,
 * decifrada e usada só dentro desta rota, e nunca sai na resposta. Gravar a
 * chave continua exigindo admin, em config/route.ts — ler o resultado dela é
 * outra pergunta, e é a que o dono decidiu abrir.
 *
 * Consequência: com `viewer` no piso, o ramo de FORBIDDEN abaixo é
 * inalcançável — requireSessionRole só lança FORBIDDEN quando o papel fica
 * ABAIXO do mínimo. Mantido de propósito, para continuar correto se esta
 * constante subir; é o único ponto que precisaria mudar.
 */
const REQUIRED_ROLE = 'viewer' as const;

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
