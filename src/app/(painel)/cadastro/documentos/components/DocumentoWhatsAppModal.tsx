'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import Button from '@/components/ui/Button';
import Field, { FIELD_CONTROL_CLS } from '@/components/ui/Field';
import Modal from '@/components/ui/Modal';

type WhatsAppRecipient = { phone: string; label: string };

type DocumentoWhatsAppModalProps = {
  isOpen: boolean;
  onClose: () => void;
  documentId: string;
  title: string;
  recipients: readonly WhatsAppRecipient[];
};

function apiErrorMessage(payload: unknown, fallback: string): string {
  const error = (payload as { error?: unknown } | null)?.error;
  return typeof error === 'string' && error.trim() ? error : fallback;
}

function splitExtraPhones(raw: string): string[] {
  return raw
    .split(/[,;]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export default function DocumentoWhatsAppModal({
  isOpen,
  onClose,
  documentId,
  title,
  recipients,
}: DocumentoWhatsAppModalProps) {
  const [selected, setSelected] = useState<string[]>([]);
  const [extraPhone, setExtraPhone] = useState('');
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const sendingRef = useRef(false);
  const seqRef = useRef(0);

  useEffect(() => {
    if (isOpen) return;
    setSelected([]);
    setExtraPhone('');
    setNote('');
    setSending(false);
    seqRef.current += 1;
  }, [isOpen]);

  function toggle(phone: string) {
    setSelected((current) =>
      current.includes(phone) ? current.filter((item) => item !== phone) : [...current, phone],
    );
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const extras = splitExtraPhones(extraPhone);
    const phones = [...selected, ...extras];
    if (sendingRef.current || phones.length === 0) return;
    sendingRef.current = true;
    setSending(true);
    const mine = seqRef.current;
    try {
      const trimmed = note.trim();
      const res = await fetch(`/api/documentos/${documentId}/compartilhar-whatsapp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phones,
          note: trimmed ? trimmed : undefined,
        }),
      });
      const payload: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(apiErrorMessage(payload, 'Não foi possível enviar pelo WhatsApp'));
        return;
      }
      const sent = (payload as { sent?: unknown } | null)?.sent;
      const n = Array.isArray(sent) ? sent.length : phones.length;
      toast.success(
        n === 1 ? 'Enviado para 1 destinatário no WhatsApp' : `Enviado para ${n} destinatários no WhatsApp`,
      );
      if (seqRef.current === mine) onClose();
    } catch {
      toast.error('Erro de rede ao enviar pelo WhatsApp');
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }

  const extras = splitExtraPhones(extraPhone);
  const canSend = (selected.length > 0 || extras.length > 0) && !sending;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`WhatsApp: ${title}`}
      width="sm:max-w-md"
      footer={null}
    >
      <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-4">
        <fieldset className="flex flex-col gap-2">
          <legend className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Destinatários
          </legend>
          {recipients.map((recipient) => (
            <label
              key={recipient.phone}
              className="flex items-center gap-2 text-sm text-slate-800 dark:text-slate-200"
            >
              <input
                type="checkbox"
                checked={selected.includes(recipient.phone)}
                onChange={() => toggle(recipient.phone)}
              />
              {recipient.label}
            </label>
          ))}
        </fieldset>
        <Field label="Outro número" hint="Opcional. Com DDD. Um ou mais, separados por vírgula.">
          <input
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            className={FIELD_CONTROL_CLS}
            placeholder="67 99999-9999"
            aria-label="Outro número"
            value={extraPhone}
            onChange={(event) => setExtraPhone(event.target.value)}
          />
        </Field>
        <Field label="Observação" hint="Opcional">
          <textarea
            className={`${FIELD_CONTROL_CLS} h-24 py-2`}
            maxLength={500}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </Field>
        <div className="mt-auto flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" onClick={onClose} block className="sm:w-auto">
            Cancelar
          </Button>
          <Button type="submit" loading={sending} disabled={!canSend} block className="sm:w-auto">
            Enviar pelo WhatsApp
          </Button>
        </div>
      </form>
    </Modal>
  );
}
