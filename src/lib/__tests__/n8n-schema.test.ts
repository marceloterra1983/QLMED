import { describe, it, expect } from 'vitest';
import {
  n8nWorkflowsEnvelopeSchema,
  n8nExecutionsEnvelopeSchema,
  mapExecutionOutcome,
  buildWorkflowStatuses,
} from '@/lib/n8n-schema';

/**
 * Fixtures com a FORMA observada em 2026-08-26 contra n8n 2.29.10, registrada
 * em specs/011-n8n-workflow-status/contracts/n8n-api-observed.md.
 *
 * Anonimizadas: nomes genéricos, nenhum parâmetro de nó, nenhum conteúdo de
 * execução, nenhuma credencial (Princípio V).
 */
const WORKFLOWS_RESPONSE = {
  data: [
    {
      id: 'wf-um',
      name: 'Workflow Um',
      active: true,
      isArchived: false,
      createdAt: '2026-02-25T02:20:00.000Z',
      updatedAt: '2026-08-20T14:00:00.000Z',
      versionId: 'v1',
      activeVersionId: 'v1',
      triggerCount: 1,
      nodes: [{}, {}, {}],
      connections: {},
      activeVersion: {},
      staticData: {},
      settings: { executionOrder: 'v1' },
      shared: [{}],
      tags: [],
      meta: null,
      pinData: null,
      nodeGroups: [],
    },
  ],
  nextCursor: null,
};

const EXECUTIONS_RESPONSE = {
  data: [
    {
      id: '46157',
      workflowId: 'wf-um',
      status: 'success',
      mode: 'webhook',
      finished: true,
      startedAt: '2026-08-26T12:00:00.000Z',
      stoppedAt: '2026-08-26T12:00:05.000Z',
      waitTill: null,
      retryOf: null,
      retrySuccessId: null,
    },
  ],
  nextCursor: null,
};

describe('schemas contra o formato observado', () => {
  it('aceita a resposta real de /api/v1/workflows', () => {
    const parsed = n8nWorkflowsEnvelopeSchema.safeParse(WORKFLOWS_RESPONSE);
    expect(parsed.success).toBe(true);
  });

  it('aceita a resposta real de /api/v1/executions', () => {
    const parsed = n8nExecutionsEnvelopeSchema.safeParse(EXECUTIONS_RESPONSE);
    expect(parsed.success).toBe(true);
  });

  it('id numérico é normalizado para string', () => {
    const parsed = n8nWorkflowsEnvelopeSchema.parse({
      data: [{ id: 7, name: 'W', active: false }],
    });
    expect(parsed.data[0].id).toBe('7');
  });

  it('recusa item sem os campos que a feature usa', () => {
    expect(n8nWorkflowsEnvelopeSchema.safeParse({ data: [{ id: '1', name: 'W' }] }).success).toBe(false);
    expect(n8nWorkflowsEnvelopeSchema.safeParse({ data: [{ id: '1', active: true }] }).success).toBe(false);
  });

  it('recusa payload sem envelope data', () => {
    expect(n8nWorkflowsEnvelopeSchema.safeParse({ workflows: [] }).success).toBe(false);
  });

  it('nextCursor ausente é aceito — nem toda resposta o traz', () => {
    expect(n8nWorkflowsEnvelopeSchema.safeParse({ data: [] }).success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// A decisão mais importante do schema, e o motivo de T012 existir: só `success`
// e `error` foram observados em 17 execuções, mas o n8n emite outros. Enum
// fechado nos observados faria uma execução em andamento derrubar a tela.
// ---------------------------------------------------------------------------
describe('mapExecutionOutcome', () => {
  it('traduz os dois status observados', () => {
    expect(mapExecutionOutcome('success')).toBe('success');
    expect(mapExecutionOutcome('error')).toBe('failure');
  });

  it('traduz os status documentados mas NÃO observados', () => {
    expect(mapExecutionOutcome('crashed')).toBe('failure');
    expect(mapExecutionOutcome('running')).toBe('running');
    expect(mapExecutionOutcome('waiting')).toBe('running');
    expect(mapExecutionOutcome('new')).toBe('running');
    expect(mapExecutionOutcome('canceled')).toBe('canceled');
  });

  it('status desconhecido vira unknown — nunca sucesso, nunca falha', () => {
    expect(mapExecutionOutcome('inventado_na_v3')).toBe('unknown');
    expect(mapExecutionOutcome('')).toBe('unknown');
  });

  it('o schema ACEITA status desconhecido, em vez de invalidar a resposta', () => {
    const parsed = n8nExecutionsEnvelopeSchema.safeParse({
      data: [{ id: '1', workflowId: 'w', status: 'status_futuro' }],
    });
    expect(parsed.success).toBe(true);
  });
});

describe('buildWorkflowStatuses', () => {
  const wf = (id: string, name = 'W', active = true) => ({ id, name, active });
  const ex = (id: string, workflowId: string, status: string, startedAt: string) => ({
    id, workflowId, status, startedAt,
  });

  it('workflow sem execução tem lastExecution null — nunca executado', () => {
    const [status] = buildWorkflowStatuses([wf('1')], []);
    expect(status.lastExecution).toBeNull();
  });

  it('distingue nunca-executado de executado-com-sucesso', () => {
    const [nunca, ok] = buildWorkflowStatuses(
      [wf('1'), wf('2')],
      [ex('e1', '2', 'success', '2026-08-26T10:00:00Z')],
    );
    expect(nunca.lastExecution).toBeNull();
    expect(ok.lastExecution?.outcome).toBe('success');
  });

  it('escolhe a de startedAt maior, independente da ordem recebida', () => {
    const [status] = buildWorkflowStatuses(
      [wf('1')],
      [
        ex('nova', '1', 'error', '2026-08-26T10:00:00Z'),
        ex('antiga', '1', 'success', '2026-01-01T10:00:00Z'),
      ],
    );
    expect(status.lastExecution?.id).toBe('nova');
  });

  it('não atribui execução de um workflow a outro', () => {
    const [a, b] = buildWorkflowStatuses(
      [wf('1'), wf('2')],
      [ex('e1', '1', 'success', '2026-08-26T10:00:00Z')],
    );
    expect(a.lastExecution?.id).toBe('e1');
    expect(b.lastExecution).toBeNull();
  });

  it('preserva o status cru para diagnóstico quando o desfecho é unknown', () => {
    const [status] = buildWorkflowStatuses(
      [wf('1')],
      [ex('e1', '1', 'algo_novo', '2026-08-26T10:00:00Z')],
    );
    expect(status.lastExecution?.outcome).toBe('unknown');
    expect(status.lastExecution?.rawStatus).toBe('algo_novo');
  });

  it('preserva o estado ativo/pausado do workflow', () => {
    const [ativo, pausado] = buildWorkflowStatuses([wf('1', 'A', true), wf('2', 'B', false)], []);
    expect(ativo.active).toBe(true);
    expect(pausado.active).toBe(false);
  });
});
