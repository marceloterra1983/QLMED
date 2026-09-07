'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import CardDetailPopupModal from '@/components/ui/CardDetailPopupModal';
import CardViewModeToggle, { type CardViewMode } from '@/components/ui/CardViewModeToggle';
import Spinner from '@/components/ui/Spinner';
import { formatDate } from '@/lib/utils';
import type { StockCatalogProduct } from '@/lib/stock-catalog';
import type { ValidityBand } from '@/lib/stock-ledger';
import type { BadgeTone } from '@/components/ui/Badge';

const VALIDITY_LABEL: Record<ValidityBand, string> = {
  vencido: 'Vencido',
  d30: '≤ 30 dias',
  d90: '≤ 90 dias',
  ok: 'OK',
  sem_validade: 'Sem validade',
};

const VALIDITY_TONE: Record<ValidityBand, BadgeTone> = {
  vencido: 'danger',
  d30: 'warning',
  d90: 'info',
  ok: 'success',
  sem_validade: 'neutral',
};

const KIND_LABEL: Record<string, string> = {
  ENTRADA_NFE: 'Entrada NF-e',
  SAIDA_NFE: 'Saída NF-e',
  REMESSA_CONSIG: 'Remessa consignação',
  RETORNO_CONSIG: 'Retorno consignação',
  PERDA_VALIDADE: 'Perda validade',
  AJUSTE: 'Ajuste',
  SAIDA_AVULSA: 'Saída avulsa',
};

type MovementRow = {
  id: string;
  lot: string;
  lotExpiry: string | null;
  quantity: number;
  direction: 'IN' | 'OUT';
  locationType: string;
  locationName: string | null;
  kind: string;
  occurredAt: string;
};

type Tab = 'lotes' | 'kardex';

interface ProductStockDetailModalProps {
  product: StockCatalogProduct | null;
  isOpen: boolean;
  onClose: () => void;
  viewMode: CardViewMode;
  onViewModeChange: (mode: CardViewMode) => void;
  lotActions?: (product: StockCatalogProduct) => ReactNode;
}

export function StockLotsKardex({
  product,
  lotActions,
}: {
  product: StockCatalogProduct;
  lotActions?: (product: StockCatalogProduct) => ReactNode;
}) {
  const [tab, setTab] = useState<Tab>('lotes');
  const [movements, setMovements] = useState<MovementRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/estoque/controle/movimentos?productCodigo=${encodeURIComponent(product.productCodigo)}&limit=200`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setMovements(data.movements ?? []);
      })
      .catch(() => {
        if (!cancelled) setMovements([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [product.productCodigo]);

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Button type="button" size="sm" variant={tab === 'lotes' ? 'primary' : 'secondary'} onClick={() => setTab('lotes')}>
          Lotes
        </Button>
        <Button type="button" size="sm" variant={tab === 'kardex' ? 'primary' : 'secondary'} onClick={() => setTab('kardex')}>
          Movimentações
        </Button>
      </div>
      {tab === 'lotes' ? (
        <div className="space-y-2">
          {product.lots.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">Sem lotes neste produto.</p>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg">
              {product.lots.map((lot) => (
                <li
                  key={`${lot.lot}|${lot.lotExpiry}|${lot.locationType}|${lot.locationCnpj}`}
                  className="px-3 py-2 flex flex-wrap items-center gap-3 text-sm"
                >
                  <span className="min-w-[7rem]">Lote <strong>{lot.lot || '—'}</strong></span>
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    Val. {lot.lotExpiry ? formatDate(lot.lotExpiry) : 'sem validade'}
                  </span>
                  <Badge tone={VALIDITY_TONE[lot.validityBand]}>
                    {VALIDITY_LABEL[lot.validityBand]}
                    {lot.daysToExpiry != null ? ` (${lot.daysToExpiry}d)` : ''}
                  </Badge>
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    {lot.locationType === 'CD' ? 'CD' : lot.locationName || lot.locationCnpj || 'Consignado'}
                  </span>
                  <span className="ml-auto font-semibold">{lot.quantity}</span>
                </li>
              ))}
            </ul>
          )}
          {lotActions ? lotActions(product) : null}
        </div>
      ) : loading ? (
        <div className="flex justify-center py-8"><Spinner label="Carregando kardex" /></div>
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg max-h-80 overflow-y-auto">
          {movements.length === 0 ? (
            <li className="px-3 py-4 text-sm text-slate-500 dark:text-slate-400">Sem movimentações.</li>
          ) : (
            movements.map((m) => (
              <li key={m.id} className="px-3 py-2 flex flex-wrap items-center gap-2 text-sm">
                <span className="text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">{formatDate(m.occurredAt)}</span>
                <span>{KIND_LABEL[m.kind] || m.kind}</span>
                <span className={m.direction === 'IN' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}>
                  {m.direction} {m.quantity}
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400">lote {m.lot || '—'}</span>
                <span className="ml-auto text-xs text-slate-500 dark:text-slate-400">
                  {m.locationType === 'CD' ? 'CD' : m.locationName || 'Consignado'}
                </span>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}

export default function ProductStockDetailModal({
  product,
  isOpen,
  onClose,
  viewMode,
  onViewModeChange,
  lotActions,
}: ProductStockDetailModalProps) {
  if (!product) return null;
  return (
    <CardDetailPopupModal
      isOpen={isOpen}
      onClose={onClose}
      title={product.productName}
      subtitle={`${product.productCodigo}${product.code ? ` · ${product.code}` : ''} · CD ${product.qtyCd} · Consig. ${product.qtyCustomer}`}
      icon="inventory_2"
      badge={<CardViewModeToggle mode={viewMode} onChange={onViewModeChange} />}
      width="sm:max-w-3xl"
    >
      <StockLotsKardex product={product} lotActions={lotActions} />
    </CardDetailPopupModal>
  );
}
