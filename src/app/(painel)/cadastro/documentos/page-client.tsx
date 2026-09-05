'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import PageHeader from '@/components/PageHeader';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import EmptyState from '@/components/ui/EmptyState';
import Field, { FIELD_CONTROL_CLS } from '@/components/ui/Field';
import Modal from '@/components/ui/Modal';
import Section from '@/components/ui/Section';
import Skeleton from '@/components/ui/Skeleton';
import { useRole } from '@/hooks/useRole';
import {
  CERTIDAO_EMISSAO_URL,
  CERTIDAO_KINDS_ORDER,
  CERTIDAO_LABEL,
  DOCUMENTOS_UPLOAD_MAX_BYTES,
} from '@/lib/documentos/constants';
import type { DocumentosListing, DocumentosRow } from '@/lib/documentos/list';
import { formatDateTime, formatDocumentDate, formatInt } from '@/lib/utils';
import CertidaoPdfModal from './components/CertidaoPdfModal';

type CertidaoKind = (typeof CERTIDAO_KINDS_ORDER)[number];

/** Destaque de dias restantes: uma semana ou menos (inclui vence hoje e vencida). */
export const CERTIDAO_DIAS_DESTAQUE = 7;

export function formatDaysRemaining(days: number | null): string {
  if (days == null) return '—';
  if (days === 0) return 'vence hoje';
  if (days === 1) return '1 dia';
  if (days > 0) return `${formatInt(days)} dias`;
  const n = -days;
  if (n === 1) return 'vencida há 1 dia';
  return `vencida há ${formatInt(n)} dias`;
}

export function isDaysDestaque(days: number | null): boolean {
  return days != null && days <= CERTIDAO_DIAS_DESTAQUE;
}

const EMISSAO_ARIA: Record<CertidaoKind, string> = {
  cnd_federal: 'Emitir CND Receita Federal no site da Receita',
  crf_fgts: 'Emitir CRF FGTS no site da Caixa',
  cndt: 'Emitir CNDT no site do TST',
  cnd_estadual_ms: 'Emitir CND Estadual (MS) no site da SEFAZ-MS',
  cnd_estadual_mt: 'Emitir CND Estadual (MT) no site da SEFAZ-MT',
  cnd_municipal_mobiliario: 'Emitir CND Municipal — mobiliário no site da Prefeitura',
  cnd_municipal_gerais: 'Emitir CND Municipal — débitos gerais no site da Prefeitura',
};

const ICON_BTN =
  'inline-flex items-center justify-center min-h-11 min-w-11 sm:min-h-8 sm:min-w-8 rounded-lg text-slate-500 dark:text-slate-400 hover:text-primary dark:hover:text-blue-400 hover:bg-slate-100 dark:hover:bg-slate-800';

function apiErrorMessage(payload: unknown, fallback: string): string {
  const error = (payload as { error?: unknown } | null)?.error;
  return typeof error === 'string' && error.trim() ? error : fallback;
}

function arquivoUrl(id: string, download = false): string {
  return download ? `/api/documentos/${id}/arquivo?download=1` : `/api/documentos/${id}/arquivo`;
}

function ValidityText({ value }: { value: string | null }) {
  if (!value) {
    return <span className="text-slate-500 dark:text-slate-400">Sem data</span>;
  }
  // formatDocumentDate, não formatDate: validUntil é `@db.Date` (meia-noite UTC) e
  // formatDate resolve no fuso local (America/Sao_Paulo, UTC-3), mostrando o dia
  // anterior — 2026-12-12 saía como 11/12.
  return <span className="tabular-nums">{formatDocumentDate(value)}</span>;
}

function TableHead() {
  return (
    <thead>
      <tr className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800 text-xs uppercase text-slate-500 dark:text-slate-400 font-bold tracking-wider">
        <th className="px-4 py-3">Certidão</th>
        <th className="px-4 py-3">Válida até</th>
        <th className="px-4 py-3">Dias restantes</th>
        <th className="px-4 py-3">Ações</th>
      </tr>
    </thead>
  );
}

function DaysCell({ days }: { days: number | null }) {
  const destaque = isDaysDestaque(days);
  return (
    <span
      className={`tabular-nums text-sm ${
        destaque
          ? 'font-medium text-amber-700 dark:text-amber-400'
          : 'text-slate-700 dark:text-slate-300'
      }`}
      data-destaque={destaque ? 'true' : undefined}
    >
      {formatDaysRemaining(days)}
    </span>
  );
}

