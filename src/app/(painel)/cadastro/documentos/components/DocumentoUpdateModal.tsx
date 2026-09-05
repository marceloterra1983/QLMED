'use client';

import { useEffect, useRef, useState, type DragEvent, type FormEvent } from 'react';
import { toast } from 'sonner';
import Button from '@/components/ui/Button';
import Field, { FIELD_CONTROL_CLS } from '@/components/ui/Field';
import Modal from '@/components/ui/Modal';
import Spinner from '@/components/ui/Spinner';
import { DOCUMENTOS_UPLOAD_MAX_BYTES } from '@/lib/documentos/constants';
import { formatDocumentDate } from '@/lib/utils';
import type { CompanyDocumentKind } from '@prisma/client';

type ValidityRead = {
  validUntil: string | null;
  confidence: 'alta' | 'media' | 'nenhuma';
  matchedLabel: string | null;
  textChars: number;
};

type DocumentoUpdateModalProps = {
  isOpen: boolean;
  onClose: () => void;
  kind: CompanyDocumentKind;
  label: string;
  onUploaded: () => void;
};

function apiErrorMessage(payload: unknown, fallback: string): string {
  const error = (payload as { error?: unknown } | null)?.error;
  return typeof error === 'string' && error.trim() ? error : fallback;
}

