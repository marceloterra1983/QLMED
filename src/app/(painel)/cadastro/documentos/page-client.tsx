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
  DOCUMENTOS_FAMILIES,
  DOCUMENTOS_UPLOAD_MAX_BYTES,
} from '@/lib/documentos/constants';
import type { DocumentosCategory } from '@/lib/documentos/constants';
import type { DocumentosListing, DocumentosRow } from '@/lib/documentos/list';
import { formatDateTime, formatInt } from '@/lib/utils';
import CertidaoPdfModal from './components/CertidaoPdfModal';
import DocumentoDetalheModal from './components/DocumentoDetalheModal';
import DocumentoShareModal from './components/DocumentoShareModal';
import DocumentoUpdateModal from './components/DocumentoUpdateModal';
import DocumentosFamilyTable from './components/DocumentosFamilyTable';

export { formatDaysRemaining, CERTIDAO_DIAS_DESTAQUE, isDaysDestaque } from './components/DocumentosFamilyTable';

type CertidaoKind = (typeof CERTIDAO_KINDS_ORDER)[number];

function apiErrorMessage(payload: unknown, fallback: string): string {
  const error = (payload as { error?: unknown } | null)?.error;
  return typeof error === 'string' && error.trim() ? error : fallback;
}

function rowsForFamily(listing: DocumentosListing, category: DocumentosCategory): DocumentosRow[] {
  switch (category) {
    case 'certidao':
      return listing.certidoes;
    case 'sanitaria':
      return listing.sanitaria;
    case 'carta':
      return listing.cartas;
    case 'societario':
      return listing.societario;
    case 'basicos':
      return listing.basicos;
    case 'balanco':
      return listing.balancos;
  }
}

function listingNeedsEmissao(listing: DocumentosListing): boolean {
  for (const family of DOCUMENTOS_FAMILIES) {
    if (family.category === 'balanco') continue;
    for (const row of rowsForFamily(listing, family.category)) {
      if (row.id && !row.emitidoEm) return true;
    }
  }
  return false;
}

