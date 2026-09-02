'use client';

import { useState, useEffect } from 'react';
import Badge from '@/components/ui/Badge';
import EmptyState from '@/components/ui/EmptyState';
import { toast } from 'sonner';
import { formatDateTime } from '@/lib/utils';
import type { SyncLog } from '@/types';
import PageHeader from '@/components/PageHeader';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Spinner from '@/components/ui/Spinner';

export default function ErrorsPage() {
  const [logs, setLogs] = useState<SyncLog[]>([]);
  const [loading, setLoading] = useState(true);

  // Carregar logs
  useEffect(() => {
    fetch('/api/nsdocs/sync')
      .then(res => res.json())
      .then(data => {
        const allLogs: SyncLog[] = data.logs || [];
        setLogs(allLogs.filter(log => log.status === 'error'));
      })
      .catch(() => toast.error('Erro ao carregar erros de sincronização'))
      .finally(() => setLoading(false));
  }, []);

  const getSyncMethodBadge = (method: string) => {
    if (method === 'sefaz') {
      return (
        <Badge tone="success">SEFAZ Direta</Badge>
      );
    }
    return (
      <Badge tone="info">NSDocs</Badge>
    );
  };

  return (
    <div className="space-y-8">
      <PageHeader
        icon="warning"
        title="Erros"
        subtitle="Erros de sincronização com SEFAZ e NSDocs"
      />

      {/* Loading State */}
      {loading && (
        <div className="text-center py-12 text-slate-500 dark:text-slate-400">
          <Spinner size="lg" />
          <p className="mt-2 text-sm">Carregando erros...</p>
        </div>
      )}

      {/* Empty State */}
      {!loading && logs.length === 0 && (
        <Card padding="none">
          <EmptyState icon="check_circle" title="Nenhum erro encontrado" hint="Tudo funcionando!" />
        </Card>
      )}

      {/* Error Cards */}
      {!loading && logs.length > 0 && (
        <div className="space-y-4">
          <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">
            {logs.length} {logs.length === 1 ? 'erro encontrado' : 'erros encontrados'}
          </p>

          {logs.map(log => (
            <div
              key={log.id}
              // ui-ok: painel de erro com borda vermelha, não cartão neutro
              className="bg-white dark:bg-card-dark border border-red-200 dark:border-red-900/50 rounded-xl p-6"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <span className="material-symbols-outlined text-red-500 dark:text-red-400 text-[24px] mt-0.5 shrink-0">
                    error
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-900 dark:text-white break-words">
                      {log.errorMessage || 'Erro desconhecido'}
                    </p>
                    <div className="flex items-center gap-3 mt-3 flex-wrap">
                      {getSyncMethodBadge(log.syncMethod)}
                      <span className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
                        <span className="material-symbols-outlined text-[14px]">schedule</span>
                        {formatDateTime(log.startedAt)}
                      </span>
                    </div>
                  </div>
                </div>

                <Button href="/sistema/sync" variant="soft" size="sm" icon="refresh" className="shrink-0">
                  Tentar Novamente
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
