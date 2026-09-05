'use client';

import { useEffect, useMemo, useState } from 'react';
import PageHeader from '@/components/PageHeader';
import Card from '@/components/ui/Card';
import Badge, { type BadgeTone } from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import EmptyState from '@/components/ui/EmptyState';
import Section from '@/components/ui/Section';
import { formatTime } from '@/lib/utils';
import {
  ROUTINE_CATEGORIES,
  ROUTINE_PAGE_SECTION_META,
  SYSTEM_ROUTINES,
  groupRoutinesByPageSection,
  type RoutineCategory,
  type RoutineTriggerType,
} from '@/lib/system-routines';
import type { EnrichedSystemRoutine } from '@/lib/system-routines';
import RoutineDetailModal from './RoutineDetailModal';

type FilterCategory = 'all' | RoutineCategory;
type FilterTrigger = 'all' | RoutineTriggerType;

interface ApiResponse {
  success: boolean;
  routines: EnrichedSystemRoutine[];
  summary: {
    totalRoutines: number;
    backgroundServicesCount: number;
    activeServicesCount: number;
    errorServicesCount: number;
    recentSyncs24h: number;
    pendingOutbox: number;
  };
  timestamp: string;
}

function formatAge(ageMs: number | null): string {
  if (ageMs === null || !Number.isFinite(ageMs)) return '—';
  const seconds = Math.floor(ageMs / 1000);
  if (seconds < 60) return `${seconds}s atrás`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}min atrás`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h atrás`;
  const days = Math.floor(hours / 24);
  return `${days}d atrás`;
}

function getStatusBadge(routine: EnrichedSystemRoutine): { tone: BadgeTone; label: string } {
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
    case 'scheduled':
    default:
      return { tone: 'info', label: 'Agendado no Sistema' };
  }
}

function triggerIcon(routine: EnrichedSystemRoutine): string {
  if (routine.triggerType === 'background_service') return 'autorenew';
  if (routine.triggerType === 'worker_cron') return 'terminal';
  if (routine.triggerType === 'scheduled_timer') return 'alarm';
  return 'sensors';
}

