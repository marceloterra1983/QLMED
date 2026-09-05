'use client';

import { useCallback, useEffect, useState } from 'react';
import Badge from '@/components/ui/Badge';
import EmptyState from '@/components/ui/EmptyState';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import { toast } from 'sonner';
import Modal from '@/components/ui/Modal';
import Skeleton from '@/components/ui/Skeleton';
import { Decimal } from '@prisma/client-runtime-utils';
import { closeEmbeddedPdfSidebar, embeddedPdfViewerSrc } from '@/lib/embedded-pdf-src';
import { formatDocumentDate, formatDateTime } from '@/lib/utils';
import PageHeader from '@/components/PageHeader';

type ParseStatus = 'ok' | 'parcial' | 'falha';

type UnimedCgListItem = {
  id: string;
  processId: string;
  authorizationNumber: string | null;
  procedureDate: string | null;
  location: string | null;
  totalAmount: string;
  receivedAt: string;
  fileName: string;
  parseStatus: ParseStatus;
};

type ListPayload = {
  lastCollectedAt: string | null;
  lastError: string | null;
  canSync: boolean;
  items: UnimedCgListItem[];
};

function formatBrl(value: string): string {
  const formatted = new Decimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
  const [reais, cents] = formatted.split('.');
  return `R$ ${reais.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${cents}`;
}

function ParseBadge({ status }: { status: ParseStatus }) {
  if (status === 'ok') return null;
  const isFail = status === 'falha';
  return (
    <Badge tone={isFail ? 'danger' : 'warning'} className="shrink-0">
      {isFail ? 'Falha' : 'Parcial'}
    </Badge>
  );
}

export default function UnimedCgPageClient() {
  const [data, setData] = useState<ListPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<UnimedCgListItem | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const loadList = useCallback(async () => {
    const res = await fetch('/api/gestao/unimed-cg');
    if (!res.ok) throw new Error('list');
    setData(await res.json());
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loadList()
      .catch(() => {
        if (!cancelled) toast.error('Erro ao carregar autorizações Unimed CG');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [loadList]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    fetch(`/api/gestao/unimed-cg/${selectedId}`)
      .then((res) => {
        if (!res.ok) throw new Error('detail');
        return res.json();
      })
      .then((payload: UnimedCgListItem) => {
        if (!cancelled) setDetail(payload);
      })
      .catch(() => {
        if (!cancelled) toast.error('Erro ao abrir a autorização');
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  async function handleSync() {
    if (!data?.canSync) return;
    setSyncing(true);
    try {
      const res = await fetch('/api/gestao/unimed-cg/sync', { method: 'POST' });
      if (res.status === 409) {
        toast.error('Coleta em andamento');
        return;
      }
      if (!res.ok) {
        toast.error('Não foi possível atualizar agora');
        return;
      }
      const payload = (await res.json().catch(() => null)) as { ok?: boolean } | null;
      if (payload?.ok === false) {
        toast.warning('Coleta parcial: parte das autorizações não foi importada');
      } else {
        toast.success('Coleta concluída');
      }
      await loadList();
    } catch {
      toast.error('Erro de rede ao atualizar');
    } finally {
      setSyncing(false);
    }
  }

  const items = data?.items ?? [];
  const modalTitle = detail
    ? `Processo ${detail.processId}${detail.authorizationNumber ? ` — Aut. ${detail.authorizationNumber}` : ''}`
    : selectedId
      ? 'Autorização Unimed CG'
      : '';

  return (
    <div className="space-y-6">
      <PageHeader
        icon="assignment_turned_in"
        title="Unimed CG"
        subtitle={(
          <>
            <p>
              {data?.lastCollectedAt
                ? `Última coleta: ${formatDateTime(data.lastCollectedAt)}`
                : 'Autorizações OPME Unimed Campo Grande'}
            </p>
            {data?.lastError && (
              <p className="text-amber-700 dark:text-amber-400 text-xs font-medium mt-0.5">{data.lastError}</p>
            )}
          </>
        )}
        actions={data?.canSync ? (
          <Button type="button" onClick={handleSync} disabled={syncing} loading={syncing} icon="sync">
            Atualizar agora
          </Button>
        ) : undefined}
      />

      {loading && (
        <Card padding="lg" className="space-y-3">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
        </Card>
      )}

      {!loading && items.length === 0 && (
        <Card padding="none">
          <EmptyState icon="clinical_notes" title="Nenhuma autorização Unimed CG." />
        </Card>
      )}

      {!loading && items.length > 0 && (
        <Card padding="none" className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-900/40 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 font-semibold">Processo</th>
                <th className="px-4 py-3 font-semibold">Autorização</th>
                <th className="px-4 py-3 font-semibold">Data prev.</th>
                <th className="px-4 py-3 font-semibold">Local</th>
                <th className="px-4 py-3 font-semibold text-right">Valor total</th>
                <th className="px-4 py-3 font-semibold">Recebido em</th>
                <th className="px-4 py-3 font-semibold">PDF</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {items.map((item) => (
                <tr
                  key={item.id}
                  className="hover:bg-slate-50/80 dark:hover:bg-slate-900/30 cursor-pointer"
                  onClick={() => setSelectedId(item.id)}
                >
                  <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">
                    <span className="inline-flex items-center gap-2">
                      {item.processId}
                      <ParseBadge status={item.parseStatus} />
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-700 dark:text-slate-200">
                    {item.authorizationNumber ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                    {formatDocumentDate(item.procedureDate)}
                  </td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300 max-w-[220px] truncate">
                    {item.location ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-900 dark:text-white">
                    {formatBrl(item.totalAmount)}
                  </td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                    {formatDateTime(item.receivedAt)}
                  </td>
                  <td className="px-4 py-3">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      icon="picture_as_pdf"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedId(item.id);
                      }}
                    >
                      Ver
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <Modal
        isOpen={Boolean(selectedId)}
        onClose={() => setSelectedId(null)}
        title={modalTitle}
        width="max-w-5xl"
      >
        {detailLoading && (
          <div className="space-y-3 p-2">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-64 w-full" />
          </div>
        )}
        {!detailLoading && detail && (
          <div className="space-y-4">
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-xs text-slate-500">Processo</dt>
                <dd className="font-medium">{detail.processId}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Autorização</dt>
                <dd className="font-medium">{detail.authorizationNumber ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Data prevista</dt>
                <dd>{formatDocumentDate(detail.procedureDate)}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Valor total</dt>
                <dd className="font-medium tabular-nums">{formatBrl(detail.totalAmount)}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs text-slate-500">Local</dt>
                <dd>{detail.location ?? '—'}</dd>
              </div>
            </dl>
            <iframe
              title={`PDF processo ${detail.processId}`}
              className="w-full h-[70vh] rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-100"
              src={embeddedPdfViewerSrc(`/api/gestao/unimed-cg/${detail.id}/arquivo`)}
              onLoad={(event) => closeEmbeddedPdfSidebar(event.currentTarget)}
            />
          </div>
        )}
      </Modal>
    </div>
  );
}
