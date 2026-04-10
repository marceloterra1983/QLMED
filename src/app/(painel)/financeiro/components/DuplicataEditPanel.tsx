'use client';

import React from 'react';
import Skeleton from '@/components/ui/Skeleton';
import { formatAmount, formatCnpj, formatDate } from '@/lib/utils';
import {
  type DuplicataEditForm,
  type InvoiceHeader,
  type Duplicata,
  parseCurrencyInput,
  roundMoney,
  toCurrencyInput,
  getNextDupNumero,
  createEditRowId,
  getParcelaLabel,
  getNick,
} from './financeiro-utils';

interface DuplicataEditPanelProps {
  isOpen: boolean;
  onClose: () => void;
  selectedDuplicata: Duplicata | null;
  invoiceHeader: InvoiceHeader | null;
  editingDuplicatas: DuplicataEditForm[];
  loadingDetails: boolean;
  savingDetails: boolean;
  canWrite: boolean;
  nicknames: Map<string, string>;
  /** 'pagar' | 'receber' — determines entity labels */
  direction: 'pagar' | 'receber';
  onUpdateRow: (index: number, field: 'dupVencimento' | 'dupValor' | 'dupDesconto', value: string) => void;
  onNormalizeCurrency: (index: number, field: 'dupValor' | 'dupDesconto') => void;
  onAddInstallment: () => void;
  onRemoveInstallment: (index: number) => void;
  onSave: () => void;
  onOpenInvoice: (invoiceId: string) => void;
}

