'use client';

import React, { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { useModalBackButton } from '@/hooks/useModalBackButton';
import type { ProductRow } from '../types';
import { BulkFieldRow } from './DetailSectionCard';
import { BULK_INPUT_CLS } from './product-utils';
import type { HierOptions } from './product-utils';

interface BulkEditModalProps {
  selectedKeys: Set<string>;
  products: ProductRow[];
  onClose: () => void;
  onSaved: () => void;
  hierOptions: HierOptions;
}

export default function BulkEditModal({ selectedKeys, products, onClose, onSaved, hierOptions }: BulkEditModalProps) {
  const [bulkFields, setBulkFields] = useState({
    enableType: false, productType: '',
    enableSubtype: false, productSubtype: '',
    enableSubgroup: false, productSubgroup: '',
    enableNcm: false, ncm: '',
    enableAnvisa: false, anvisa: '',
    enableOutOfLine: false, outOfLine: false,
    enableCstIpi: false, cstIpi: '',
    enableCstPis: false, cstPis: '',
    enableCstCofins: false, cstCofins: '',
  });
  const [bulkNewMode, setBulkNewMode] = useState({ type: false, subtype: false, subgroup: false });
  const [isBulkSaving, setIsBulkSaving] = useState(false);

  const enabledCount = [bulkFields.enableType, bulkFields.enableSubtype, bulkFields.enableSubgroup, bulkFields.enableNcm, bulkFields.enableAnvisa, bulkFields.enableOutOfLine, bulkFields.enableCstIpi, bulkFields.enableCstPis, bulkFields.enableCstCofins].filter(Boolean).length;

  const handleClose = useCallback(() => onClose(), [onClose]);
  useModalBackButton(true, handleClose);

  const handleBulkSave = async () => {
    const fields: Record<string, string | null> = {};
    if (bulkFields.enableType) fields.productType = bulkFields.productType || null;
    if (bulkFields.enableSubtype) fields.productSubtype = bulkFields.productSubtype || null;
    if (bulkFields.enableSubgroup) fields.productSubgroup = bulkFields.productSubgroup || null;
    if (bulkFields.enableNcm) fields.ncm = bulkFields.ncm || null;
    if (bulkFields.enableAnvisa) fields.anvisa = bulkFields.anvisa || null;
    if (bulkFields.enableOutOfLine) (fields as Record<string, unknown>).outOfLine = bulkFields.outOfLine;
    if (bulkFields.enableCstIpi) fields.fiscalCstIpi = bulkFields.cstIpi || null;
    if (bulkFields.enableCstPis) fields.fiscalCstPis = bulkFields.cstPis || null;
    if (bulkFields.enableCstCofins) fields.fiscalCstCofins = bulkFields.cstCofins || null;
    if (Object.keys(fields).length === 0) { toast.error('Selecione pelo menos um campo para editar'); return; }

    const selectedProducts = products.filter((p) => selectedKeys.has(p.key));
    if (selectedProducts.length === 0) return;

    setIsBulkSaving(true);
    const toastId = toast.loading(`Atualizando ${selectedProducts.length} produto(s)...`);
    try {
      if (bulkNewMode.type && fields.productType) {
        await fetch('/api/products/rename-type', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'addLine', name: fields.productType }) });
      }
      if (bulkNewMode.subtype && fields.productSubtype) {
        await fetch('/api/products/rename-type', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'addGroup', parentType: fields.productType || bulkFields.productType, subtypeName: fields.productSubtype }) });
      }
      if (bulkNewMode.subgroup && fields.productSubgroup) {
        await fetch('/api/products/rename-type', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'addSubgroup', parentType: fields.productType || bulkFields.productType, parentSubtype: fields.productSubtype || bulkFields.productSubtype, subgroupName: fields.productSubgroup }) });
      }

      const res = await fetch('/api/products/bulk-update', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          products: selectedProducts.map((p) => ({ productKey: p.key, code: p.code, description: p.description, ncm: p.ncm, unit: p.unit, ean: p.ean })),
          fields,
        }),
      });
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err?.error || 'Falha'); }
      const result = await res.json();
      toast.success(`${result.updated} produto(s) atualizados com sucesso`, { id: toastId });
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao atualizar', { id: toastId });
    } finally {
      setIsBulkSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 !mt-0 sm:flex sm:items-center sm:justify-center sm:p-4 sm:bg-black/60 sm:backdrop-blur-sm" onClick={onClose}>
      <div className="absolute inset-0 sm:relative sm:inset-auto bg-slate-50 dark:bg-[#1a1e2e] sm:rounded-2xl w-full sm:max-w-md sm:h-auto sm:max-h-[92vh] flex flex-col overflow-hidden sm:shadow-2xl sm:ring-1 ring-black/5 dark:ring-white/5" onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="px-4 sm:px-6 py-4 bg-white dark:bg-card-dark border-b border-slate-200 dark:border-slate-700 shrink-0 shadow-[0_2px_8px_rgba(0,0,0,0.08)] sm:shadow-none">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 dark:from-primary/30 dark:to-primary/10 flex items-center justify-center ring-1 ring-primary/20 dark:ring-primary/30 shrink-0">
              <span className="material-symbols-outlined text-[22px] text-primary">edit_note</span>
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-[15px] font-bold text-slate-900 dark:text-white leading-tight">Editar em massa</h3>
              <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
                <span className="font-bold text-primary">{selectedKeys.size.toLocaleString('pt-BR')}</span> produto{selectedKeys.size !== 1 ? 's' : ''} selecionado{selectedKeys.size !== 1 ? 's' : ''}
              </p>
            </div>
            <button onClick={onClose} className="flex-shrink-0 p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
              <span className="material-symbols-outlined text-[20px]">close</span>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-2.5">
          <div className="flex items-start gap-2.5 px-3.5 py-2.5 rounded-xl bg-blue-50/80 dark:bg-blue-900/10 ring-1 ring-blue-200/50 dark:ring-blue-800/30">
            <div className="w-6 h-6 rounded-md bg-blue-500/10 ring-1 ring-blue-500/20 flex items-center justify-center shrink-0 mt-0.5">
              <span className="material-symbols-outlined text-[13px] text-blue-500">info</span>
            </div>
            <p className="text-[12px] text-blue-700 dark:text-blue-300 leading-relaxed">Marque os campos que deseja alterar. Campos nao marcados permanecerao inalterados.</p>
          </div>

          <BulkFieldRow checked={bulkFields.enableType} onChange={(v) => setBulkFields((f) => ({ ...f, enableType: v }))} icon="category" label="Linha">
            {bulkNewMode.type ? (
              <div className="flex gap-1.5">
                <input autoFocus type="text" value={bulkFields.productType} onChange={(e) => setBulkFields((f) => ({ ...f, productType: e.target.value }))} placeholder="Nome da nova linha" className={BULK_INPUT_CLS} />
                <button type="button" onClick={() => { setBulkNewMode((m) => ({ ...m, type: false })); setBulkFields((f) => ({ ...f, productType: '' })); }} className="px-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0"><span className="material-symbols-outlined text-[18px]">close</span></button>
              </div>
            ) : (
              <select value={bulkFields.productType} onChange={(e) => { if (e.target.value === '__new__') { setBulkNewMode((m) => ({ ...m, type: true })); setBulkFields((f) => ({ ...f, productType: '' })); } else { setBulkFields((f) => ({ ...f, productType: e.target.value })); } }} className={BULK_INPUT_CLS}>
                <option value="">{'\u2014 Limpar \u2014'}</option>
                {hierOptions.lines.map((t) => <option key={t} value={t}>{t}</option>)}
                <option value="__new__">+ Criar nova linha...</option>
              </select>
            )}
          </BulkFieldRow>

          <BulkFieldRow checked={bulkFields.enableSubtype} onChange={(v) => setBulkFields((f) => ({ ...f, enableSubtype: v }))} icon="folder" label="Grupo">
            {bulkNewMode.subtype ? (
              <div className="flex gap-1.5">
                <input autoFocus type="text" value={bulkFields.productSubtype} onChange={(e) => setBulkFields((f) => ({ ...f, productSubtype: e.target.value }))} placeholder="Nome do novo grupo" className={BULK_INPUT_CLS} />
                <button type="button" onClick={() => { setBulkNewMode((m) => ({ ...m, subtype: false })); setBulkFields((f) => ({ ...f, productSubtype: '' })); }} className="px-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0"><span className="material-symbols-outlined text-[18px]">close</span></button>
              </div>
            ) : (
              <select value={bulkFields.productSubtype} onChange={(e) => { if (e.target.value === '__new__') { setBulkNewMode((m) => ({ ...m, subtype: true })); setBulkFields((f) => ({ ...f, productSubtype: '' })); } else { setBulkFields((f) => ({ ...f, productSubtype: e.target.value })); } }} className={BULK_INPUT_CLS}>
                <option value="">{'\u2014 Limpar \u2014'}</option>
                {bulkFields.productType ? (
                  hierOptions.groupsFor(bulkFields.productType).map((s) => <option key={s} value={s}>{s}</option>)
                ) : (
                  <>
                    {hierOptions.groupsByLine.map((entry) => (
                      <optgroup key={entry.line} label={entry.line}>
                        {entry.groups.map((g) => <option key={g} value={g}>{g}</option>)}
                      </optgroup>
                    ))}
                    {hierOptions.orphanGroups.length > 0 && (
                      <optgroup label="Outros">
                        {hierOptions.orphanGroups.map((g) => <option key={g} value={g}>{g}</option>)}
                      </optgroup>
                    )}
                  </>
                )}
                <option value="__new__">+ Criar novo grupo...</option>
              </select>
            )}
          </BulkFieldRow>

          <BulkFieldRow checked={bulkFields.enableSubgroup} onChange={(v) => setBulkFields((f) => ({ ...f, enableSubgroup: v }))} icon="folder_open" label="Subgrupo">
            {bulkNewMode.subgroup ? (
              <div className="flex gap-1.5">
                <input autoFocus type="text" value={bulkFields.productSubgroup} onChange={(e) => setBulkFields((f) => ({ ...f, productSubgroup: e.target.value }))} placeholder="Nome do novo subgrupo" className={BULK_INPUT_CLS} />
                <button type="button" onClick={() => { setBulkNewMode((m) => ({ ...m, subgroup: false })); setBulkFields((f) => ({ ...f, productSubgroup: '' })); }} className="px-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0"><span className="material-symbols-outlined text-[18px]">close</span></button>
              </div>
            ) : (
              <select value={bulkFields.productSubgroup} onChange={(e) => { if (e.target.value === '__new__') { setBulkNewMode((m) => ({ ...m, subgroup: true })); setBulkFields((f) => ({ ...f, productSubgroup: '' })); } else { setBulkFields((f) => ({ ...f, productSubgroup: e.target.value })); } }} className={BULK_INPUT_CLS}>
                <option value="">{'\u2014 Limpar \u2014'}</option>
                {bulkFields.productType && bulkFields.productSubtype ? (
                  hierOptions.subgroupsFor(bulkFields.productType, bulkFields.productSubtype).map((s) => <option key={s} value={s}>{s}</option>)
                ) : bulkFields.productSubtype ? (
                  hierOptions.subgroupsForGroup(bulkFields.productSubtype).map((s) => <option key={s} value={s}>{s}</option>)
                ) : (
                  <>
                    {hierOptions.subgroupsByGroup.map((entry) => (
                      <optgroup key={entry.group} label={entry.group}>
                        {entry.subgroups.map((s) => <option key={s} value={s}>{s}</option>)}
                      </optgroup>
                    ))}
                    {hierOptions.orphanSubgroups.length > 0 && (
                      <optgroup label="Outros">
                        {hierOptions.orphanSubgroups.map((s) => <option key={s} value={s}>{s}</option>)}
                      </optgroup>
                    )}
                  </>
                )}
                <option value="__new__">+ Criar novo subgrupo...</option>
              </select>
            )}
          </BulkFieldRow>

          <BulkFieldRow checked={bulkFields.enableNcm} onChange={(v) => setBulkFields((f) => ({ ...f, enableNcm: v }))} icon="tag" label="NCM">
            <input type="text" value={bulkFields.ncm} onChange={(e) => setBulkFields((f) => ({ ...f, ncm: e.target.value }))} placeholder="Ex: 90189099" maxLength={8} className={`${BULK_INPUT_CLS} font-mono`} />
          </BulkFieldRow>

          <BulkFieldRow checked={bulkFields.enableAnvisa} onChange={(v) => setBulkFields((f) => ({ ...f, enableAnvisa: v }))} icon="verified" label="ANVISA">
            <input type="text" value={bulkFields.anvisa} onChange={(e) => setBulkFields((f) => ({ ...f, anvisa: e.target.value }))} placeholder="11 digitos \u2014 deixe em branco para limpar" maxLength={13} className={`${BULK_INPUT_CLS} font-mono`} />
          </BulkFieldRow>

          <BulkFieldRow checked={bulkFields.enableOutOfLine} onChange={(v) => setBulkFields((f) => ({ ...f, enableOutOfLine: v }))} icon="toggle_on" label="Status">
            <div className="flex gap-2">
              <button onClick={() => setBulkFields((f) => ({ ...f, outOfLine: false }))} className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all ring-1 ${!bulkFields.outOfLine ? 'bg-emerald-50 dark:bg-emerald-900/20 ring-emerald-300 dark:ring-emerald-700 text-emerald-700 dark:text-emerald-300 shadow-sm shadow-emerald-100 dark:shadow-none' : 'ring-slate-200 dark:ring-slate-700 text-slate-400 dark:text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800'}`}>
                <span className="material-symbols-outlined text-[16px]">check_circle</span>
                Em Linha
              </button>
              <button onClick={() => setBulkFields((f) => ({ ...f, outOfLine: true }))} className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all ring-1 ${bulkFields.outOfLine ? 'bg-red-50 dark:bg-red-900/20 ring-red-300 dark:ring-red-700 text-red-700 dark:text-red-300 shadow-sm shadow-red-100 dark:shadow-none' : 'ring-slate-200 dark:ring-slate-700 text-slate-400 dark:text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800'}`}>
                <span className="material-symbols-outlined text-[16px]">block</span>
                Fora de Linha
              </button>
            </div>
          </BulkFieldRow>

          <BulkFieldRow checked={bulkFields.enableCstIpi} onChange={(v) => setBulkFields((f) => ({ ...f, enableCstIpi: v }))} icon="receipt_long" label="CST IPI">
            <select value={bulkFields.cstIpi} onChange={(e) => setBulkFields((f) => ({ ...f, cstIpi: e.target.value }))} className={`${BULK_INPUT_CLS} font-mono`}>
              <option value="">{'\u2014 Limpar \u2014'}</option>
              <option value="00">00 {'\u2013'} Entrada/Saida trib.</option>
              <option value="01">01 {'\u2013'} Trib. aliq. zero</option>
              <option value="02">02 {'\u2013'} Outras entradas/saidas</option>
              <option value="49">49 {'\u2013'} Outras entradas</option>
              <option value="50">50 {'\u2013'} Saida tributada</option>
              <option value="99">99 {'\u2013'} Outras saidas</option>
            </select>
          </BulkFieldRow>

          <BulkFieldRow checked={bulkFields.enableCstPis} onChange={(v) => setBulkFields((f) => ({ ...f, enableCstPis: v }))} icon="receipt_long" label="CST PIS">
            <select value={bulkFields.cstPis} onChange={(e) => setBulkFields((f) => ({ ...f, cstPis: e.target.value }))} className={`${BULK_INPUT_CLS} font-mono`}>
              <option value="">{'\u2014 Limpar \u2014'}</option>
              <option value="01">01 {'\u2013'} Op. trib. (BC = valor op.)</option>
              <option value="04">04 {'\u2013'} Op. trib. (monoFasica)</option>
              <option value="06">06 {'\u2013'} Op. trib. (aliq. zero)</option>
              <option value="07">07 {'\u2013'} Op. isenta</option>
              <option value="08">08 {'\u2013'} Op. sem incidencia</option>
              <option value="09">09 {'\u2013'} Op. com suspensao</option>
              <option value="49">49 {'\u2013'} Outras saidas</option>
              <option value="99">99 {'\u2013'} Outras operacoes</option>
            </select>
          </BulkFieldRow>

          <BulkFieldRow checked={bulkFields.enableCstCofins} onChange={(v) => setBulkFields((f) => ({ ...f, enableCstCofins: v }))} icon="receipt_long" label="CST COFINS">
            <select value={bulkFields.cstCofins} onChange={(e) => setBulkFields((f) => ({ ...f, cstCofins: e.target.value }))} className={`${BULK_INPUT_CLS} font-mono`}>
              <option value="">{'\u2014 Limpar \u2014'}</option>
              <option value="01">01 {'\u2013'} Op. trib. (BC = valor op.)</option>
              <option value="04">04 {'\u2013'} Op. trib. (monoFasica)</option>
              <option value="06">06 {'\u2013'} Op. trib. (aliq. zero)</option>
              <option value="07">07 {'\u2013'} Op. isenta</option>
              <option value="08">08 {'\u2013'} Op. sem incidencia</option>
              <option value="09">09 {'\u2013'} Op. com suspensao</option>
              <option value="49">49 {'\u2013'} Outras saidas</option>
              <option value="99">99 {'\u2013'} Outras operacoes</option>
            </select>
          </BulkFieldRow>
        </div>

        {/* Footer */}
        <div className="px-4 sm:px-6 py-3.5 border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-card-dark shrink-0 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] sm:shadow-none">
          <div className="flex flex-col gap-2 sm:hidden">
            <button onClick={handleBulkSave} disabled={isBulkSaving || enabledCount === 0} className="flex items-center justify-center gap-2 w-full px-5 py-2.5 bg-gradient-to-r from-primary to-primary-dark hover:from-primary-dark hover:to-primary text-white rounded-xl text-sm font-bold transition-all shadow-sm shadow-primary/25 disabled:opacity-40 disabled:shadow-none">
              {isBulkSaving ? (
                <><span className="material-symbols-outlined text-[16px] animate-spin">progress_activity</span>Salvando...</>
              ) : (
                <><span className="material-symbols-outlined text-[16px]">save</span>Salvar {enabledCount > 0 && <span className="px-1.5 py-0.5 rounded-md bg-white/20 text-[11px] font-bold">{enabledCount}</span>}</>
              )}
            </button>
            <button onClick={onClose} className="w-full px-4 py-2.5 text-sm font-semibold text-primary hover:bg-primary/5 rounded-xl transition-colors">
              <span className="material-symbols-outlined text-[16px] align-middle mr-1">arrow_back</span>Voltar
            </button>
          </div>
          <div className="hidden sm:flex items-center justify-between">
            <button onClick={onClose} className="px-4 py-2.5 text-sm font-medium text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
              Cancelar
            </button>
            <button onClick={handleBulkSave} disabled={isBulkSaving || enabledCount === 0} className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-primary to-primary-dark hover:from-primary-dark hover:to-primary text-white rounded-xl text-sm font-bold transition-all shadow-sm shadow-primary/25 disabled:opacity-40 disabled:shadow-none">
              {isBulkSaving ? (
                <><span className="material-symbols-outlined text-[16px] animate-spin">progress_activity</span>Salvando...</>
              ) : (
                <><span className="material-symbols-outlined text-[16px]">save</span>Salvar {enabledCount > 0 && <span className="px-1.5 py-0.5 rounded-md bg-white/20 text-[11px] font-bold">{enabledCount}</span>}</>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
