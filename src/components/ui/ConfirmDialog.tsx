'use client';

import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';

/**
 * Confirmação em cima de `<Modal>`: foco preso, `Esc`, trava de rolagem, botão
 * voltar e devolução de foco vêm de lá — este ficheiro só põe ícone, mensagem
 * e dois botões. A API pública não mudou.
 */
interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmVariant?: 'danger' | 'primary';
  loading?: boolean;
}

const ICONE = {
  danger: {
    nome: 'warning',
    fundo: 'bg-red-500/10 dark:bg-red-500/20 ring-1 ring-red-500/20 dark:ring-red-500/30',
    cor: 'text-red-500',
  },
  primary: {
    nome: 'help',
    fundo: 'bg-primary/10 dark:bg-primary/20 ring-1 ring-primary/20 dark:ring-primary/30',
    cor: 'text-primary dark:text-blue-400',
  },
} as const;

export default function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  confirmVariant = 'primary',
  loading = false,
}: ConfirmDialogProps) {
  const icone = ICONE[confirmVariant];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      width="sm:max-w-md"
      footer={null}
      bodyClassName="flex flex-col gap-6 p-6"
    >
      <div className="flex items-start gap-4">
        <div className={`shrink-0 w-12 h-12 rounded-xl flex items-center justify-center ${icone.fundo}`}>
          <span aria-hidden="true" className={`material-symbols-outlined text-[24px] ${icone.cor}`}>
            {icone.nome}
          </span>
        </div>
        <p className="pt-3 text-sm text-slate-500 dark:text-slate-400 leading-relaxed">{message}</p>
      </div>

      {/* `mt-auto` cola os botões ao fundo no celular (tela cheia); no desktop o conteúdo manda. */}
      <div className="mt-auto flex flex-col gap-2 sm:flex-row sm:justify-end">
        <Button onClick={onClose} variant="ghost" block className="sm:w-auto">
          {cancelLabel}
        </Button>
        <Button
          onClick={() => onConfirm()}
          variant={confirmVariant === 'danger' ? 'danger' : 'primary'}
          loading={loading}
          block
          className="sm:w-auto"
        >
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
