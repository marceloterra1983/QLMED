import { z } from 'zod';

/**
 * Schemas da API do n8n, escritos contra o formato REALMENTE observado em
 * 2026-08-26 (n8n 2.29.10). Ver specs/011-n8n-workflow-status/contracts/.
 *
 * Nada aqui foi escrito de memória: o plano proíbe, e a observação provou o
 * motivo — ver a nota sobre `status` mais abaixo.
 */

/** `id` veio sempre string na observação, mas número é aceito e normalizado. */
const idLike = z.union([z.string(), z.number()]).transform(String);

/**
 * Item de workflow. `.passthrough()` de propósito: a resposta traz `nodes`,
 * `connections`, `activeVersion` e `staticData` (~15 KB por workflow) que a
 * feature não usa e não deve guardar. Validar só os três campos usados evita
 * que uma mudança em campo irrelevante derrube a tela para `unavailable`.
 */
export const n8nWorkflowSchema = z
  .object({
    id: idLike,
    name: z.string(),
    active: z.boolean(),
  })
  .passthrough();

export const n8nWorkflowsEnvelopeSchema = z.object({
  data: z.array(n8nWorkflowSchema),
  nextCursor: z.string().nullable().optional(),
});

/**
 * Item de execução.
 *
 * `status` é `z.string()` e NÃO um enum fechado — esta é a decisão mais
 * importante do arquivo. A observação viu só `success` e `error` em 17
 * execuções, mas o n8n também emite `running`, `waiting`, `canceled`,
 * `crashed` e `new`. Um enum com os dois observados faria uma execução em
 * andamento REPROVAR a validação e derrubar a tela inteira para
 * "não consigo saber" — transformando informação legítima em indisponibilidade.
 *
 * O desconhecido é tratado em `mapExecutionOutcome`, não recusado aqui.
 */
export const n8nExecutionSchema = z
  .object({
    id: idLike,
    workflowId: idLike,
    status: z.string(),
    startedAt: z.string().nullable().optional(),
    stoppedAt: z.string().nullable().optional(),
  })
  .passthrough();

export const n8nExecutionsEnvelopeSchema = z.object({
  data: z.array(n8nExecutionSchema),
  nextCursor: z.string().nullable().optional(),
});

export type N8nWorkflow = z.infer<typeof n8nWorkflowSchema>;
export type N8nExecution = z.infer<typeof n8nExecutionSchema>;

/** Desfecho de uma execução, na linguagem da tela e não na do n8n. */
export type ExecutionOutcome = 'success' | 'failure' | 'running' | 'canceled' | 'unknown';

/**
 * Traduz o `status` cru do n8n para o desfecho que a tela mostra.
 *
 * Status não reconhecido vira `unknown` — nunca sucesso, nunca falha. Um
 * status novo em versão futura do n8n degrada para "não sei dizer" naquele
 * workflow, em vez de derrubar a consulta inteira ou, pior, ser exibido como
 * saúde.
 */
export function mapExecutionOutcome(rawStatus: string): ExecutionOutcome {
  switch (rawStatus) {
    case 'success':
      return 'success';
    case 'error':
    case 'crashed':
      return 'failure';
    case 'running':
    case 'waiting':
    case 'new':
      return 'running';
    case 'canceled':
      return 'canceled';
    default:
      return 'unknown';
  }
}

export interface WorkflowLastExecution {
  id: string;
  outcome: ExecutionOutcome;
  /** Status cru, preservado para diagnóstico quando `outcome` é `unknown`. */
  rawStatus: string;
  startedAt: string | null;
  stoppedAt: string | null;
}

export interface WorkflowStatus {
  id: string;
  name: string;
  active: boolean;
  /**
   * `null` significa NUNCA EXECUTADO — cenário 3 da User Story 1.
   *
   * Resolvido pela AUSÊNCIA de execução para aquele workflowId, não por um
   * campo: a observação confirmou que a API não expõe "nunca executou" de
   * outra forma. Distinto de sucesso e distinto de falha.
   */
  lastExecution: WorkflowLastExecution | null;
}

/**
 * Casa workflows com sua execução mais recente.
 *
 * "Mais recente" = maior `startedAt`. A spec deixou em aberto o critério
 * quando há execuções concorrentes (a que iniciou por último ou a que terminou
 * por último); adotado `startedAt` por ser o único presente em toda execução,
 * inclusive nas que ainda não terminaram. Ordena explicitamente em vez de
 * confiar na ordem da API, que não é documentada.
 */
export function buildWorkflowStatuses(
  workflows: readonly N8nWorkflow[],
  executions: readonly N8nExecution[],
): WorkflowStatus[] {
  const latestByWorkflow = new Map<string, N8nExecution>();

  for (const execution of executions) {
    const current = latestByWorkflow.get(execution.workflowId);
    if (!current || (execution.startedAt ?? '') > (current.startedAt ?? '')) {
      latestByWorkflow.set(execution.workflowId, execution);
    }
  }

  return workflows.map((workflow) => {
    const execution = latestByWorkflow.get(workflow.id);
    return {
      id: workflow.id,
      name: workflow.name,
      active: workflow.active,
      lastExecution: execution
        ? {
            id: execution.id,
            outcome: mapExecutionOutcome(execution.status),
            rawStatus: execution.status,
            startedAt: execution.startedAt ?? null,
            stoppedAt: execution.stoppedAt ?? null,
          }
        : null,
    };
  });
}
