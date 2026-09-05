'use client';

import { useEffect, useId, useState } from 'react';
import Badge, { type BadgeTone } from '@/components/ui/Badge';
import EmptyState from '@/components/ui/EmptyState';
import Spinner from '@/components/ui/Spinner';
import CardDetailPopupModal from '@/components/ui/CardDetailPopupModal';
import { formatDateTime } from '@/lib/utils';
import { ROUTINE_CATEGORIES } from '@/lib/system-routines';
import type { EnrichedSystemRoutine } from '@/lib/system-routines';

type DetailTab = 'detalhes' | 'historico';

type HistoryItem = {
  id: string;
  syncMethod: string;
  status: string;
  newDocs: number;
  updatedDocs: number;
  skippedDocs: number;
  errorMessage: string | null;
  startedAt: string;
  completedAt: string | null;
};

type HistoryResponse = {
  success: boolean;
  source: 'sync_log' | 'none';
  unavailableReason: string | null;
  items: HistoryItem[];
};

function formatAge(ageMs: number | null): string {
  if (ageMs === null || !Number.isFinite(ageMs)) return '—';
  const seconds = Math.floor(ageMs / 1000);
  if (seconds < 60) return `${seconds}s atrás`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}min atrás`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h atrás`;
  return `${Math.floor(hours / 24)}d atrás`;
}

function statusTone(status: string): BadgeTone {
  switch (status) {
    case 'completed':
      return 'success';
    case 'running':
      return 'info';
    case 'partial':
      return 'warning';
    case 'error':
      return 'danger';
    default:
      return 'neutral';
  }
}

function liveStatusBadge(routine: EnrichedSystemRoutine): { tone: BadgeTone; label: string } {
  switch (routine.liveStatus) {
    case 'running':
      return { tone: 'success', label: 'Ativo / Em Execução' };
    case 'stale':
      return { tone: 'warning', label: 'Sem Batimento (Stale)' };
    case 'disabled':
      return { tone: 'neutral', label: 'Desativado' };
    case 'error':
      return { tone: 'danger', label: 'Falha / Erro' };
    case 'worker':
      return { tone: 'info', label: 'Worker / Cron Host' };
    default:
      return { tone: 'info', label: 'Agendado no Sistema' };
  }
}

type Props = {
  routine: EnrichedSystemRoutine | null;
  isOpen: boolean;
  onClose: () => void;
};

