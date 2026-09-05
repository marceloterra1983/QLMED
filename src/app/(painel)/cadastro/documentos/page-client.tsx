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
  CERTIDAO_KINDS_ORDER,
  CERTIDAO_LABEL,
  DOCUMENTOS_UPLOAD_MAX_BYTES,
  familyByCategory,
} from '@/lib/documentos/constants';
import type { DocumentosListing, DocumentosRow } from '@/lib/documentos/list';
import { formatDateTime, formatInt } from '@/lib/utils';
import CertidaoPdfModal from './components/CertidaoPdfModal';
import DocumentosFamilyTable from './components/DocumentosFamilyTable';

export { formatDaysRemaining, CERTIDAO_DIAS_DESTAQUE, isDaysDestaque } from './components/DocumentosFamilyTable';

type CertidaoKind = (typeof CERTIDAO_KINDS_ORDER)[number];

function apiErrorMessage(payload: unknown, fallback: string): string {
  const error = (payload as { error?: unknown } | null)?.error;
  return typeof error === 'string' && error.trim() ? error : fallback;
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

  const tableProps = {
    canWrite,
    editingId,
    editDraft,
    saving,
    onEditDraft: setEditDraft,
    onStartEdit: (row: DocumentosRow) => {
      setEditingId(row.id);
      setEditDraft(row.validUntil ?? '');
    },
    onSaveEdit: () => {
      void saveEdit();
    },
    onCancelEdit: () => {
      setEditingId(null);
      setEditDraft('');
    },
    onView: (row: DocumentosRow) => {
      if (!row.id) return;
      setViewer({ id: row.id, title: row.label });
    },
  };

  const certidoes = data?.certidoes ?? [];
  const sanitaria = data?.sanitaria ?? [];
  const cartas = data?.cartas ?? [];
  const certidaoFamily = familyByCategory('certidao');
  const sanitariaFamily = familyByCategory('sanitaria');
  const cartaFamily = familyByCategory('carta');

  return (
    <>
      <PageHeader
        icon="verified"
        title="Documentos"
        subtitle="Certidões, autorizações sanitárias e cartas de comercialização"
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
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800 text-xs uppercase text-slate-500 dark:text-slate-400 font-bold tracking-wider">
                  <th className="px-4 py-3">Certidão</th>
                  <th className="px-4 py-3">Válida até</th>
                  <th className="px-4 py-3">Dias restantes</th>
                  <th className="px-4 py-3">Ações</th>
                </tr>
              </thead>
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
          <Section
            icon={certidaoFamily.icon}
            title={certidaoFamily.label}
            defaultOpen={certidaoFamily.defaultOpen}
          >
            {canWrite ? (
              <div className="mb-3 flex justify-end">
                <Button size="sm" variant="secondary" icon="upload_file" onClick={() => setUploadOpen(true)}>
                  Enviar arquivo
                </Button>
              </div>
            ) : null}
            <DocumentosFamilyTable
              caption={certidaoFamily.label}
              columnLabel={certidaoFamily.columnLabel}
              rows={certidoes}
              {...tableProps}
            />
          </Section>

          <Section
            icon={sanitariaFamily.icon}
            title={sanitariaFamily.label}
            defaultOpen={sanitariaFamily.defaultOpen}
          >
            <DocumentosFamilyTable
              caption={sanitariaFamily.label}
              columnLabel={sanitariaFamily.columnLabel}
              rows={sanitaria}
              {...tableProps}
            />
          </Section>

          <Section
            icon={cartaFamily.icon}
            title={cartaFamily.label}
            defaultOpen={cartaFamily.defaultOpen}
          >
            <DocumentosFamilyTable
              caption={cartaFamily.label}
              columnLabel={cartaFamily.columnLabel}
              rows={cartas}
              {...tableProps}
            />
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
        title={viewer?.title ?? 'Documento'}
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
