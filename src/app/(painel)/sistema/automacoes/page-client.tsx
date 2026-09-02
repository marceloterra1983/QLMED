'use client';

import { useEffect, useState } from 'react';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import PageHeader from '@/components/PageHeader';

/**
 * Tela de Automações — SPEC-011, Fase F.
 *
 * A lista fixa que vivia aqui saiu: o dado vem da API do n8n, pela rota
 * interna. E o mais importante desta tela não é o caminho feliz, é o infeliz —
 * quando o n8n não responde, ela precisa DIZER isso, e não mostrar cartões que
 * parecem saudáveis (User Story 2).
 *
 * A inferência que trocava `app.` por `n8n.` no host da requisição também saiu:
 * derivar destino a partir do host de entrada é padrão de SSRF, e o servidor
 * agora usa só o endereço configurado (decisão D5). `NEXT_PUBLIC_N8N_URL`
 * permanece apenas para o link de navegação no navegador.
 */

type Outcome = 'success' | 'failure' | 'running' | 'canceled' | 'unknown';

interface LastExecution {
  id: string;
  outcome: Outcome;
  rawStatus: string;
  startedAt: string | null;
  stoppedAt: string | null;
}

interface WorkflowStatus {
  id: string;
  name: string;
  active: boolean;
  lastExecution: LastExecution | null;
}

type StatusPayload =
  | { state: 'ok'; workflows: WorkflowStatus[]; fetchedAt: string; truncated: boolean; cached: boolean; ageMs: number }
  | { state: 'unavailable'; reason: string }
  | { state: 'not_configured'; reason: string };

const OUTCOME_UI: Record<Outcome, { label: string; icon: string; classes: string }> = {
  success: { label: 'Sucesso', icon: 'check_circle', classes: 'text-emerald-600 dark:text-emerald-400' },
  failure: { label: 'Falhou', icon: 'error', classes: 'text-red-600 dark:text-red-400' },
  running: { label: 'Em execução', icon: 'sync', classes: 'text-blue-600 dark:text-blue-400' },
  canceled: { label: 'Cancelada', icon: 'cancel', classes: 'text-slate-500 dark:text-slate-400' },
  unknown: { label: 'Desconhecido', icon: 'help', classes: 'text-slate-500 dark:text-slate-400' },
};

function formatWhen(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

/** Aviso de estado, usado pelos dois caminhos infelizes. */
function StateNotice({
  icon,
  title,
  detail,
  tone,
}: {
  icon: string;
  title: string;
  detail: string;
  tone: 'amber' | 'slate';
}) {
  const toneClasses =
    tone === 'amber'
      ? 'border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/10 text-amber-700 dark:text-amber-400'
      : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 text-slate-600 dark:text-slate-400';
  return (
    <div className={`flex items-start gap-3 rounded-xl border px-4 py-3 ${toneClasses}`}>
      <span className="material-symbols-outlined text-[20px] flex-shrink-0">{icon}</span>
      <div>
        <p className="text-sm font-semibold">{title}</p>
        <p className="text-xs mt-0.5 opacity-90">{detail}</p>
      </div>
    </div>
  );
}

export default function AutomacoesPage() {
  const [status, setStatus] = useState<StatusPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const n8nUrl = process.env.NEXT_PUBLIC_N8N_URL || '';

  useEffect(() => {
    let cancelled = false;
    fetch('/api/integrations/n8n/status')
      .then((res) => {
        if (!res.ok) throw new Error('falha ao consultar');
        return res.json();
      })
      .then((data) => {
        if (!cancelled) setStatus(data.status ?? null);
      })
      .catch(() => {
        // Falha da NOSSA rota, não do n8n. Cai no mesmo estado honesto: não
        // sabemos, e por isso não mostramos workflow nenhum.
        if (!cancelled) setStatus({ state: 'unavailable', reason: 'network' });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader
        icon="account_tree"
        title="Automações"
        subtitle="Workflows do n8n que mantêm o QLMED sincronizado."
        showTitleOnMobile
        actions={n8nUrl ? (
          <Button href={n8nUrl} external target="_blank" rel="noopener noreferrer" variant="secondary" icon="open_in_new">
            Abrir n8n
          </Button>
        ) : undefined}
      />

      {loading && (
        <div className="bg-white dark:bg-card-dark rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm p-6">
          <p className="text-sm text-slate-500 dark:text-slate-400">Consultando o n8n...</p>
        </div>
      )}

      {/* Integração não configurada — a ação é configurar a chave. */}
      {!loading && status?.state === 'not_configured' && (
        <StateNotice
          tone="slate"
          icon="link_off"
          title="Integração com o n8n não configurada"
          detail="Cadastre o endereço e a chave de API em Configurações para ver o estado dos workflows aqui."
        />
      )}

      {/* Indisponível — a ação é investigar a instância. NENHUM cartão. */}
      {!loading && status?.state === 'unavailable' && (
        <StateNotice
          tone="amber"
          icon="cloud_off"
          title="Não foi possível consultar o n8n"
          detail="O estado dos workflows não é exibido enquanto a consulta falhar — mostrar dado antigo aqui daria falsa impressão de que está tudo certo."
        />
      )}

      {!loading && status?.state === 'ok' && (
        <>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {status.workflows.length} workflow{status.workflows.length === 1 ? '' : 's'}
              {' · consultado '}
              {status.cached ? `há ${Math.round(status.ageMs / 1000)}s` : 'agora'}
            </span>
          </div>

          {status.truncated && (
            <StateNotice
              tone="amber"
              icon="filter_list_off"
              title="Lista incompleta"
              detail="Há mais workflows do que esta consulta alcançou. O que aparece abaixo é um recorte, não o conjunto completo."
            />
          )}

          {status.workflows.length === 0 ? (
            <StateNotice
              tone="slate"
              icon="inbox"
              title="Nenhum workflow no n8n"
              detail="A consulta funcionou; a instância não tem workflows cadastrados."
            />
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {status.workflows.map((w) => {
                const ui = w.lastExecution ? OUTCOME_UI[w.lastExecution.outcome] : null;
                return (
                  <div
                    key={w.id}
                    className="bg-white dark:bg-card-dark border border-slate-200 dark:border-slate-700 rounded-xl p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="font-semibold text-slate-900 dark:text-white text-sm min-w-0 truncate">{w.name}</h3>
                      <Badge tone={w.active ? 'success' : 'neutral'} className="shrink-0">
                        {w.active ? 'Ativo' : 'Pausado'}
                      </Badge>
                    </div>

                    <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                      <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                        Última execução
                      </p>
                      {w.lastExecution && ui ? (
                        <div className="flex items-center gap-2 mt-1">
                          <span className={`material-symbols-outlined text-[16px] ${ui.classes}`}>{ui.icon}</span>
                          <span className={`text-xs font-semibold ${ui.classes}`}>{ui.label}</span>
                          <span className="text-xs text-slate-500 dark:text-slate-400">
                            · {formatWhen(w.lastExecution.startedAt)}
                          </span>
                        </div>
                      ) : (
                        /* Ausência de execução — distinto de sucesso e de falha. */
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Nunca executado</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
