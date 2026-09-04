'use client';

import { Fragment, useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import PageHeader from '@/components/PageHeader';
import Badge, { type BadgeTone } from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import EmptyState from '@/components/ui/EmptyState';
import Field, { FIELD_CONTROL_CLS } from '@/components/ui/Field';
import Modal from '@/components/ui/Modal';
import Skeleton from '@/components/ui/Skeleton';
import { useRole } from '@/hooks/useRole';
import {
  CERTIDAO_KINDS_ORDER,
  CERTIDAO_LABEL,
  DOCUMENTOS_UPLOAD_MAX_BYTES,
} from '@/lib/documentos/constants';
import type { DocumentosHistoryItem, DocumentosListing, DocumentosRow } from '@/lib/documentos/list';
import { formatDate, formatDateTime, formatInt } from '@/lib/utils';

type CertidaoKind = (typeof CERTIDAO_KINDS_ORDER)[number];

function statusTone(key: string): BadgeTone {
  if (key === 'ok') return 'success';
  if (key === 'atencao') return 'warning';
  if (key === 'urgente' || key === 'hoje' || key === 'vencida') return 'danger';
  return 'neutral';
}

function apiErrorMessage(payload: unknown, fallback: string): string {
  const error = (payload as { error?: unknown } | null)?.error;
  return typeof error === 'string' && error.trim() ? error : fallback;
}

function arquivoUrl(id: string, download = false): string {
  return download ? `/api/documentos/${id}/arquivo?download=1` : `/api/documentos/${id}/arquivo`;
}

function FileLinks({ id, fileName }: { id: string; fileName: string }) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      <Button
        href={arquivoUrl(id)}
        external
        target="_blank"
        rel="noopener"
        size="xs"
        variant="ghost"
        icon="visibility"
      >
        Ver
      </Button>
      <Button
        href={arquivoUrl(id, true)}
        external
        download={fileName}
        size="xs"
        variant="ghost"
        icon="download"
      >
        Baixar
      </Button>
    </div>
  );
}

function ValidityText({ value }: { value: string | null }) {
  if (!value) {
    return <span className="text-slate-500 dark:text-slate-400">Sem data</span>;
  }
  return <span className="tabular-nums">{formatDate(value)}</span>;
}

function FileNameCell({ fileName }: { fileName: string | null }) {
  if (!fileName) {
    return <span className="text-sm text-slate-500 dark:text-slate-400">Não encontrada</span>;
  }
  return <span className="text-sm text-slate-700 dark:text-slate-300">{fileName}</span>;
}

function TableHead() {
  return (
    <thead>
      <tr className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800 text-xs uppercase text-slate-500 dark:text-slate-400 font-bold tracking-wider">
        <th className="px-4 py-3">Certidão</th>
        <th className="px-4 py-3">Arquivo</th>
        <th className="px-4 py-3">Válida até</th>
        <th className="px-4 py-3">Dias restantes</th>
        <th className="px-4 py-3">Ações</th>
      </tr>
    </thead>
  );
}