function isYmd(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export default function DocumentoUpdateModal({
  isOpen,
  onClose,
  kind,
  label,
  onUploaded,
}: DocumentoUpdateModalProps) {
  const [dragActive, setDragActive] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [validity, setValidity] = useState<ValidityRead | null>(null);
  const [validUntil, setValidUntil] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadingRef = useRef(false);
  /**
   * Cada anexo e cada fecho do modal incrementam este contador. Uma resposta de
   * `/analisar` que volte depois disso pertence a um ficheiro que já não está
   * na tela: aplicá-la gravaria a validade do PDF antigo com o ficheiro novo, e
   * é essa data que alimenta os alertas de vencimento.
   */
  const seqRef = useRef(0);
  const busy = reading || uploading;

  useEffect(() => {
    if (isOpen) return;
    setDragActive(false);
    setFile(null);
    setFileError(null);
    setReading(false);
    setValidity(null);
    setValidUntil('');
    setUploading(false);
    // uploadingRef NÃO é limpo aqui: o POST pode estar em curso, e zerá-lo
    // abriria a porta a um segundo envio. Quem o limpa é o `finally` do submit.
    seqRef.current += 1;
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [isOpen]);

  function handleDrag(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    if (busy) return;
    if (event.type === 'dragenter' || event.type === 'dragover') setDragActive(true);
    else if (event.type === 'dragleave') setDragActive(false);
  }

  function handleDrop(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    setDragActive(false);
    if (busy) return;
    const dropped = event.dataTransfer.files?.[0];
    if (dropped) void acceptFile(dropped);
  }

  async function acceptFile(next: File) {
    if (!next.name.toLowerCase().endsWith('.pdf')) {
      setFileError('Formato inválido. Envie um arquivo .pdf');
      return;
    }
    if (next.size > DOCUMENTOS_UPLOAD_MAX_BYTES) {
      setFileError('Arquivo excede o limite de 5 MB');
      return;
    }
    setFileError(null);
    setFile(next);
    setValidity(null);
    setValidUntil('');
    setReading(true);
    const mine = ++seqRef.current;
    try {
      const form = new FormData();
      form.set('file', next);
      const res = await fetch('/api/documentos/analisar', { method: 'POST', body: form });
      const payload: unknown = await res.json().catch(() => null);
      if (seqRef.current !== mine) return;
      if (!res.ok) {
        setFileError(apiErrorMessage(payload, 'Não foi possível ler o PDF'));
        return;
      }
      const result = payload as ValidityRead;
      setValidity(result);
      if (isYmd(result.validUntil)) setValidUntil(result.validUntil);
    } catch {
      if (seqRef.current !== mine) return;
      setFileError('Erro de rede ao ler o PDF');
    } finally {
      if (seqRef.current === mine) setReading(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (uploadingRef.current || reading || !file) return;
    if (!validUntil) {
      toast.error('Informe a data de validade');
      return;
    }
    uploadingRef.current = true;
    setUploading(true);
    const mine = seqRef.current;
    try {
      const form = new FormData();
      form.set('kind', kind);
      form.set('validUntil', validUntil);
      form.set('file', file);
      const res = await fetch('/api/documentos/upload', { method: 'POST', body: form });
      const payload: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(apiErrorMessage(payload, 'Não foi possível enviar o arquivo'));
        return;
      }
      toast.success('Arquivo enviado');
      onUploaded();
      if (seqRef.current === mine) onClose();
    } catch {
      toast.error('Erro de rede ao enviar o arquivo');
    } finally {
      uploadingRef.current = false;
      setUploading(false);
    }
  }

  const canSubmit = Boolean(file && validUntil && !reading && !uploading);
  const readDone = file != null && !reading && validity != null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Atualizar ${label}`}
      width="sm:max-w-md"
      footer={null}
    >
      <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-4">
        <div
          role="button"
          tabIndex={busy ? -1 : 0}
          aria-label="Anexar PDF"
          aria-disabled={busy}
          className={`border-2 border-dashed rounded-xl p-6 text-center transition-all ${
            busy
              ? 'border-slate-200 dark:border-slate-800 opacity-50 cursor-not-allowed'
              : dragActive
                ? 'border-primary bg-primary/5 cursor-pointer'
                : 'border-slate-300 dark:border-slate-700 hover:border-primary/50 cursor-pointer'
          }`}
          onDragEnter={busy ? undefined : handleDrag}
          onDragLeave={busy ? undefined : handleDrag}
          onDragOver={busy ? undefined : handleDrag}
          onDrop={busy ? undefined : handleDrop}
          onClick={() => {
            if (!busy) fileInputRef.current?.click();
          }}
          onKeyDown={(event) => {
            if (busy) return;
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              fileInputRef.current?.click();
            }
          }}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf,.pdf"
            className="hidden"
            disabled={busy}
            onChange={(event) => {
              const chosen = event.target.files?.[0];
              if (chosen) void acceptFile(chosen);
              event.target.value = '';
            }}
          />
          <span
            className={`material-symbols-outlined text-[40px] mb-2 transition-colors ${
              dragActive ? 'text-primary dark:text-blue-400' : 'text-slate-300'
            }`}
          >
            upload_file
          </span>
          <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
            Arraste o PDF ou clique para escolher
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Somente .pdf, até 5 MB</p>
          {file ? (
            <p className="text-xs font-medium text-slate-600 dark:text-slate-300 mt-2 truncate">
              {file.name}
            </p>
          ) : null}
        </div>

        {fileError ? (
          <p className="text-sm font-medium text-red-700 dark:text-red-400">{fileError}</p>
        ) : null}

        {reading ? (
          <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
            <Spinner size="sm" label="Lendo validade do PDF" />
            Lendo validade do documento…
          </div>
        ) : null}

        {readDone && validity.confidence === 'alta' && validity.validUntil ? (
          <p className="text-sm text-slate-700 dark:text-slate-200">
            Validade encontrada no documento: {formatDocumentDate(validity.validUntil)}
          </p>
        ) : null}
        {readDone && validity.confidence === 'media' && validity.validUntil ? (
          <p className="text-sm text-slate-700 dark:text-slate-200">
            Validade encontrada no documento: {formatDocumentDate(validity.validUntil)} (o ano veio
            com 2 dígitos)
          </p>
        ) : null}
        {readDone && validity.confidence === 'nenhuma' ? (
          <p className="text-sm text-slate-700 dark:text-slate-200">
            Não foi possível ler a validade neste PDF. Informe a data.
          </p>
        ) : null}

        {readDone ? (
          <Field
            label={
              validity.validUntil
                ? 'Validade (corrigir se estiver errada)'
                : 'Validade'
            }
            required={!validity.validUntil}
          >
            <input
              type="date"
              required
              className={FIELD_CONTROL_CLS}
              value={validUntil}
              onChange={(event) => setValidUntil(event.target.value)}
            />
          </Field>
        ) : null}

        <div className="mt-auto flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            disabled={uploading}
            block
            className="sm:w-auto"
          >
            Cancelar
          </Button>
          <Button type="submit" loading={uploading} disabled={!canSubmit} block className="sm:w-auto">
            Enviar
          </Button>
        </div>
      </form>
    </Modal>
  );
}
