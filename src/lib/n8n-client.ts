import { createLogger } from '@/lib/logger';
import {
  n8nWorkflowsEnvelopeSchema,
  n8nExecutionsEnvelopeSchema,
  buildWorkflowStatuses,
  type N8nWorkflow,
  type N8nExecution,
  type WorkflowStatus,
} from '@/lib/n8n-schema';

const log = createLogger('n8n-client');

/** Tempo limite de cada requisição ao n8n. FR-004: estourar cai em `unavailable`. */
export const N8N_REQUEST_TIMEOUT_MS = 5000;

/** Itens por página. A observação mostrou 250 cobrindo toda a instância atual. */
export const N8N_PAGE_SIZE = 250;

/**
 * Teto de páginas por recurso.
 *
 * Existe porque a API pagina por cursor e o histórico de execuções cresce
 * indefinidamente: seguir o cursor sem limite faria a consulta crescer com o
 * tempo de vida do sistema. Atingido o teto, o resultado é marcado como
 * `truncated` — nunca silenciosamente incompleto.
 */
export const N8N_MAX_PAGES = 4;

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
  | {
      state: 'ok';
      workflows: WorkflowStatus[];
      fetchedAt: string;
      /** `true` quando o teto de páginas foi atingido e a lista está incompleta. */
      truncated: boolean;
    }
  | { state: 'unavailable'; reason: 'timeout' | 'network' | 'http_error' | 'invalid_response' }
  | { state: 'not_configured'; reason: 'missing_credential' | 'rejected_credential' };

export interface N8nConnection {
  baseUrl: string;
  apiToken: string | null;
}

type FailureResult = Exclude<N8nStatusResult, { state: 'ok' }>;

/** Página lida com sucesso, ou a falha que impediu a leitura. */
type PageOutcome<T> = { ok: true; items: T[]; truncated: boolean } | { ok: false; failure: FailureResult };

/**
 * Lê um recurso paginado, seguindo `nextCursor` até o fim ou até o teto.
 *
 * A observação (T012) mostrou que `nextCursor` é paginação REAL: com `limit=1`
 * ele vem preenchido. A primeira versão deste cliente fazia uma requisição só e
 * o ignorava — passando do limite, a tela mostraria uma lista incompleta sem
 * nenhum sinal disso, que é a mesma família de defeito que a User Story 2
 * combate. Daí seguir o cursor e, no teto, declarar truncamento.
 */
async function fetchPaginated<T>(
  connection: N8nConnection & { apiToken: string },
  path: string,
  parseEnvelope: (payload: unknown) => { data: T[]; nextCursor?: string | null } | null,
  fetchImpl: typeof fetch,
): Promise<PageOutcome<T>> {
  const base = connection.baseUrl.replace(/\/$/, '');
  const items: T[] = [];
  let cursor: string | null = null;

  for (let page = 0; page < N8N_MAX_PAGES; page++) {
    const url = new URL(`${base}${path}`);
    url.searchParams.set('limit', String(N8N_PAGE_SIZE));
    if (cursor) url.searchParams.set('cursor', cursor);

    let response: Response;
    try {
      response = await fetchImpl(url.toString(), {
        headers: { 'X-N8N-API-KEY': connection.apiToken, Accept: 'application/json' },
        signal: AbortSignal.timeout(N8N_REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      const name = error instanceof Error ? error.name : '';
      // Nunca registrar a credencial nem corpo de execução (Princípio V, FR-008).
      log.warn({ errName: name, path }, 'n8n request failed');
      return {
        ok: false,
        failure: {
          state: 'unavailable',
          reason: name === 'TimeoutError' || name === 'AbortError' ? 'timeout' : 'network',
        },
      };
    }

    // 401/403 significam credencial ausente ou recusada: a ação é configurar,
    // não investigar a instância. Por isso NÃO cai em `unavailable`.
    if (response.status === 401 || response.status === 403) {
      return { ok: false, failure: { state: 'not_configured', reason: 'rejected_credential' } };
    }

    if (!response.ok) {
      log.warn({ status: response.status, path }, 'n8n responded with error status');
      return { ok: false, failure: { state: 'unavailable', reason: 'http_error' } };
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      return { ok: false, failure: { state: 'unavailable', reason: 'invalid_response' } };
    }

    const envelope = parseEnvelope(payload);
    if (!envelope) {
      return { ok: false, failure: { state: 'unavailable', reason: 'invalid_response' } };
    }

    items.push(...envelope.data);
    cursor = envelope.nextCursor ?? null;
    if (!cursor) return { ok: true, items, truncated: false };
  }

  // Saiu pelo teto com cursor ainda pendente: a lista está incompleta e isso
  // precisa chegar à tela.
  log.warn({ path, pages: N8N_MAX_PAGES }, 'n8n pagination cap reached');
  return { ok: true, items, truncated: true };
}

function parseWorkflowsEnvelope(payload: unknown) {
  const parsed = n8nWorkflowsEnvelopeSchema.safeParse(payload);
  return parsed.success ? parsed.data : null;
}

function parseExecutionsEnvelope(payload: unknown) {
  const parsed = n8nExecutionsEnvelopeSchema.safeParse(payload);
  return parsed.success ? parsed.data : null;
}

/**
 * Busca workflows e suas últimas execuções, já casados.
 *
 * Nunca lança: toda falha vira um dos estados acima. Um `throw` daqui obrigaria
 * cada chamador a lembrar do try/catch, e um esquecido renderizaria erro de
 * página em vez do estado honesto — que é o que a User Story 2 proíbe.
 */
export async function fetchN8nWorkflows(
  connection: N8nConnection | null,
  fetchImpl: typeof fetch = fetch,
): Promise<N8nStatusResult> {
  if (!connection?.apiToken || !connection.baseUrl) {
    return { state: 'not_configured', reason: 'missing_credential' };
  }

  const conn = { ...connection, apiToken: connection.apiToken };

  const workflows = await fetchPaginated<N8nWorkflow>(
    conn,
    '/api/v1/workflows',
    parseWorkflowsEnvelope,
    fetchImpl,
  );
  if (!workflows.ok) return workflows.failure;

  const executions = await fetchPaginated<N8nExecution>(
    conn,
    '/api/v1/executions',
    parseExecutionsEnvelope,
    fetchImpl,
  );
  if (!executions.ok) return executions.failure;

  return {
    state: 'ok',
    workflows: buildWorkflowStatuses(workflows.items, executions.items),
    fetchedAt: new Date().toISOString(),
    // Execuções truncadas significam "última execução" possivelmente errada,
    // então o truncamento de qualquer um dos dois recursos conta.
    truncated: workflows.truncated || executions.truncated,
  };
}
