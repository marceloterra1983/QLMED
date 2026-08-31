'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { FILTER_INPUT_CLS, formatAmount, formatCnpj } from '@/lib/utils';
import { addMoney, roundMoney, sumMoney } from '@/lib/money';
import { useRole } from '@/hooks/useRole';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import {
  FIN_NFE_OPTIONS,
  IND_PRES_OPTIONS,
  MOD_FRETE_OPTIONS,
  TPAG_OPTIONS,
} from '@/lib/nfe-emission/form-options';
import {
  DEFAULT_IND_PRES,
  DEFAULT_INDPAG_VENDA,
  DEFAULT_MOD_FRETE,
  DEFAULT_SERIES,
  DEFAULT_TPAG_VENDA,
  INF_AD_FISCO_SINIEF,
  INF_CPL_ICMS_CONV_199,
  defaultFinNFe,
  isSemPagamentoCfop,
} from '@/lib/nfe-emission/issued-defaults';

type Tab = 'dados' | 'itens' | 'transporte' | 'pagamento' | 'complementos';
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
  fiscalOrigem: string | null;
  fiscalSitTributaria: string | null;
  fiscalCstPis: string | null;
  fiscalCstCofins: string | null;
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
  vDesc: string;
  ean?: string | null;
  cest?: string | null;
  anvisa?: string | null;
  orig?: string | null;
  csosn?: string | null;
};

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'dados', label: 'Dados', icon: 'badge' },
  { id: 'itens', label: 'Itens', icon: 'inventory_2' },
  { id: 'transporte', label: 'Transporte', icon: 'local_shipping' },
  { id: 'pagamento', label: 'Pagamento', icon: 'payments' },
  { id: 'complementos', label: 'Complementos', icon: 'notes' },
];

function lineNet(item: Line): number {
  return addMoney(roundMoney(Number(item.qCom || 0) * Number(item.vUnCom || 0)), -roundMoney(Number(item.vDesc || 0)));
}

function Field({
  label,
  children,
  className = '',
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
        {label}
      </span>
      {children}
    </label>
  );
}

