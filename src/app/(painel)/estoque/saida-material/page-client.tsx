'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import PageHeader from '@/components/PageHeader';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Field from '@/components/ui/Field';
import Modal from '@/components/ui/Modal';
import EmptyState from '@/components/ui/EmptyState';
import Spinner from '@/components/ui/Spinner';
import { FILTER_INPUT_CLS } from '@/lib/utils';
import { DEFAULT_IND_PRES, DEFAULT_SERIES, isSemPagamentoCfop } from '@/lib/nfe-emission/issued-defaults';
import { getSaidaOperation } from '@/lib/nfe-emission/operations';
import CardViewModeToggle, { type CardViewMode } from '@/components/ui/CardViewModeToggle';
import {
  mergeCatalogWithBalances,
  type StockCatalogProduct,
} from '@/lib/stock-catalog';
import type { StockBalanceRow } from '@/lib/stock-ledger';
import {
  SAIDA_MATERIAL_TABS,
  clampCartQty,
  defaultCfopForTab,
  lotKey,
  tabRequiresCustomer,
  tabUsesCdStock,
  type BalanceLike,
  type SaidaMaterialTab,
} from '@/lib/saida-material';
import StockProductTreeTable, {
  collapseAllStock,
  expandAllStock,
} from '../controle/components/StockProductTreeTable';
import ProductStockDetailModal from '../controle/components/ProductStockDetailModal';

type Cliente = { cnpj: string; name: string };

type CartLine = {
  key: string;
  productCodigo: string;
  productName: string;
  lot: string;
  lotExpiry: string | null;
  quantity: number;
  available: number;
};

type ProductFiscal = {
  id: string;
  code: string | null;
  description: string;
  ncm: string | null;
  unit: string | null;
  ean: string | null;
  anvisaCode: string | null;
  fiscalCfopSaida: string | null;
  fiscalCest: string | null;
  fiscalSitTributaria: string | null;
  fiscalOrigem: string | null;
  aggLastSalePrice: number | null;
  codigo: string | null;
};


function SaidaLotPicker({
  product,
  cart,
  setQty,
  toggleLot,
}: {
  product: StockCatalogProduct;
  cart: Record<string, CartLine>;
  setQty: (b: BalanceLike, raw: number) => void;
  toggleLot: (b: BalanceLike, checked: boolean) => void;
}) {
  return (
    <ul className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg">
      {product.lots.filter((l) => l.quantity > 0).map((lot) => {
        const key = lotKey(lot.productCodigo, lot.lot, lot.lotExpiry);
        const selected = cart[key];
        return (
          <li key={key} className="px-3 py-2 flex flex-wrap items-center gap-3 text-sm">
            <input
              type="checkbox"
              checked={Boolean(selected)}
              onChange={(e) => toggleLot(lot, e.target.checked)}
              aria-label={`Selecionar lote ${lot.lot || 'sem lote'} de ${product.productName}`}
              className="rounded border-slate-200 dark:border-slate-700"
            />
            <span className="min-w-[7rem]">
              Lote <strong>{lot.lot || '—'}</strong>
            </span>
            <span className="text-slate-500 dark:text-slate-400 text-xs">
              Val. {lot.lotExpiry || 'sem validade'}
            </span>
            <span className="text-xs">Disp. {lot.quantity}</span>
            <input
              type="number"
              min={0}
              max={lot.quantity}
              step="any"
              className={`${FILTER_INPUT_CLS} w-24 ml-auto`}
              value={selected?.quantity ?? ''}
              disabled={!selected}
              onChange={(e) => setQty(lot, Number(e.target.value))}
              aria-label={`Quantidade lote ${lot.lot || 'sem lote'}`}
            />
          </li>
        );
      })}
    </ul>
  );
}

