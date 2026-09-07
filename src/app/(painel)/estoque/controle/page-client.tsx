'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import PageHeader from '@/components/PageHeader';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Field from '@/components/ui/Field';
import EmptyState from '@/components/ui/EmptyState';
import Spinner from '@/components/ui/Spinner';
import Modal from '@/components/ui/Modal';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { useRole } from '@/hooks/useRole';
import { FILTER_INPUT_CLS, formatDate } from '@/lib/utils';
import type { BadgeTone } from '@/components/ui/Badge';
import type { ValidityBand } from '@/lib/stock-ledger';

type BalanceRow = {
  productCodigo: string;
  productName: string | null;
  lot: string;
  lotExpiry: string | null;
  locationType: 'CD' | 'CUSTOMER';
  locationCnpj: string | null;
  locationName: string | null;
  quantity: number;
  validityBand: ValidityBand;
  daysToExpiry: number | null;
};

type MovementRow = {
  id: string;
  productCodigo: string;
  productName: string | null;
  lot: string;
  lotExpiry: string | null;
  quantity: number;
  direction: 'IN' | 'OUT';
  locationType: string;
  locationName: string | null;
  kind: string;
  reason: string | null;
  occurredAt: string;
};

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
};

type Tab = 'saldos' | 'movimentos';