export default function DuplicataEditPanel({
  isOpen,
  onClose,
  selectedDuplicata,
  invoiceHeader,
  editingDuplicatas,
  loadingDetails,
  savingDetails,
  canWrite,
  nicknames,
  direction,
  onUpdateRow,
  onNormalizeCurrency,
  onAddInstallment,
  onRemoveInstallment,
  onSave,
  onOpenInvoice,
}: DuplicataEditPanelProps) {
  if (!isOpen || (!selectedDuplicata && !invoiceHeader)) return null;

  const entityCnpj = direction === 'pagar'
    ? (invoiceHeader?.emitenteCnpj || selectedDuplicata?.emitenteCnpj)
    : (invoiceHeader?.clienteCnpj || selectedDuplicata?.clienteCnpj);
  const entityName = direction === 'pagar'
    ? (invoiceHeader?.emitenteNome || selectedDuplicata?.emitenteNome)
    : (invoiceHeader?.clienteNome || selectedDuplicata?.clienteNome);

  const parsedEditingValues = editingDuplicatas.map((row) => parseCurrencyInput(row.dupValor));
  const parsedEditingDiscounts = editingDuplicatas.map((row) => parseCurrencyInput(row.dupDesconto));
  const hasInvalidEditingValue = parsedEditingValues.some((value) => !Number.isFinite(value) || value < 0)
    || parsedEditingDiscounts.some((value) => !Number.isFinite(value) || value < 0)
    || parsedEditingValues.some((value, idx) => Number.isFinite(value) && Number.isFinite(parsedEditingDiscounts[idx]) && parsedEditingDiscounts[idx] > value);
  const totalParcelasEdicao = roundMoney(
    parsedEditingValues.reduce((sum, value, idx) => {
      const safeValue = Number.isFinite(value) ? Math.max(0, value) : 0;
      const discount = parsedEditingDiscounts[idx];
      const safeDiscount = Number.isFinite(discount) ? Math.max(0, discount) : 0;
      return sum + Math.max(0, safeValue - safeDiscount);
    }, 0)
  );
  const totalDescontoEdicao = roundMoney(
    parsedEditingDiscounts.reduce((sum, value) => sum + (Number.isFinite(value) ? Math.max(0, value) : 0), 0)
  );
  const totalNotaEdicao = roundMoney(invoiceHeader?.totalValue || selectedDuplicata?.nfValorTotal || 0);
  const diferencaEdicao = roundMoney(totalNotaEdicao - totalParcelasEdicao);
  const parcelasConferem = Math.abs(diferencaEdicao) <= 0.01;
  const totaisValidos = parcelasConferem && !hasInvalidEditingValue;
  const canSaveDetails = !savingDetails && !loadingDetails && editingDuplicatas.length > 0 && totaisValidos;

  const n = getNick(entityCnpj, entityName, nicknames);
  const entityLabel = direction === 'pagar' ? 'Fornecedor' : 'Cliente';

  return (
    <div className="fixed inset-0 z-50 !mt-0 sm:flex sm:items-center sm:justify-center sm:p-4 sm:bg-black/60 sm:backdrop-blur-sm">
      <div className="absolute inset-0 hidden sm:block" onClick={onClose} aria-hidden="true" />
      <div className="absolute inset-0 sm:relative sm:inset-auto bg-slate-50 dark:bg-[#1a1e2e] sm:rounded-2xl w-full sm:max-w-4xl sm:h-auto sm:max-h-[90vh] flex flex-col overflow-hidden sm:shadow-2xl sm:ring-1 ring-black/5 dark:ring-white/5" role="dialog" aria-modal="true">
        {/* Fixed Header */}
        <div className="px-4 sm:px-6 py-4 bg-white dark:bg-card-dark border-b border-slate-200 dark:border-slate-700 shrink-0 shadow-[0_2px_8px_rgba(0,0,0,0.08)] sm:shadow-none">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 dark:from-primary/30 dark:to-primary/10 flex items-center justify-center ring-1 ring-primary/20 dark:ring-primary/30 shrink-0 hidden sm:flex">
                <span className="material-symbols-outlined text-[22px] text-primary">receipt_long</span>
              </div>
              <div className="min-w-0">
                <h3 className="text-[15px] font-bold text-slate-900 dark:text-white leading-tight truncate">
                  Duplicatas — NF-e {invoiceHeader?.number || selectedDuplicata?.nfNumero}
                </h3>
                <span className="text-[11px] text-slate-400 dark:text-slate-500">
                  {n.display}
                </span>
              </div>
            </div>
            <button onClick={onClose} aria-label="Fechar" className="hidden sm:flex p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0" title="Fechar">
              <span className="material-symbols-outlined text-[20px]">close</span>
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          <div className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 bg-white/60 dark:bg-slate-800/40">
                <p className="text-[11px] uppercase tracking-wider text-slate-400">Número da NF-e</p>
                <div className="mt-1 flex items-center gap-2">
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                    {invoiceHeader?.number || selectedDuplicata?.nfNumero}
                  </p>
                  <button
                    onClick={() => onOpenInvoice((invoiceHeader?.id || selectedDuplicata?.invoiceId || ''))}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold text-primary border border-primary/30 hover:bg-primary/10 transition-colors"
                    disabled={!(invoiceHeader?.id || selectedDuplicata?.invoiceId)}
                  >
                    <span className="material-symbols-outlined text-[14px]">open_in_new</span>
                    Ver NF-e
                  </button>
                </div>
              </div>
              <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 bg-white/60 dark:bg-slate-800/40">
                <p className="text-[11px] uppercase tracking-wider text-slate-400">Emissão</p>
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                  {formatDate(invoiceHeader?.issueDate || selectedDuplicata?.nfEmissao || '')}
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 bg-white/60 dark:bg-slate-800/40">
                <p className="text-[11px] uppercase tracking-wider text-slate-400">{entityLabel}</p>
                {n.full ? (
                  <>
                    <p className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate" title={n.full}>{n.display}</p>
                    <p className="text-[10px] text-slate-400 dark:text-slate-500">{n.full}</p>
                  </>
                ) : (
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate" title={n.display}>{n.display}</p>
                )}
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  {formatCnpj(entityCnpj || '')}
                </p>
              </div>
            </div>

            <div className="border-t border-slate-200 dark:border-slate-700 pt-5">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <h4 className="text-sm font-bold text-slate-700 dark:text-slate-200">
                  Parcelas da Nota
                </h4>
                {canWrite && (
                  <button
                    type="button"
                    onClick={onAddInstallment}
                    disabled={loadingDetails || savingDetails}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-lg border border-primary/30 text-primary hover:bg-primary/10 transition-colors disabled:opacity-50"
                  >
                    <span className="material-symbols-outlined text-[16px]">add</span>
                    Adicionar parcela
                  </button>
                )}
              </div>
              {loadingDetails ? (
                <div className="space-y-2">
                  {Array.from({ length: 4 }).map((_, idx) => (
                    <Skeleton key={idx} className="h-12 rounded-lg" />
                  ))}
                </div>
              ) : editingDuplicatas.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Nenhuma parcela encontrada para esta nota.
                </p>
              ) : (
                <>
                {/* Mobile cards for parcelas */}
                <div className="sm:hidden space-y-1.5">
                  {editingDuplicatas.map((row, idx) => (
                    <div key={row.id} className="border border-slate-200 dark:border-slate-700 rounded-lg p-2.5 space-y-1.5 bg-white dark:bg-slate-800/40">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold font-mono text-slate-700 dark:text-slate-200">
                          Parcela {getParcelaLabel(row.dupNumero, idx, editingDuplicatas.length)}
                        </span>
                        {canWrite && (
                          <button
                            type="button"
                            onClick={() => onRemoveInstallment(idx)}
                            disabled={editingDuplicatas.length <= 1 || savingDetails}
                            className="inline-flex items-center justify-center w-7 h-7 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-40 flex-shrink-0"
                            title="Remover parcela"
                          >
                            <span className="material-symbols-outlined text-[16px]">delete</span>
                          </button>
                        )}
                      </div>
                      <div>
                        <label className="text-[10px] uppercase tracking-wider text-slate-400">Vencimento</label>
                        <input
                          type="date"
                          value={row.dupVencimento}
                          onChange={(e) => onUpdateRow(idx, 'dupVencimento', e.target.value)}
                          readOnly={!canWrite}
                          className={`w-full px-2 py-1.5 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white${!canWrite ? ' opacity-60 cursor-not-allowed' : ''}`}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] uppercase tracking-wider text-slate-400">Valor</label>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={row.dupValor}
                            onChange={(e) => onUpdateRow(idx, 'dupValor', e.target.value)}
                            onBlur={() => onNormalizeCurrency(idx, 'dupValor')}
                            placeholder="R$ 0,00"
                            readOnly={!canWrite}
                            className={`w-full px-2 py-1.5 text-sm text-right border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white${!canWrite ? ' opacity-60 cursor-not-allowed' : ''}`}
                          />
                        </div>
                        <div>
                          <label className="text-[10px] uppercase tracking-wider text-slate-400">Desconto</label>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={row.dupDesconto}
                            onChange={(e) => onUpdateRow(idx, 'dupDesconto', e.target.value)}
                            onBlur={() => onNormalizeCurrency(idx, 'dupDesconto')}
                            placeholder="R$ 0,00"
                            readOnly={!canWrite}
                            className={`w-full px-2 py-1.5 text-sm text-right border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white${!canWrite ? ' opacity-60 cursor-not-allowed' : ''}`}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Desktop table for parcelas */}
                <div className="hidden sm:block overflow-x-auto border border-slate-200 dark:border-slate-700 rounded-lg">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700">
                      <tr>
                        <th className="text-left px-3 py-2 font-semibold text-slate-500 dark:text-slate-400">Parcela</th>
                        <th className="text-left px-3 py-2 font-semibold text-slate-500 dark:text-slate-400">Vencimento</th>
                        <th className="text-right px-3 py-2 font-semibold text-slate-500 dark:text-slate-400">Valor</th>
                        <th className="text-right px-3 py-2 font-semibold text-slate-500 dark:text-slate-400">Desconto</th>
                        {canWrite && <th className="text-center px-3 py-2 font-semibold text-slate-500 dark:text-slate-400">Ação</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {editingDuplicatas.map((row, idx) => (
                        <tr key={row.id} className="border-b border-slate-100 dark:border-slate-800 last:border-b-0">
                          <td className="px-3 py-2 font-mono text-slate-700 dark:text-slate-200">
                            {getParcelaLabel(row.dupNumero, idx, editingDuplicatas.length)}
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="date"
                              value={row.dupVencimento}
                              onChange={(e) => onUpdateRow(idx, 'dupVencimento', e.target.value)}
                              readOnly={!canWrite}
                              className={`w-full px-2.5 py-1.5 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white${!canWrite ? ' opacity-60 cursor-not-allowed' : ''}`}
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="text"
                              inputMode="decimal"
                              value={row.dupValor}
                              onChange={(e) => onUpdateRow(idx, 'dupValor', e.target.value)}
                              onBlur={() => onNormalizeCurrency(idx, 'dupValor')}
                              placeholder="R$ 0,00"
                              readOnly={!canWrite}
                              className={`w-full px-2.5 py-1.5 text-sm text-right border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white${!canWrite ? ' opacity-60 cursor-not-allowed' : ''}`}
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="text"
                              inputMode="decimal"
                              value={row.dupDesconto}
                              onChange={(e) => onUpdateRow(idx, 'dupDesconto', e.target.value)}
                              onBlur={() => onNormalizeCurrency(idx, 'dupDesconto')}
                              placeholder="R$ 0,00"
                              readOnly={!canWrite}
                              className={`w-full px-2.5 py-1.5 text-sm text-right border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white${!canWrite ? ' opacity-60 cursor-not-allowed' : ''}`}
                            />
                          </td>
                          {canWrite && (
                          <td className="px-3 py-2 text-center">
                            <button
                              type="button"
                              onClick={() => onRemoveInstallment(idx)}
                              disabled={editingDuplicatas.length <= 1 || savingDetails}
                              className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-slate-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-40"
                              title="Remover parcela"
                            >
                              <span className="material-symbols-outlined text-[18px]">delete</span>
                            </button>
                          </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                </>
              )}
              {!loadingDetails && editingDuplicatas.length > 0 && (
                <div className={`mt-3 rounded-lg border px-3 py-2 text-sm ${
                  totaisValidos
                    ? 'border-emerald-200 bg-emerald-50/60 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300'
                    : 'border-amber-200 bg-amber-50/70 text-amber-700 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300'
                }`}>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs sm:text-sm">
                    <span>Nota: <strong>{formatAmount(totalNotaEdicao)}</strong></span>
                    <span>Parcelas: <strong>{formatAmount(totalParcelasEdicao)}</strong></span>
                    <span>Desconto: <strong>{formatAmount(totalDescontoEdicao)}</strong></span>
                    <span>Diferença: <strong>{formatAmount(Math.abs(diferencaEdicao))}</strong></span>
                  </div>
                  {hasInvalidEditingValue ? (
                    <p className="mt-1 text-xs">
                      Preencha valores e descontos válidos (ex.: R$ 12.542,83) e mantenha desconto menor ou igual ao valor.
                    </p>
                  ) : !parcelasConferem && (
                    <p className="mt-1 text-xs">
                      A soma das parcelas deve ser igual ao valor total da nota para salvar.
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Fixed Footer */}
        <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-card-dark shrink-0 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] sm:shadow-none">
          {/* Mobile */}
          <div className="sm:hidden flex gap-2">
            <button
              onClick={onClose}
              className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl bg-primary text-white font-bold text-base active:bg-primary-dark transition-colors shadow-sm"
            >
              <span className="material-symbols-outlined text-[20px]">arrow_back</span>
              Voltar
            </button>
            {canWrite && (
              <button
                onClick={onSave}
                disabled={!canSaveDetails}
                className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl bg-emerald-600 text-white font-bold text-base active:bg-emerald-700 transition-colors shadow-sm disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <span className="material-symbols-outlined text-[20px]">save</span>
                {savingDetails ? 'Salvando...' : 'Salvar'}
              </button>
            )}
          </div>
          {/* Desktop */}
          <div className="hidden sm:flex items-center justify-end gap-2">
            <button
              onClick={onClose}
              disabled={savingDetails}
              className="px-3 py-2 text-sm font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-60"
            >
              {canWrite ? 'Cancelar' : 'Fechar'}
            </button>
            {canWrite && (
              <button
                onClick={onSave}
                disabled={!canSaveDetails}
                className="px-3 py-2 text-sm font-semibold rounded-lg bg-primary text-white hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {savingDetails ? 'Salvando...' : 'Salvar Alterações'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
