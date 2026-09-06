'use client';

import { useCallback, useEffect, useState } from 'react';
import Badge from '@/components/ui/Badge';
import EmptyState from '@/components/ui/EmptyState';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Section from '@/components/ui/Section';
import { toast } from 'sonner';
import Modal from '@/components/ui/Modal';
import Skeleton from '@/components/ui/Skeleton';
import { Decimal } from '@prisma/client-runtime-utils';
import { embeddedPdfViewerSrc } from '@/lib/embedded-pdf-src';
import { formatDocumentDate, formatDateTime } from '@/lib/utils';
import PageHeader from '@/components/PageHeader';

type ParseStatus = 'ok' | 'parcial' | 'falha';

type BillingItem = {
  id: string;
  processId: string;
  authorizationNumber: string | null;
  procedureDate: string | null;
  patientName: string | null;
  location: string | null;
  totalAmount: string;
  receivedAt: string;
  fileName: string;
  parseStatus: ParseStatus;
};

type DeliveryItem = {
  id: string;
  processId: string;
  principalAuthorization: string | null;
  status: string | null;
  authorizedAt: string | null;
  patientName: string | null;
  supplier: string | null;
  receivedAt: string;
  fileName: string;
  parseStatus: ParseStatus;
};

type ReversalItem = {
  id: string;
  processId: string;
  authorizationNumber: string | null;
  procedureDate: string | null;
  patientName: string | null;
  location: string | null;
  procedureType: string | null;
  receivedAt: string;
  fileName: string;
  parseStatus: ParseStatus;
};

type PreSolicitationItem = {
  id: string;
  preSolicitationId: string;
  patientName: string | null;
  procedureType: string | null;
  quoteDeadlineDays: number | null;
  receivedAt: string;
  fileName: string;
  parseStatus: ParseStatus;
};

type InvoiceDeadlineItem = {
  id: string;
  processId: string;
  patientName: string | null;
  receivedAt: string;
  fileName: string;
  parseStatus: ParseStatus;
};

type ListPayload = {
  lastCollectedAt: string | null;
  lastError: string | null;
  canSync: boolean;
  billing: BillingItem[];
  deliveries: DeliveryItem[];
  reversals: ReversalItem[];
  preSolicitations: PreSolicitationItem[];
  invoiceDeadlines: InvoiceDeadlineItem[];
};

type PdfKind = 'billing' | 'delivery' | 'reversal' | 'pre' | 'prazo';

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

function BeneficiarioLocalCell({
  patientName,
  location,
}: {
  patientName: string | null | undefined;
  location?: string | null;
}) {
  return (
    <td className="px-4 py-3 text-slate-600 dark:text-slate-300 max-w-[240px]">
      <div className="font-medium text-slate-800 dark:text-slate-100 truncate">
        {patientName?.trim() || '—'}
      </div>
      {location !== undefined && (
        <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
          {location?.trim() || '—'}
        </div>
      )}
    </td>
  );
}

function detailUrl(kind: PdfKind, id: string): string {
  switch (kind) {
    case 'billing':
      return `/api/gestao/unimed-cg/${id}`;
    case 'delivery':
      return `/api/gestao/unimed-cg/entrega/${id}`;
    case 'reversal':
      return `/api/gestao/unimed-cg/reversao/${id}`;
    case 'pre':
      return `/api/gestao/unimed-cg/pre-solicitacao/${id}`;
    case 'prazo':
      return `/api/gestao/unimed-cg/prazo-nf/${id}`;
  }
}

function arquivoUrl(kind: PdfKind, id: string): string {
  return `${detailUrl(kind, id)}/arquivo`;
}

