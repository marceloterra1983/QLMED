'use client';

import { useCallback, useEffect, useState } from 'react';
import Badge from '@/components/ui/Badge';
import EmptyState from '@/components/ui/EmptyState';
import Button from '@/components/ui/Button';
import { toast } from 'sonner';
import Modal from '@/components/ui/Modal';
import Skeleton from '@/components/ui/Skeleton';
import { Decimal } from '@prisma/client-runtime-utils';
import GestaoPatientHospital from '@/components/gestao/GestaoPatientHospital';
import ImpcgItemsEditor, { type ImpcgItemDraft } from '@/components/gestao/ImpcgItemsEditor';
import ReadFieldEditor, { readFieldInputClass } from '@/components/gestao/ReadFieldEditor';
import { closeEmbeddedPdfSidebar, embeddedPdfViewerSrc } from '@/lib/embedded-pdf-src';
import { isOficioFieldEdited } from '@/lib/gestao-oficio-edits';
import { formatDocumentDate, formatDateTime } from '@/lib/utils';
import PageHeader from '@/components/PageHeader';

type ParseStatus = 'ok' | 'parcial' | 'falha';

type ImpcgListItem = {
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

type ImpcgDetail = ImpcgListItem & {
  patientRegistry: string | null;
  doctorCrm: string | null;
  procedureName: string | null;
  canEdit?: boolean;
  editedFields?: string[];
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
  canEdit?: boolean;
  items: ImpcgListItem[];
};

function formatBrl(value: string): string {
  const formatted = new Decimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
  const [reais, cents] = formatted.split('.');
  return `R$ ${reais.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${cents}`;
}

/** Lista mostra só o chip; o que faltou é longo demais para caber na linha. */
function ParseBadge({ status }: { status: ParseStatus }) {
  if (status === 'ok') return null;
  const isFail = status === 'falha';
  return (
    <Badge tone={isFail ? 'danger' : 'warning'} className="shrink-0">
      {isFail ? 'Falha' : 'Parcial'}
    </Badge>
  );
}

/** Data futura é leitura errada do PDF; não mostra como se fosse verdade. */
function formatIssuedAt(issuedAt: string | null): string {
  if (issuedAt && new Date(issuedAt).getTime() > Date.now() + 24 * 60 * 60 * 1000) return '—';
  return formatDocumentDate(issuedAt);
}

export default function ImpcgPageClient() {
  const [data, setData] = useState<ListPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ImpcgDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [issuedAtDraft, setIssuedAtDraft] = useState('');
  const [patientDraft, setPatientDraft] = useState('');
  const [doctorDraft, setDoctorDraft] = useState('');
  const [procedureDraft, setProcedureDraft] = useState('');
  const [hospitalDraft, setHospitalDraft] = useState('');
  const [registryDraft, setRegistryDraft] = useState('');
  const [totalDraft, setTotalDraft] = useState('');

  const loadList = useCallback(async () => {
    const res = await fetch('/api/gestao/impcg');
    if (!res.ok) throw new Error('list');
    setData(await res.json());
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loadList()
      .catch(() => {
        if (!cancelled) toast.error('Erro ao carregar autorizações IMPCG');
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
    fetch(`/api/gestao/impcg/${selectedId}`)
      .then((res) => {
        if (!res.ok) throw new Error('detail');
        return res.json();
      })
      .then((payload: ImpcgDetail) => {
        if (!cancelled) {
          setDetail(payload);
          setIssuedAtDraft(payload.issuedAt ? payload.issuedAt.slice(0, 10) : '');
          setPatientDraft(payload.patientName === 'PACIENTE' ? '' : payload.patientName);
          setDoctorDraft(payload.doctorName ?? '');
          setProcedureDraft(payload.procedureName ?? '');
          setHospitalDraft(payload.hospitalName ?? '');
          setRegistryDraft(payload.patientRegistry ?? '');
          setTotalDraft(payload.totalAmount);
        }
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

  async function savePatch(body: Record<string, unknown>) {
    if (!detail?.canEdit || !selectedId) return;
    if (Object.keys(body).length === 0) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/gestao/impcg/${selectedId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.status === 403) {
        toast.error('Sem permissão para editar');
        return;
      }
      if (!res.ok) {
        toast.error('Não foi possível salvar');
        return;
      }
      const payload = (await res.json()) as ImpcgDetail;
      setDetail(payload);
      setTotalDraft(payload.totalAmount);
      await loadList();
    } catch {
      toast.error('Erro de rede ao salvar');
    } finally {
      setSaving(false);
    }
  }

  async function savePatchItems(items: ImpcgItemDraft[]) {
    await savePatch({ items });
  }

  async function handleSync() {
    if (!data?.canSync) return;
    setSyncing(true);
    try {
      const res = await fetch('/api/gestao/impcg/sync', { method: 'POST' });
      if (res.status === 409) {
        toast.error('Coleta em andamento');
        return;
      }
      if (!res.ok) {
        toast.error('Não foi possível atualizar agora');
        return;
      }
      // JOB-004: HTTP 200 não é coleta completa. Falha parcial (caixa, upload ou
      // gravação) avisa, senão o operador dá o ofício por recebido sem ele estar.
      const payload = (await res.json().catch(() => null)) as { ok?: boolean } | null;
      if (payload?.ok === false) {
        toast.warning('Coleta parcial: parte dos ofícios não foi importada');
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
    ? `Ordem ${detail.oficioNumber} — ${detail.patientName}`
    : selectedId
      ? 'Autorização IMPCG'
      : '';

  return (
    <div className="space-y-6">
      <PageHeader
        icon="assignment"
        title="IMPCG"
        subtitle={(
          <>
            <p>
              {data?.lastCollectedAt
                ? `Última coleta: ${formatDateTime(data.lastCollectedAt)}`
                : 'Autorizações de fornecimento'}
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
        <div className="bg-white dark:bg-card-dark border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-3">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
        </div>
      )}

      {!loading && items.length === 0 && (
        <div className="bg-white dark:bg-card-dark border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm">
          <EmptyState icon="assignment" title="Nenhuma autorização IMPCG." />
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
                    Ordem {item.oficioNumber}
                  </span>
                  <span className="text-xs text-slate-500">
                    {formatIssuedAt(item.issuedAt)}
                  </span>
                </div>
                <div className="mt-1">
                  <GestaoPatientHospital
                    patientName={item.patientName}
                    hospitalName={item.hospitalName}
                  />
                </div>
                <div className="flex items-center justify-between gap-2 mt-0.5">
                  <p className="text-xs text-slate-500 truncate">
                    {item.doctorName || '—'}
                  </p>
                  <ParseBadge status={item.parseStatus} />
                </div>
              </button>
            ))}
          </div>

          <div className="hidden sm:block bg-white dark:bg-card-dark border border-slate-200 dark:border-slate-800 rounded-xl shadow-lg shadow-slate-200/50 dark:shadow-none overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <caption className="sr-only">Autorizações IMPCG</caption>
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800 text-xs uppercase text-slate-500 dark:text-slate-400 font-bold tracking-wider">
                    <th className="px-4 py-3">Data</th>
                    <th className="px-4 py-3">Nº</th>
                    <th className="px-4 py-3">Paciente</th>
                    <th className="px-4 py-3">Médico</th>
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
                      <td className="px-4 py-3 text-sm tabular-nums whitespace-nowrap">
                        {formatIssuedAt(item.issuedAt)}
                      </td>
                      <td className="px-4 py-3 text-sm font-semibold tabular-nums">
                        <span className="inline-flex items-center gap-2">
                          {item.oficioNumber}
                          <ParseBadge status={item.parseStatus} />
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <GestaoPatientHospital
                          patientName={item.patientName}
                          hospitalName={item.hospitalName}
                        />
                      </td>
                      <td className="px-4 py-3 text-sm">{item.doctorName || '—'}</td>
                      <td className="px-4 py-3 text-sm font-mono font-bold tabular-nums text-right">
                        {formatBrl(item.totalAmount)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            setSelectedId(item.id);
                          }}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-primary dark:hover:text-blue-400 hover:bg-primary/10"
                          title={item.fileName}
                          aria-label={`Abrir arquivo da ordem ${item.oficioNumber}`}
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
              <ReadFieldEditor
                label="Data"
                display={formatIssuedAt(detail.issuedAt)}
                edited={isOficioFieldEdited(detail.editedFields, 'issuedAt')}
                canEdit={detail.canEdit}
                saving={saving}
                onSave={() => {
                  if (issuedAtDraft) void savePatch({ issuedAt: issuedAtDraft });
                }}
              >
                <input
                  type="date"
                  aria-label="Data"
                  value={issuedAtDraft}
                  onChange={(event) => setIssuedAtDraft(event.target.value)}
                  className={readFieldInputClass}
                />
              </ReadFieldEditor>
              <ReadFieldEditor
                label="Paciente"
                display={<span className="font-semibold text-slate-900 dark:text-white">{detail.patientName}</span>}
                edited={isOficioFieldEdited(detail.editedFields, 'patientName')}
                canEdit={detail.canEdit}
                saving={saving}
                onSave={() => {
                  if (patientDraft.trim()) void savePatch({ patientName: patientDraft.trim() });
                }}
              >
                <input
                  aria-label="Paciente"                  value={patientDraft}
                  onChange={(event) => setPatientDraft(event.target.value)}
                  className={readFieldInputClass}
                />
              </ReadFieldEditor>
              <ReadFieldEditor
                label="Matrícula"
                display={detail.patientRegistry || '—'}
                edited={isOficioFieldEdited(detail.editedFields, 'patientRegistry')}
                canEdit={detail.canEdit}
                saving={saving}
                onSave={() => void savePatch({ patientRegistry: registryDraft.trim() })}
              >
                <input
                  aria-label="Matrícula"                  value={registryDraft}
                  onChange={(event) => setRegistryDraft(event.target.value)}
                  className={readFieldInputClass}
                />
              </ReadFieldEditor>
              <ReadFieldEditor
                label="Médico"
                display={detail.doctorName || '—'}
                edited={isOficioFieldEdited(detail.editedFields, 'doctorName')}
                canEdit={detail.canEdit}
                saving={saving}
                onSave={() => {
                  if (doctorDraft.trim()) void savePatch({ doctorName: doctorDraft.trim() });
                }}
              >
                <input
                  aria-label="Médico"                  value={doctorDraft}
                  onChange={(event) => setDoctorDraft(event.target.value)}
                  className={readFieldInputClass}
                  placeholder="Nome"
                />
              </ReadFieldEditor>
              <ReadFieldEditor
                label="Hospital"
                display={detail.hospitalName || '—'}
                edited={isOficioFieldEdited(detail.editedFields, 'hospitalName')}
                canEdit={detail.canEdit}
                saving={saving}
                onSave={() => {
                  if (hospitalDraft.trim()) void savePatch({ hospitalName: hospitalDraft.trim() });
                }}
              >
                <input
                  aria-label="Hospital"                  value={hospitalDraft}
                  onChange={(event) => setHospitalDraft(event.target.value)}
                  className={readFieldInputClass}
                />
              </ReadFieldEditor>
              <div className="sm:col-span-2">
                <ReadFieldEditor
                  label="Procedimento"
                  display={detail.procedureName || '—'}
                  edited={isOficioFieldEdited(detail.editedFields, 'procedureName')}
                  canEdit={detail.canEdit}
                  saving={saving}
                  onSave={() => {
                    if (procedureDraft.trim()) void savePatch({ procedureName: procedureDraft.trim() });
                  }}
                >
                  <input
                    aria-label="Procedimento"                    value={procedureDraft}
                    onChange={(event) => setProcedureDraft(event.target.value)}
                    className={readFieldInputClass}
                  />
                </ReadFieldEditor>
              </div>
              <div>
                <dt className="flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Total
                  {isOficioFieldEdited(detail.editedFields, 'totalAmount') ? (
                    <span className="normal-case font-medium tracking-normal text-xs text-slate-500 dark:text-slate-400/80">
                      editado
                    </span>
                  ) : null}
                </dt>
                {detail.canEdit ? (
                  <dd className="flex flex-wrap items-center gap-1.5 mt-1">
                    <input
                      value={totalDraft}
                      onChange={(event) => setTotalDraft(event.target.value)}
                      className={`${readFieldInputClass} font-mono w-36`}
                      placeholder="12.550,00"
                      aria-label="Total do ofício"
                    />
                    <button
                      type="button"
                      disabled={saving || !totalDraft.trim()}
                      onClick={() => {
                        if (totalDraft.trim()) void savePatch({ totalAmount: totalDraft.trim() });
                      }}
                      className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 hover:text-primary dark:hover:text-blue-400 disabled:opacity-50"
                    >
                      Salvar total
                    </button>
                  </dd>
                ) : (
                  <dd>
                    <span className="font-mono font-bold">{formatBrl(detail.totalAmount)}</span>
                  </dd>
                )}
              </div>
              <div>
                <dt className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Leitura</dt>
                <dd className="flex items-center gap-2 flex-wrap">
                  {detail.parseStatus === 'ok' ? (
                    'Ok'
                  ) : (
                    <>
                      <ParseBadge status={detail.parseStatus} />
                      <span
                        className={`text-xs font-medium ${
                          detail.parseStatus === 'falha'
                            ? 'text-rose-700 dark:text-rose-300'
                            : 'text-amber-800 dark:text-amber-300'
                        }`}
                      >
                        {detail.parseMissingReason ?? 'Não foi possível ler o documento'}
                      </span>
                    </>
                  )}
                </dd>
              </div>
            </dl>

            <ImpcgItemsEditor
              items={detail.items}
              canEdit={detail.canEdit}
              edited={isOficioFieldEdited(detail.editedFields, 'items')}
              saving={saving}
              formatBrl={formatBrl}
              onSave={(items) => void savePatchItems(items)}
              totalAmount={detail.totalAmount}
              totalEdited={isOficioFieldEdited(detail.editedFields, 'totalAmount')}
              onSaveTotal={(totalAmount) => void savePatch({ totalAmount })}
            />

          </div>
        )}
        {/* Fora do bloco de detalhe: o PDF começa a carregar junto do JSON, não depois. */}
        {selectedId && (
          <div className="w-full h-[70vh] mt-5 bg-slate-200 dark:bg-slate-900 rounded-lg overflow-hidden">
            <iframe
              src={embeddedPdfViewerSrc(`/api/gestao/impcg/${selectedId}/arquivo`)}
              className="w-full h-full border-0"
              title="PDF da autorização"
              onLoad={(event) => closeEmbeddedPdfSidebar(event.currentTarget)}
            />
          </div>
        )}
      </Modal>
    </div>
  );
}
