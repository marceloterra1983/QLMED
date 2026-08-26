import { createLogger } from '@/lib/logger';

const log = createLogger('n8n-client');

/** Tempo limite de cada requisição ao n8n. FR-004: estourar cai em `unavailable`. */
export const N8N_REQUEST_TIMEOUT_MS = 5000;

export interface N8nWorkflowSummary {
  id: string;
  name: string;
  active: boolean;
}

/**
 * Resultado de uma consulta ao n8n — união discriminada de propósito.
 *
 * Decisão D2 da SPEC-011: falha de integração é ESTADO DE DADO, não exceção.
 * Os três estados são mutuamente exclusivos, e só `ok` carrega workflows —
 * o consumidor não consegue ler status de um resultado que não o tem, o que
 * torna impossível a tela "inventar saúde" quando a fonte caiu.
 *
 * `not_configured` e `unavailable` são separados porque a ação do
 * administrador é diferente: configurar uma chave, ou investigar a instância.
 */
export type N8nStatusResult =
  | { state: 'ok'; workflows: N8nWorkflowSummary[]; fetchedAt: string }
  | { state: 'unavailable'; reason: 'timeout' | 'network' | 'http_error' | 'invalid_response' }
  | { state: 'not_configured'; reason: 'missing_credential' | 'rejected_credential' };

export interface N8nConnection {
  baseUrl: string;
  apiToken: string | null;
}

/**
 * Busca os workflows do n8n.
 *
 * Nunca lança: toda falha vira um dos estados acima. Um `throw` daqui obrigaria
 * cada chamador a lembrar do try/catch, e um esquecido renderizaria erro de
 * página em vez do estado honesto — que é exatamente o que a User Story 2 proíbe.
 *
 * A validação do formato da resposta NÃO está aqui. Escrever o schema exige
 * observar uma resposta real do n8n (tarefas T012–T013), e o plano proíbe
 * escrevê-lo de memória. Até lá, `parseWorkflows` é o ponto de extensão e
 * qualquer resposta que não case com o mínimo esperado cai em
 * `invalid_response` — falha fechada, nunca renderizada pela metade.
 */
export async function fetchN8nWorkflows(
  connection: N8nConnection | null,
  fetchImpl: typeof fetch = fetch,
): Promise<N8nStatusResult> {
  if (!connection?.apiToken || !connection.baseUrl) {
    return { state: 'not_configured', reason: 'missing_credential' };
  }

  let response: Response;
  try {
    response = await fetchImpl(`${connection.baseUrl.replace(/\/$/, '')}/api/v1/workflows`, {
      headers: { 'X-N8N-API-KEY': connection.apiToken, Accept: 'application/json' },
      signal: AbortSignal.timeout(N8N_REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    const name = error instanceof Error ? error.name : '';
    // Nunca registrar a credencial nem corpo de execução (Princípio V, FR-008).
    log.warn({ errName: name }, 'n8n request failed');
    return {
      state: 'unavailable',
      reason: name === 'TimeoutError' || name === 'AbortError' ? 'timeout' : 'network',
    };
  }

  // 401/403 significam credencial ausente ou recusada: a ação é configurar,
  // não investigar a instância. Por isso NÃO cai em `unavailable`.
  if (response.status === 401 || response.status === 403) {
    return { state: 'not_configured', reason: 'rejected_credential' };
  }

  if (!response.ok) {
    log.warn({ status: response.status }, 'n8n responded with error status');
    return { state: 'unavailable', reason: 'http_error' };
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return { state: 'unavailable', reason: 'invalid_response' };
  }

  const workflows = parseWorkflows(payload);
  if (!workflows) {
    return { state: 'unavailable', reason: 'invalid_response' };
  }

  return { state: 'ok', workflows, fetchedAt: new Date().toISOString() };
}

/**
 * Extrai os workflows da resposta do n8n.
 *
 * Provisório e deliberadamente MÍNIMO: valida só o que a documentação pública
 * da API v1 garante (um envelope `data` com id, name e active). O schema Zod
 * completo vem em T013, contra uma resposta real observada — o plano proíbe
 * escrevê-lo de memória, e adivinhar campos aqui seria justamente isso.
 *
 * Devolve `null` quando o formato não bate, e o chamador transforma isso em
 * `invalid_response`. Nunca devolve lista parcial: meia verdade renderizada é
 * pior que indisponibilidade declarada.
 */
export function parseWorkflows(payload: unknown): N8nWorkflowSummary[] | null {
  if (!payload || typeof payload !== 'object') return null;
  const data = (payload as { data?: unknown }).data;
  if (!Array.isArray(data)) return null;

  const workflows: N8nWorkflowSummary[] = [];
  for (const item of data) {
    if (!item || typeof item !== 'object') return null;
    const { id, name, active } = item as { id?: unknown; name?: unknown; active?: unknown };
    if (typeof id !== 'string' && typeof id !== 'number') return null;
    if (typeof name !== 'string') return null;
    if (typeof active !== 'boolean') return null;
    workflows.push({ id: String(id), name, active });
  }
  return workflows;
}
