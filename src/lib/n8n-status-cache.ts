import type { N8nStatusResult } from '@/lib/n8n-client';

/**
 * Janela do cache. Curta de propósito: quanto menor, mais fresco e mais carga.
 * Calibração fina é pendência registrada no plano (D3).
 */
export const N8N_STATUS_CACHE_TTL_MS = 30_000;

interface CacheEntry {
  result: N8nStatusResult;
  fetchedAtMs: number;
}

/**
 * Cache do status do n8n, compartilhado entre pedidos do mesmo processo.
 *
 * Existe por causa do FR-005: a carga sobre o n8n não pode acompanhar o número
 * de administradores com a tela aberta. Uma consulta por carregamento de página
 * não serve.
 *
 * Limite aceito e declarado (D3): em cenário multiprocesso cada processo tem o
 * seu, então a carga é proporcional a processos, não a usuários — o que ainda
 * satisfaz FR-005. Cache entre processos exigiria armazenamento externo e não
 * se justifica nesta escala.
 */
let entry: CacheEntry | null = null;

/**
 * Devolve o status, consultando o n8n só quando a janela expirou.
 *
 * SÓ resultados `ok` são guardados. Falha nunca entra no cache: se a consulta
 * falhar, o chamador recebe a falha atual, e não um `ok` antigo que pareceria
 * saúde presente. É a escolha conservadora de D3 — a spec permitiria exibir o
 * antigo com a idade declarada, e este código deliberadamente não o faz.
 */
export async function getCachedN8nStatus(
  load: () => Promise<N8nStatusResult>,
  nowMs: number = Date.now(),
): Promise<N8nStatusResult & { cached: boolean; ageMs: number }> {
  if (entry && nowMs - entry.fetchedAtMs < N8N_STATUS_CACHE_TTL_MS) {
    return { ...entry.result, cached: true, ageMs: nowMs - entry.fetchedAtMs };
  }

  const result = await load();
  if (result.state === 'ok') {
    entry = { result, fetchedAtMs: nowMs };
  }
  return { ...result, cached: false, ageMs: 0 };
}

/** Descarta o cache. Existe para os testes e para uma atualização forçada. */
export function clearN8nStatusCache(): void {
  entry = null;
}
