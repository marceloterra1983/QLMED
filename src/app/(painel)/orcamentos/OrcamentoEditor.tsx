'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import PageHeader from '@/components/PageHeader';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Field, { FIELD_CONTROL_CLS } from '@/components/ui/Field';
import Section from '@/components/ui/Section';
import Spinner from '@/components/ui/Spinner';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { useRole } from '@/hooks/useRole';
import { createClientRowId, formatCurrency } from '@/lib/utils';
import { moneyText, quoteTotalsOf, todayYmd } from '@/lib/orcamentos/totals';

type ClienteHit = {
  cnpj: string;
  name: string;
  ie: string | null;
  street: string | null;
  number: string | null;
  district: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
};

type ProdutoHit = {
  id: string;
  code: string;
  description: string;
  ncm: string | null;
  unit: string | null;
  rvs: string | null;
  unitPrice: string;
};

type Line = {
  key: string;
  productRegistryId: string | null;
  code: string;
  description: string;
  rvs: string;
  ncm: string;
  unit: string;
  quantity: string;
  unitPrice: string;
  discount: string;
};

type QuotePayload = {
  id?: string;
  numberLabel?: string;
  issuedAt: string;
  status?: 'draft' | 'issued' | 'cancelled';
  customerCnpj: string;
  customerName: string;
  customerIe: string | null;
  customerCode: string | null;
  customerStreet: string | null;
  customerNumber: string | null;
  customerDistrict: string | null;
  customerCity: string | null;
  customerState: string | null;
  customerZip: string | null;
  salesperson: string | null;
  patientName: string | null;
  doctorName: string | null;
  convenio: string | null;
  local: string | null;
  notes: string | null;
  freight: string;
  items: Array<Omit<Line, 'key'> & { id?: string }>;
};

function blankLine(): Line {
  return {
    key: createClientRowId(),
    productRegistryId: null,
    code: '',
    description: '',
    rvs: '',
    ncm: '',
    unit: 'UN',
    quantity: '1',
    unitPrice: '0.00',
    discount: '0.00',
  };
}

function applyCliente(c: ClienteHit): Partial<QuotePayload> {
  return {
    customerCnpj: c.cnpj,
    customerName: c.name,
    customerIe: c.ie,
    customerStreet: c.street,
    customerNumber: c.number,
    customerDistrict: c.district,
    customerCity: c.city,
    customerState: c.state,
    customerZip: c.zip,
  };
}