export default function DocumentosPageClient() {
  const { canWrite } = useRole();
  const [data, setData] = useState<DocumentosListing | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [backfilling, setBackfilling] = useState(false);
  const [backfillRestantes, setBackfillRestantes] = useState(0);
  const [backfillCursor, setBackfillCursor] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadKind, setUploadKind] = useState<CertidaoKind>(CERTIDAO_KINDS_ORDER[0]);
  const [uploadValidUntil, setUploadValidUntil] = useState('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [viewer, setViewer] = useState<{ id: string; title: string } | null>(null);
  const [detailRow, setDetailRow] = useState<DocumentosRow | null>(null);
  const [updateRow, setUpdateRow] = useState<DocumentosRow | null>(null);
  const [shareRow, setShareRow] = useState<DocumentosRow | null>(null);
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

  async function handleBackfill() {
    setBackfilling(true);
    try {
      const res = await fetch('/api/documentos/backfill-emissao', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // O cursor do lote anterior faz a varredura AVANÇAR. Sem ele, as linhas
        // cujo PDF não declara emissão continuam à cabeça e são re-descarregadas
        // a cada clique, sem nunca chegar às seguintes.
        body: JSON.stringify(backfillCursor ? { aposId: backfillCursor } : {}),
      });
      const payload: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(apiErrorMessage(payload, 'Não foi possível preencher as emissões'));
        return;
      }
      const result = payload as {
        preenchidos?: number;
        semEmissao?: number;
        restantes?: number;
        proximoId?: string | null;
        ocupado?: boolean;
      };
      if (result.ocupado) {
        toast.error('já em andamento');
        return;
      }
      const restantes = result.restantes ?? 0;
      setBackfillRestantes(restantes);
      setBackfillCursor(restantes > 0 ? (result.proximoId ?? null) : null);
      toast.success(
        `${formatInt(result.preenchidos ?? 0)} preenchidos, ${formatInt(result.semEmissao ?? 0)} sem emissão no PDF, ${formatInt(restantes)} restantes`,
      );
      await load({ quiet: true });
    } catch {
      toast.error('Erro de rede ao preencher emissões');
    } finally {
      setBackfilling(false);
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
    onOpenDetail: (row: DocumentosRow) => {
      setDetailRow(row);
    },
    onUpdate: (row: DocumentosRow) => {
      setEditingId(null);
      setDetailRow(null);
      setUpdateRow(row);
    },
    onShare: (row: DocumentosRow) => {
      if (!row.id) return;
      setShareRow(row);
    },
  };

  return (
    <>
      <PageHeader
        icon="verified"
        title="Documentos"
        subtitle="Certidões, autorizações, contratos, documentos básicos e balanços"
        actions={
          canWrite ? (
            <>
              {data && (listingNeedsEmissao(data) || backfillRestantes > 0) ? (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => void handleBackfill()}
                  loading={backfilling}
                  icon="calendar_month"
                >
                  Preencher emissões
                </Button>
              ) : null}
              <Button type="button" onClick={() => void handleSync()} loading={syncing} icon="sync">
                Atualizar do OneDrive
              </Button>
            </>
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
                  <th className="px-3 py-2 sm:py-1.5">Certidão</th>
                  <th className="px-3 py-2 sm:py-1.5">Válida até</th>
                  <th className="px-3 py-2 sm:py-1.5">Dias restantes</th>
                  <th className="px-3 py-2 sm:py-1.5">Ações</th>
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: 7 }, (_, index) => (
                  <tr key={index} className="border-b border-slate-100 dark:border-slate-800">
                    <td className="px-3 py-2 sm:py-1.5"><Skeleton className="h-4 w-48" /></td>
                    <td className="px-3 py-2 sm:py-1.5"><Skeleton className="h-4 w-24" /></td>
                    <td className="px-3 py-2 sm:py-1.5"><Skeleton className="h-4 w-28" /></td>
                    <td className="px-3 py-2 sm:py-1.5"><Skeleton className="h-4 w-32" /></td>
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
          {DOCUMENTOS_FAMILIES.map((family) => (
            <Section
              key={family.category}
              icon={family.icon}
              title={family.label}
              defaultOpen={family.defaultOpen}
            >
              {family.category === 'certidao' && canWrite ? (
                <div className="mb-3 flex justify-end">
                  <Button size="sm" variant="secondary" icon="upload_file" onClick={() => setUploadOpen(true)}>
                    Enviar arquivo
                  </Button>
                </div>
              ) : null}
              <DocumentosFamilyTable
                caption={family.label}
                columnLabel={family.columnLabel}
                rows={rowsForFamily(data, family.category)}
                layout={family.scan === 'yearFolders' ? 'yearFolders' : 'validity'}
                {...tableProps}
              />
            </Section>
          ))}

          <p className="text-xs text-slate-500 dark:text-slate-400">
            Última varredura:{' '}
            {data.ingest.lastSuccessAt ? formatDateTime(data.ingest.lastSuccessAt) : 'ainda não realizada'}
          </p>
          {data.ingest.lastError ? (
            <p className="text-xs text-amber-700 dark:text-amber-400">{data.ingest.lastError}</p>
          ) : null}
        </div>
      ) : null}

      <DocumentoDetalheModal
        isOpen={detailRow != null}
        onClose={() => setDetailRow(null)}
        row={detailRow}
        canWrite={canWrite}
        onView={(row) => {
          if (!row.id) return;
          setViewer({ id: row.id, title: row.label });
        }}
        onShare={(row) => {
          if (!row.id) return;
          setShareRow(row);
        }}
        onUpdate={(row) => {
          setDetailRow(null);
          setEditingId(null);
          setUpdateRow(row);
        }}
        onStartEdit={(row) => {
          if (!row.id) return;
          setDetailRow(null);
          setEditingId(row.id);
          setEditDraft(row.validUntil ?? '');
        }}
      />

      <DocumentoUpdateModal
        isOpen={updateRow != null}
        onClose={() => setUpdateRow(null)}
        kind={updateRow?.kind ?? CERTIDAO_KINDS_ORDER[0]}
        label={updateRow?.label ?? ''}
        onUploaded={() => {
          void load({ quiet: true });
        }}
      />

      <DocumentoShareModal
        isOpen={shareRow != null && shareRow.id != null}
        onClose={() => setShareRow(null)}
        documentId={shareRow?.id ?? ''}
        title={shareRow?.label ?? 'Documento'}
        recipients={data?.shareRecipients ?? []}
      />

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