export default function SaidaMaterialPage() {
  const router = useRouter();
  const [tab, setTab] = useState<SaidaMaterialTab>('consignado');
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);
  const [balances, setBalances] = useState<BalanceLike[]>([]);
  const [clienteQuery, setClienteQuery] = useState('');
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [cart, setCart] = useState<Record<string, CartLine>>({});
  const [destOpen, setDestOpen] = useState(false);
  const [checklistPrint, setChecklistPrint] = useState<{
    id: string;
    items: CartLine[];
    tab: SaidaMaterialTab;
    customerName?: string | null;
    customerCnpj?: string | null;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [avulsaMovimento, setAvulsaMovimento] = useState(false);
  const [avulsaClienteDraft, setAvulsaClienteDraft] = useState('');
  const [viewMode, setViewMode] = useState<CardViewMode>('popup');
  const [selected, setSelected] = useState<StockCatalogProduct | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const needsCustomer = tabRequiresCustomer(tab);
  const usesCd = tabUsesCdStock(tab);

  const loadClientes = useCallback(async (search: string) => {
    try {
      const res = await fetch(`/api/estoque/saida-material/clientes?q=${encodeURIComponent(search)}`);
      if (!res.ok) throw new Error('fail');
      const data = await res.json();
      setClientes(data.clientes || []);
    } catch {
      setClientes([]);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => { void loadClientes(clienteQuery); }, 250);
    return () => clearTimeout(t);
  }, [clienteQuery, loadClientes]);

  const loadSaldos = useCallback(async () => {
    if (tab === 'material_usado' && !cliente) {
      setBalances([]);
      return;
    }
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set('q', q.trim());
      if (usesCd) {
        params.set('locationType', 'CD');
      } else {
        params.set('locationType', 'CUSTOMER');
        if (cliente?.cnpj) params.set('locationCnpj', cliente.cnpj);
      }
      const res = await fetch(`/api/estoque/saida-material/saldos?${params}`);
      if (!res.ok) throw new Error('fail');
      const data = await res.json();
      setBalances(data.balances || []);
    } catch {
      toast.error('Não foi possível carregar os saldos');
      setBalances([]);
    } finally {
      setLoading(false);
    }
  }, [tab, q, usesCd, cliente]);

  useEffect(() => {
    void loadSaldos();
  }, [loadSaldos]);

  useEffect(() => {
    setCart({});
    setAvulsaMovimento(false);
    setSelected(null);
    if (tab === 'material_usado') {
      /* keep cliente */
    } else if (!needsCustomer) {
      setCliente(null);
    }
  }, [tab, needsCustomer]);

  const catalogProducts = useMemo(() => {
    const seen = new Set<string>();
    const catalog = [];
    for (const b of balances) {
      if (seen.has(b.productCodigo)) continue;
      seen.add(b.productCodigo);
      catalog.push({
        codigo: b.productCodigo,
        code: null,
        description: b.description || b.productName || b.productCodigo,
        productType: b.productType ?? null,
        productSubtype: b.productSubtype ?? null,
        productSubgroup: b.productSubgroup ?? null,
        manufacturerShortName: b.manufacturer ?? null,
        anvisaManufacturer: null,
        shortName: b.productName,
      });
    }
    return mergeCatalogWithBalances(catalog, balances as StockBalanceRow[], { includeZero: false });
  }, [balances]);

  useEffect(() => {
    setCollapsed(expandAllStock(catalogProducts));
  }, [catalogProducts]);

  const cartLines = useMemo(() => Object.values(cart).filter((l) => l.quantity > 0), [cart]);
  const cartCount = cartLines.length;
  const cartQty = useMemo(() => cartLines.reduce((s, l) => s + l.quantity, 0), [cartLines]);

  function setQty(b: BalanceLike, raw: number) {
    const key = lotKey(b.productCodigo, b.lot, b.lotExpiry);
    const quantity = clampCartQty(raw, b.quantity);
    setCart((prev) => {
      if (quantity <= 0) {
        const next = { ...prev };
        delete next[key];
        return next;
      }
      return {
        ...prev,
        [key]: {
          key,
          productCodigo: b.productCodigo,
          productName: b.productName || b.description || b.productCodigo,
          lot: b.lot,
          lotExpiry: b.lotExpiry,
          quantity,
          available: b.quantity,
        },
      };
    });
  }

  function toggleLot(b: BalanceLike, checked: boolean) {
    setQty(b, checked ? Math.min(1, b.quantity) : 0);
  }

  async function emitNfe() {
    const cfop = defaultCfopForTab(tab);
    if (!cfop) {
      toast.error('Saída Avulsa não emite NF-e por padrão');
      return;
    }
    let dest = cliente;
    if (!dest && tab === 'saida_avulsa') {
      toast.error('Informe o cliente para emitir NF-e');
      return;
    }
    if (!dest) {
      toast.error('Selecione o cliente');
      return;
    }
    const op = getSaidaOperation(cfop);
    if (!op) {
      toast.error(`CFOP ${cfop} fora do catálogo de emissão`);
      return;
    }

    setBusy(true);
    try {
      const codigos = [...new Set(cartLines.map((l) => l.productCodigo))];
      const fiscalBy = new Map<string, ProductFiscal>();
      await Promise.all(
        codigos.map(async (codigo) => {
          const res = await fetch(`/api/nfe-emissions/products?search=${encodeURIComponent(codigo)}`);
          if (!res.ok) return;
          const data = await res.json();
          const products: ProductFiscal[] = data.products || [];
          const hit =
            products.find((p) => p.codigo === codigo || p.code === codigo) || products[0];
          if (hit) fiscalBy.set(codigo, hit);
        }),
      );

      const items = cartLines.map((line) => {
        const p = fiscalBy.get(line.productCodigo);
        const ncm = (p?.ncm || '').replace(/\D/g, '').slice(0, 8);
        if (ncm.length !== 8) {
          throw new Error(`Produto ${line.productCodigo} sem NCM de 8 dígitos no cadastro`);
        }
        return {
          productId: p?.id || line.productCodigo,
          cProd: p?.code || line.productCodigo,
          xProd: (p?.description || line.productName).slice(0, 120),
          ncm,
          cfop,
          uCom: p?.unit || 'UN',
          qCom: String(line.quantity),
          vUnCom: p?.aggLastSalePrice != null ? String(p.aggLastSalePrice) : '0.00',
          vDesc: '0.00',
          ean: p?.ean ?? null,
          cest: p?.fiscalCest ?? null,
          anvisa: p?.anvisaCode ?? null,
          orig: p?.fiscalOrigem ?? '0',
          csosn: p?.fiscalSitTributaria ?? '102',
          lot: line.lot || null,
          lotExpiry: line.lotExpiry,
        };
      });

      const payload = {
        natureza: op.natureza,
        cfop,
        series: DEFAULT_SERIES,
        destCnpj: dest.cnpj,
        destName: dest.name,
        finNFe: '1' as const,
        indFinal: '0' as const,
        indPres: DEFAULT_IND_PRES,
        modFrete: '9' as const,
        pag: {
          indPag: isSemPagamentoCfop(cfop) ? ('0' as const) : ('1' as const),
          tPag: isSemPagamentoCfop(cfop) ? '90' : '01',
          vPag: isSemPagamentoCfop(cfop) ? '0.00' : undefined,
        },
        items,
      };

      const res = await fetch('/api/nfe-emissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Falha ao criar rascunho de NF-e');
      }
      const emissionId = data.emission?.id;
      if (!emissionId) throw new Error('Rascunho sem id');
      setDestOpen(false);
      toast.success('Rascunho de NF-e criado');
      router.push(`/fiscal/issued/nova?emissionId=${encodeURIComponent(emissionId)}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao emitir NF-e');
    } finally {
      setBusy(false);
    }
  }

  async function postChecklist(mode: 'checklist' | 'avulsa_movimento') {
    if (needsCustomer && !cliente) {
      toast.error('Selecione o cliente');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/estoque/saida-material/checklist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tab,
          customerCnpj: cliente?.cnpj ?? null,
          customerName: cliente?.name ?? (avulsaClienteDraft.trim() || null),
          items: cartLines.map((l) => ({
            productCodigo: l.productCodigo,
            productName: l.productName,
            lot: l.lot,
            lotExpiry: l.lotExpiry,
            quantity: l.quantity,
          })),
          mode,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Falha ao gravar checklist');
      setDestOpen(false);
      setChecklistPrint({
        id: data.checklist.id,
        items: cartLines,
        tab,
        customerName: cliente?.name ?? (avulsaClienteDraft.trim() || null),
        customerCnpj: cliente?.cnpj ?? null,
      });
      setCart({});
      toast.success(mode === 'avulsa_movimento' ? 'Saída avulsa registrada' : 'Checklist gravado');
      if (mode === 'avulsa_movimento') void loadSaldos();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro no checklist');
    } finally {
      setBusy(false);
    }
  }

  function onContinuar() {
    if (cartCount === 0) {
      toast.error('Selecione ao menos um item');
      return;
    }
    if (needsCustomer && !cliente) {
      toast.error('Selecione o cliente antes de continuar');
      return;
    }
    setDestOpen(true);
  }

  const showStock = tab !== 'material_usado' || Boolean(cliente);

  return (
    <div className="space-y-4 pb-28">
      <PageHeader
        icon="logout"
        title="Saída Material"
        subtitle="Consignado, avulsa, venda direta e material usado no cliente"
      />

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Tipo de saída">
        {SAIDA_MATERIAL_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`px-3 py-1.5 rounded-lg text-sm font-semibold border transition-colors ${
              tab === t.id
                ? 'bg-primary text-white border-primary'
                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {(needsCustomer || tab === 'saida_avulsa') && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/40 p-3 space-y-2">
          <Field label={needsCustomer ? 'Cliente (obrigatório)' : 'Cliente (opcional)'}>
            <input
              className={FILTER_INPUT_CLS}
              placeholder="Buscar por nome ou CNPJ"
              value={cliente ? `${cliente.name} — ${cliente.cnpj}` : clienteQuery}
              onChange={(e) => {
                setCliente(null);
                setClienteQuery(e.target.value);
              }}
              aria-label="Buscar cliente"
            />
          </Field>
          {!cliente && clientes.length > 0 && (
            <ul className="max-h-40 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 rounded-lg border border-slate-100 dark:border-slate-800">
              {clientes.map((c) => (
                <li key={c.cnpj}>
                  <button
                    type="button"
                    className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-800/60"
                    onClick={() => {
                      setCliente(c);
                      setClienteQuery('');
                    }}
                  >
                    <span className="font-medium text-slate-900 dark:text-white">{c.name}</span>
                    <span className="ml-2 text-xs text-slate-500">{c.cnpj}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {cliente && (
            <div className="flex items-center gap-2">
              <Badge>{cliente.cnpj}</Badge>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => {
                  setCliente(null);
                  setClienteQuery('');
                }}
              >
                Trocar
              </Button>
            </div>
          )}
        </div>
      )}

      {showStock && (
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[16rem]">
            <Field label="Buscar produto / lote">
              <input
                className={FILTER_INPUT_CLS}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Código, descrição ou lote"
                aria-label="Filtrar produtos"
              />
            </Field>
          </div>
          <CardViewModeToggle mode={viewMode} onChange={setViewMode} />
        </div>
      )}

      {!showStock && (
        <EmptyState icon="person_search" title="Selecione o cliente" hint="O material usado lista saldos consignados daquele CNPJ." />
      )}

      {showStock && loading && (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      )}

      {showStock && !loading && (
        <StockProductTreeTable
          products={catalogProducts}
          collapsed={collapsed}
          onToggle={(key) => {
            setCollapsed((prev) => {
              const next = new Set(prev);
              if (next.has(key)) next.delete(key);
              else next.add(key);
              return next;
            });
          }}
          onCollapseAll={() => setCollapsed(collapseAllStock(catalogProducts))}
          onExpandAll={() => setCollapsed(expandAllStock(catalogProducts))}
          onOpenProduct={(p) => {
            if (viewMode === 'expand') {
              setSelected((cur) => (cur?.productCodigo === p.productCodigo ? null : p));
              return;
            }
            setSelected(p);
          }}
          expandedCodigo={viewMode === 'expand' ? selected?.productCodigo : null}
          renderExpanded={(p) => <SaidaLotPicker product={p} cart={cart} setQty={setQty} toggleLot={toggleLot} />}
          emptyHint="Ajuste o filtro ou confira o Controle de estoque."
        />
      )}

      {viewMode === 'popup' && selected && (
        <ProductStockDetailModal
          product={selected}
          isOpen
          onClose={() => setSelected(null)}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          lotActions={(p) => <SaidaLotPicker product={p} cart={cart} setQty={setQty} toggleLot={toggleLot} />}
        />
      )}

      {cartCount > 0 && (
        <div className="fixed bottom-0 inset-x-0 z-30 border-t border-slate-200 dark:border-slate-700 bg-background-light/95 dark:bg-background-dark/95 backdrop-blur px-4 py-3">
          <div className="max-w-5xl mx-auto flex flex-wrap items-center gap-3 justify-between">
            <div className="text-sm text-slate-700 dark:text-slate-200">
              <strong>{cartCount}</strong> {cartCount === 1 ? 'item' : 'itens'} · qty total{' '}
              <strong>{Math.round(cartQty * 1000) / 1000}</strong>
            </div>
            <Button type="button" onClick={onContinuar}>
              Continuar
            </Button>
          </div>
        </div>
      )}

      <Modal
        isOpen={destOpen}
        onClose={() => !busy && setDestOpen(false)}
        title="Destino da saída"
        subtitle="Escolha emitir NF-e ou gerar o check list"
        width="max-w-lg"
        footer={
          <div className="flex flex-wrap gap-2 justify-end w-full">
            <Button type="button" variant="secondary" disabled={busy} onClick={() => setDestOpen(false)}>
              Cancelar
            </Button>
            {tab !== 'saida_avulsa' && (
              <Button type="button" disabled={busy} onClick={() => void emitNfe()}>
                Emitir NF-e
              </Button>
            )}
            <Button
              type="button"
              variant={tab === 'saida_avulsa' ? 'primary' : 'secondary'}
              disabled={busy}
              onClick={() =>
                void postChecklist(tab === 'saida_avulsa' && avulsaMovimento ? 'avulsa_movimento' : 'checklist')
              }
            >
              Check List de Saída
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            {cartCount} {cartCount === 1 ? 'item' : 'itens'} · qty {Math.round(cartQty * 1000) / 1000}
            {cliente ? ` · ${cliente.name}` : ''}
          </p>
          <ul className="max-h-48 overflow-y-auto text-sm divide-y divide-slate-100 dark:divide-slate-800 border border-slate-100 dark:border-slate-800 rounded-lg">
            {cartLines.map((l) => (
              <li key={l.key} className="px-3 py-2 flex justify-between gap-2">
                <span>
                  {l.productName} · lote {l.lot || '—'}
                </span>
                <span className="font-semibold">{l.quantity}</span>
              </li>
            ))}
          </ul>
          {tab === 'saida_avulsa' && (
            <label className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-200">
              <input
                type="checkbox"
                className="mt-1"
                checked={avulsaMovimento}
                onChange={(e) => setAvulsaMovimento(e.target.checked)}
              />
              <span>
                Registrar saída no estoque (movimento <code className="text-xs">SAIDA_AVULSA</code> OUT do CD)
              </span>
            </label>
          )}
          {tab === 'saida_avulsa' && !cliente && (
            <Field label="Cliente no checklist (opcional)">
              <input
                className={FILTER_INPUT_CLS}
                value={avulsaClienteDraft}
                onChange={(e) => setAvulsaClienteDraft(e.target.value)}
                placeholder="Nome livre"
              />
            </Field>
          )}
          {tab === 'saida_avulsa' && (
            <p className="text-xs text-slate-500">Emitir NF-e não está disponível nesta aba (use checklist).</p>
          )}
        </div>
      </Modal>

      <Modal
        isOpen={Boolean(checklistPrint)}
        onClose={() => setChecklistPrint(null)}
        title="Check List de Saída"
        subtitle={checklistPrint ? `Ref. ${checklistPrint.id}` : undefined}
        width="max-w-2xl"
        footer={
          <div className="flex gap-2 justify-end w-full">
            <Button type="button" variant="secondary" onClick={() => setChecklistPrint(null)}>
              Fechar
            </Button>
            <Button type="button" onClick={() => window.print()}>
              Imprimir
            </Button>
          </div>
        }
      >
        {checklistPrint && (
          <div className="print:text-black space-y-3" id="saida-material-checklist-print">
            <style>{`@media print { body * { visibility: hidden; } #saida-material-checklist-print, #saida-material-checklist-print * { visibility: visible; } #saida-material-checklist-print { position: absolute; left: 0; top: 0; width: 100%; } }`}</style>
            <p className="text-sm">
              Aba: <strong>{SAIDA_MATERIAL_TABS.find((t) => t.id === checklistPrint.tab)?.label}</strong>
              {checklistPrint.customerName ? (
                <>
                  {' '}
                  · Cliente: <strong>{checklistPrint.customerName}</strong>
                  {checklistPrint.customerCnpj ? ` (${checklistPrint.customerCnpj})` : ''}
                </>
              ) : null}
            </p>
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-slate-300 text-left">
                  <th className="py-1 pr-2">Produto</th>
                  <th className="py-1 pr-2">Código</th>
                  <th className="py-1 pr-2">Lote</th>
                  <th className="py-1 pr-2">Validade</th>
                  <th className="py-1 text-right">Qtd</th>
                </tr>
              </thead>
              <tbody>
                {checklistPrint.items.map((l) => (
                  <tr key={l.key} className="border-b border-slate-100">
                    <td className="py-1 pr-2">{l.productName}</td>
                    <td className="py-1 pr-2">{l.productCodigo}</td>
                    <td className="py-1 pr-2">{l.lot || '—'}</td>
                    <td className="py-1 pr-2">{l.lotExpiry || '—'}</td>
                    <td className="py-1 text-right">{l.quantity}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Modal>
    </div>
  );
}
