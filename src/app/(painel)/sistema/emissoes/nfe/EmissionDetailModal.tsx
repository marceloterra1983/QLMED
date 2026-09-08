'use client';

import Badge, { type BadgeTone } from '@/components/ui/Badge';
import CardDetailPopupModal from '@/components/ui/CardDetailPopupModal';
import { formatAmount, formatCnpj, formatDateTime } from '@/lib/utils';
import { analyzeSefazRejection } from '@/lib/nfe-emission/sefaz-analysis';

export type EmissionListItem = {
  id: string;
  status: string;
  series: string;
  number: string | null;
  natureza: string;
  cfop: string;
  destCnpj: string;
  destName: string;
  totalValue: string | number;
  sefazStat: string | null;
  sefazMotivo: string | null;
  accessKey: string | null;
  invoiceId: string | null;
  createdAt: string;
  updatedAt: string;
};

function statusBadge(status: string): { tone: BadgeTone; label: string } {
  switch (status) {
    case 'authorized':
      return { tone: 'success', label: 'Autorizada' };
    case 'rejected':
      return { tone: 'danger', label: 'Rejeitada' };
    case 'submitted':
      return { tone: 'warning', label: 'Enviada' };
    case 'draft':
    default:
      return { tone: 'neutral', label: 'Rascunho' };
  }
}

type Props = {
  emission: EmissionListItem | null;
  isOpen: boolean;
  onClose: () => void;
};

export default function EmissionDetailModal({ emission, isOpen, onClose }: Props) {
  if (!emission) {
    return (
      <CardDetailPopupModal
        isOpen={isOpen}
        onClose={onClose}
        title="Emissão NF-e"
        icon="receipt_long"
      >
        <p className="text-sm text-slate-500">Nenhuma emissão selecionada.</p>
      </CardDetailPopupModal>
    );
  }

  const badge = statusBadge(emission.status);
  const analysis = analyzeSefazRejection({
    status: emission.status,
    sefazStat: emission.sefazStat,
    sefazMotivo: emission.sefazMotivo,
  });
  const total = Number(emission.totalValue);

  return (
    <CardDetailPopupModal
      isOpen={isOpen}
      onClose={onClose}
      title={
        emission.number
          ? `NF-e ${emission.series}/${emission.number}`
          : `Rascunho série ${emission.series}`
      }
      subtitle={emission.destName}
      icon="receipt_long"
      badge={<Badge tone={badge.tone}>{badge.label}</Badge>}
    >
      <div className="space-y-5 text-sm">
        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Análise SEFAZ
          </h3>
          <div
            className={`rounded-lg border p-3 ${
              analysis.severity === 'danger'
                ? 'border-red-200 bg-red-50 dark:border-red-900/50 dark:bg-red-950/30'
                : analysis.severity === 'success'
                  ? 'border-green-200 bg-green-50 dark:border-green-900/50 dark:bg-green-950/30'
                  : analysis.severity === 'warning'
                    ? 'border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/30'
                    : 'border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900/40'
            }`}
          >
            <p className="font-semibold text-slate-900 dark:text-white">
              {analysis.code ? `cStat ${analysis.code} — ` : ''}
              {analysis.title}
            </p>
            <p className="mt-1 text-slate-700 dark:text-slate-300">{analysis.summary}</p>
            {analysis.hints.length > 0 && (
              <ul className="mt-2 list-disc space-y-1 pl-5 text-slate-600 dark:text-slate-400">
                {analysis.hints.map((hint) => (
                  <li key={hint}>{hint}</li>
                ))}
              </ul>
            )}
          </div>
          {emission.sefazMotivo && (
            <p className="text-xs text-slate-500">
              Motivo bruto: <span className="font-mono">{emission.sefazMotivo}</span>
            </p>
          )}
        </section>

        <section className="grid gap-3 sm:grid-cols-2">
          <div>
            <p className="text-xs text-slate-500">Destinatário</p>
            <p className="font-medium text-slate-900 dark:text-white">{emission.destName}</p>
            <p className="font-mono text-xs text-slate-500">{formatCnpj(emission.destCnpj)}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Operação</p>
            <p className="font-medium text-slate-900 dark:text-white">
              CFOP {emission.cfop} — {emission.natureza}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Valor</p>
            <p className="font-medium text-slate-900 dark:text-white">
              {Number.isFinite(total) ? formatAmount(total) : String(emission.totalValue)}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Atualizado</p>
            <p className="font-medium text-slate-900 dark:text-white">
              {formatDateTime(emission.updatedAt)}
            </p>
          </div>
          {emission.accessKey && (
            <div className="sm:col-span-2">
              <p className="text-xs text-slate-500">Chave de acesso</p>
              <p className="break-all font-mono text-xs text-slate-700 dark:text-slate-300">
                {emission.accessKey}
              </p>
            </div>
          )}
          <div className="sm:col-span-2">
            <p className="text-xs text-slate-500">ID interno</p>
            <p className="font-mono text-xs text-slate-500">{emission.id}</p>
          </div>
        </section>
      </div>
    </CardDetailPopupModal>
  );
}
