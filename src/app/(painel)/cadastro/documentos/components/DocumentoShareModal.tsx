'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import Button from '@/components/ui/Button';
import Field, { FIELD_CONTROL_CLS } from '@/components/ui/Field';
import Modal from '@/components/ui/Modal';

type ShareRecipient = { email: string; label: string };

type DocumentoShareModalProps = {
  isOpen: boolean;
  onClose: () => void;
  documentId: string;
  title: string;
  recipients: readonly ShareRecipient[];
};

function apiErrorMessage(payload: unknown, fallback: string): string {
  const error = (payload as { error?: unknown } | null)?.error;
  return typeof error === 'string' && error.trim() ? error : fallback;
}

function splitExtraEmails(raw: string): string[] {
  return raw
    .split(/[,;\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export default function DocumentoShareModal({
  isOpen,
  onClose,
  documentId,
  title,
  recipients,
}: DocumentoShareModalProps) {
  const [selected, setSelected] = useState<string[]>([]);
  const [extraEmail, setExtraEmail] = useState('');
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const sendingRef = useRef(false);
  /** Invalida respostas em voo quando o modal fecha ou muda de documento. */
  const seqRef = useRef(0);

  useEffect(() => {
    if (isOpen) return;
    setSelected([]);
    setExtraEmail('');
    setNote('');
    setSending(false);
    // sendingRef NÃO é limpo aqui: o POST pode estar em curso e zerá-lo
    // permitiria um segundo envio do mesmo documento. Quem o limpa é o
    // `finally` do envio.
    seqRef.current += 1;
  }, [isOpen]);

  function toggle(email: string) {
    setSelected((current) =>
      current.includes(email) ? current.filter((item) => item !== email) : [...current, email],
    );
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const extras = splitExtraEmails(extraEmail);
    const recipients = [...selected, ...extras];
    if (sendingRef.current || recipients.length === 0) return;
    sendingRef.current = true;
    setSending(true);
    const mine = seqRef.current;
    try {
      const trimmed = note.trim();
      const res = await fetch(`/api/documentos/${documentId}/compartilhar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipients,
          note: trimmed ? trimmed : undefined,
        }),
      });
      const payload: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(apiErrorMessage(payload, 'Não foi possível compartilhar'));
        return;
      }
      const sent = (payload as { sent?: unknown } | null)?.sent;
      const n = Array.isArray(sent) ? sent.length : recipients.length;
      toast.success(n === 1 ? 'Enviado para 1 destinatário' : `Enviado para ${n} destinatários`);
      if (seqRef.current === mine) onClose();
    } catch {
      toast.error('Erro de rede ao compartilhar');
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }

  const extras = splitExtraEmails(extraEmail);
  const canSend = (selected.length > 0 || extras.length > 0) && !sending;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Compartilhar ${title}`}
      width="sm:max-w-md"
      footer={null}
    >
      <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-4">
        <fieldset className="flex flex-col gap-2">
          <legend className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Destinatários
          </legend>
          {recipients.map((recipient) => (
            <label key={recipient.email} className="flex items-center gap-2 text-sm text-slate-800 dark:text-slate-200">
              <input
                type="checkbox"
                checked={selected.includes(recipient.email)}
                onChange={() => toggle(recipient.email)}
              />
              {recipient.label}
            </label>
          ))}
        </fieldset>
        <Field label="Outro e-mail" hint="Opcional. Um ou mais, separados por vírgula.">
          <input
            type="text"
            inputMode="email"
            autoComplete="email"
            className={FIELD_CONTROL_CLS}
            placeholder="ex.: compras@hospital.com.br"
            aria-label="Outro e-mail"
            value={extraEmail}
            onChange={(event) => setExtraEmail(event.target.value)}
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
            Enviar
          </Button>
        </div>
      </form>
    </Modal>
  );
}