export default function OrcamentoEditor({ quoteId }: { quoteId?: string }) {
  const router = useRouter();
  const { canWrite } = useRole();
  const [loading, setLoading] = useState(Boolean(quoteId));
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<'draft' | 'issued' | 'cancelled'>('draft');
  const [numberLabel, setNumberLabel] = useState<string | null>(null);
  const [issuedAt, setIssuedAt] = useState(todayYmd());
  const [clienteQ, setClienteQ] = useState('');
  const [clientes, setClientes] = useState<ClienteHit[]>([]);
  const [produtoQ, setProdutoQ] = useState('');
  const [produtos, setProdutos] = useState<ProdutoHit[]>([]);
  const [includeOut, setIncludeOut] = useState(false);
  const [form, setForm] = useState<QuotePayload>({
    issuedAt: todayYmd(),
    customerCnpj: '',
    customerName: '',
    customerIe: null,
    customerCode: null,
    customerStreet: null,
    customerNumber: null,
    customerDistrict: null,
    customerCity: null,
    customerState: null,
    customerZip: null,
    salesperson: null,
    patientName: null,
    doctorName: null,
    convenio: null,
    local: null,
    notes: null,
    freight: '0.00',
    items: [],
  });
  const [lines, setLines] = useState<Line[]>([]);
  const [cancelOpen, setCancelOpen] = useState(false);

  const locked = status === 'cancelled' || !canWrite;

  const loadQuote = useCallback(async () => {
    if (!quoteId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/orcamentos/${quoteId}`);
      if (!res.ok) {
        toast.error('Orçamento não encontrado');
        router.push('/orcamentos');
        return;
      }
      const quote = (await res.json()) as QuotePayload & { numberLabel: string; status: typeof status };
      setStatus(quote.status);
      setNumberLabel(quote.numberLabel);
      setIssuedAt(quote.issuedAt);
      setForm(quote);
      setLines(
        quote.items.map((item) => ({
          key: item.id || createClientRowId(),
          productRegistryId: item.productRegistryId ?? null,
          code: item.code,
          description: item.description,
          rvs: item.rvs || '',
          ncm: item.ncm || '',
          unit: item.unit || 'UN',
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          discount: item.discount,
        })),
      );
    } finally {
      setLoading(false);
    }
  }, [quoteId, router]);

  useEffect(() => {
    void loadQuote();
  }, [loadQuote]);

  useEffect(() => {
    const q = clienteQ.trim();
    if (q.length < 2) {
      setClientes([]);
      return;
    }
    const handle = window.setTimeout(() => {
      void fetch(`/api/orcamentos/clientes?q=${encodeURIComponent(q)}`)
        .then((r) => r.json())
        .then((p: { clientes?: ClienteHit[] }) => setClientes(p.clientes || []))
        .catch(() => setClientes([]));
    }, 250);
    return () => window.clearTimeout(handle);
  }, [clienteQ]);

  useEffect(() => {
    const q = produtoQ.trim();
    const handle = window.setTimeout(() => {
      const params = new URLSearchParams({ lineStatus: includeOut ? 'all' : 'active' });
      if (q) params.set('q', q);
      void fetch(`/api/orcamentos/produtos?${params}`)
        .then((r) => r.json())
        .then((p: { produtos?: ProdutoHit[] }) => setProdutos(p.produtos || []))
        .catch(() => setProdutos([]));
    }, 250);
    return () => window.clearTimeout(handle);
  }, [produtoQ, includeOut]);

  const totals = useMemo(() => {
    try {
      if (lines.length === 0) return { subtotal: '0.00', total: '0.00' };
      const t = quoteTotalsOf(
        lines.map((l) => ({ quantity: l.quantity || '0', unitPrice: l.unitPrice || '0', discount: l.discount || '0' })),
        form.freight || '0',
      );
      return { subtotal: moneyText(t.subtotal), total: moneyText(t.total) };
    } catch {
      return { subtotal: '—', total: '—' };
    }
  }, [lines, form.freight]);

  function body() {
    return {
      issuedAt,
      customerCnpj: form.customerCnpj,
      customerName: form.customerName,
      customerIe: form.customerIe,
      customerCode: form.customerCode,
      customerStreet: form.customerStreet,
      customerNumber: form.customerNumber,
      customerDistrict: form.customerDistrict,
      customerCity: form.customerCity,
      customerState: form.customerState,
      customerZip: form.customerZip,
      salesperson: form.salesperson,
      patientName: form.patientName,
      doctorName: form.doctorName,
      convenio: form.convenio,
      local: form.local,
      notes: form.notes,
      freight: form.freight,
      items: lines.map((line) => ({
        productRegistryId: line.productRegistryId,
        code: line.code,
        description: line.description,
        rvs: line.rvs || null,
        ncm: line.ncm || null,
        unit: line.unit || null,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        discount: line.discount,
      })),
    };
  }

  async function salvar() {
    setSaving(true);
    try {
      const res = await fetch(quoteId ? `/api/orcamentos/${quoteId}` : '/api/orcamentos', {
        method: quoteId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body()),
      });
      const payload = (await res.json()) as { id?: string; error?: string; numberLabel?: string };
      if (!res.ok) {
        toast.error(payload.error || 'Não foi possível salvar');
        return;
      }
      toast.success('Orçamento salvo');
      if (!quoteId && payload.id) router.replace(`/orcamentos/${payload.id}`);
      else if (payload.numberLabel) setNumberLabel(payload.numberLabel);
    } finally {
      setSaving(false);
    }
  }

  async function cancelar() {
    if (!quoteId) return;
    const res = await fetch(`/api/orcamentos/${quoteId}/cancelar`, { method: 'POST' });
    if (!res.ok) {
      toast.error('Não foi possível cancelar');
      return;
    }
    toast.success('Orçamento cancelado');
    setCancelOpen(false);
    await loadQuote();
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        icon="contract"
        title={numberLabel ? `Orçamento ${numberLabel}` : 'Novo orçamento'}
        titleExtra={
          <Badge tone={status === 'cancelled' ? 'danger' : status === 'issued' ? 'success' : 'neutral'}>
            {status === 'cancelled' ? 'Cancelado' : status === 'issued' ? 'Emitido' : 'Rascunho'}
          </Badge>
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <Button href="/orcamentos" variant="secondary">
              Voltar
            </Button>
            {quoteId ? (
              <Button
                variant="secondary"
                icon="picture_as_pdf"
                onClick={() => window.open(`/api/orcamentos/${quoteId}/pdf`, '_blank')}
              >
                Gerar PDF
              </Button>
            ) : null}
            {canWrite && quoteId && status !== 'cancelled' ? (
              <Button variant="danger" onClick={() => setCancelOpen(true)}>
                Cancelar
              </Button>
            ) : null}
            {canWrite && status !== 'cancelled' ? (
              <Button icon="save" loading={saving} onClick={() => void salvar()}>
                Salvar
              </Button>
            ) : null}
          </div>
        }
      />

      <section className="grid gap-4 md:grid-cols-2">
        <Section icon="person" title="Cliente">
          <div className="space-y-3">
          {!locked ? (
            <Field label="Buscar cliente">
              <input
                className={FIELD_CONTROL_CLS}
                value={clienteQ}
                onChange={(e) => setClienteQ(e.target.value)}
                placeholder="Nome ou CNPJ"
              />
            </Field>
          ) : null}
          {clientes.length > 0 && !locked ? (
            <ul className="max-h-40 overflow-auto border border-slate-200 dark:border-slate-700 rounded-lg divide-y divide-slate-100 dark:divide-slate-800">
              {clientes.map((c) => (
                <li key={c.cnpj}>
                  <button
                    type="button"
                    className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-800"
                    onClick={() => {
                      setForm((prev) => ({ ...prev, ...applyCliente(c) }));
                      setClienteQ('');
                      setClientes([]);
                    }}
                  >
                    <span className="font-semibold">{c.name}</span>
                    <span className="block text-xs text-slate-500">{c.cnpj}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <p className="text-sm">
            <span className="font-semibold">{form.customerName || 'Nenhum cliente selecionado'}</span>
            {form.customerCnpj ? (
              <span className="block text-slate-500">{form.customerCnpj}</span>
            ) : null}
            <span className="block text-slate-500 text-xs">
              {[form.customerStreet, form.customerNumber, form.customerDistrict, form.customerCity, form.customerState]
                .filter(Boolean)
                .join(' · ')}
            </span>
          </p>
          <Field label="Data">
            <input
              type="date"
              className={FIELD_CONTROL_CLS}
              value={issuedAt}
              disabled={locked}
              onChange={(e) => setIssuedAt(e.target.value)}
            />
          </Field>
          <Field label="Vendedor">
            <input
              className={FIELD_CONTROL_CLS}
              value={form.salesperson || ''}
              disabled={locked}
              onChange={(e) => setForm((p) => ({ ...p, salesperson: e.target.value }))}
            />
          </Field>
          </div>
        </Section>

        <Section icon="medical_services" title="Paciente e convênio">
          <div className="space-y-3">
          <Field label="Paciente">
            <input className={FIELD_CONTROL_CLS} value={form.patientName || ''} disabled={locked} onChange={(e) => setForm((p) => ({ ...p, patientName: e.target.value }))} />
          </Field>
          <Field label="Médico">
            <input className={FIELD_CONTROL_CLS} value={form.doctorName || ''} disabled={locked} onChange={(e) => setForm((p) => ({ ...p, doctorName: e.target.value }))} />
          </Field>
          <Field label="Convênio">
            <input className={FIELD_CONTROL_CLS} value={form.convenio || ''} disabled={locked} onChange={(e) => setForm((p) => ({ ...p, convenio: e.target.value }))} />
          </Field>
          <Field label="Local">
            <input className={FIELD_CONTROL_CLS} value={form.local || ''} disabled={locked} onChange={(e) => setForm((p) => ({ ...p, local: e.target.value }))} />
          </Field>
          </div>
        </Section>
      </section>

      <Section icon="inventory_2" title="Itens">
        <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-end gap-3">
          <Field label="Adicionar produto" className="flex-1">
            <input
              className={FIELD_CONTROL_CLS}
              value={produtoQ}
              disabled={locked}
              onChange={(e) => setProdutoQ(e.target.value)}
              placeholder="Código, descrição, NCM ou R.V.S."
            />
          </Field>
          <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300 pb-2">
            <input type="checkbox" checked={includeOut} onChange={(e) => setIncludeOut(e.target.checked)} disabled={locked} />
            Incluir fora de linha
          </label>
        </div>
        {produtos.length > 0 && !locked ? (
          <ul className="max-h-48 overflow-auto border border-slate-200 dark:border-slate-700 rounded-lg divide-y divide-slate-100 dark:divide-slate-800">
            {produtos.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-800"
                  onClick={() => {
                    setLines((prev) => [
                      ...prev,
                      {
                        key: createClientRowId(),
                        productRegistryId: p.id,
                        code: p.code,
                        description: p.description,
                        rvs: p.rvs || '',
                        ncm: p.ncm || '',
                        unit: p.unit || 'UN',
                        quantity: '1',
                        unitPrice: p.unitPrice,
                        discount: '0.00',
                      },
                    ]);
                    setProdutoQ('');
                    setProdutos([]);
                  }}
                >
                  <span className="font-semibold">{p.code}</span> {p.description}
                  <span className="block text-xs text-slate-500">
                    {p.ncm || 'sem NCM'} · {formatCurrency(Number(p.unitPrice))}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-slate-500">
                <th className="py-2 pr-2">Código</th>
                <th className="py-2 pr-2">Descrição</th>
                <th className="py-2 pr-2">Qtde</th>
                <th className="py-2 pr-2">Pr. un.</th>
                <th className="py-2 pr-2">Desc.</th>
                <th className="py-2"></th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <tr key={line.key} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="py-2 pr-2 w-28">
                    <input aria-label="Código do item" className={FIELD_CONTROL_CLS} value={line.code} disabled={locked} onChange={(e) => setLines((rows) => rows.map((r) => (r.key === line.key ? { ...r, code: e.target.value } : r)))} />
                  </td>
                  <td className="py-2 pr-2">
                    <input aria-label="Descrição do item" className={FIELD_CONTROL_CLS} value={line.description} disabled={locked} onChange={(e) => setLines((rows) => rows.map((r) => (r.key === line.key ? { ...r, description: e.target.value } : r)))} />
                  </td>
                  <td className="py-2 pr-2 w-24">
                    <input aria-label="Quantidade" className={FIELD_CONTROL_CLS} value={line.quantity} disabled={locked} onChange={(e) => setLines((rows) => rows.map((r) => (r.key === line.key ? { ...r, quantity: e.target.value } : r)))} />
                  </td>
                  <td className="py-2 pr-2 w-28">
                    <input aria-label="Preço unitário" className={FIELD_CONTROL_CLS} value={line.unitPrice} disabled={locked} onChange={(e) => setLines((rows) => rows.map((r) => (r.key === line.key ? { ...r, unitPrice: e.target.value } : r)))} />
                  </td>
                  <td className="py-2 pr-2 w-24">
                    <input aria-label="Desconto" className={FIELD_CONTROL_CLS} value={line.discount} disabled={locked} onChange={(e) => setLines((rows) => rows.map((r) => (r.key === line.key ? { ...r, discount: e.target.value } : r)))} />
                  </td>
                  <td className="py-2">
                    {!locked ? (
                      <button type="button" className="text-slate-500 hover:text-red-600" aria-label="Remover item" onClick={() => setLines((rows) => rows.filter((r) => r.key !== line.key))}>
                        <span className="material-symbols-outlined text-[18px]">delete</span>
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {lines.length === 0 ? <p className="text-sm text-slate-500">Nenhum item. Busque um produto em linha para adicionar.</p> : null}
        {!locked ? (
          <Button variant="ghost" size="sm" icon="add" onClick={() => setLines((rows) => [...rows, blankLine()])}>
            Linha avulsa
          </Button>
        ) : null}

        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 pt-2">
          <Field label="Observação" className="flex-1">
            <textarea className={`${FIELD_CONTROL_CLS} h-20 py-2`} value={form.notes || ''} disabled={locked} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} />
          </Field>
          <div className="sm:w-56 space-y-2">
            <Field label="Frete">
              <input className={FIELD_CONTROL_CLS} value={form.freight} disabled={locked} onChange={(e) => setForm((p) => ({ ...p, freight: e.target.value }))} />
            </Field>
            <p className="text-sm text-slate-500">Subtotal {totals.subtotal === '—' ? '—' : formatCurrency(Number(totals.subtotal))}</p>
            <p className="text-lg font-bold">Total {totals.total === '—' ? '—' : formatCurrency(Number(totals.total))}</p>
          </div>
        </div>
        </div>
      </Section>

      <ConfirmDialog
        isOpen={cancelOpen}
        onClose={() => setCancelOpen(false)}
        onConfirm={() => void cancelar()}
        title="Cancelar orçamento"
        message="O PDF passa a mostrar CANCELADO e o documento não pode mais ser editado."
        confirmLabel="Cancelar orçamento"
        confirmVariant="danger"
      />
    </div>
  );
}
