'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { FILTER_INPUT_CLS, formatAmount } from '@/lib/utils';
import { useRole } from '@/hooks/useRole';

type Operation = { cfop: string; tag: string; natureza: string; ambito: string };
type Customer = { cnpj: string; name: string };
type Product = {
  id: string;
  code: string | null;
  description: string;
  ncm: string | null;
  unit: string | null;
  ean: string | null;
  anvisaCode: string | null;
  fiscalCfopSaida: string | null;
  fiscalCest: string | null;
  aggLastSalePrice: number | null;
};
type Line = {
  productId: string;
  cProd: string;
  xProd: string;
  ncm: string;
  cfop: string;
  uCom: string;
  qCom: string;
  vUnCom: string;
  anvisa?: string | null;
};

export default function EmitirNfePage() {
  const { canWrite } = useRole();
  const router = useRouter();
  const [operations, setOperations] = useState<Operation[]>([]);
  const [cfop, setCfop] = useState('5102');
  const [series, setSeries] = useState('1');
  const [indFinal, setIndFinal] = useState<'0' | '1'>('1');
  const [indPres, setIndPres] = useState('1');
  const [customerQuery, setCustomerQuery] = useState('');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [dest, setDest] = useState<Customer | null>(null);
  const [productQuery, setProductQuery] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [items, setItems] = useState<Line[]>([]);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [emissionId, setEmissionId] = useState<string | null>(null);
  const [sefazMotivo, setSefazMotivo] = useState<string | null>(null);

  const op = operations.find((o) => o.cfop === cfop);

  useEffect(() => {
    fetch('/api/nfe-emissions/catalog')
      .then((r) => r.json())
      .then((d) => setOperations(d.operations || []))
      .catch(() => toast.error('Não carregou o catálogo de operações'));
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      fetch(`/api/nfe-emissions/customers?search=${encodeURIComponent(customerQuery)}`)
        .then((r) => r.json())
        .then((d) => setCustomers(d.customers || []))
        .catch(() => null);
    }, 250);
    return () => clearTimeout(t);
  }, [customerQuery]);

  useEffect(() => {
    const t = setTimeout(() => {
      if (!productQuery) { setProducts([]); return; }
      fetch(`/api/nfe-emissions/products?search=${encodeURIComponent(productQuery)}`)
        .then((r) => r.json())
        .then((d) => setProducts(d.products || []))
        .catch(() => null);
    }, 250);
    return () => clearTimeout(t);
  }, [productQuery]);

  const total = useMemo(() => {
    return items.reduce((sum, item) => sum + Number(item.qCom || 0) * Number(item.vUnCom || 0), 0);
  }, [items]);

  function addProduct(p: Product) {
    setItems((prev) => [
      ...prev,
      {
        productId: p.id,
        cProd: p.code || p.id,
        xProd: p.description,
        ncm: (p.ncm || '').replace(/\D/g, '').slice(0, 8),
        cfop: p.fiscalCfopSaida || cfop,
        uCom: p.unit || 'UN',
        qCom: '1',
        vUnCom: p.aggLastSalePrice != null ? String(p.aggLastSalePrice) : '0.00',
        anvisa: p.anvisaCode,
      },
    ]);
    setProductQuery('');
    setProducts([]);
  }

  function payload() {
    if (!dest) throw new Error('Selecione um cliente PJ cadastrado');
    if (!op) throw new Error('Selecione a natureza da operação');
    if (items.length === 0) throw new Error('Inclua pelo menos um produto');
    if (items.some((i) => i.ncm.length !== 8)) throw new Error('Todo item precisa de NCM com 8 dígitos');
    return {
      natureza: op.natureza,
      cfop,
      series,
      destCnpj: dest.cnpj,
      destName: dest.name,
      indFinal,
      indPres,
      items: items.map((i) => ({
        productId: i.productId,
        cProd: i.cProd,
        xProd: i.xProd,
        ncm: i.ncm,
        cfop: i.cfop || cfop,
        uCom: i.uCom,
        qCom: i.qCom,
        vUnCom: i.vUnCom,
        anvisa: i.anvisa,
      })),
    };
  }

  async function saveDraft(): Promise<string | null> {
    try {
      setSaving(true);
      const body = payload();
      const url = emissionId ? `/api/nfe-emissions/${emissionId}` : '/api/nfe-emissions';
      const res = await fetch(url, {
        method: emissionId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Não salvou o rascunho');
        return null;
      }
      setEmissionId(data.emission.id);
      toast.success('Rascunho salvo');
      return data.emission.id as string;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao salvar');
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function sendSefaz() {
    if (!window.confirm('Enviar esta NF-e para autorização na SEFAZ?')) return;
    const id = emissionId || await saveDraft();
    if (!id) return;
    try {
      setSending(true);
      setSefazMotivo(null);
      const res = await fetch(`/api/nfe-emissions/${id}/authorize`, { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.status === 'authorized') {
        toast.success('NF-e autorizada pela SEFAZ');
        router.push('/fiscal/issued');
        return;
      }
      const motivo = data.xMotivo || data.error || 'SEFAZ rejeitou ou não autorizou';
      setSefazMotivo(motivo);
      toast.error(motivo);
    } catch {
      toast.error('Falha ao enviar à SEFAZ');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <span className="material-symbols-outlined text-[28px] text-primary">post_add</span>
          <div>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Nova NF-e</h2>
            <p className="text-slate-500 dark:text-slate-400 text-xs font-medium">Emissão manual · envio à SEFAZ</p>
          </div>
        </div>
        <Link href="/fiscal/issued" className="text-sm font-medium text-slate-600 hover:text-primary">Voltar às emitidas</Link>
      </div>

      {sefazMotivo && (
        <div className="px-4 py-3 rounded-xl border border-rose-200 bg-rose-50 text-sm text-rose-900 dark:bg-rose-950/30 dark:border-rose-900 dark:text-rose-100">
          {sefazMotivo}
        </div>
      )}

      <section className="bg-white dark:bg-card-dark border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-4">
        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500">Operação</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <label className="block lg:col-span-2">
            <span className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Natureza / CFOP</span>
            <select value={cfop} onChange={(e) => setCfop(e.target.value)} className={FILTER_INPUT_CLS}>
              {operations.map((o) => (
                <option key={o.cfop} value={o.cfop}>{o.tag} · {o.cfop} · {o.ambito}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Série</span>
            <input value={series} onChange={(e) => setSeries(e.target.value.replace(/\D/g, '').slice(0, 3))} className={FILTER_INPUT_CLS} />
          </label>
          <label className="block">
            <span className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Consumidor final</span>
            <select value={indFinal} onChange={(e) => setIndFinal(e.target.value as '0' | '1')} className={FILTER_INPUT_CLS}>
              <option value="1">Sim</option>
              <option value="0">Não</option>
            </select>
          </label>
          <label className="block">
            <span className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Presença</span>
            <select value={indPres} onChange={(e) => setIndPres(e.target.value)} className={FILTER_INPUT_CLS}>
              <option value="1">Presencial</option>
              <option value="2">Internet</option>
              <option value="3">Teleatendimento</option>
              <option value="9">Outros</option>
              <option value="0">Não se aplica</option>
            </select>
          </label>
        </div>
      </section>

      <section className="bg-white dark:bg-card-dark border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-3">
        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500">Destinatário (cliente PJ)</h3>
        {dest ? (
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-bold text-slate-900 dark:text-white">{dest.name}</div>
              <div className="text-xs text-slate-500">{dest.cnpj}</div>
            </div>
            <button type="button" onClick={() => setDest(null)} className="text-sm text-slate-500 hover:text-rose-600">Trocar</button>
          </div>
        ) : (
          <>
            <input value={customerQuery} onChange={(e) => setCustomerQuery(e.target.value)} placeholder="Buscar cliente por CNPJ" className={FILTER_INPUT_CLS} />
            <ul className="divide-y divide-slate-100 dark:divide-slate-800 max-h-48 overflow-auto">
              {customers.map((c) => (
                <li key={c.cnpj}>
                  <button type="button" onClick={() => setDest(c)} className="w-full text-left py-2 text-sm hover:text-primary">
                    <span className="font-bold">{c.name}</span>
                    <span className="text-slate-500 ml-2">{c.cnpj}</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section className="bg-white dark:bg-card-dark border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-3">
        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500">Itens</h3>
        <input value={productQuery} onChange={(e) => setProductQuery(e.target.value)} placeholder="Buscar produto" className={FILTER_INPUT_CLS} />
        {products.length > 0 && (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800 max-h-40 overflow-auto">
            {products.map((p) => (
              <li key={p.id}>
                <button type="button" onClick={() => addProduct(p)} className="w-full text-left py-2 text-sm hover:text-primary">
                  {p.description} <span className="text-slate-400">{p.code} · {p.ncm}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-slate-500">
                <th className="py-2">Produto</th>
                <th>NCM</th>
                <th>Qtd</th>
                <th>Unitário</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => (
                <tr key={`${item.productId}-${idx}`} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="py-2 pr-2">{item.xProd}</td>
                  <td className="pr-2">{item.ncm}</td>
                  <td className="pr-2">
                    <input value={item.qCom} onChange={(e) => setItems((rows) => rows.map((r, i) => i === idx ? { ...r, qCom: e.target.value } : r))} className={`${FILTER_INPUT_CLS} w-20`} />
                  </td>
                  <td className="pr-2">
                    <input value={item.vUnCom} onChange={(e) => setItems((rows) => rows.map((r, i) => i === idx ? { ...r, vUnCom: e.target.value } : r))} className={`${FILTER_INPUT_CLS} w-28`} />
                  </td>
                  <td>
                    <button type="button" onClick={() => setItems((rows) => rows.filter((_, i) => i !== idx))} className="text-rose-600 text-xs">Remover</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="text-right text-sm font-bold">Total {formatAmount(total)}</div>
      </section>

      <div className="flex flex-wrap gap-3 justify-end">
        {canWrite && (
          <button type="button" disabled={saving} onClick={() => void saveDraft()} className="px-4 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-sm font-medium">
            Salvar rascunho
          </button>
        )}
        {canWrite && (
          <button type="button" disabled={sending} onClick={() => void sendSefaz()} className="px-4 py-2.5 rounded-lg bg-primary text-white text-sm font-bold disabled:opacity-50">
            {sending ? 'Enviando…' : 'Enviar à SEFAZ'}
          </button>
        )}
      </div>
    </div>
  );
}
