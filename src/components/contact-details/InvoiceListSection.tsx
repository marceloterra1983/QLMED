'use client';

import { formatDate, formatAmount } from '@/lib/utils';
import Badge from '@/components/ui/Badge';
import EmptyState from '@/components/ui/EmptyState';
import { formatDueDate, getDuplicateStatus, formatInstallmentDisplay } from '@/lib/modal-helpers';
import RowActions from '@/components/ui/RowActions';
import { thCls, tdCls } from './contact-detail-utils';
import type { ContactInvoice, ContactDuplicate } from './contact-detail-types';

// --- Invoice table (purchase or sale) ---

interface InvoiceTableProps {
  invoices: ContactInvoice[];
  installmentsMap: Map<string, { totalInstallments: number; firstDueDate: Date | null }>;
  emptyLabel: string;
  onView: (id: string) => void;
  onDetails: (id: string) => void;
  onDelete: (id: string) => void;
}

export function InvoiceTable({ invoices, installmentsMap, emptyLabel, onView, onDetails, onDelete }: InvoiceTableProps) {
  if (invoices.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 gap-2">
        <span className="material-symbols-outlined text-[36px] text-slate-300 dark:text-slate-600">receipt</span>
        <span className="text-sm text-slate-500 dark:text-slate-400">{emptyLabel}</span>
      </div>
    );
  }

  return (
    <>
      <div className="sm:hidden space-y-1.5">
        {invoices.map((inv) => {
          const s = installmentsMap.get(inv.id);
          const total = s?.totalInstallments || 0;
          const due = s?.firstDueDate ? s.firstDueDate.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '-';
          return (
            <div key={inv.id} className="rounded-lg border border-slate-200 dark:border-slate-800 p-2.5">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-900 dark:text-white">N. {inv.number}</span>
                  <span className="text-xs text-slate-500 dark:text-slate-400">{formatDate(inv.issueDate)}</span>
                </div>
                <span className="text-xs font-bold text-slate-900 dark:text-white">{formatAmount(inv.totalValue)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500 dark:text-slate-400">{total}x — Venc: {due}</span>
                <RowActions invoiceId={inv.id} onView={onView} onDetails={onDetails} onDelete={onDelete} />
              </div>
            </div>
          );
        })}
      </div>
      <div className="hidden sm:block overflow-x-auto max-h-[360px] rounded-xl ring-1 ring-slate-200/50 dark:ring-slate-800/50">
        <table className="w-full text-left border-collapse min-w-[760px]">
          <thead className="sticky top-0 z-10">
            <tr className="bg-slate-50 dark:bg-slate-900/70 border-b border-slate-200 dark:border-slate-800">
              <th className={thCls}>Número</th><th className={thCls}>Emissão</th>
              <th className={`${thCls} text-right`}>Valor</th><th className={`${thCls} text-center`}>Parcelas</th>
              <th className={thCls}>1. Vencimento</th><th className={`${thCls} text-center`}>Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
            {invoices.map((inv) => {
              const s = installmentsMap.get(inv.id);
              const total = s?.totalInstallments || 0;
              const due = s?.firstDueDate ? s.firstDueDate.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '-';
              return (
                <tr key={inv.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30 transition-colors">
                  <td className={`${tdCls} text-xs font-bold tabular-nums text-slate-800 dark:text-white`}>{inv.number}</td>
                  <td className={`${tdCls} text-xs tabular-nums text-slate-600 dark:text-slate-300`}>{formatDate(inv.issueDate)}</td>
                  <td className={`${tdCls} text-right text-xs font-bold font-mono tabular-nums text-slate-900 dark:text-white`}>{formatAmount(inv.totalValue)}</td>
                  <td className={`${tdCls} text-center text-xs font-semibold tabular-nums text-slate-600 dark:text-slate-300`}>{total.toLocaleString('pt-BR')}</td>
                  <td className={`${tdCls} text-xs tabular-nums text-slate-600 dark:text-slate-300`}>{due}</td>
                  <td className={`${tdCls} text-center`}><RowActions invoiceId={inv.id} onView={onView} onDetails={onDetails} onDelete={onDelete} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

// --- Movimentacoes table ---

interface MovimentacoesTableProps {
  invoices: ContactInvoice[];
  onView: (id: string) => void;
  onDetails: (id: string) => void;
  onDelete: (id: string) => void;
}

export function MovimentacoesTable({ invoices, onView, onDetails, onDelete }: MovimentacoesTableProps) {
  if (invoices.length === 0) {
    return (
      <EmptyState icon="swap_horiz" title="Nenhuma movimentação encontrada" />
    );
  }

  return (
    <>
      <div className="sm:hidden space-y-1.5">
        {invoices.map((inv) => (
          <div key={inv.id} className="rounded-lg border border-slate-200 dark:border-slate-800 p-2.5">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-900 dark:text-white">N. {inv.number}</span>
                <span className="px-1.5 py-0.5 rounded text-xs font-bold bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">{inv.cfopTag}</span>
              </div>
              <span className="text-xs font-bold text-slate-900 dark:text-white">{formatAmount(inv.totalValue)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500 dark:text-slate-400">{formatDate(inv.issueDate)}</span>
              <RowActions invoiceId={inv.id} onView={onView} onDetails={onDetails} onDelete={onDelete} />
            </div>
          </div>
        ))}
      </div>
      <div className="hidden sm:block overflow-x-auto max-h-[360px] rounded-xl ring-1 ring-slate-200/50 dark:ring-slate-800/50">
        <table className="w-full text-left border-collapse min-w-[760px]">
          <thead className="sticky top-0 z-10">
            <tr className="bg-slate-50 dark:bg-slate-900/70 border-b border-slate-200 dark:border-slate-800">
              <th className={thCls}>Número</th><th className={thCls}>Emissão</th><th className={thCls}>Tipo</th>
              <th className={`${thCls} text-right`}>Valor</th><th className={`${thCls} text-center`}>Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
            {invoices.map((inv) => (
              <tr key={inv.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30 transition-colors">
                <td className={`${tdCls} text-xs font-bold tabular-nums text-slate-800 dark:text-white`}>{inv.number}</td>
                <td className={`${tdCls} text-xs tabular-nums text-slate-600 dark:text-slate-300`}>{formatDate(inv.issueDate)}</td>
                <td className={tdCls}><span className="px-2 py-0.5 rounded-lg text-xs font-bold bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">{inv.cfopTag}</span></td>
                <td className={`${tdCls} text-right text-xs font-bold font-mono tabular-nums text-slate-900 dark:text-white`}>{formatAmount(inv.totalValue)}</td>
                <td className={`${tdCls} text-center`}><RowActions invoiceId={inv.id} onView={onView} onDetails={onDetails} onDelete={onDelete} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

// --- Duplicatas table ---

interface DuplicatasTableProps {
  duplicates: ContactDuplicate[];
}

export function DuplicatasTable({ duplicates }: DuplicatasTableProps) {
  if (duplicates.length === 0) {
    return (
      <EmptyState icon="money_off" title="Nenhuma duplicata encontrada" />
    );
  }

  return (
    <>
      <div className="sm:hidden space-y-1.5">
        {duplicates.map((dup, index) => {
          const status = getDuplicateStatus(dup.dueDate);
          return (
            <div key={`m-${dup.invoiceId}-${dup.invoiceNumber}-${dup.installmentNumber}-${dup.dueDate || 'sem-data'}-${index}`} className="rounded-lg border border-slate-200 dark:border-slate-800 p-2.5">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-900 dark:text-white">{dup.invoiceNumber}</span>
                  <span className="text-xs font-mono text-slate-500 dark:text-slate-400">{formatInstallmentDisplay(dup.installmentNumber, dup.installmentTotal)}</span>
                </div>
                <Badge tone={status.label === 'Vencido' ? 'danger' : 'success'}>{status.label}</Badge>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500 dark:text-slate-400">Venc: {formatDueDate(dup.dueDate)}</span>
                <span className="font-bold text-slate-900 dark:text-white">{formatAmount(dup.installmentValue)}</span>
              </div>
            </div>
          );
        })}
      </div>
      <div className="hidden sm:block overflow-x-auto max-h-[320px] rounded-xl ring-1 ring-slate-200/50 dark:ring-slate-800/50">
        <table className="w-full text-left border-collapse min-w-[680px]">
          <thead className="sticky top-0 z-10">
            <tr className="bg-slate-50 dark:bg-slate-900/70 border-b border-slate-200 dark:border-slate-800">
              <th className={thCls}>N. Nota</th><th className={thCls}>Parcela</th><th className={thCls}>Vencimento</th>
              <th className={`${thCls} text-right`}>Valor</th><th className={`${thCls} text-center`}>Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
            {duplicates.map((dup, index) => {
              const status = getDuplicateStatus(dup.dueDate);
              return (
                <tr key={`${dup.invoiceId}-${dup.invoiceNumber}-${dup.installmentNumber}-${dup.dueDate || 'sem-data'}-${index}`} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30 transition-colors">
                  <td className={`${tdCls} text-xs font-bold tabular-nums text-slate-800 dark:text-white`}>{dup.invoiceNumber}</td>
                  <td className={`${tdCls} text-xs font-mono text-slate-600 dark:text-slate-300`}>{formatInstallmentDisplay(dup.installmentNumber, dup.installmentTotal)}</td>
                  <td className={`${tdCls} text-xs tabular-nums text-slate-600 dark:text-slate-300`}>{formatDueDate(dup.dueDate)}</td>
                  <td className={`${tdCls} text-right text-xs font-bold tabular-nums text-slate-900 dark:text-white`}>{formatAmount(dup.installmentValue)}</td>
                  <td className={`${tdCls} text-center`}><Badge tone={status.label === 'Vencido' ? 'danger' : 'success'}>{status.label}</Badge></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