export default function DocumentosPageClient() {
  const { canWrite } = useRole();
  const [data, setData] = useState<DocumentosListing | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadKind, setUploadKind] = useState<CertidaoKind>(CERTIDAO_KINDS_ORDER[0]);
  const [uploadValidUntil, setUploadValidUntil] = useState('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [viewer, setViewer] = useState<{ id: string; title: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async (opts?: { quiet?: boolean }) => {
    if (!opts?.quiet) {
      setLoading(true);
      setLoadError(false);
    }
    try {
      const res = await fetch('/api/documentos');
      if (!res.ok) throw new Error('load');
      const payload = (await res.json()) as DocumentosListing;
      setData(payload);
      setEditingId(null);
      setEditDraft('');
      setLoadError(false);
    } catch {
      if (opts?.quiet) toast.error('Erro ao recarregar documentos');
      else setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (editingId === null) setEditDraft('');
  }, [editingId]);

  function resetUpload() {
    setUploadKind(CERTIDAO_KINDS_ORDER[0]);
    setUploadValidUntil('');
    setUploadFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function closeUpload() {
    setUploadOpen(false);
    resetUpload();
  }

  async function handleSync() {
    setSyncing(true);
    try {
      const res = await fetch('/api/documentos/sync', { method: 'POST' });
      if (res.status === 409) {
        toast.error('já em andamento');
        return;
      }
      const payload: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(apiErrorMessage(payload, 'Não foi possível atualizar agora'));
        return;
      }
      const result = payload as { scanned?: number; upserted?: number; removed?: number };
      toast.success(
        `Varredura concluída: ${formatInt(result.scanned ?? 0)} lidos, ${formatInt(result.upserted ?? 0)} atualizados, ${formatInt(result.removed ?? 0)} removidos`,
      );
      await load({ quiet: true });
    } catch {
      toast.error('Erro de rede ao atualizar');
    } finally {
      setSyncing(false);
    }
  }

  async function saveEdit() {
    if (!editingId || !editDraft) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/documentos/${editingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ validUntil: editDraft }),
      });
      const payload: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(apiErrorMessage(payload, 'Não foi possível salvar a validade'));
        return;
      }
      toast.success('Validade atualizada');
      setEditingId(null);
      setEditDraft('');
      await load({ quiet: true });
    } catch {
      toast.error('Erro de rede ao salvar a validade');
    } finally {
      setSaving(false);
    }
  }

  async function submitUpload(event: FormEvent) {
    event.preventDefault();
    if (!uploadFile) {
      toast.error('Arquivo PDF é obrigatório');
      return;
    }
    if (!uploadFile.name.toLowerCase().endsWith('.pdf')) {
      toast.error('Formato inválido. Envie um arquivo .pdf');
      return;
    }
    if (uploadFile.size > DOCUMENTOS_UPLOAD_MAX_BYTES) {
      toast.error('Arquivo excede o limite de 5 MB');
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      form.set('kind', uploadKind);
      form.set('validUntil', uploadValidUntil);
      form.set('file', uploadFile);
      const res = await fetch('/api/documentos/upload', { method: 'POST', body: form });
      const payload: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(apiErrorMessage(payload, 'Não foi possível enviar o arquivo'));
        return;
      }
      toast.success('Arquivo enviado');
      closeUpload();
      await load({ quiet: true });
    } catch {
      toast.error('Erro de rede ao enviar o arquivo');
    } finally {
      setUploading(false);
    }
  }

  function isEditingRow(row: DocumentosRow): boolean {
    return canWrite && row.id !== null && editingId === row.id;
  }

  function rowActions(row: DocumentosRow) {
    const kind = row.kind as CertidaoKind;
    return (
      <div className="flex flex-wrap items-center gap-1">
        {row.id && row.fileName ? (
          <>
            <Button
              size="xs"
              variant="ghost"
              icon="picture_as_pdf"
              onClick={() => setViewer({ id: row.id as string, title: row.label })}
            >
              Ver
            </Button>
            <Button
              href={arquivoUrl(row.id, true)}
              external
              download={row.fileName}
              size="xs"
              variant="ghost"
              icon="download"
            >
              Baixar
            </Button>
          </>
        ) : null}
        {isEditingRow(row) ? (
          <>
            <Button size="xs" onClick={() => void saveEdit()} loading={saving} disabled={!editDraft}>
              Salvar
            </Button>
            <Button
              size="xs"
              variant="ghost"
              onClick={() => {
                setEditingId(null);
                setEditDraft('');
              }}
              disabled={saving}
            >
              Cancelar
            </Button>
          </>
        ) : null}
        <a
          href={CERTIDAO_EMISSAO_URL[kind]}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={EMISSAO_ARIA[kind]}
          className={ICON_BTN}
        >
          <span aria-hidden="true" className="material-symbols-outlined text-[18px]">open_in_new</span>
        </a>
      </div>
    );
  }

  function renderCertidaoRow(row: DocumentosRow) {
    return (
      <tr
        key={row.kind}
        className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40"
      >
        <td className="px-4 py-3">
          <span className="text-sm font-medium text-slate-900 dark:text-white">{row.label}</span>
        </td>
        <td className="px-4 py-3 text-sm whitespace-nowrap">
          {isEditingRow(row) ? (
            <input
              type="date"
              value={editDraft}
              onChange={(event) => setEditDraft(event.target.value)}
              aria-label="Validade"
              className={`${FIELD_CONTROL_CLS} max-w-40`}
            />
          ) : (
            <span className="inline-flex items-center">
              <ValidityText value={row.validUntil} />
              {canWrite && row.id ? (
                <button
                  type="button"
                  className={ICON_BTN}
                  aria-label={`Editar validade de ${row.label}`}
                  onClick={() => {
                    setEditingId(row.id);
                    setEditDraft(row.validUntil ?? '');
                  }}
                >
                  <span aria-hidden="true" className="material-symbols-outlined text-[16px]">edit</span>
                </button>
              ) : null}
            </span>
          )}
        </td>
        <td className="px-4 py-3">
          <DaysCell days={row.daysRemaining} />
        </td>
        <td className="px-4 py-3 whitespace-nowrap">{rowActions(row)}</td>
      </tr>
    );
  }

  const certidoes = data?.certidoes ?? [];

  return (
    <>
      <PageHeader
        icon="verified"
        title="Documentos"
        subtitle="Certidões de regularidade da empresa"
        actions={
          canWrite ? (
            <Button type="button" onClick={() => void handleSync()} loading={syncing} icon="sync">
              Atualizar do OneDrive
            </Button>
          ) : undefined
        }
      />

      {loading && !data ? (
        <Card padding="none">
          <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800">
            <Skeleton className="h-4 w-32" />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] text-left border-collapse">
              <TableHead />
              <tbody>
                {Array.from({ length: 7 }, (_, index) => (
                  <tr key={index} className="border-b border-slate-100 dark:border-slate-800">
                    <td className="px-4 py-3"><Skeleton className="h-4 w-48" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-4 w-24" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-4 w-28" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-4 w-32" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      {loadError && !data ? (
        <Card padding="none">
          <EmptyState
            icon="error"
            title="Não foi possível carregar os documentos"
            hint="Tente novamente. Se o erro persistir, avise o administrador."
            action={(
              <Button variant="secondary" size="sm" onClick={() => void load()}>
                Tentar de novo
              </Button>
            )}
          />
        </Card>
      ) : null}

      {data ? (
        <div className="space-y-4">
          <Section icon="verified" title="Certidões" defaultOpen>
            {canWrite ? (
              <div className="mb-3 flex justify-end">
                <Button size="sm" variant="secondary" icon="upload_file" onClick={() => setUploadOpen(true)}>
                  Enviar arquivo
                </Button>
              </div>
            ) : null}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[40rem] text-left border-collapse">
                <caption className="sr-only">Certidões</caption>
                <TableHead />
                <tbody>{certidoes.map(renderCertidaoRow)}</tbody>
              </table>
            </div>
          </Section>

          <p className="text-xs text-slate-500 dark:text-slate-400">
            Última varredura:{' '}
            {data.ingest.lastSuccessAt ? formatDateTime(data.ingest.lastSuccessAt) : 'ainda não realizada'}
          </p>
          {data.ingest.lastError ? (
            <p className="text-xs text-amber-700 dark:text-amber-400">{data.ingest.lastError}</p>
          ) : null}
        </div>
      ) : null}

      <CertidaoPdfModal
        isOpen={viewer != null}
        onClose={() => setViewer(null)}
        documentId={viewer?.id ?? null}
        title={viewer?.title ?? 'Certidão'}
      />

      <Modal
        isOpen={uploadOpen}
        onClose={closeUpload}
        title="Enviar arquivo"
        width="sm:max-w-md"
        footer={null}
      >
        <form onSubmit={(event) => void submitUpload(event)} className="flex flex-col gap-4">
          <Field label="Tipo" required>
            <select
              className={FIELD_CONTROL_CLS}
              value={uploadKind}
              onChange={(event) => setUploadKind(event.target.value as CertidaoKind)}
            >
              {CERTIDAO_KINDS_ORDER.map((kind) => (
                <option key={kind} value={kind}>
                  {CERTIDAO_LABEL[kind]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Validade" required>
            <input
              type="date"
              required
              className={FIELD_CONTROL_CLS}
              value={uploadValidUntil}
              onChange={(event) => setUploadValidUntil(event.target.value)}
            />
          </Field>
          <Field label="Arquivo PDF" required>
            <input
              ref={fileInputRef}
              type="file"
              required
              accept="application/pdf,.pdf"
              onChange={(event) => setUploadFile(event.target.files?.[0] ?? null)}
            />
          </Field>
          <div className="mt-auto flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="ghost" onClick={closeUpload} block className="sm:w-auto">
              Cancelar
            </Button>
            <Button type="submit" loading={uploading} block className="sm:w-auto">
              Enviar
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