export default function EmitirNfePage() {
  const { canWrite } = useRole();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('dados');
  const [operations, setOperations] = useState<Operation[]>([]);
  const [ambiente, setAmbiente] = useState<'homologation' | 'production' | null>(null);
  const [certExpired, setCertExpired] = useState(false);
  const [cfop, setCfop] = useState('5102');
  const [series, setSeries] = useState(DEFAULT_SERIES);
  const [finNFe, setFinNFe] = useState<'1' | '2' | '3' | '4'>('1');
  const [indFinal, setIndFinal] = useState<'0' | '1'>('1');
  const [indPres, setIndPres] = useState(DEFAULT_IND_PRES);
  const [customerQuery, setCustomerQuery] = useState('');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [dest, setDest] = useState<Customer | null>(null);
  const [productQuery, setProductQuery] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [items, setItems] = useState<Line[]>([]);
  const [openItem, setOpenItem] = useState<number | null>(null);
  const [modFrete, setModFrete] = useState(DEFAULT_MOD_FRETE);
  const [vFrete, setVFrete] = useState('0.00');
  const [vSeg, setVSeg] = useState('0.00');
  const [vOutro, setVOutro] = useState('0.00');
  const [transpNome, setTranspNome] = useState('');
  const [transpCnpj, setTranspCnpj] = useState('');
  const [transpUf, setTranspUf] = useState('');
  const [qVol, setQVol] = useState('');
  const [esp, setEsp] = useState('');
  const [pesoB, setPesoB] = useState('');
  const [pesoL, setPesoL] = useState('');
  const [indPag, setIndPag] = useState<'0' | '1'>(DEFAULT_INDPAG_VENDA);
  const [tPag, setTPag] = useState(DEFAULT_TPAG_VENDA);
  const [infCpl, setInfCpl] = useState(INF_CPL_ICMS_CONV_199);
  const [infAdFisco, setInfAdFisco] = useState(INF_AD_FISCO_SINIEF);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [confirmSend, setConfirmSend] = useState(false);
  const [emissionId, setEmissionId] = useState<string | null>(null);
  const [sefazMotivo, setSefazMotivo] = useState<string | null>(null);

  const op = operations.find((o) => o.cfop === cfop);

  useEffect(() => {
    setFinNFe(defaultFinNFe(cfop));
    if (isSemPagamentoCfop(cfop)) {
      setTPag('90');
      setIndPag('0');
    } else {
      setTPag(DEFAULT_TPAG_VENDA);
      setIndPag(DEFAULT_INDPAG_VENDA);
    }
  }, [cfop]);

  useEffect(() => {
    fetch('/api/nfe-emissions/catalog')
      .then((r) => r.json())
      .then((d) => {
        setOperations(d.operations || []);
        setAmbiente(d.certificate?.environment || null);
        setCertExpired(Boolean(d.certificate?.expired));
      })
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

  const vProd = useMemo(
    () => sumMoney(items.map((item) => roundMoney(Number(item.qCom || 0) * Number(item.vUnCom || 0)))),
    [items],
  );
  const vDesc = useMemo(() => sumMoney(items.map((item) => roundMoney(Number(item.vDesc || 0)))), [items]);
  const vNf = useMemo(
    () => addMoney(addMoney(addMoney(addMoney(vProd, -vDesc), Number(vFrete || 0)), Number(vSeg || 0)), Number(vOutro || 0)),
    [vProd, vDesc, vFrete, vSeg, vOutro],
  );

  const pendencias = useMemo(() => {
    const list: string[] = [];
    if (!dest) list.push('Selecione o destinatário PJ');
    if (!op) list.push('Selecione a natureza / CFOP');
    if (items.length === 0) list.push('Inclua ao menos um item');
    if (items.some((i) => i.ncm.length !== 8)) list.push('Todo item precisa de NCM com 8 dígitos');
    if (items.some((i) => Number(i.qCom) <= 0 || Number(i.vUnCom) < 0)) list.push('Quantidade e valor unitário inválidos');
    if (modFrete !== '9' && !transpNome.trim()) list.push('Informe a transportadora ou use “sem transporte”');
    if (tPag !== '90' && vNf <= 0) list.push('Pagamento informado exige valor da nota maior que zero');
    if (certExpired) list.push('Certificado A1 vencido');
    if (!ambiente) list.push('Certificado digital não configurado');
    return list;
  }, [dest, op, items, modFrete, transpNome, tPag, vNf, certExpired, ambiente]);

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
        vDesc: '0.00',
        ean: p.ean,
        cest: p.fiscalCest,
        anvisa: p.anvisaCode,
        orig: p.fiscalOrigem,
        csosn: p.fiscalSitTributaria,
      },
    ]);
    setProductQuery('');
    setProducts([]);
    setTab('itens');
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
      finNFe,
      indFinal,
      indPres,
      modFrete,
      vFrete: vFrete || '0.00',
      vSeg: vSeg || '0.00',
      vOutro: vOutro || '0.00',
      transporta: transpNome.trim()
        ? { xNome: transpNome.trim(), cnpj: transpCnpj.replace(/\D/g, '') || undefined, UF: transpUf || undefined }
        : undefined,
      volume: qVol || esp || pesoB
        ? { qVol: qVol || undefined, esp: esp || undefined, pesoB: pesoB || undefined, pesoL: pesoL || undefined }
        : undefined,
      pag: { indPag, tPag, vPag: tPag === '90' ? '0.00' : vNf.toFixed(2) },
      infCpl: infCpl || undefined,
      infAdFisco: infAdFisco || undefined,
      items: items.map((i) => ({
        productId: i.productId,
        cProd: i.cProd,
        xProd: i.xProd,
        ncm: i.ncm,
        cfop: i.cfop || cfop,
        uCom: i.uCom,
        qCom: i.qCom,
        vUnCom: i.vUnCom,
        vDesc: i.vDesc && Number(i.vDesc) > 0 ? i.vDesc : undefined,
        ean: i.ean,
        cest: i.cest,
        anvisa: i.anvisa,
        orig: i.orig,
        csosn: i.csosn,
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
      setConfirmSend(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <Link
            href="/fiscal/issued"
            className="mt-1 inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-primary"
            aria-label="Voltar às emitidas"
          >
            <span className="material-symbols-outlined text-[20px]">arrow_back</span>
          </Link>
          <div>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Emitir NF-e</h2>
            <p className="text-slate-500 dark:text-slate-400 text-xs font-medium mt-0.5">
              Modelo 55 · saída · {op ? `${op.tag} · CFOP ${op.cfop}` : 'escolha a natureza'}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            {emissionId ? 'Rascunho salvo' : 'Rascunho'}
          </span>
          {ambiente === 'production' && (
            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-100 text-amber-900 dark:bg-amber-500/25 dark:text-amber-100">
              Produção SEFAZ
            </span>
          )}
          {ambiente === 'homologation' && (
            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold bg-sky-100 text-sky-900 dark:bg-sky-500/25 dark:text-sky-100">
              Homologação
            </span>
          )}
        </div>
      </div>

      {sefazMotivo && (
        <div className="px-4 py-3 rounded-xl border border-rose-200 bg-rose-50 text-sm text-rose-900 dark:bg-rose-950/30 dark:border-rose-900 dark:text-rose-100">
          <div className="font-bold mb-0.5">SEFAZ não autorizou</div>
          {sefazMotivo}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px] gap-5 items-start">
        <div className="space-y-4 min-w-0">
          <div className="flex flex-wrap gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800/80">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-colors ${
                  tab === t.id
                    ? 'bg-white dark:bg-card-dark text-primary shadow-sm'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                <span className="material-symbols-outlined text-[16px]">{t.icon}</span>
                {t.label}
              </button>
            ))}
          </div>

          {tab === 'dados' && (
            <section className="bg-white dark:bg-card-dark border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-5">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Identificação da operação</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <Field label="Natureza / CFOP" className="lg:col-span-2">
                  <select value={cfop} onChange={(e) => setCfop(e.target.value)} className={FILTER_INPUT_CLS}>
                    {operations.map((o) => (
                      <option key={o.cfop} value={o.cfop}>{o.tag} · {o.cfop} · {o.ambito}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Finalidade">
                  <select value={finNFe} onChange={(e) => setFinNFe(e.target.value as typeof finNFe)} className={FILTER_INPUT_CLS}>
                    {FIN_NFE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </Field>
                <Field label="Série">
                  <input value={series} onChange={(e) => setSeries(e.target.value.replace(/\D/g, '').slice(0, 3))} className={FILTER_INPUT_CLS} />
                </Field>
                <Field label="Consumidor final">
                  <select value={indFinal} onChange={(e) => setIndFinal(e.target.value as '0' | '1')} className={FILTER_INPUT_CLS}>
                    <option value="1">Sim</option>
                    <option value="0">Não (revenda / industrialização)</option>
                  </select>
                </Field>
                <Field label="Presença do comprador">
                  <select value={indPres} onChange={(e) => setIndPres(e.target.value)} className={FILTER_INPUT_CLS}>
                    {IND_PRES_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </Field>
              </div>

              <div className="border-t border-slate-100 dark:border-slate-800 pt-5 space-y-3">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">Destinatário</h3>
                <p className="text-xs text-slate-500">Somente cliente PJ já presente nas emitidas. Endereço, IE e município IBGE vêm do cadastro e da última NF-e.</p>
                {dest ? (
                  <div className="flex items-start justify-between gap-3 rounded-lg border border-slate-200 dark:border-slate-700 px-4 py-3">
                    <div>
                      <div className="text-sm font-bold text-slate-900 dark:text-white">{dest.name}</div>
                      <div className="text-xs text-slate-500 mt-0.5">{formatCnpj(dest.cnpj)}</div>
                    </div>
                    <button type="button" onClick={() => setDest(null)} className="text-xs font-bold text-slate-500 hover:text-rose-600">Trocar</button>
                  </div>
                ) : (
                  <>
                    <input value={customerQuery} onChange={(e) => setCustomerQuery(e.target.value)} placeholder="Buscar por CNPJ" className={FILTER_INPUT_CLS} />
                    <ul className="divide-y divide-slate-100 dark:divide-slate-800 max-h-48 overflow-auto rounded-lg border border-slate-100 dark:border-slate-800">
                      {customers.map((c) => (
                        <li key={c.cnpj}>
                          <button type="button" onClick={() => setDest(c)} className="w-full text-left px-3 py-2.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-800/50">
                            <span className="font-bold text-slate-900 dark:text-white">{c.name}</span>
                            <span className="text-slate-500 ml-2">{formatCnpj(c.cnpj)}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            </section>
          )}

          {tab === 'itens' && (
            <section className="bg-white dark:bg-card-dark border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">Itens da nota</h3>
                <span className="text-xs text-slate-500">{items.length} {items.length === 1 ? 'item' : 'itens'}</span>
              </div>
              <input value={productQuery} onChange={(e) => setProductQuery(e.target.value)} placeholder="Buscar produto por código ou descrição" className={FILTER_INPUT_CLS} />
              {products.length > 0 && (
                <ul className="divide-y divide-slate-100 dark:divide-slate-800 max-h-40 overflow-auto rounded-lg border border-slate-100 dark:border-slate-800">
                  {products.map((p) => (
                    <li key={p.id}>
                      <button type="button" onClick={() => addProduct(p)} className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-800/50">
                        <span className="font-medium">{p.description}</span>
                        <span className="text-slate-400 ml-2">{p.code} · NCM {p.ncm || '—'}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[720px]">
                  <thead>
                    <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500">
                      <th className="py-2 pr-2">Produto</th>
                      <th className="pr-2">NCM</th>
                      <th className="pr-2">CFOP</th>
                      <th className="pr-2">Qtd</th>
                      <th className="pr-2">Unitário</th>
                      <th className="pr-2">Desconto</th>
                      <th className="pr-2 text-right">Total</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, idx) => (
                      <React.Fragment key={`${item.productId}-${idx}`}>
                        <tr className="border-t border-slate-100 dark:border-slate-800 align-top">
                          <td className="py-2 pr-2">
                            <div className="font-medium text-slate-900 dark:text-white">{item.xProd}</div>
                            <div className="text-[11px] text-slate-400">
                              {item.cProd}
                              {item.anvisa ? ` · ANVISA ${item.anvisa}` : ''}
                              {item.cest ? ` · CEST ${item.cest}` : ''}
                            </div>
                          </td>
                          <td className="pr-2 pt-2">
                            <input value={item.ncm} onChange={(e) => setItems((rows) => rows.map((r, i) => i === idx ? { ...r, ncm: e.target.value.replace(/\D/g, '').slice(0, 8) } : r))} className={`${FILTER_INPUT_CLS} w-24`} />
                          </td>
                          <td className="pr-2 pt-2">
                            <input value={item.cfop} onChange={(e) => setItems((rows) => rows.map((r, i) => i === idx ? { ...r, cfop: e.target.value.replace(/\D/g, '').slice(0, 4) } : r))} className={`${FILTER_INPUT_CLS} w-16`} />
                          </td>
                          <td className="pr-2 pt-2">
                            <input value={item.qCom} onChange={(e) => setItems((rows) => rows.map((r, i) => i === idx ? { ...r, qCom: e.target.value } : r))} className={`${FILTER_INPUT_CLS} w-20`} />
                          </td>
                          <td className="pr-2 pt-2">
                            <input value={item.vUnCom} onChange={(e) => setItems((rows) => rows.map((r, i) => i === idx ? { ...r, vUnCom: e.target.value } : r))} className={`${FILTER_INPUT_CLS} w-24`} />
                          </td>
                          <td className="pr-2 pt-2">
                            <input value={item.vDesc} onChange={(e) => setItems((rows) => rows.map((r, i) => i === idx ? { ...r, vDesc: e.target.value } : r))} className={`${FILTER_INPUT_CLS} w-20`} />
                          </td>
                          <td className="pr-2 pt-3 text-right font-bold tabular-nums">{formatAmount(lineNet(item))}</td>
                          <td className="pt-3 whitespace-nowrap">
                            <button type="button" onClick={() => setOpenItem(openItem === idx ? null : idx)} className="text-xs text-primary font-bold mr-2">
                              {openItem === idx ? 'Fechar' : 'Fiscal'}
                            </button>
                            <button type="button" onClick={() => setItems((rows) => rows.filter((_, i) => i !== idx))} className="text-xs text-rose-600 font-bold">
                              Remover
                            </button>
                          </td>
                        </tr>
                        {openItem === idx && (
                          <tr className="bg-slate-50/80 dark:bg-slate-900/40">
                            <td colSpan={8} className="px-3 py-3">
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                <Field label="CEST">
                                  <input value={item.cest || ''} onChange={(e) => setItems((rows) => rows.map((r, i) => i === idx ? { ...r, cest: e.target.value } : r))} className={FILTER_INPUT_CLS} />
                                </Field>
                                <Field label="EAN / GTIN">
                                  <input value={item.ean || ''} onChange={(e) => setItems((rows) => rows.map((r, i) => i === idx ? { ...r, ean: e.target.value } : r))} className={FILTER_INPUT_CLS} />
                                </Field>
                                <Field label="Origem">
                                  <input value={item.orig || '0'} onChange={(e) => setItems((rows) => rows.map((r, i) => i === idx ? { ...r, orig: e.target.value } : r))} className={FILTER_INPUT_CLS} />
                                </Field>
                                <Field label="CSOSN / CST">
                                  <input value={item.csosn || ''} onChange={(e) => setItems((rows) => rows.map((r, i) => i === idx ? { ...r, csosn: e.target.value } : r))} className={FILTER_INPUT_CLS} />
                                </Field>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {tab === 'transporte' && (
            <section className="bg-white dark:bg-card-dark border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Transporte e volumes</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Modalidade do frete" className="md:col-span-2">
                  <select value={modFrete} onChange={(e) => setModFrete(e.target.value)} className={FILTER_INPUT_CLS}>
                    {MOD_FRETE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </Field>
                <Field label="Frete (R$)">
                  <input value={vFrete} onChange={(e) => setVFrete(e.target.value)} className={FILTER_INPUT_CLS} />
                </Field>
                <Field label="Seguro (R$)">
                  <input value={vSeg} onChange={(e) => setVSeg(e.target.value)} className={FILTER_INPUT_CLS} />
                </Field>
                <Field label="Outras despesas (R$)">
                  <input value={vOutro} onChange={(e) => setVOutro(e.target.value)} className={FILTER_INPUT_CLS} />
                </Field>
                <Field label="Transportadora">
                  <input value={transpNome} onChange={(e) => setTranspNome(e.target.value)} className={FILTER_INPUT_CLS} placeholder="Razão social" />
                </Field>
                <Field label="CNPJ transportadora">
                  <input value={transpCnpj} onChange={(e) => setTranspCnpj(e.target.value)} className={FILTER_INPUT_CLS} />
                </Field>
                <Field label="UF veículo / transportadora">
                  <input value={transpUf} onChange={(e) => setTranspUf(e.target.value.toUpperCase().slice(0, 2))} className={FILTER_INPUT_CLS} />
                </Field>
                <Field label="Quantidade de volumes">
                  <input value={qVol} onChange={(e) => setQVol(e.target.value)} className={FILTER_INPUT_CLS} />
                </Field>
                <Field label="Espécie">
                  <input value={esp} onChange={(e) => setEsp(e.target.value)} className={FILTER_INPUT_CLS} placeholder="Caixa, volume…" />
                </Field>
                <Field label="Peso líquido">
                  <input value={pesoL} onChange={(e) => setPesoL(e.target.value)} className={FILTER_INPUT_CLS} />
                </Field>
                <Field label="Peso bruto">
                  <input value={pesoB} onChange={(e) => setPesoB(e.target.value)} className={FILTER_INPUT_CLS} />
                </Field>
              </div>
            </section>
          )}

          {tab === 'pagamento' && (
            <section className="bg-white dark:bg-card-dark border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Pagamento da NF-e</h3>
              <p className="text-xs text-slate-500">Grupo <span className="font-mono">pag</span> do XML — distinto do contas a receber interno.</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Indicador">
                  <select value={indPag} onChange={(e) => setIndPag(e.target.value as '0' | '1')} className={FILTER_INPUT_CLS}>
                    <option value="0">À vista</option>
                    <option value="1">A prazo</option>
                  </select>
                </Field>
                <Field label="Meio de pagamento">
                  <select value={tPag} onChange={(e) => setTPag(e.target.value)} className={FILTER_INPUT_CLS}>
                    {TPAG_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.value} · {o.label}</option>)}
                  </select>
                </Field>
              </div>
              <div className="rounded-lg bg-slate-50 dark:bg-slate-900/40 px-4 py-3 text-sm">
                Valor a informar no XML: <span className="font-bold tabular-nums">{tPag === '90' ? '0,00' : formatAmount(vNf)}</span>
              </div>
            </section>
          )}

          {tab === 'complementos' && (
            <section className="bg-white dark:bg-card-dark border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Informações adicionais</h3>
              <Field label="Informações complementares (contribuinte / DANFE)">
                <textarea value={infCpl} onChange={(e) => setInfCpl(e.target.value.slice(0, 2000))} rows={4} className={FILTER_INPUT_CLS} placeholder="Pedido, contrato, texto legal ao destinatário" />
              </Field>
              <Field label="Informações de interesse do fisco">
                <textarea value={infAdFisco} onChange={(e) => setInfAdFisco(e.target.value.slice(0, 2000))} rows={3} className={FILTER_INPUT_CLS} />
              </Field>
            </section>
          )}
        </div>

        <aside className="xl:sticky xl:top-4 space-y-4">
          <div className="bg-white dark:bg-card-dark border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">Totais da NF-e</h3>
            {[
              ['Produtos', vProd],
              ['Descontos', vDesc],
              ['Frete', Number(vFrete || 0)],
              ['Seguro', Number(vSeg || 0)],
              ['Outras', Number(vOutro || 0)],
            ].map(([label, value]) => (
              <div key={String(label)} className="flex justify-between text-sm">
                <span className="text-slate-500">{label}</span>
                <span className="tabular-nums font-medium">{formatAmount(Number(value))}</span>
              </div>
            ))}
            <div className="flex justify-between text-sm pt-2 border-t border-slate-100 dark:border-slate-800">
              <span className="font-bold">Total da nota</span>
              <span className="tabular-nums font-bold text-primary">{formatAmount(vNf)}</span>
            </div>
          </div>

          <div className="bg-white dark:bg-card-dark border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-2">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">Conferência</h3>
            {pendencias.length === 0 ? (
              <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400">Pronta para transmitir.</p>
            ) : (
              <ul className="space-y-1.5">
                {pendencias.map((p) => (
                  <li key={p} className="text-xs text-amber-800 dark:text-amber-200 flex gap-1.5">
                    <span className="material-symbols-outlined text-[14px]">error</span>
                    {p}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {canWrite && (
            <div className="flex flex-col gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => void saveDraft()}
                className="w-full px-4 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-sm font-medium"
              >
                {saving ? 'Salvando…' : 'Salvar rascunho'}
              </button>
              <button
                type="button"
                disabled={sending || pendencias.length > 0}
                onClick={() => setConfirmSend(true)}
                className="w-full px-4 py-2.5 rounded-lg bg-primary text-white text-sm font-bold disabled:opacity-50"
              >
                {sending ? 'Enviando…' : 'Transmitir à SEFAZ'}
              </button>
            </div>
          )}
        </aside>
      </div>

      <ConfirmDialog
        isOpen={confirmSend}
        onClose={() => setConfirmSend(false)}
        onConfirm={() => void sendSefaz()}
        title="Transmitir NF-e"
        message={ambiente === 'production'
          ? 'O certificado está em produção. A SEFAZ vai autorizar uma nota fiscal real. Confirma o envio?'
          : 'Enviar esta NF-e para autorização na SEFAZ (homologação)?'}
        confirmLabel="Transmitir"
        confirmVariant={ambiente === 'production' ? 'danger' : 'primary'}
        loading={sending}
      />
    </div>
  );
}
