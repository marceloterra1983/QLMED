'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import Modal from '@/components/ui/Modal';
import Skeleton from '@/components/ui/Skeleton';
import { Decimal } from '@prisma/client-runtime-utils';
import { closeEmbeddedPdfSidebar, embeddedPdfViewerSrc } from '@/lib/embedded-pdf-src';
import { formatDocumentDate, formatDateTime } from '@/lib/utils';

type ParseStatus = 'ok' | 'parcial' | 'falha';

type CassemsListItem = {
  id: string;
  issuedAt: string | null;
  oficioNumber: string;
  patientName: string;
  doctorName: string | null;
  hospitalName: string | null;
  totalAmount: string;
  fileName: string;
  parseStatus: ParseStatus;
  parseMissingReason: string | null;
};

type CassemsDetail = CassemsListItem & {
  patientRegistry: string | null;
  doctorCrm: string | null;
  procedureName: string | null;
  items: Array<{
    anvisaCode: string | null;
    description: string;
    brand: string | null;
    reference: string | null;
    quantity: string;
    unitAmount: string;
    lineTotal: string;
  }>;
};

type ListPayload = {
  lastCollectedAt: string | null;
  lastError: string | null;
  canSync: boolean;
  items: CassemsListItem[];
};

function formatBrl(value: string): string {
  const formatted = new Decimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
  const [reais, cents] = formatted.split('.');
  return `R$ ${reais.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${cents}`;
}