export default function ControleEstoquePage() {
  const { canWrite } = useRole();
  const [tab, setTab] = useState<Tab>('saldos');
  const [q, setQ] = useState('');
  const [locationType, setLocationType] = useState<'ALL' | 'CD' | 'CUSTOMER'>('ALL');
  const [validity, setValidity] = useState<'ALL' | ValidityBand>('ALL');
  const [balances, setBalances] = useState<BalanceRow[]>([]);
  const [movements, setMovements] = useState<MovementRow[]>([]);
  const [loading, setLoading] = useState(false);
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

  const loadSaldos = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set('q', q.trim());
      if (locationType !== 'ALL') params.set('locationType', locationType);
      if (validity !== 'ALL') params.set('validity', validity);
      const res = await fetch(`/api/estoque/controle/saldos?${params}`);
      if (!res.ok) throw new Error('falha saldos');
      const data = await res.json();
      setBalances(data.balances ?? []);
    } catch {
      toast.error('Não foi possível carregar os saldos');
    } finally {
      setLoading(false);
    }
  }, [q, locationType, validity]);

  const loadMovimentos = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set('productCodigo', q.trim());
      params.set('limit', '100');
      const res = await fetch(`/api/estoque/controle/movimentos?${params}`);
      if (!res.ok) throw new Error('falha movimentos');
      const data = await res.json();
      setMovements(data.movements ?? []);
    } catch {
      toast.error('Não foi possível carregar os movimentos');
    } finally {
      setLoading(false);
    }
  }, [q]);

  useEffect(() => {
    if (tab === 'saldos') void loadSaldos();
    else void loadMovimentos();
  }, [tab, loadSaldos, loadMovimentos]);

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
      if (tab === 'saldos') await loadSaldos();
      else await loadMovimentos();
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
      toast.success(`Backfill: ${data.entries ?? 0} entradas, ${data.issued ?? 0} emitidas`);
      await loadSaldos();
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
        subtitle="Saldos por lote e localização (CD / consignado)"
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

      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant={tab === 'saldos' ? 'primary' : 'secondary'} size="sm" onClick={() => setTab('saldos')}>
          Saldos
        </Button>
        <Button variant={tab === 'movimentos' ? 'primary' : 'secondary'} size="sm" onClick={() => setTab('movimentos')}>
          Movimentos
        </Button>
      </div>

      <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
        <Field label="Busca">
          <input
            className={FILTER_INPUT_CLS}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Código, nome ou lote"
          />
        </Field>
        {tab === 'saldos' && (
          <>
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
          </>
        )}
      </div>

      <div className="mt-4">
        {loading ? (
          <div className="flex justify-center py-12"><Spinner label="Carregando estoque" /></div>
        ) : tab === 'saldos' ? (
          balances.length === 0 ? (
            <EmptyState icon="warehouse" title="Nenhum saldo encontrado" hint="Ajuste os filtros ou rode o backfill" />
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-900/50 text-left text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Produto</th>
                    <th className="px-3 py-2">Lote</th>
                    <th className="px-3 py-2">Validade</th>
                    <th className="px-3 py-2">Local</th>
                    <th className="px-3 py-2 text-right">Qtd</th>
                    <th className="px-3 py-2">Faixa</th>
                  </tr>
                </thead>
                <tbody>
                  {balances.map((b) => (
                    <tr key={[b.productCodigo, b.lot, b.lotExpiry, b.locationType, b.locationCnpj].join('|')} className="border-t border-slate-100 dark:border-slate-800">
                      <td className="px-3 py-2">
                        <div className="font-medium text-slate-900 dark:text-white">{b.productCodigo}</div>
                        <div className="text-xs text-slate-500 truncate max-w-[240px]">{b.productName}</div>
                      </td>
                      <td className="px-3 py-2">{b.lot || '—'}</td>
                      <td className="px-3 py-2">{b.lotExpiry ? formatDate(b.lotExpiry) : '—'}</td>
                      <td className="px-3 py-2">
                        {b.locationType === 'CD' ? 'CD' : (b.locationName || b.locationCnpj || 'Consignado')}
                      </td>
                      <td className="px-3 py-2 text-right font-semibold">{b.quantity}</td>
                      <td className="px-3 py-2">
                        <Badge tone={VALIDITY_TONE[b.validityBand]}>
                          {VALIDITY_LABEL[b.validityBand]}
                          {b.daysToExpiry != null ? ` (${b.daysToExpiry}d)` : ''}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : movements.length === 0 ? (
          <EmptyState icon="swap_horiz" title="Nenhum movimento" hint="Registre entradas ou use Perda/Ajuste" />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-900/50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Data</th>
                  <th className="px-3 py-2">Produto</th>
                  <th className="px-3 py-2">Lote</th>
                  <th className="px-3 py-2">Tipo</th>
                  <th className="px-3 py-2">Dir.</th>
                  <th className="px-3 py-2 text-right">Qtd</th>
                  <th className="px-3 py-2">Local</th>
                </tr>
              </thead>
              <tbody>
                {movements.map((m) => (
                  <tr key={m.id} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="px-3 py-2 whitespace-nowrap">{formatDate(m.occurredAt)}</td>
                    <td className="px-3 py-2">
                      <div className="font-medium">{m.productCodigo}</div>
                      <div className="text-xs text-slate-500 truncate max-w-[200px]">{m.productName}</div>
                    </td>
                    <td className="px-3 py-2">{m.lot || '—'}</td>
                    <td className="px-3 py-2">{KIND_LABEL[m.kind] || m.kind}</td>
                    <td className="px-3 py-2">{m.direction}</td>
                    <td className="px-3 py-2 text-right font-semibold">{m.quantity}</td>
                    <td className="px-3 py-2">{m.locationType === 'CD' ? 'CD' : (m.locationName || 'Consignado')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

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
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Código do produto" className="sm:col-span-2">
            <input className={FILTER_INPUT_CLS} value={form.productCodigo} onChange={(e) => setForm({ ...form, productCodigo: e.target.value })} />
          </Field>
          <Field label="Lote">
            <input className={FILTER_INPUT_CLS} value={form.lot} onChange={(e) => setForm({ ...form, lot: e.target.value })} />
          </Field>
          <Field label="Validade">
            <input className={FILTER_INPUT_CLS} type="date" value={form.lotExpiry} onChange={(e) => setForm({ ...form, lotExpiry: e.target.value })} />
          </Field>
          <Field label="Quantidade">
            <input className={FILTER_INPUT_CLS} type="number" min="0.001" step="any" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
          </Field>
          <Field label="Tipo">
            <select className={FILTER_INPUT_CLS} value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as typeof form.kind, direction: e.target.value === 'PERDA_VALIDADE' ? 'OUT' : form.direction })}>
              <option value="PERDA_VALIDADE">Perda por validade</option>
              <option value="AJUSTE">Ajuste</option>
            </select>
          </Field>
          {form.kind === 'AJUSTE' && (
            <Field label="Direção">
              <select className={FILTER_INPUT_CLS} value={form.direction} onChange={(e) => setForm({ ...form, direction: e.target.value as 'IN' | 'OUT' })}>
                <option value="OUT">Saída</option>
                <option value="IN">Entrada</option>
              </select>
            </Field>
          )}
          <Field label="Local">
            <select className={FILTER_INPUT_CLS} value={form.locationType} onChange={(e) => setForm({ ...form, locationType: e.target.value as 'CD' | 'CUSTOMER' })}>
              <option value="CD">CD</option>
              <option value="CUSTOMER">Consignado</option>
            </select>
          </Field>
          {form.locationType === 'CUSTOMER' && (
            <>
              <Field label="CNPJ local">
                <input className={FILTER_INPUT_CLS} value={form.locationCnpj} onChange={(e) => setForm({ ...form, locationCnpj: e.target.value })} />
              </Field>
              <Field label="Nome local">
                <input className={FILTER_INPUT_CLS} value={form.locationName} onChange={(e) => setForm({ ...form, locationName: e.target.value })} />
              </Field>
            </>
          )}
          <Field label="Motivo" className="sm:col-span-2">
            <input className={FILTER_INPUT_CLS} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="Obrigatório" />
          </Field>
        </div>
      </Modal>
      <ConfirmDialog
        isOpen={backfillConfirmOpen}
        onClose={() => setBackfillConfirmOpen(false)}
        onConfirm={() => void runBackfill()}
        title="Backfill do ledger"
        message="Reprocessar entradas e NF-e emitidas no ledger? Operação idempotente."
        confirmLabel="Executar backfill"
        confirmVariant="primary"
        loading={backfilling}
      />
    </>
  );
}
