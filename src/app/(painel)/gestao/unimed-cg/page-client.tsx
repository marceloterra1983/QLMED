'use client';

import { useCallback, useEffect, useState, type MouseEvent } from 'react';
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
import dynamic from 'next/dynamic';

const InvoiceDetailsModal = dynamic(() => import('@/components/InvoiceDetailsModal'), { ssr: false });

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
  billedMatchStatus?: string | null;
  billedInvoiceNumber?: string | null;
};

type BilledRelatedItem = {
  kind: 'faturamento' | 'entrega' | 'reversao' | 'prazo';
  id: string;
  label: string;
  fileName: string;
  parseStatus: ParseStatus;
  summary: string;
};

type BilledItem = {
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
  billedInvoiceId: string | null;
  billedInvoiceNumber: string | null;
  billedMatchedAt: string | null;
  billedMatchStatus: string | null;
  related: BilledRelatedItem[];
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
  billed: BilledItem[];
};

type PdfKind = 'billing' | 'delivery' | 'reversal' | 'pre' | 'prazo';

function relatedPdfKind(kind: BilledRelatedItem['kind']): PdfKind {
  switch (kind) {
    case 'faturamento':
      return 'billing';
    case 'entrega':
      return 'delivery';
    case 'reversao':
      return 'reversal';
    case 'prazo':
      return 'prazo';
  }
}

function NfYellowTag({
  number,
  onClick,
}: {
  number: string;
  onClick: (e: MouseEvent) => void;
}) {
  return (
    <button
      type="button"
      title={`Abrir NF-e ${number}`}
      onClick={onClick}
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold whitespace-nowrap bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border border-amber-300/70 dark:border-amber-700/60 hover:bg-amber-200/80 dark:hover:bg-amber-900/60"
    >
      <span aria-hidden="true" className="w-1.5 h-1.5 rounded-full shrink-0 bg-amber-500" />
      NF {number}
    </button>
  );
}

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
  const [invoiceModalId, setInvoiceModalId] = useState<string | null>(null);

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
  const billed = data?.billed ?? [];

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
            icon="paid"
            tone="amber"
            title={`PROCESSOS FATURADOS (${billed.length})`}
            defaultOpen={false}
          >
            {billed.length === 0 ? (
              <EmptyState icon="receipt" title="Nenhum processo faturado ainda." />
            ) : (
              <div className="space-y-3">
                {billed.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-lg border border-amber-200/80 dark:border-amber-900/50 bg-amber-50/40 dark:bg-amber-950/20 overflow-hidden"
                  >
                    <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-amber-200/60 dark:border-amber-900/40">
                      <span className="font-semibold text-slate-900 dark:text-white">
                        Processo {item.processId}
                      </span>
                      {item.billedInvoiceId && item.billedInvoiceNumber ? (
                        <NfYellowTag
                          number={item.billedInvoiceNumber}
                          onClick={(e) => {
                            e.stopPropagation();
                            setInvoiceModalId(item.billedInvoiceId);
                          }}
                        />
                      ) : null}
                      <ParseBadge status={item.parseStatus} />
                      <span className="text-sm text-slate-600 dark:text-slate-300 truncate max-w-[220px]">
                        {item.patientName?.trim() || '—'}
                      </span>
                      {item.location?.trim() ? (
                        <span className="text-xs text-slate-500 truncate max-w-[160px]">
                          {item.location}
                        </span>
                      ) : null}
                      <span className="ml-auto tabular-nums text-sm font-medium text-slate-900 dark:text-white">
                        {formatBrl(item.totalAmount)}
                      </span>
                    </div>
                    <ul className="divide-y divide-amber-100/80 dark:divide-amber-900/30">
                      {item.related.map((rel) => (
                        <li
                          key={`${rel.kind}-${rel.id}`}
                          className="flex flex-wrap items-center gap-2 px-4 py-2.5 text-sm hover:bg-amber-50/60 dark:hover:bg-amber-950/30 cursor-pointer"
                          onClick={() =>
                            setSelected({ kind: relatedPdfKind(rel.kind), id: rel.id })
                          }
                        >
                          <Badge tone="neutral" dot={false} className="shrink-0">
                            {rel.label}
                          </Badge>
                          <span className="text-slate-700 dark:text-slate-200 truncate">
                            {rel.summary}
                          </span>
                          <ParseBadge status={rel.parseStatus} />
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            icon="picture_as_pdf"
                            className="ml-auto"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelected({ kind: relatedPdfKind(rel.kind), id: rel.id });
                            }}
                          >
                            Ver
                          </Button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </Section>

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
                            {item.billedMatchStatus === 'ambiguous' ? (
                              <Badge tone="warning" title="Mais de uma NF-e Unimed bateu com o beneficiário">
                                Ambíguo
                              </Badge>
                            ) : null}
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
      <InvoiceDetailsModal
        isOpen={!!invoiceModalId}
        onClose={() => setInvoiceModalId(null)}
        invoiceId={invoiceModalId}
      />
    </div>
  );
}