function HistoryRows({ items }: { items: DocumentosHistoryItem[] }) {
  return (
    <>
      {items.map((item) => (
        <tr key={item.id} className="bg-slate-50/80 dark:bg-slate-900/40 border-b border-slate-100 dark:border-slate-800">
          <td className="px-4 py-2 pl-8 text-xs text-slate-500 dark:text-slate-400">Histórico</td>
          <td className="px-4 py-2">
            <FileNameCell fileName={item.fileName} />
          </td>
          <td className="px-4 py-2 text-sm whitespace-nowrap">
            <ValidityText value={item.validUntil} />
          </td>
          <td className="px-4 py-2" />
          <td className="px-4 py-2 whitespace-nowrap">
            <FileLinks id={item.id} fileName={item.fileName} />
          </td>
        </tr>
      ))}
    </>
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
  const [outrosOpen, setOutrosOpen] = useState(false);
  const [expandedKinds, setExpandedKinds] = useState<Set<string>>(() => new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [saving, setSaving] = useState(false);
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

  function toggleHistory(kind: string) {
    setExpandedKinds((prev) => {
      const next = new Set(prev);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });
  }

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

  function rowActions(row: DocumentosRow) {
    if (!row.id || !row.fileName) return null;
    return (
      <div className="flex flex-wrap items-center gap-1">
        <FileLinks id={row.id} fileName={row.fileName} />
        {editingId === row.id ? (
          <>
            <Button size="xs" onClick={() => void saveEdit()} loading={saving} disabled={!editDraft}>
              Salvar
            </Button>
            <Button size="xs" variant="ghost" onClick={() => setEditingId(null)} disabled={saving}>
              Cancelar
            </Button>
          </>
        ) : canWrite ? (
          <Button
            size="xs"
            variant="ghost"
            icon="edit_calendar"
            onClick={() => {
              setEditingId(row.id);
              setEditDraft(row.validUntil ?? '');
            }}
          >
            Editar validade
          </Button>
        ) : null}
      </div>
    );
  }

  function renderCertidaoRow(row: DocumentosRow) {
    const expanded = expandedKinds.has(row.kind);
    return (
      <Fragment key={row.kind}>
        <tr className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40">
          <td className="px-4 py-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium text-slate-900 dark:text-white">{row.label}</span>
              {row.history.length > 0 ? (
                <Button
                  variant="ghost"
                  size="xs"
                  icon={expanded ? 'expand_less' : 'expand_more'}
                  aria-expanded={expanded}
                  aria-label={expanded ? 'Recolher histórico' : 'Expandir histórico'}
                  onClick={() => toggleHistory(row.kind)}
                >
                  {formatInt(row.history.length)}
                </Button>
              ) : null}
            </div>
          </td>
          <td className="px-4 py-3">
            <FileNameCell fileName={row.fileName} />
          </td>
          <td className="px-4 py-3 text-sm whitespace-nowrap">
            {editingId === row.id ? (
              <input
                type="date"
                value={editDraft}
                onChange={(event) => setEditDraft(event.target.value)}
                aria-label="Validade"
                className={`${FIELD_CONTROL_CLS} max-w-40`}
              />
            ) : (
              <ValidityText value={row.validUntil} />
            )}
          </td>
          <td className="px-4 py-3">
            <Badge
              tone={statusTone(row.status.key)}
              title={row.daysRemaining != null ? `${row.daysRemaining} dias` : undefined}
            >
              {row.status.label}
            </Badge>
          </td>
          <td className="px-4 py-3 whitespace-nowrap">{rowActions(row)}</td>
        </tr>
        {expanded ? <HistoryRows items={row.history} /> : null}
      </Fragment>
    );
  }

  const certidoes = data?.certidoes ?? [];
  const outros = data?.outros ?? [];

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
            <table className="w-full min-w-[52rem] text-left border-collapse">
              <TableHead />
              <tbody>
                {Array.from({ length: 6 }, (_, index) => (
                  <tr key={index} className="border-b border-slate-100 dark:border-slate-800">
                    <td className="px-4 py-3"><Skeleton className="h-4 w-48" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-4 w-64" /></td>
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
          <Card padding="none">
            <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Certidões</h3>
              {canWrite ? (
                <Button size="sm" variant="secondary" icon="upload_file" onClick={() => setUploadOpen(true)}>
                  Enviar arquivo
                </Button>
              ) : null}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[52rem] text-left border-collapse">
                <caption className="sr-only">Certidões</caption>
                <TableHead />
                <tbody>{certidoes.map(renderCertidaoRow)}</tbody>
              </table>
            </div>
          </Card>

          {outros.length > 0 ? (
            <Card padding="none">
              <button
                type="button"
                className="flex w-full items-center gap-2 px-4 py-3 text-left"
                aria-expanded={outrosOpen}
                onClick={() => setOutrosOpen((open) => !open)}
              >
                <span aria-hidden="true" className="material-symbols-outlined text-[20px] text-slate-500 dark:text-slate-400">
                  {outrosOpen ? 'expand_less' : 'expand_more'}
                </span>
                <span className="text-sm font-bold text-slate-900 dark:text-white">Outros arquivos na pasta</span>
                <Badge tone="neutral" dot={false}>{formatInt(outros.length)}</Badge>
              </button>
              {outrosOpen ? (
                <div className="overflow-x-auto border-t border-slate-200 dark:border-slate-800">
                  <table className="w-full min-w-[52rem] text-left border-collapse">
                    <caption className="sr-only">Outros arquivos na pasta</caption>
                    <TableHead />
                    <tbody>
                      {outros.map((row) => (
                        <tr key={row.id ?? row.fileName} className="border-b border-slate-100 dark:border-slate-800">
                          <td className="px-4 py-3 text-sm font-medium text-slate-900 dark:text-white">{row.label}</td>
                          <td className="px-4 py-3"><FileNameCell fileName={row.fileName} /></td>
                          <td className="px-4 py-3 text-sm whitespace-nowrap"><ValidityText value={row.validUntil} /></td>
                          <td className="px-4 py-3">
                            <Badge tone={statusTone(row.status.key)}>{row.status.label}</Badge>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            {row.id && row.fileName ? <FileLinks id={row.id} fileName={row.fileName} /> : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </Card>
          ) : null}

          <p className="text-xs text-slate-500 dark:text-slate-400">
            Última varredura:{' '}
            {data.ingest.lastSuccessAt ? formatDateTime(data.ingest.lastSuccessAt) : 'ainda não realizada'}
          </p>
          {data.ingest.lastError ? (
            <p className="text-xs text-amber-700 dark:text-amber-400">{data.ingest.lastError}</p>
          ) : null}
        </div>
      ) : null}

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