export default function RoutineDetailModal({ routine, isOpen, onClose }: Props) {
  const baseId = useId();
  const [tab, setTab] = useState<DetailTab>('detalhes');
  const [historyLoading, setHistoryLoading] = useState(false);
  const [history, setHistory] = useState<HistoryResponse | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setTab('detalhes');
      setHistory(null);
      return;
    }
    setTab('detalhes');
  }, [isOpen, routine?.id]);

  useEffect(() => {
    if (!isOpen || !routine || tab !== 'historico') return;
    let cancelled = false;
    setHistoryLoading(true);
    fetch(`/api/sistema/rotinas/${encodeURIComponent(routine.id)}/history`)
      .then(async (res) => {
        if (!res.ok) throw new Error('fail');
        return res.json() as Promise<HistoryResponse>;
      })
      .then((data) => {
        if (!cancelled) setHistory(data);
      })
      .catch(() => {
        if (!cancelled) {
          setHistory({
            success: false,
            source: 'none',
            unavailableReason: 'Não foi possível carregar o histórico.',
            items: [],
          });
        }
      })
      .finally(() => {
        if (!cancelled) setHistoryLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, routine, tab]);

  if (!routine) return null;

  const live = liveStatusBadge(routine);
  const panelId = `${baseId}-panel`;
  const tabDetalhesId = `${baseId}-detalhes`;
  const tabHistoricoId = `${baseId}-historico`;

  return (
    <CardDetailPopupModal
      isOpen={isOpen}
      onClose={onClose}
      title={routine.name}
      subtitle={`ID: ${routine.id}`}
      icon="schedule"
      badge={<Badge tone={live.tone}>{live.label}</Badge>}
      width="sm:max-w-4xl"
    >
      <div className="flex flex-col min-h-[280px]">
        <div
          role="tablist"
          aria-label="Secções da rotina"
          className="flex items-center gap-1 border-b border-slate-200 dark:border-slate-700 mb-4"
        >
          {(
            [
              { id: 'detalhes' as const, label: 'Detalhes', icon: 'info', tabId: tabDetalhesId },
              { id: 'historico' as const, label: 'Histórico', icon: 'history', tabId: tabHistoricoId },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              id={t.tabId}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              aria-controls={panelId}
              tabIndex={tab === t.id ? 0 : -1}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-bold whitespace-nowrap transition-all border-b-2 -mb-px ${
                tab === t.id
                  ? 'text-primary dark:text-blue-400 border-primary'
                  : 'text-slate-500 dark:text-slate-400 border-transparent hover:text-slate-700 dark:hover:text-slate-200'
              }`}
            >
              <span className="material-symbols-outlined text-[15px]">{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>

        <div role="tabpanel" id={panelId} aria-labelledby={tab === 'detalhes' ? tabDetalhesId : tabHistoricoId}>
          {tab === 'detalhes' ? (
            <div className="grid md:grid-cols-2 gap-4 text-xs">
              <div className="space-y-3">
                <div>
                  <h4 className="font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                    Descrição
                  </h4>
                  <p className="text-slate-600 dark:text-slate-300 leading-relaxed bg-slate-50 dark:bg-slate-900/40 p-3 rounded-lg border border-slate-200 dark:border-slate-700">
                    {routine.description}
                  </p>
                </div>
                <div>
                  <h4 className="font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                    Categoria
                  </h4>
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                    <span className="material-symbols-outlined text-[15px] opacity-70">
                      {ROUTINE_CATEGORIES[routine.category].icon}
                    </span>
                    {routine.categoryLabel}
                  </span>
                </div>
                <div>
                  <h4 className="font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                    Módulos fonte
                  </h4>
                  <p className="font-mono text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-900/40 p-2 rounded-lg border border-slate-200 dark:border-slate-700 break-all">
                    {routine.sourceModule}
                  </p>
                </div>
              </div>
              <div className="space-y-3">
                <div>
                  <h4 className="font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                    Gatilho & frequência
                  </h4>
                  <p className="text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-900/40 p-3 rounded-lg border border-slate-200 dark:border-slate-700">
                    <span className="font-semibold text-slate-800 dark:text-slate-100">{routine.frequency}</span>
                    <br />
                    {routine.triggerTypeLabel}
                    <br />
                    <span className="mt-1 block text-slate-500 dark:text-slate-400">{routine.scheduleDetails}</span>
                  </p>
                </div>
                <div>
                  <h4 className="font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                    Concorrência / Lock
                  </h4>
                  <p className="text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-900/40 p-3 rounded-lg border border-slate-200 dark:border-slate-700">
                    {routine.concurrencyLock}
                  </p>
                </div>
                {routine.environmentVars && routine.environmentVars.length > 0 && (
                  <div>
                    <h4 className="font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                      Variáveis de ambiente
                    </h4>
                    <div className="flex flex-wrap gap-1.5">
                      {routine.environmentVars.map((env) => (
                        <span
                          key={env}
                          className="font-mono text-xs bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-2 py-0.5 rounded"
                        >
                          {env}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {routine.lastHeartbeatAt && (
                  <p className="text-slate-500 dark:text-slate-400">
                    Último batimento:{' '}
                    <span className="font-semibold text-slate-700 dark:text-slate-200">
                      {formatDateTime(routine.lastHeartbeatAt)} ({formatAge(routine.lastHeartbeatAgeMs)})
                    </span>
                  </p>
                )}
                {routine.lastError && (
                  <div className="text-xs bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 p-2.5 rounded-lg border border-red-200 dark:border-red-800">
                    <span className="font-bold">Último erro:</span> {routine.lastError}
                  </div>
                )}
              </div>
            </div>
          ) : historyLoading ? (
            <div className="flex justify-center py-12">
              <Spinner />
            </div>
          ) : history?.source === 'none' || (history && history.items.length === 0 && history.unavailableReason) ? (
            <EmptyState
              icon="history"
              title="Sem histórico de execução"
              hint={history?.unavailableReason || 'Nenhuma execução registrada.'}
            />
          ) : !history || history.items.length === 0 ? (
            <EmptyState
              icon="history"
              title="Nenhuma execução registrada"
              hint="Ainda não há linhas de SyncLog para esta rotina."
            />
          ) : (
            <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    <th className="py-2.5 px-3">Início</th>
                    <th className="py-2.5 px-3">Método</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3 text-right">Novos</th>
                    <th className="py-2.5 px-3 text-right">Atualizados</th>
                    <th className="py-2.5 px-3">Fim</th>
                    <th className="py-2.5 px-3">Erro</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {history.items.map((item) => (
                    <tr key={item.id}>
                      <td className="py-2 px-3 whitespace-nowrap tabular-nums text-slate-700 dark:text-slate-200">
                        {formatDateTime(item.startedAt)}
                      </td>
                      <td className="py-2 px-3 font-mono text-slate-600 dark:text-slate-300">{item.syncMethod}</td>
                      <td className="py-2 px-3">
                        <Badge tone={statusTone(item.status)}>{item.status}</Badge>
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums">{item.newDocs}</td>
                      <td className="py-2 px-3 text-right tabular-nums">{item.updatedDocs}</td>
                      <td className="py-2 px-3 whitespace-nowrap tabular-nums text-slate-600 dark:text-slate-300">
                        {item.completedAt ? formatDateTime(item.completedAt) : '—'}
                      </td>
                      <td className="py-2 px-3 max-w-[14rem] truncate text-slate-500 dark:text-slate-400" title={item.errorMessage || undefined}>
                        {item.errorMessage || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </CardDetailPopupModal>
  );
}
