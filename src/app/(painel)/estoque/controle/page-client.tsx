'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import PageHeader from '@/components/PageHeader';
import Button from '@/components/ui/Button';
import Field from '@/components/ui/Field';
import Spinner from '@/components/ui/Spinner';
import Modal from '@/components/ui/Modal';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import CardViewModeToggle, { type CardViewMode } from '@/components/ui/CardViewModeToggle';
import { useRole } from '@/hooks/useRole';
import { FILTER_INPUT_CLS } from '@/lib/utils';
import { filterStockProducts, type StockCatalogProduct } from '@/lib/stock-catalog';
import type { ValidityBand } from '@/lib/stock-ledger';
import StockProductTreeTable, {
  collapseAllStock,
  expandAllStock,
} from './components/StockProductTreeTable';
import ProductStockDetailModal, { StockLotsKardex } from './components/ProductStockDetailModal';

export default function ControleEstoquePage() {
  const { canWrite } = useRole();
  const [q, setQ] = useState('');
  const [locationType, setLocationType] = useState<'ALL' | 'CD' | 'CUSTOMER'>('ALL');
  const [validity, setValidity] = useState<'ALL' | ValidityBand>('ALL');
  const [products, setProducts] = useState<StockCatalogProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<CardViewMode>('popup');
  const [selected, setSelected] = useState<StockCatalogProduct | null>(null);
  const [ajusteOpen, setAjusteOpen] = useState(false);
  const [backfilling, setBackfilling] = useState(false);
  const [backfillConfirmOpen, setBackfillConfirmOpen] = useState(false);
  const [form, setForm] = useState({
    productCodigo: '',
    lot: '',
    lotExpiry: '',
    quantity: '1',
    kind: 'PERDA_VALIDADE' as 'PERDA_VALIDADE' | 'AJUSTE',
    direction: 'OUT' as 'IN' | 'OUT',
    locationType: 'CD' as 'CD' | 'CUSTOMER',
    locationCnpj: '',
    locationName: '',
    reason: '',
  });

  const loadCatalogo = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/estoque/controle/catalogo?includeZero=true');
      if (!res.ok) throw new Error('falha catalogo');
      const data = await res.json();
      const rows = (data.products ?? []) as StockCatalogProduct[];
      setProducts(rows);
      setCollapsed(expandAllStock(rows));
    } catch {
      toast.error('Não foi possível carregar o catálogo de estoque');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCatalogo();
  }, [loadCatalogo]);

  const visible = useMemo(
    () => filterStockProducts(products, { q, locationType, validity }),
    [products, q, locationType, validity],
  );

  function openProduct(p: StockCatalogProduct) {
    if (viewMode === 'expand') {
      setSelected((cur) => (cur?.productCodigo === p.productCodigo ? null : p));
      return;
    }
    setSelected(p);
  }

  async function submitAjuste() {
    try {
      const res = await fetch('/api/estoque/controle/ajuste', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productCodigo: form.productCodigo.trim(),
          lot: form.lot,
          lotExpiry: form.lotExpiry || null,
          quantity: Number(form.quantity),
          kind: form.kind,
          direction: form.kind === 'PERDA_VALIDADE' ? 'OUT' : form.direction,
          locationType: form.locationType,
          locationCnpj: form.locationCnpj || null,
          locationName: form.locationName || null,
          reason: form.reason.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || 'Falha ao registrar ajuste');
        return;
      }
      toast.success('Movimento registrado');
      setAjusteOpen(false);
      await loadCatalogo();
    } catch {
      toast.error('Erro ao registrar ajuste');
    }
  }

  async function runBackfill() {
    setBackfillConfirmOpen(false);
    setBackfilling(true);
    try {
      const res = await fetch('/api/estoque/controle/backfill', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || 'Falha no backfill');
        return;
      }
      toast.success(`Backfill: ${data.entries ?? 0} entradas, ${data.issued ?? 0} emitidas, ${data.openings ?? 0} aberturas`);
      await loadCatalogo();
    } catch {
      toast.error('Erro no backfill');
    } finally {
      setBackfilling(false);
    }
  }

  return (
    <>
      <PageHeader
        icon="warehouse"
        title="Controle de Estoque"
        subtitle="Catálogo com saldo CD / consignado, lotes e validade"
        actions={
          canWrite ? (
            <div className="flex items-center gap-2 flex-wrap">
              <Button variant="secondary" onClick={() => setAjusteOpen(true)}>
                Perda / Ajuste
              </Button>
              <Button variant="secondary" loading={backfilling} onClick={() => setBackfillConfirmOpen(true)}>
                Backfill
              </Button>
            </div>
          ) : undefined
        }
      />

      <div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-3">
        <Field label="Busca">
          <input
            className={FILTER_INPUT_CLS}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Código, nome, fabricante ou lote"
          />
        </Field>
        <Field label="Local">
          <select className={FILTER_INPUT_CLS} value={locationType} onChange={(e) => setLocationType(e.target.value as typeof locationType)}>
            <option value="ALL">Todos</option>
            <option value="CD">CD</option>
            <option value="CUSTOMER">Consignado</option>
          </select>
        </Field>
        <Field label="Validade">
          <select className={FILTER_INPUT_CLS} value={validity} onChange={(e) => setValidity(e.target.value as typeof validity)}>
            <option value="ALL">Todas</option>
            <option value="vencido">Vencido</option>
            <option value="d30">≤ 30 dias</option>
            <option value="d90">≤ 90 dias</option>
            <option value="ok">OK</option>
            <option value="sem_validade">Sem validade</option>
          </select>
        </Field>
        <div className="flex items-end">
          <CardViewModeToggle mode={viewMode} onChange={setViewMode} />
        </div>
      </div>

      <div className="mt-4">
        {loading ? (
          <div className="flex justify-center py-12"><Spinner label="Carregando estoque" /></div>
        ) : (
          <StockProductTreeTable
            products={visible}
            collapsed={collapsed}
            onToggle={(key) => {
              setCollapsed((prev) => {
                const next = new Set(prev);
                if (next.has(key)) next.delete(key);
                else next.add(key);
                return next;
              });
            }}
            onCollapseAll={() => setCollapsed(collapseAllStock(visible))}
            onExpandAll={() => setCollapsed(expandAllStock(visible))}
            onOpenProduct={openProduct}
            expandedCodigo={viewMode === 'expand' ? selected?.productCodigo : null}
            renderExpanded={(p) => <StockLotsKardex product={p} />}
            emptyHint="Ajuste os filtros ou rode o backfill a partir de 01/01/2021"
          />
        )}
      </div>

      {viewMode === 'popup' && (
        <ProductStockDetailModal
          product={selected}
          isOpen={Boolean(selected)}
          onClose={() => setSelected(null)}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
        />
      )}

      <Modal
        isOpen={ajusteOpen}
        onClose={() => setAjusteOpen(false)}
        title="Perda / Ajuste de estoque"
        width="max-w-lg"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setAjusteOpen(false)}>Cancelar</Button>
            <Button onClick={() => void submitAjuste()}>Registrar</Button>
          </div>
        }
      >
        <div className="space-y-3">
          <Field label="Código do produto">
            <input className={FILTER_INPUT_CLS} value={form.productCodigo} onChange={(e) => setForm({ ...form, productCodigo: e.target.value })} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Lote">
              <input className={FILTER_INPUT_CLS} value={form.lot} onChange={(e) => setForm({ ...form, lot: e.target.value })} />
            </Field>
            <Field label="Validade">
              <input className={FILTER_INPUT_CLS} value={form.lotExpiry} onChange={(e) => setForm({ ...form, lotExpiry: e.target.value })} placeholder="AAAA-MM-DD" />
            </Field>
          </div>
          <Field label="Quantidade">
            <input className={FILTER_INPUT_CLS} type="number" min="0" step="any" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
          </Field>
          <Field label="Tipo">
            <select className={FILTER_INPUT_CLS} value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as typeof form.kind })}>
              <option value="PERDA_VALIDADE">Perda por validade</option>
              <option value="AJUSTE">Ajuste</option>
            </select>
          </Field>
          {form.kind === 'AJUSTE' && (
            <Field label="Direção">
              <select className={FILTER_INPUT_CLS} value={form.direction} onChange={(e) => setForm({ ...form, direction: e.target.value as typeof form.direction })}>
                <option value="OUT">Saída</option>
                <option value="IN">Entrada</option>
              </select>
            </Field>
          )}
          <Field label="Local">
            <select className={FILTER_INPUT_CLS} value={form.locationType} onChange={(e) => setForm({ ...form, locationType: e.target.value as typeof form.locationType })}>
              <option value="CD">CD</option>
              <option value="CUSTOMER">Consignado</option>
            </select>
          </Field>
          {form.locationType === 'CUSTOMER' && (
            <>
              <Field label="CNPJ do cliente">
                <input className={FILTER_INPUT_CLS} value={form.locationCnpj} onChange={(e) => setForm({ ...form, locationCnpj: e.target.value })} />
              </Field>
              <Field label="Nome do cliente">
                <input className={FILTER_INPUT_CLS} value={form.locationName} onChange={(e) => setForm({ ...form, locationName: e.target.value })} />
              </Field>
            </>
          )}
          <Field label="Motivo">
            <input className={FILTER_INPUT_CLS} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
          </Field>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={backfillConfirmOpen}
        onClose={() => setBackfillConfirmOpen(false)}
        onConfirm={() => void runBackfill()}
        title="Recalcular estoque"
        message="Reconstrói entradas e saídas a partir de 01/01/2021 e lança saldo de abertura onde o histórico de compra não cobre a venda. Ajustes manuais são preservados. Pode levar vários minutos."
        confirmLabel="Recalcular"
      />
    </>
  );
}
