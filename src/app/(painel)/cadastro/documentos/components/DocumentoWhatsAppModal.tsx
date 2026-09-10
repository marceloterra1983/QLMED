'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import Button from '@/components/ui/Button';
import Field, { FIELD_CONTROL_CLS } from '@/components/ui/Field';
import Modal from '@/components/ui/Modal';

type DocumentoWhatsAppModalProps = {
  isOpen: boolean;
  onClose: () => void;
  documentId: string;
  title: string;
};

function apiErrorMessage(payload: unknown, fallback: string): string {
  const error = (payload as { error?: unknown } | null)?.error;
  return typeof error === 'string' && error.trim() ? error : fallback;
}

export default function DocumentoWhatsAppModal({
  isOpen,
  onClose,
  documentId,
  title,
}: DocumentoWhatsAppModalProps) {
  const [phone, setPhone] = useState('');
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const sendingRef = useRef(false);
  const seqRef = useRef(0);

  useEffect(() => {
    if (isOpen) return;
    setPhone('');
    setNote('');
    setSending(false);
    seqRef.current += 1;
  }, [isOpen]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (sendingRef.current || phone.replace(/\D/g, '').length < 10) return;
    sendingRef.current = true;
    setSending(true);
    const mine = seqRef.current;
    try {
      const trimmed = note.trim();
      const res = await fetch(`/api/documentos/${documentId}/compartilhar-whatsapp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone,
          note: trimmed ? trimmed : undefined,
        }),
      });
      const payload: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(apiErrorMessage(payload, 'Não foi possível enviar pelo WhatsApp'));
        return;
      }
      toast.success('Enviado pelo WhatsApp');
      if (seqRef.current === mine) onClose();
    } catch {
      toast.error('Erro de rede ao enviar pelo WhatsApp');
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }

  const canSend = phone.replace(/\D/g, '').length >= 10 && !sending;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`WhatsApp: ${title}`}
      width="sm:max-w-md"
      footer={null}
    >
      <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-4">
        <Field label="Telefone" hint="Com DDD. Ex.: 67 99999-9999" required>
          <input
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            className={FIELD_CONTROL_CLS}
            placeholder="67 99999-9999"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
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
