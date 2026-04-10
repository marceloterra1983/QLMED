'use client';

import type { ContactDetails, ContactOverrideData, AddressDivergence } from './contact-detail-types';
import { EditableField } from './contact-detail-utils';
import { compareAddressFields } from './contact-detail-utils';
import type { CnpjData } from '@/lib/cnpj-utils';

interface AddressSectionProps {
  contact: ContactDetails;
  contactOverride: ContactOverrideData | null;
  cnpjData: CnpjData | null;
  isEditing: boolean;
  editDraft: Record<string, string>;
  savingOverride: boolean;
  accentColor: string; // e.g. 'orange' or 'indigo'
  onToggleEdit: () => void;
  onEditField: (field: string, value: string) => void;
  onSave: () => void;
  onCancelEdit: () => void;
  getField: (xmlValue: string | null, overrideField: keyof ContactOverrideData) => string | null;
}

export default function AddressSection({
  contact,
  contactOverride,
  cnpjData,
  isEditing,
  editDraft,
  savingOverride,
  accentColor,
  onToggleEdit,
  onEditField,
  onSave,
  onCancelEdit,
  getField,
}: AddressSectionProps) {
  const colorClasses: Record<string, { editBtn: string; saveBtn: string; ring: string }> = {
    orange: {
      editBtn: 'text-orange-500 hover:text-orange-600',
      saveBtn: 'bg-orange-500 hover:bg-orange-600',
      ring: 'focus:ring-orange-500/40 focus:border-orange-500',
    },
    indigo: {
      editBtn: 'text-indigo-500 hover:text-indigo-600',
      saveBtn: 'bg-indigo-500 hover:bg-indigo-600',
      ring: 'focus:ring-indigo-500/40 focus:border-indigo-500',
    },
  };
  const colors = colorClasses[accentColor] || colorClasses.orange;

  return (
    <div className="rounded-lg ring-1 ring-slate-200/60 dark:ring-slate-800/60 p-2.5 bg-slate-50/50 dark:bg-slate-900/20">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <span className="material-symbols-outlined text-[13px] text-slate-400">location_on</span>
          <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Endereço & Contato</p>
        </div>
        <button
          onClick={onToggleEdit}
          className={`flex items-center gap-1 text-[10px] font-medium ${colors.editBtn} transition-colors`}
        >
          <span className="material-symbols-outlined text-[13px]">{isEditing ? 'close' : 'edit'}</span>
          {isEditing ? 'Cancelar' : 'Editar'}
        </button>
      </div>
      {isEditing ? (
        <div className="space-y-2">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-x-3 gap-y-2">
            <div className="col-span-2">
              <EditableField label="Logradouro" value={getField(contact.address.street, 'street')} field="street" draft={editDraft} onChange={onEditField} />
            </div>
            <EditableField label="N." value={getField(contact.address.number, 'number')} field="number" draft={editDraft} onChange={onEditField} />
            <EditableField label="Compl." value={getField(contact.address.complement, 'complement')} field="complement" draft={editDraft} onChange={onEditField} />
            <EditableField label="Bairro" value={getField(contact.address.district, 'district')} field="district" draft={editDraft} onChange={onEditField} />
            <EditableField label="Cidade" value={getField(contact.address.city, 'city')} field="city" draft={editDraft} onChange={onEditField} />
            <EditableField label="UF" value={getField(contact.address.state, 'state')} field="state" draft={editDraft} onChange={onEditField} />
            <EditableField label="CEP" value={getField(contact.address.zipCode, 'zipCode')} field="zipCode" draft={editDraft} onChange={onEditField} />
          </div>
          <div className="grid grid-cols-2 gap-x-3 pt-1 border-t border-slate-200/40 dark:border-slate-800/30">
            <EditableField label="Telefone" value={getField(contact.phone, 'phone')} field="phone" draft={editDraft} onChange={onEditField} />
            <EditableField label="E-mail" value={getField(contact.email, 'email')} field="email" draft={editDraft} onChange={onEditField} />
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-slate-600 dark:text-slate-400">
          <span>
            <span className="material-symbols-outlined text-[12px] align-middle mr-0.5">location_on</span>
            {[
              getField(contact.address.street, 'street'),
              getField(contact.address.number, 'number') ? `n. ${getField(contact.address.number, 'number')}` : null,
              getField(contact.address.complement, 'complement'),
            ].filter(Boolean).join(', ') || '-'}
            {' — '}
            {[
              getField(contact.address.district, 'district'),
              getField(contact.address.city, 'city'),
              getField(contact.address.state, 'state'),
            ].filter(Boolean).join(', ')}
            {getField(contact.address.zipCode, 'zipCode') && (
              <span className="text-slate-400"> · CEP {getField(contact.address.zipCode, 'zipCode')}</span>
            )}
          </span>
          {getField(contact.phone, 'phone') && <span><span className="material-symbols-outlined text-[12px] align-middle mr-0.5">phone</span>{getField(contact.phone, 'phone')}</span>}
          {getField(contact.email, 'email') && <span><span className="material-symbols-outlined text-[12px] align-middle mr-0.5">mail</span>{getField(contact.email, 'email')}</span>}
        </div>
      )}
      {(() => {
        if (!cnpjData?.endereco) return null;
        const divs = compareAddressFields(contact.address, cnpjData.endereco);
        if (divs.length === 0) return null;
        return (
          <details className="mt-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40 p-2">
            <summary className="flex items-center gap-1.5 cursor-pointer text-amber-700 dark:text-amber-400 text-[10px] font-bold">
              <span className="material-symbols-outlined text-[13px]">warning</span>
              Diverge da Receita ({divs.length})
            </summary>
            <div className="mt-1.5 space-y-1">
              {divs.map((d) => (
                <div key={d.field} className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[10px]">
                  <span className="font-bold text-slate-500">{d.label}</span>
                  <span className="text-slate-600 dark:text-slate-400">{d.xmlValue}</span>
                  <span className="text-amber-700 dark:text-amber-400">{d.apiValue}</span>
                </div>
              ))}
            </div>
          </details>
        );
      })()}
      {/* Save/Cancel inline */}
      {isEditing && (
        <div className="flex items-center justify-end gap-2 mt-2 pt-2 border-t border-slate-200/60 dark:border-slate-800/40">
          <button
            onClick={onCancelEdit}
            className="px-2.5 py-1 text-[11px] font-medium text-slate-500 hover:text-slate-700 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={onSave}
            disabled={savingOverride}
            className={`flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold ${colors.saveBtn} text-white rounded-lg transition-colors disabled:opacity-40 shadow-sm`}
          >
            {savingOverride && <span className="material-symbols-outlined text-[12px] animate-spin">sync</span>}
            {savingOverride ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      )}
    </div>
  );
}