export default function UnimedCgPageClient() {
  const [data, setData] = useState<ListPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [selected, setSelected] = useState<{ kind: PdfKind; id: string } | null>(null);
  const [billingDetail, setBillingDetail] = useState<BillingItem | null>(null);
  const [deliveryDetail, setDeliveryDetail] = useState<DeliveryItem | null>(null);
  const [reversalDetail, setReversalDetail] = useState<ReversalItem | null>(null);
  const [preDetail, setPreDetail] = useState<PreSolicitationItem | null>(null);
  const [prazoDetail, setPrazoDetail] = useState<InvoiceDeadlineItem | null>(null);
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
    if (!selected) {
      setBillingDetail(null);
      setDeliveryDetail(null);
      setReversalDetail(null);
      setPreDetail(null);
      setPrazoDetail(null);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    fetch(detailUrl(selected.kind, selected.id))
      .then((res) => {
        if (!res.ok) throw new Error('detail');
        return res.json();
      })
      .then((payload) => {
        if (cancelled) return;
        setBillingDetail(selected.kind === 'billing' ? (payload as BillingItem) : null);
        setDeliveryDetail(selected.kind === 'delivery' ? (payload as DeliveryItem) : null);
        setReversalDetail(selected.kind === 'reversal' ? (payload as ReversalItem) : null);
        setPreDetail(selected.kind === 'pre' ? (payload as PreSolicitationItem) : null);
        setPrazoDetail(selected.kind === 'prazo' ? (payload as InvoiceDeadlineItem) : null);
      })
      .catch(() => {
        if (!cancelled) toast.error('Erro ao abrir o registro');
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selected]);

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
        toast.warning('Coleta parcial: parte dos registros não foi importada');
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

  const billing = data?.billing ?? [];
  const deliveries = data?.deliveries ?? [];
  const reversals = data?.reversals ?? [];
  const preSolicitations = data?.preSolicitations ?? [];
  const invoiceDeadlines = data?.invoiceDeadlines ?? [];

  const modalTitle = (() => {
    if (selected?.kind === 'billing' && billingDetail) {
      return `Processo ${billingDetail.processId}${billingDetail.authorizationNumber ? ` — Aut. ${billingDetail.authorizationNumber}` : ''}`;
    }
    if (selected?.kind === 'delivery' && deliveryDetail) {
      return `Processo ${deliveryDetail.processId}${deliveryDetail.principalAuthorization ? ` — Aut. ${deliveryDetail.principalAuthorization}` : ''} (entrega)`;
    }
    if (selected?.kind === 'reversal' && reversalDetail) {
      return `Processo ${reversalDetail.processId} (reversão)`;
    }
    if (selected?.kind === 'pre' && preDetail) {
      return `Pré-solicitação ${preDetail.preSolicitationId}`;
    }
    if (selected?.kind === 'prazo' && prazoDetail) {
      return `Processo ${prazoDetail.processId} (prazo NF)`;
    }
    return selected ? 'Unimed CG' : '';
  })();

  const pdfSrc = selected ? embeddedPdfViewerSrc(arquivoUrl(selected.kind, selected.id)) : '';

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

      {!loading && (
        <>
          <Section
            icon="receipt_long"
            tone="teal"
            title={`AUTORIZAÇÃO DE FATURAMENTO (${billing.length})`}
            defaultOpen={false}
          >
            {billing.length === 0 ? (
              <EmptyState icon="clinical_notes" title="Nenhuma autorização de faturamento." />
            ) : (
              <div className="overflow-x-auto -mx-4 -mb-4">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-900/40 text-left text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Processo</th>
                      <th className="px-4 py-3 font-semibold">Autorização</th>
                      <th className="px-4 py-3 font-semibold">Data prev.</th>
                      <th className="px-4 py-3 font-semibold">Beneficiário / Local</th>
                      <th className="px-4 py-3 font-semibold text-right">Valor total</th>
                      <th className="px-4 py-3 font-semibold">Recebido em</th>
                      <th className="px-4 py-3 font-semibold">PDF</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {billing.map((item) => (
                      <tr
                        key={item.id}
                        className="hover:bg-slate-50/80 dark:hover:bg-slate-900/30 cursor-pointer"
                        onClick={() => setSelected({ kind: 'billing', id: item.id })}
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
                        <BeneficiarioLocalCell patientName={item.patientName} location={item.location} />
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
                              setSelected({ kind: 'billing', id: item.id });
                            }}
                          >
                            Ver
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          <Section
            icon="local_shipping"
            tone="indigo"
            title={`AUTORIZAÇÃO PARA ENTREGA (${deliveries.length})`}
            defaultOpen={false}
          >
            {deliveries.length === 0 ? (
              <EmptyState icon="local_shipping" title="Nenhuma autorização para entrega." />
            ) : (
              <div className="overflow-x-auto -mx-4 -mb-4">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-900/40 text-left text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Processo</th>
                      <th className="px-4 py-3 font-semibold">Autorização principal</th>
                      <th className="px-4 py-3 font-semibold">Situação</th>
                      <th className="px-4 py-3 font-semibold">Data autorização</th>
                      <th className="px-4 py-3 font-semibold">Beneficiário / Local</th>
                      <th className="px-4 py-3 font-semibold">Fornecedor</th>
                      <th className="px-4 py-3 font-semibold">Recebido em</th>
                      <th className="px-4 py-3 font-semibold">PDF</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {deliveries.map((item) => (
                      <tr
                        key={item.id}
                        className="hover:bg-slate-50/80 dark:hover:bg-slate-900/30 cursor-pointer"
                        onClick={() => setSelected({ kind: 'delivery', id: item.id })}
                      >
                        <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">
                          <span className="inline-flex items-center gap-2">
                            {item.processId}
                            <ParseBadge status={item.parseStatus} />
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-700 dark:text-slate-200">
                          {item.principalAuthorization ?? '—'}
                        </td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                          {item.status ?? '—'}
                        </td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                          {formatDocumentDate(item.authorizedAt)}
                        </td>
                        <BeneficiarioLocalCell patientName={item.patientName} />
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-300 max-w-[220px] truncate">
                          {item.supplier ?? '—'}
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
                              setSelected({ kind: 'delivery', id: item.id });
                            }}
                          >
                            Ver
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          <Section
            icon="undo"
            tone="amber"
            title={`REVERSÃO DE PROCESSO (${reversals.length})`}
            defaultOpen={false}
          >
            {reversals.length === 0 ? (
              <EmptyState icon="undo" title="Nenhuma reversão de processo." />
            ) : (
              <div className="overflow-x-auto -mx-4 -mb-4">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-900/40 text-left text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Processo</th>
                      <th className="px-4 py-3 font-semibold">Autorização</th>
                      <th className="px-4 py-3 font-semibold">Data prev.</th>
                      <th className="px-4 py-3 font-semibold">Beneficiário / Local</th>
                      <th className="px-4 py-3 font-semibold">Recebido em</th>
                      <th className="px-4 py-3 font-semibold">PDF</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {reversals.map((item) => (
                      <tr
                        key={item.id}
                        className="hover:bg-slate-50/80 dark:hover:bg-slate-900/30 cursor-pointer"
                        onClick={() => setSelected({ kind: 'reversal', id: item.id })}
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
                        <BeneficiarioLocalCell patientName={item.patientName} location={item.location} />
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
                              setSelected({ kind: 'reversal', id: item.id });
                            }}
                          >
                            Ver
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          <Section
            icon="request_quote"
            tone="violet"
            title={`PRÉ-SOLICITAÇÃO (${preSolicitations.length})`}
            defaultOpen={false}
          >
            {preSolicitations.length === 0 ? (
              <EmptyState icon="request_quote" title="Nenhuma pré-solicitação." />
            ) : (
              <div className="overflow-x-auto -mx-4 -mb-4">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-900/40 text-left text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Pré-solicitação</th>
                      <th className="px-4 py-3 font-semibold">Beneficiário / Local</th>
                      <th className="px-4 py-3 font-semibold">Tipo</th>
                      <th className="px-4 py-3 font-semibold">Prazo (dias)</th>
                      <th className="px-4 py-3 font-semibold">Recebido em</th>
                      <th className="px-4 py-3 font-semibold">PDF</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {preSolicitations.map((item) => (
                      <tr
                        key={item.id}
                        className="hover:bg-slate-50/80 dark:hover:bg-slate-900/30 cursor-pointer"
                        onClick={() => setSelected({ kind: 'pre', id: item.id })}
                      >
                        <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">
                          <span className="inline-flex items-center gap-2">
                            {item.preSolicitationId}
                            <ParseBadge status={item.parseStatus} />
                          </span>
                        </td>
                        <BeneficiarioLocalCell patientName={item.patientName} />
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                          {item.procedureType ?? '—'}
                        </td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-300 tabular-nums">
                          {item.quoteDeadlineDays ?? '—'}
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
                              setSelected({ kind: 'pre', id: item.id });
                            }}
                          >
                            Ver
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          <Section
            icon="schedule"
            tone="rose"
            title={`PRAZO DE NOTA FISCAL (${invoiceDeadlines.length})`}
            defaultOpen={false}
          >
            {invoiceDeadlines.length === 0 ? (
              <EmptyState icon="schedule" title="Nenhum alerta de prazo de nota fiscal." />
            ) : (
              <div className="overflow-x-auto -mx-4 -mb-4">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-900/40 text-left text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Processo</th>
                      <th className="px-4 py-3 font-semibold">Paciente</th>
                      <th className="px-4 py-3 font-semibold">Recebido em</th>
                      <th className="px-4 py-3 font-semibold">PDF</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {invoiceDeadlines.map((item) => (
                      <tr
                        key={item.id}
                        className="hover:bg-slate-50/80 dark:hover:bg-slate-900/30 cursor-pointer"
                        onClick={() => setSelected({ kind: 'prazo', id: item.id })}
                      >
                        <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">
                          <span className="inline-flex items-center gap-2">
                            {item.processId}
                            <ParseBadge status={item.parseStatus} />
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-700 dark:text-slate-200">
                          {item.patientName ?? '—'}
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
                              setSelected({ kind: 'prazo', id: item.id });
                            }}
                          >
                            Ver
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>
        </>
      )}

      <Modal
        isOpen={Boolean(selected)}
        onClose={() => {
          setSelected(null);
        }}
        title={modalTitle}
        width="max-w-5xl"
      >
        {detailLoading && (
          <div className="space-y-3 p-2">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-64 w-full" />
          </div>
        )}
        {!detailLoading && billingDetail && selected?.kind === 'billing' && (
          <div className="space-y-4">
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-xs text-slate-500">Processo</dt>
                <dd className="font-medium">{billingDetail.processId}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Autorização</dt>
                <dd className="font-medium">{billingDetail.authorizationNumber ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Beneficiário</dt>
                <dd>{billingDetail.patientName ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Data prevista</dt>
                <dd>{formatDocumentDate(billingDetail.procedureDate)}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Valor total</dt>
                <dd className="font-medium tabular-nums">{formatBrl(billingDetail.totalAmount)}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs text-slate-500">Local</dt>
                <dd>{billingDetail.location ?? '—'}</dd>
              </div>
            </dl>
            <iframe
              title={`PDF processo ${billingDetail.processId}`}
              className="w-full h-[70vh] rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-100"
              src={pdfSrc}
            />
          </div>
        )}
        {!detailLoading && deliveryDetail && selected?.kind === 'delivery' && (
          <div className="space-y-4">
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-xs text-slate-500">Processo</dt>
                <dd className="font-medium">{deliveryDetail.processId}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Autorização principal</dt>
                <dd className="font-medium">{deliveryDetail.principalAuthorization ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Beneficiário</dt>
                <dd>{deliveryDetail.patientName ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Situação</dt>
                <dd>{deliveryDetail.status ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Data autorização</dt>
                <dd>{formatDocumentDate(deliveryDetail.authorizedAt)}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs text-slate-500">Fornecedor</dt>
                <dd>{deliveryDetail.supplier ?? '—'}</dd>
              </div>
            </dl>
            <iframe
              title={`PDF entrega processo ${deliveryDetail.processId}`}
              className="w-full h-[70vh] rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-100"
              src={pdfSrc}
            />
          </div>
        )}
        {!detailLoading && reversalDetail && selected?.kind === 'reversal' && (
          <div className="space-y-4">
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-xs text-slate-500">Processo</dt>
                <dd className="font-medium">{reversalDetail.processId}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Autorização</dt>
                <dd className="font-medium">{reversalDetail.authorizationNumber ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Beneficiário</dt>
                <dd>{reversalDetail.patientName ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Data prevista</dt>
                <dd>{formatDocumentDate(reversalDetail.procedureDate)}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs text-slate-500">Local</dt>
                <dd>{reversalDetail.location ?? '—'}</dd>
              </div>
            </dl>
            <iframe
              title={`PDF reversão processo ${reversalDetail.processId}`}
              className="w-full h-[70vh] rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-100"
              src={pdfSrc}
            />
          </div>
        )}
        {!detailLoading && preDetail && selected?.kind === 'pre' && (
          <div className="space-y-4">
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-xs text-slate-500">Pré-solicitação</dt>
                <dd className="font-medium">{preDetail.preSolicitationId}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Beneficiário</dt>
                <dd>{preDetail.patientName ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Tipo</dt>
                <dd>{preDetail.procedureType ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Prazo (dias)</dt>
                <dd>{preDetail.quoteDeadlineDays ?? '—'}</dd>
              </div>
            </dl>
            <iframe
              title={`PDF pré-solicitação ${preDetail.preSolicitationId}`}
              className="w-full h-[70vh] rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-100"
              src={pdfSrc}
            />
          </div>
        )}
        {!detailLoading && prazoDetail && selected?.kind === 'prazo' && (
          <div className="space-y-4">
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-xs text-slate-500">Processo</dt>
                <dd className="font-medium">{prazoDetail.processId}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Paciente</dt>
                <dd>{prazoDetail.patientName ?? '—'}</dd>
              </div>
            </dl>
            <iframe
              title={`PDF prazo NF processo ${prazoDetail.processId}`}
              className="w-full h-[70vh] rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-100"
              src={pdfSrc}
            />
          </div>
        )}
      </Modal>
    </div>
  );
}