export default function RotinasPageClient() {
  const [routines, setRoutines] = useState<EnrichedSystemRoutine[]>(() =>
    SYSTEM_ROUTINES.map((r) => ({
      ...r,
      liveStatus: r.triggerType === 'worker_cron' ? 'worker' : 'scheduled',
      liveStatusLabel: r.triggerType === 'worker_cron' ? 'Worker do Host' : 'Agendado no Sistema',
      lastHeartbeatAt: null,
      lastHeartbeatAgeMs: null,
      lastError: null,
    })),
  );
  const [summary, setSummary] = useState<ApiResponse['summary'] | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<FilterCategory>('all');
  const [selectedTrigger, setSelectedTrigger] = useState<FilterTrigger>('all');
  const [selectedRoutineId, setSelectedRoutineId] = useState<string | null>(null);

  const fetchRoutines = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/sistema/rotinas');
      if (!res.ok) throw new Error('Falha ao carregar');
      const data: ApiResponse = await res.json();
      if (data.success && Array.isArray(data.routines)) {
        setRoutines(data.routines);
        setSummary(data.summary);
        setLastUpdated(data.timestamp);
      }
    } catch {
      // Mantém catálogo padrão offline
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchRoutines();
  }, []);

  const filteredRoutines = useMemo(() => {
    return routines.filter((r) => {
      if (selectedCategory !== 'all' && r.category !== selectedCategory) return false;
      if (selectedTrigger !== 'all' && r.triggerType !== selectedTrigger) return false;
      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase();
        return (
          r.name.toLowerCase().includes(query) ||
          r.description.toLowerCase().includes(query) ||
          r.sourceModule.toLowerCase().includes(query) ||
          r.concurrencyLock.toLowerCase().includes(query) ||
          r.categoryLabel.toLowerCase().includes(query)
        );
      }
      return true;
    });
  }, [routines, selectedCategory, selectedTrigger, searchTerm]);

  const sectionGroups = useMemo(
    () => groupRoutinesByPageSection(filteredRoutines),
    [filteredRoutines],
  );

  const isFiltering =
    searchTerm.trim() !== '' || selectedCategory !== 'all' || selectedTrigger !== 'all';

  const selectedRoutine = selectedRoutineId
    ? routines.find((r) => r.id === selectedRoutineId) ?? null
    : null;

  const openDetail = (id: string) => setSelectedRoutineId(id);
  const clearFilters = () => {
    setSearchTerm('');
    setSelectedCategory('all');
    setSelectedTrigger('all');
  };

  return (
    <div className="space-y-6">
      <PageHeader
        icon="schedule"
        title="Rotinas"
        subtitle="Relação e monitoramento de todas as rotinas que o código do portal realiza hoje."
        showTitleOnMobile
        actions={
          <div className="flex items-center gap-2">
            {lastUpdated && (
              <span className="text-xs text-slate-500 dark:text-slate-400 hidden sm:inline">
                Atualizado às {formatTime(lastUpdated)}
              </span>
            )}
            <Button
              variant="secondary"
              size="sm"
              icon="refresh"
              onClick={fetchRoutines}
              disabled={loading}
            >
              {loading ? 'Atualizando...' : 'Atualizar Status'}
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card padding="md">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-[28px] text-primary dark:text-blue-400">
              account_tree
            </span>
            <div>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Total de Rotinas
              </p>
              <p className="text-xl font-bold text-slate-900 dark:text-white">{routines.length}</p>
            </div>
          </div>
        </Card>
        <Card padding="md">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-[28px] text-emerald-600 dark:text-emerald-400">
              play_circle
            </span>
            <div>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Background Ativos
              </p>
              <p className="text-xl font-bold text-slate-900 dark:text-white">
                {summary
                  ? summary.activeServicesCount
                  : routines.filter((r) => r.triggerType === 'background_service').length}
              </p>
            </div>
          </div>
        </Card>
        <Card padding="md">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-[28px] text-blue-600 dark:text-blue-400">
              update
            </span>
            <div>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Agendadas / Cron
              </p>
              <p className="text-xl font-bold text-slate-900 dark:text-white">
                {routines.filter(
                  (r) => r.triggerType === 'scheduled_timer' || r.triggerType === 'worker_cron',
                ).length}
              </p>
            </div>
          </div>
        </Card>
        <Card padding="md">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-[28px] text-purple-600 dark:text-purple-400">
              lock
            </span>
            <div>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Com Advisory Lock
              </p>
              <p className="text-xl font-bold text-slate-900 dark:text-white">
                {routines.filter((r) => r.concurrencyLock.toLowerCase().includes('lock')).length}
              </p>
            </div>
          </div>
        </Card>
      </div>

      <Card padding="md">
        <div className="flex flex-col md:flex-row gap-4 items-stretch md:items-center justify-between">
          <div className="relative flex-1 max-w-md">
            <span className="material-symbols-outlined text-[20px] text-slate-500 dark:text-slate-400 absolute left-3 top-1/2 -translate-y-1/2">
              search
            </span>
            <input
              type="text"
              aria-label="Buscar rotinas por nome, módulo ou descrição"
              placeholder="Buscar por rotina, módulo, lock ou descrição..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white placeholder:text-slate-500 dark:placeholder:text-slate-400"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="Filtrar por categoria"
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value as FilterCategory)}
              className="text-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-700 dark:text-slate-200"
            >
              <option value="all">Todas as Categorias</option>
              {Object.entries(ROUTINE_CATEGORIES).map(([key, cat]) => (
                <option key={key} value={key}>
                  {cat.label}
                </option>
              ))}
            </select>
            <select
              aria-label="Filtrar por tipo de gatilho"
              value={selectedTrigger}
              onChange={(e) => setSelectedTrigger(e.target.value as FilterTrigger)}
              className="text-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-700 dark:text-slate-200"
            >
              <option value="all">Todos os Gatilhos</option>
              <option value="background_service">Background Service (Contínuo)</option>
              <option value="scheduled_timer">Agendamento / Timer</option>
              <option value="worker_cron">Worker / Cron do Host</option>
              <option value="event_driven">Gatilho por Evento / Watcher</option>
            </select>
            {isFiltering && (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                Limpar
              </Button>
            )}
          </div>
        </div>
      </Card>

      {filteredRoutines.length === 0 ? (
        <Card padding="none">
          <EmptyState
            icon="schedule"
            title="Nenhuma rotina encontrada"
            hint="Tente alterar ou limpar os filtros de busca e categoria."
            action={
              <Button variant="secondary" size="sm" onClick={clearFilters}>
                Limpar Filtros
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {sectionGroups.map((group) => {
            const meta = ROUTINE_PAGE_SECTION_META[group.section];
            return (
              <Section
                key={group.section}
                icon={meta.icon}
                tone={meta.tone}
                title={group.section}
                subtitle={`${group.routines.length} rotina${group.routines.length === 1 ? '' : 's'}`}
                badge={<Badge tone="neutral">{group.routines.length}</Badge>}
                defaultOpen={false}
              >
                <div className="overflow-x-auto -mx-4 -mb-4">
                  <table className="w-full text-left border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                        <th className="py-3 px-4">Rotina & Descrição</th>
                        <th className="py-3 px-4">Gatilho & Frequência</th>
                        <th className="py-3 px-4 text-center">Status</th>
                        <th className="py-3 px-4 text-right">Detalhes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {group.routines.map((routine) => {
                        const statusInfo = getStatusBadge(routine);
                        return (
                          <tr
                            key={routine.id}
                            className="hover:bg-slate-50/60 dark:hover:bg-slate-800/30 transition-colors cursor-pointer group"
                            onClick={() => openDetail(routine.id)}
                          >
                            <td className="py-3.5 px-4 align-top max-w-sm">
                              <div className="flex items-start gap-2.5">
                                <span className="material-symbols-outlined text-[20px] text-primary dark:text-blue-400 shrink-0 mt-0.5">
                                  {triggerIcon(routine)}
                                </span>
                                <div>
                                  <p className="font-semibold text-slate-900 dark:text-white group-hover:text-primary dark:group-hover:text-blue-400 transition-colors">
                                    {routine.name}
                                  </p>
                                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">
                                    {routine.description}
                                  </p>
                                </div>
                              </div>
                            </td>
                            <td className="py-3.5 px-4 align-top">
                              <p className="font-medium text-slate-800 dark:text-slate-200 text-xs">
                                {routine.frequency}
                              </p>
                              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                {routine.triggerTypeLabel}
                              </p>
                            </td>
                            <td className="py-3.5 px-4 align-top text-center whitespace-nowrap">
                              <Badge tone={statusInfo.tone}>{statusInfo.label}</Badge>
                              {routine.lastHeartbeatAgeMs !== null && (
                                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                                  batimento: {formatAge(routine.lastHeartbeatAgeMs)}
                                </p>
                              )}
                            </td>
                            <td className="py-3.5 px-4 align-top text-right whitespace-nowrap">
                              <Button
                                variant="ghost"
                                size="xs"
                                icon="open_in_new"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openDetail(routine.id);
                                }}
                              >
                                Ver
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Section>
            );
          })}
        </div>
      )}

      <RoutineDetailModal
        routine={selectedRoutine}
        isOpen={selectedRoutineId !== null}
        onClose={() => setSelectedRoutineId(null)}
      />
    </div>
  );
}
