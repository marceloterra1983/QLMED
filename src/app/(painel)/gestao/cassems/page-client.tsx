'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import Modal from '@/components/ui/Modal';
import Skeleton from '@/components/ui/Skeleton';
import { Decimal } from '@prisma/client-runtime-utils';
import GestaoPatientHospital from '@/components/gestao/GestaoPatientHospital';
import ReadFieldEditor, { readFieldInputClass } from '@/components/gestao/ReadFieldEditor';
import { closeEmbeddedPdfSidebar, embeddedPdfViewerSrc } from '@/lib/embedded-pdf-src';
import { isOficioFieldEdited } from '@/lib/gestao-oficio-edits';
import { formatDocumentDate, formatDateTime } from '@/lib/utils';
import PageHeader from '@/components/PageHeader';

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
  items: CassemsListItem[];
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
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide shrink-0 ${
        isFail
          ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300'
          : 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300'
      }`}
    >
      {isFail ? 'Falha' : 'Parcial'}
    </span>
  );
}

/** Data futura é leitura errada do PDF; não mostra como se fosse verdade. */
function formatIssuedAt(issuedAt: string | null): string {
  if (issuedAt && new Date(issuedAt).getTime() > Date.now() + 24 * 60 * 60 * 1000) return '—';
  return formatDocumentDate(issuedAt);
}

export default function CassemsPageClient() {
  const [data, setData] = useState<ListPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<CassemsDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [issuedAtDraft, setIssuedAtDraft] = useState('');
  const [patientDraft, setPatientDraft] = useState('');
  const [doctorDraft, setDoctorDraft] = useState('');
  const [crmDraft, setCrmDraft] = useState('');
  const [procedureDraft, setProcedureDraft] = useState('');
  const [hospitalDraft, setHospitalDraft] = useState('');
  const [registryDraft, setRegistryDraft] = useState('');

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
        if (!cancelled) {
          setDetail(payload);
          setIssuedAtDraft(payload.issuedAt ? payload.issuedAt.slice(0, 10) : '');
          setPatientDraft(payload.patientName === 'PACIENTE' ? '' : payload.patientName);
          setDoctorDraft(payload.doctorName ?? '');
          setCrmDraft(payload.doctorCrm ?? '');
          setProcedureDraft(payload.procedureName ?? '');
          setHospitalDraft(payload.hospitalName ?? '');
          setRegistryDraft(payload.patientRegistry ?? '');
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

  async function savePatch(body: Record<string, string>) {
    if (!detail?.canEdit || !selectedId) return;
    if (Object.keys(body).length === 0) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/gestao/cassems/${selectedId}`, {
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
      const payload = (await res.json()) as CassemsDetail;
      setDetail(payload);
      await loadList();
    } catch {
      toast.error('Erro de rede ao salvar');
    } finally {
      setSaving(false);
    }
  }

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
    ? `Autorização ${detail.oficioNumber} — ${detail.patientName}`
    : selectedId
      ? 'Autorização CASSEMS'
      : '';

  return (
    <div className="space-y-6">
      <PageHeader
        icon="clinical_notes"
        title="CASSEMS"
        subtitle={(
          <>
            <p>
              {data?.lastCollectedAt
                ? `Última coleta: ${formatDateTime(data.lastCollectedAt)}`
                : 'Autorizações de materiais OPME'}
            </p>
            {data?.lastError && (
              <p className="text-amber-700 dark:text-amber-400 text-xs font-medium mt-0.5">{data.lastError}</p>
            )}
          </>
        )}
        actions={data?.canSync ? (
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
                <caption className="sr-only">Autorizações CASSEMS</caption>
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
                      <td className="px-4 py-3 text-sm whitespace-nowrap">
                        {formatIssuedAt(item.issuedAt)}
                      </td>
                      <td className="px-4 py-3 text-sm font-semibold">
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
                  value={patientDraft}
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
                  value={registryDraft}
                  onChange={(event) => setRegistryDraft(event.target.value)}
                  className={readFieldInputClass}
                />
              </ReadFieldEditor>
              <ReadFieldEditor
                label="Prestador"
                display={`${detail.doctorName || '—'}${detail.doctorCrm ? ` · CRM ${detail.doctorCrm}` : ''}`}
                edited={
                  isOficioFieldEdited(detail.editedFields, 'doctorName')
                  || isOficioFieldEdited(detail.editedFields, 'doctorCrm')
                }
                canEdit={detail.canEdit}
                saving={saving}
                onSave={() => {
                  const body: Record<string, string> = {};
                  if (doctorDraft.trim()) body.doctorName = doctorDraft.trim();
                  body.doctorCrm = crmDraft.trim();
                  void savePatch(body);
                }}
              >
                <input
                  value={doctorDraft}
                  onChange={(event) => setDoctorDraft(event.target.value)}
                  className={readFieldInputClass}
                  placeholder="Nome"
                />
                <input
                  value={crmDraft}
                  onChange={(event) => setCrmDraft(event.target.value)}
                  className={`${readFieldInputClass} max-w-24`}
                  placeholder="CRM"
                />
              </ReadFieldEditor>
              <ReadFieldEditor
                label="Local de execução"
                display={detail.hospitalName || '—'}
                edited={isOficioFieldEdited(detail.editedFields, 'hospitalName')}
                canEdit={detail.canEdit}
                saving={saving}
                onSave={() => {
                  if (hospitalDraft.trim()) void savePatch({ hospitalName: hospitalDraft.trim() });
                }}
              >
                <input
                  value={hospitalDraft}
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
                    value={procedureDraft}
                    onChange={(event) => setProcedureDraft(event.target.value)}
                    className={readFieldInputClass}
                  />
                </ReadFieldEditor>
              </div>
              <div>
                <dt className="text-xs font-bold uppercase tracking-wider text-slate-400">Total</dt>
                <dd className="font-mono font-bold">{formatBrl(detail.totalAmount)}</dd>
              </div>
              <div>
                <dt className="text-xs font-bold uppercase tracking-wider text-slate-400">Leitura</dt>
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

          </div>
        )}
        {/* Fora do bloco de detalhe: o PDF começa a carregar junto do JSON, não depois. */}
        {selectedId && (
          <div className="w-full h-[70vh] mt-5 bg-slate-200 dark:bg-slate-900 rounded-lg overflow-hidden">
            <iframe
              src={embeddedPdfViewerSrc(`/api/gestao/cassems/${selectedId}/arquivo`)}
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