function ParseBadge({ status, reason }: { status: ParseStatus; reason?: string | null }) {
  if (status === 'ok') return null;
  const isFail = status === 'falha';
  const text = reason ?? (isFail ? 'Não foi possível ler o documento' : null);
  return (
    <span className="inline-flex items-center gap-1.5 min-w-0">
      {text ? (
        <span
          className={`text-xs font-medium normal-case tracking-normal ${
            isFail
              ? 'text-rose-700 dark:text-rose-300'
              : 'text-amber-800 dark:text-amber-300'
          }`}
        >
          {text}
        </span>
      ) : null}
      <span
        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide shrink-0 ${
          isFail
            ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300'
            : 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300'
        }`}
      >
        {isFail ? 'Falha' : 'Parcial'}
      </span>
    </span>
  );
}

export default function CassemsPageClient() {
  const [data, setData] = useState<ListPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<CassemsDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const loadList = useCallback(async () => {
    const res = await fetch('/api/gestao/cassems');
    if (!res.ok) throw new Error('list');
    setData(await res.json());
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loadList()
      .catch(() => {
        if (!cancelled) toast.error('Erro ao carregar autorizações CASSEMS');
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
    fetch(`/api/gestao/cassems/${selectedId}`)
      .then((res) => {
        if (!res.ok) throw new Error('detail');
        return res.json();
      })
      .then((payload: CassemsDetail) => {
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
      const res = await fetch('/api/gestao/cassems/sync', { method: 'POST' });
      if (res.status === 409) {
        toast.error('Coleta em andamento');
        return;
      }
      if (!res.ok) {
        toast.error('Não foi possível atualizar agora');
        return;
      }
      toast.success('Coleta concluída');
      await loadList();
    } catch {
      toast.error('Erro de rede ao atualizar');
    } finally {
      setSyncing(false);
    }
  }

  const items = data?.items ?? [];
  const modalTitle = detail
    ? `Autorização ${detail.oficioNumber} — ${detail.patientName}`
    : selectedId
      ? 'Autorização CASSEMS'
      : '';

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="hidden sm:flex items-center gap-3 min-w-0">
          <span className="material-symbols-outlined text-[28px] text-primary flex-shrink-0">clinical_notes</span>
          <div className="min-w-0">
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">CASSEMS</h2>
            <p className="text-slate-500 dark:text-slate-400 text-xs font-medium">
              {data?.lastCollectedAt
                ? `Última coleta: ${formatDateTime(data.lastCollectedAt)}`
                : 'Autorizações de materiais OPME'}
            </p>
            {data?.lastError && (
              <p className="text-amber-700 dark:text-amber-400 text-xs font-medium mt-0.5">{data.lastError}</p>
            )}
          </div>
        </div>
        {data?.canSync && (
          <button
            type="button"
            onClick={handleSync}
            disabled={syncing}
            className="flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-primary to-primary-dark text-white rounded-lg text-sm font-bold shadow-md shadow-primary/30 disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-[20px]">
              {syncing ? 'progress_activity' : 'sync'}
            </span>
            Atualizar agora
          </button>
        )}
      </div>

      {loading && (
        <div className="bg-white dark:bg-card-dark border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-3">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
        </div>
      )}

      {!loading && items.length === 0 && (
        <div className="bg-white dark:bg-card-dark border border-slate-200 dark:border-slate-800 rounded-xl p-12 text-center shadow-sm">
          <span className="material-symbols-outlined text-slate-300 dark:text-slate-600 text-[48px]">clinical_notes</span>
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400 mt-4">
            Nenhuma autorização CASSEMS.
          </p>
        </div>
      )}

      {!loading && items.length > 0 && (
        <>
          <div className="sm:hidden space-y-2">
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setSelectedId(item.id)}
                className="w-full text-left bg-white dark:bg-card-dark border border-slate-200 dark:border-slate-800 rounded-xl p-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-slate-900 dark:text-white">
                    Autorização {item.oficioNumber}
                  </span>
                  <span className="text-xs text-slate-500">
                    {formatDocumentDate(item.issuedAt)}
                  </span>
                </div>
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate mt-1">
                  {item.patientName}
                </p>
                <p className="text-xs text-slate-500 truncate mt-1">
                  {item.hospitalName || '—'}
                </p>
                <div className="flex items-center justify-between gap-2 mt-0.5">
                  <p className="text-xs text-slate-500 truncate">
                    {item.doctorName || '—'}
                  </p>
                  <ParseBadge status={item.parseStatus} reason={item.parseMissingReason} />
                </div>
              </button>
            ))}
          </div>

          <div className="hidden sm:block bg-white dark:bg-card-dark border border-slate-200 dark:border-slate-800 rounded-xl shadow-lg shadow-slate-200/50 dark:shadow-none overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <caption className="sr-only">Autorizações CASSEMS</caption>
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800 text-xs uppercase text-slate-500 dark:text-slate-400 font-bold tracking-wider">
                    <th className="px-4 py-3">Data</th>
                    <th className="px-4 py-3">Nº</th>
                    <th className="px-4 py-3">Paciente</th>
                    <th className="px-4 py-3">Médico</th>
                    <th className="px-4 py-3">Hospital</th>
                    <th className="px-4 py-3 text-right">Total</th>
                    <th className="px-4 py-3 text-center">Arquivo</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr
                      key={item.id}
                      onClick={() => setSelectedId(item.id)}
                      className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer"
                    >
                      <td className="px-4 py-3 text-sm whitespace-nowrap">
                        {formatDocumentDate(item.issuedAt)}
                      </td>
                      <td className="px-4 py-3 text-sm font-semibold">
                        <span className="inline-flex items-center gap-2">
                          {item.oficioNumber}
                          <ParseBadge status={item.parseStatus} reason={item.parseMissingReason} />
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm">{item.patientName}</td>
                      <td className="px-4 py-3 text-sm">{item.doctorName || '—'}</td>
                      <td className="px-4 py-3 text-sm">{item.hospitalName || '—'}</td>
                      <td className="px-4 py-3 text-sm font-mono font-bold text-right">
                        {formatBrl(item.totalAmount)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            setSelectedId(item.id);
                          }}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-primary hover:bg-primary/10"
                          title={item.fileName}
                          aria-label={`Abrir arquivo da autorização ${item.oficioNumber}`}
                        >
                          <span className="material-symbols-outlined text-[20px]">picture_as_pdf</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      <Modal
        isOpen={Boolean(selectedId)}
        onClose={() => setSelectedId(null)}
        title={modalTitle}
        subtitle={detail?.parseMissingReason ?? undefined}
        width="max-w-5xl"
      >
        {detailLoading && !detail && (
          <div className="space-y-3">
            <Skeleton className="h-4 w-64" />
            <Skeleton className="h-32 w-full" />
          </div>
        )}
        {detail && (
          <div className="space-y-5">
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-xs font-bold uppercase tracking-wider text-slate-400">Data</dt>
                <dd>{formatDocumentDate(detail.issuedAt)}</dd>
              </div>
              <div>
                <dt className="text-xs font-bold uppercase tracking-wider text-slate-400">Paciente</dt>
                <dd className="font-semibold text-slate-900 dark:text-white">{detail.patientName}</dd>
              </div>
              <div>
                <dt className="text-xs font-bold uppercase tracking-wider text-slate-400">Matrícula</dt>
                <dd>{detail.patientRegistry || '—'}</dd>
              </div>
              <div>
                <dt className="text-xs font-bold uppercase tracking-wider text-slate-400">Prestador</dt>
                <dd>{detail.doctorName || '—'}{detail.doctorCrm ? ` · CRM ${detail.doctorCrm}` : ''}</dd>
              </div>
              <div>
                <dt className="text-xs font-bold uppercase tracking-wider text-slate-400">Local de execução</dt>
                <dd>{detail.hospitalName || '—'}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs font-bold uppercase tracking-wider text-slate-400">Procedimento</dt>
                <dd>{detail.procedureName || '—'}</dd>
              </div>
              <div>
                <dt className="text-xs font-bold uppercase tracking-wider text-slate-400">Total</dt>
                <dd className="font-mono font-bold">{formatBrl(detail.totalAmount)}</dd>
              </div>
              <div>
                <dt className="text-xs font-bold uppercase tracking-wider text-slate-400">Leitura</dt>
                <dd>
                  {detail.parseStatus === 'ok' ? (
                    'Ok'
                  ) : (
                    <ParseBadge status={detail.parseStatus} reason={detail.parseMissingReason} />
                  )}
                </dd>
              </div>
            </dl>

            <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-lg">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">Itens autorizados</caption>
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-900/50 text-xs uppercase text-slate-500 font-bold">
                    <th className="px-3 py-2">Descrição</th>
                    <th className="px-3 py-2">Marca</th>
                    <th className="px-3 py-2">Ref.</th>
                    <th className="px-3 py-2 text-right">Qtd</th>
                    <th className="px-3 py-2 text-right">Unitário</th>
                    <th className="px-3 py-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.items.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-3 py-4 text-center text-slate-400">
                        Nenhum item extraído.
                      </td>
                    </tr>
                  ) : (
                    detail.items.map((item, index) => (
                      <tr key={`${item.description}-${index}`} className="border-t border-slate-100 dark:border-slate-800">
                        <td className="px-3 py-2">{item.description}</td>
                        <td className="px-3 py-2">{item.brand || '—'}</td>
                        <td className="px-3 py-2">{item.reference || '—'}</td>
                        <td className="px-3 py-2 text-right font-mono">{item.quantity}</td>
                        <td className="px-3 py-2 text-right font-mono">{formatBrl(item.unitAmount)}</td>
                        <td className="px-3 py-2 text-right font-mono font-semibold">{formatBrl(item.lineTotal)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="w-full h-[70vh] bg-slate-200 dark:bg-slate-900 rounded-lg overflow-hidden">
              <iframe
                src={embeddedPdfViewerSrc(`/api/gestao/cassems/${detail.id}/arquivo`)}
                className="w-full h-full border-0"
                title={`PDF da autorização ${detail.oficioNumber}`}
                onLoad={(event) => closeEmbeddedPdfSidebar(event.currentTarget)}
              />
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
