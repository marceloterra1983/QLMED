'use client';

import Field from '@/components/ui/Field';
import { FILTER_INPUT_CLS } from '@/lib/utils';

export type StockLotOption = {
  lot: string;
  lotExpiry: string | null;
  quantity: number;
};

type Props = {
  lot?: string | null;
  lotExpiry?: string | null;
  lots: StockLotOption[];
  loading?: boolean;
  required?: boolean;
  onChange: (patch: { lot?: string | null; lotExpiry?: string | null }) => void;
};

export default function EmissionLotFields({
  lot,
  lotExpiry,
  lots,
  loading,
  required,
  onChange,
}: Props) {
  const selected = lots.find((l) => l.lot === lot && (l.lotExpiry || '') === (lotExpiry || ''));
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2">
      <Field label={required ? 'Lote (obrigatório)' : 'Lote em estoque'}>
        <select
          aria-label="Selecionar lote do estoque"
          value={lot && lots.some((l) => l.lot === lot) ? lot : lot ? '__manual__' : ''}
          onChange={(e) => {
            const value = e.target.value;
            if (!value) {
              onChange({ lot: '', lotExpiry: null });
              return;
            }
            if (value === '__manual__') return;
            const hit = lots.find((l) => l.lot === value);
            onChange({ lot: value, lotExpiry: hit?.lotExpiry ?? lotExpiry ?? null });
          }}
          className={FILTER_INPUT_CLS}
        >
          <option value="">{loading ? 'Carregando lotes…' : 'Selecionar lote'}</option>
          {lots.map((l) => (
            <option key={`${l.lot}|${l.lotExpiry || ''}`} value={l.lot}>
              {l.lot || 'sem lote'} · val. {l.lotExpiry || '—'} · disp. {l.quantity}
            </option>
          ))}
          {lot && !lots.some((l) => l.lot === lot) ? (
            <option value="__manual__">Digitado: {lot}</option>
          ) : null}
        </select>
      </Field>
      <Field label="Lote (editar)">
        <input
          aria-label="Editar número do lote"
          value={lot || ''}
          onChange={(e) => onChange({ lot: e.target.value, lotExpiry })}
          className={FILTER_INPUT_CLS}
          placeholder="Número do lote"
        />
      </Field>
      <Field label="Validade">
        <input
          aria-label="Validade do lote"
          type="date"
          value={lotExpiry || ''}
          onChange={(e) => onChange({ lot, lotExpiry: e.target.value || null })}
          className={FILTER_INPUT_CLS}
        />
      </Field>
      {selected ? (
        <p className="sm:col-span-3 text-xs text-slate-500">Disponível neste lote: {selected.quantity}</p>
      ) : null}
    </div>
  );
}
