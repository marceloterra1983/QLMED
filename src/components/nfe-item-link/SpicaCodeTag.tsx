'use client';

import Button from '@/components/ui/Button';
import type { NfeItemVinculo } from '@/types/invoice-details';

const STRATEGY_LABEL: Record<string, string> = {
  S1: 'cProd = código Spica',
  S2: 'cProd = referência Spica',
  S3: 'EAN',
  S4: 'registro ANVISA',
  S5: 'descrição/referência no texto',
  S6: 'histórico do fornecedor',
  S7: 'descrição contida + NCM',
  MANUAL: 'vínculo manual',
};

/**
 * SPEC-047: tag verde com o código Spica (mesmo estilo da coluna Cod. Spica em
 * ProductTable) ou tag âmbar "Sem vínculo" com ação Relacionar.
 */
export default function SpicaCodeTag({
  vinculo,
  canWrite,
  onRelate,
  busy,
}: {
  vinculo: NfeItemVinculo | null | undefined;
  canWrite: boolean;
  onRelate?: () => void;
  busy?: boolean;
}) {
  if (vinculo === undefined) return null;
  if (vinculo) {
    const how = STRATEGY_LABEL[vinculo.strategy || ''] || vinculo.strategy || '';
    return (
      <span
        title={[vinculo.descricao, vinculo.referencia ? `Ref. ${vinculo.referencia}` : null, how ? `Vínculo: ${how}` : null].filter(Boolean).join(' · ')}
        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-mono font-bold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-800/40 shrink-0"
      >
        <span className="material-symbols-outlined text-[13px]" aria-hidden="true">link</span>
        {vinculo.codigo || vinculo.referencia || '—'}
        {canWrite && onRelate && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onRelate(); }}
            title="Trocar produto vinculado"
            className="ml-0.5 text-emerald-700/70 hover:text-emerald-900 dark:text-emerald-300/70 dark:hover:text-emerald-200"
          >
            <span className="material-symbols-outlined text-[13px]" aria-hidden="true">edit</span>
            <span className="sr-only">Trocar produto vinculado</span>
          </button>
        )}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-bold bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border border-amber-200/60 dark:border-amber-800/40">
        <span className="material-symbols-outlined text-[13px]" aria-hidden="true">link_off</span>
        Sem vínculo
      </span>
      {canWrite && onRelate && (
        <Button type="button" size="xs" variant="soft" icon="add_link" onClick={onRelate} loading={busy}>
          Relacionar
        </Button>
      )}
    </span>
  );
}
