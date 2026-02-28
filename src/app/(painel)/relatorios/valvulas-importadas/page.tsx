'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { toast } from 'sonner';
import Skeleton from '@/components/ui/Skeleton';
import { formatCurrency, formatCurrencyShort } from '@/lib/utils';
import { useModalBackButton } from '@/hooks/useModalBackButton';

interface SystemUser {
  id: string;
  name: string;
  email: string;
}

interface Product {
  key: string;
  code: string;
  description: string;
  shortName: string | null;
  unit: string;
  anvisa: string | null;
  purchasedQty: number;
  purchasedValue: number;
  soldQty: number;
  soldValue: number;
  resaleQty: number;
  resaleValue: number;
  netQty: number;
  avgPurchasePrice: number | null;
  avgSalePrice: number | null;
}

interface Summary {
  totalProducts: number;
  totalPurchasedQty: number;
  totalPurchasedValue: number;
  totalSoldQty: number;
  totalSoldValue: number;
  totalResaleQty: number;
  totalResaleValue: number;
}

interface CustomerYearlySales {
  years: number[];
  customers: Array<{
    customerName: string;
    shortName: string;
    totalQty: number;
    totalValue: number;
    lastUnitPrice: number | null;
    byYear: Record<string, { qty: number; value: number }>;
  }>;
}

interface ReportData {
  summary: Summary;
  products: Product[];
  customerYearlySales: CustomerYearlySales;
  meta: { invoicesScanned: number; issuedInvoicesScanned: number };
}

export default function ValvulasImportadasPage() {
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<string>('purchasedValue');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [users, setUsers] = useState<SystemUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [selectedEmail, setSelectedEmail] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const res = await fetch('/api/reports/valvulas-importadas');
      if (!res.ok) throw new Error('Erro ao carregar relatório');
      setData(await res.json());
    } catch {
      toast.error('Erro ao carregar relatório de válvulas mecânicas');
    } finally {
      setLoading(false);
    }
  }

  const sortedProducts = useMemo(() => {
    if (!data?.products) return [];
    const items = [...data.products];
    items.sort((a, b) => {
      let cmp = 0;
      switch (sortBy) {
        case 'code': cmp = a.code.localeCompare(b.code); break;
        case 'description': cmp = a.description.localeCompare(b.description); break;
        case 'purchasedQty': cmp = a.purchasedQty - b.purchasedQty; break;
        case 'purchasedValue': cmp = a.purchasedValue - b.purchasedValue; break;
        case 'soldQty': cmp = a.soldQty - b.soldQty; break;
        case 'soldValue': cmp = a.soldValue - b.soldValue; break;
        case 'netQty': cmp = a.netQty - b.netQty; break;
        case 'avgPurchasePrice': cmp = (a.avgPurchasePrice || 0) - (b.avgPurchasePrice || 0); break;
        case 'avgSalePrice': cmp = (a.avgSalePrice || 0) - (b.avgSalePrice || 0); break;
        default: cmp = 0;
      }
      return sortOrder === 'asc' ? cmp : -cmp;
    });
    return items;
  }, [data?.products, sortBy, sortOrder]);

  const totals = useMemo(() => {
    if (!data?.products) return null;
    const purchasedQty = data.products.reduce((s, p) => s + p.purchasedQty, 0);
    const purchasedValue = data.products.reduce((s, p) => s + p.purchasedValue, 0);
    const soldQty = data.products.reduce((s, p) => s + p.soldQty, 0);
    const soldValue = data.products.reduce((s, p) => s + p.soldValue, 0);
    const netQty = data.products.reduce((s, p) => s + p.netQty, 0);
    const stockValue = data.products.reduce((s, p) => {
      if (p.netQty <= 0 || p.purchasedQty <= 0) return s;
      const avgCost = p.purchasedValue / p.purchasedQty;
      return s + p.netQty * avgCost;
    }, 0);
    const avgPurchasePrice = purchasedQty > 0 ? purchasedValue / purchasedQty : 0;
    const avgSalePrice = soldQty > 0 ? soldValue / soldQty : 0;
    const grossProfit = soldValue - (soldQty > 0 && purchasedQty > 0 ? soldQty * (purchasedValue / purchasedQty) : 0);
    return { purchasedQty, purchasedValue, soldQty, soldValue, netQty, stockValue, avgPurchasePrice, avgSalePrice, grossProfit };
  }, [data?.products]);

  const handleSort = (field: string) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
  };

  const getSortIcon = (field: string) => {
    if (sortBy !== field)
      return (
        <span className="material-symbols-outlined text-[14px] text-slate-300 opacity-0 group-hover:opacity-50 print:hidden">
          unfold_more
        </span>
      );
    return (
      <span className="material-symbols-outlined text-[14px] text-primary print:hidden">
        {sortOrder === 'asc' ? 'expand_less' : 'expand_more'}
      </span>
    );
  };

  useModalBackButton(emailModalOpen, () => setEmailModalOpen(false));

  const openEmailModal = useCallback(async () => {
    setEmailModalOpen(true);
    setSelectedEmail(null);
    if (users.length === 0) {
      setLoadingUsers(true);
      try {
        const res = await fetch('/api/users');
        if (!res.ok) throw new Error();
        const json = await res.json();
        setUsers(
          (json.users as any[])
            .filter((u: any) => u.status === 'active' && u.email)
            .map((u: any) => ({ id: u.id, name: u.name, email: u.email }))
        );
      } catch {
        toast.error('Erro ao carregar lista de usuários');
      } finally {
        setLoadingUsers(false);
      }
    }
  }, [users.length]);

  const handleSendEmail = useCallback(async () => {
    if (!selectedEmail) return;
    setSendingEmail(true);
    try {
      const res = await fetch(`/api/reports/valvulas-importadas/pdf?action=email&to=${encodeURIComponent(selectedEmail)}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Erro ao enviar');
      toast.success(`Email enviado para ${selectedEmail}`);
      setEmailModalOpen(false);
    } catch (err: any) {
      toast.error(err.message || 'Erro ao enviar email');
    } finally {
      setSendingEmail(false);
    }
  }, [selectedEmail]);

  return (
    <>
      {/* Page Title */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-[28px] text-primary">bar_chart</span>
          <div>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
              Válvulas Mecânicas Corcym
            </h2>
            <p className="text-slate-500 dark:text-slate-400 text-xs font-medium">
              Relatório consolidado de compras e vendas
            </p>
          </div>
        </div>
        {!loading && data && (
          <div className="flex items-center gap-2 print:hidden">
            <button
              onClick={() => window.open('/api/reports/valvulas-importadas/pdf?action=download', '_blank')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white dark:bg-card-dark border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              <span className="material-symbols-outlined text-[16px]">picture_as_pdf</span>
              Exportar PDF
            </button>
            <button
              onClick={openEmailModal}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-semibold hover:bg-primary/90 transition-colors"
            >
              <span className="material-symbols-outlined text-[16px]">mail</span>
              Enviar por Email
            </button>
          </div>
        )}
      </div>

      {/* Email Modal */}
      {emailModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 print:hidden" onClick={() => setEmailModalOpen(false)}>
          <div className="bg-white dark:bg-card-dark rounded-xl border border-slate-200 dark:border-slate-800 shadow-xl w-full max-w-sm mx-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Enviar Relatório por Email</h3>
              <button onClick={() => setEmailModalOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors">
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>
            <div className="p-4">
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">Selecione o destinatário:</p>
              {loadingUsers ? (
                <div className="flex items-center justify-center py-6">
                  <span className="material-symbols-outlined text-[20px] text-slate-400 animate-spin">progress_activity</span>
                </div>
              ) : users.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-4">Nenhum usuário ativo encontrado</p>
              ) : (
                <div className="flex flex-col gap-1 max-h-[240px] overflow-y-auto">
                  {users.map(u => (
                    <button
                      key={u.id}
                      onClick={() => setSelectedEmail(u.email)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-colors ${
                        selectedEmail === u.email
                          ? 'bg-primary/10 border border-primary/30'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/50 border border-transparent'
                      }`}
                    >
                      <span className={`material-symbols-outlined text-[16px] ${selectedEmail === u.email ? 'text-primary' : 'text-slate-400'}`}>
                        {selectedEmail === u.email ? 'radio_button_checked' : 'radio_button_unchecked'}
                      </span>
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-slate-900 dark:text-white truncate">{u.name}</div>
                        <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate">{u.email}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {/* Mobile footer */}
            <div className="sm:hidden border-t border-slate-200 dark:border-slate-800 p-4 flex flex-col gap-2">
              <button
                onClick={handleSendEmail}
                disabled={!selectedEmail || sendingEmail}
                className="flex items-center justify-center gap-1.5 w-full px-3 py-2.5 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {sendingEmail && <span className="material-symbols-outlined text-[16px] animate-spin">progress_activity</span>}
                {sendingEmail ? 'Enviando...' : 'Enviar'}
              </button>
              <button
                onClick={() => setEmailModalOpen(false)}
                className="w-full px-3 py-2.5 rounded-lg text-sm font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                Voltar
              </button>
            </div>
            {/* Desktop footer */}
            <div className="hidden sm:flex items-center justify-end gap-2 px-4 py-3 border-t border-slate-200 dark:border-slate-800">
              <button
                onClick={() => setEmailModalOpen(false)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleSendEmail}
                disabled={!selectedEmail || sendingEmail}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {sendingEmail && <span className="material-symbols-outlined text-[14px] animate-spin">progress_activity</span>}
                {sendingEmail ? 'Enviando...' : 'Enviar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Printable report area */}
      <div className="flex flex-col gap-4">

        {/* KPI Cards — 3 cols × 3 rows ultra-compact */}
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: 'Qtd Comprada', value: loading ? null : (totals?.purchasedQty ?? 0).toLocaleString('pt-BR'), icon: 'call_received', color: 'emerald' },
            { label: 'Valor Comprado', value: loading ? null : formatCurrencyShort(totals?.purchasedValue ?? 0), icon: 'payments', color: 'blue' },
            { label: 'Preço Méd. Compra', value: loading ? null : formatCurrency(totals?.avgPurchasePrice ?? 0), icon: 'price_check', color: 'indigo' },
            { label: 'Qtd Vendida', value: loading ? null : (totals?.soldQty ?? 0).toLocaleString('pt-BR'), icon: 'call_made', color: 'purple' },
            { label: 'Valor Vendido', value: loading ? null : formatCurrencyShort(totals?.soldValue ?? 0), icon: 'request_quote', color: 'amber' },
            { label: 'Preço Méd. Venda', value: loading ? null : formatCurrency(totals?.avgSalePrice ?? 0), icon: 'sell', color: 'orange' },
            { label: 'Saldo Estoque', value: loading ? null : (totals?.netQty ?? 0).toLocaleString('pt-BR'), icon: 'inventory', color: 'teal', highlight: (totals?.netQty ?? 0) > 0 ? 'emerald' : (totals?.netQty ?? 0) < 0 ? 'red' : null },
            { label: 'Valor Estoque', value: loading ? null : formatCurrencyShort(totals?.stockValue ?? 0), icon: 'account_balance', color: 'cyan' },
            { label: 'Lucro Bruto', value: loading ? null : formatCurrencyShort(totals?.grossProfit ?? 0), icon: 'trending_up', color: 'green', highlight: (totals?.grossProfit ?? 0) >= 0 ? 'green' : 'red' },
          ].map((card, i) => {
            const highlightClass = card.highlight === 'emerald' ? 'text-emerald-600 dark:text-emerald-400'
              : card.highlight === 'red' ? 'text-red-600 dark:text-red-400'
              : card.highlight === 'green' ? 'text-green-600 dark:text-green-400'
              : 'text-slate-900 dark:text-white';
            return (
              <div key={i} className="bg-white dark:bg-card-dark px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 flex items-center gap-2">
                <span className={`flex items-center justify-center w-7 h-7 rounded-md bg-${card.color}-50 dark:bg-${card.color}-900/20 text-${card.color}-600 dark:text-${card.color}-400 shrink-0`}>
                  <span className="material-symbols-outlined text-[16px]">{card.icon}</span>
                </span>
                <div className="min-w-0">
                  <p className="text-[9px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider leading-tight">{card.label}</p>
                  <p className={`text-xl font-bold leading-tight ${highlightClass}`}>
                    {card.value === null ? <Skeleton className="h-4 w-14" /> : card.value}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Customer Yearly Sales Table */}
        {!loading && data && (
          <>
            {/* Desktop table */}
            <div className="hidden lg:block bg-white dark:bg-card-dark border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
              <div className="px-3 py-2 border-b border-slate-200 dark:border-slate-800 bg-slate-50/30 dark:bg-slate-800/20">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Vendas por Cliente / Ano
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800 text-[10px] uppercase text-slate-500 dark:text-slate-400 font-bold tracking-wider">
                      <th className="px-2 py-1.5">Cliente</th>
                      {data.customerYearlySales.years.map((y) => (
                        <th key={y} className="px-2 py-1.5 text-right">{y}</th>
                      ))}
                      <th className="px-2 py-1.5 text-right">Total</th>
                      <th className="px-2 py-1.5 text-right">Últ. Preço</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {data.customerYearlySales.customers.map((c, idx) => (
                      <tr key={idx} className="group hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                        <td className="px-2 py-1.5 text-xs text-slate-900 dark:text-white truncate max-w-[180px]" title={c.customerName}>
                          {c.shortName}
                        </td>
                        {data.customerYearlySales.years.map((y) => {
                          const entry = c.byYear[String(y)];
                          return (
                            <td key={y} className="px-2 py-1.5 text-right">
                              {entry && entry.qty > 0 ? (
                                <div>
                                  <div className="text-xs font-mono font-bold text-slate-900 dark:text-white">
                                    {entry.qty.toLocaleString('pt-BR')}
                                  </div>
                                  <div className="text-[9px] font-mono text-slate-400 leading-tight">
                                    {formatCurrency(entry.value)}
                                  </div>
                                </div>
                              ) : (
                                <span className="text-slate-300 dark:text-slate-600">—</span>
                              )}
                            </td>
                          );
                        })}
                        <td className="px-2 py-1.5 text-right">
                          <div className="text-sm font-mono font-bold text-slate-900 dark:text-white">
                            {c.totalQty.toLocaleString('pt-BR')}
                          </div>
                          <div className="text-[9px] font-mono text-slate-500 leading-tight">
                            {formatCurrency(c.totalValue)}
                          </div>
                        </td>
                        <td className="px-2 py-1.5 text-right text-xs font-mono text-slate-700 dark:text-slate-300">
                          {c.lastUnitPrice != null ? formatCurrency(c.lastUnitPrice) : '—'}
                        </td>
                      </tr>
                    ))}
                    {data.customerYearlySales.customers.length > 0 && (
                      <tr className="bg-slate-50 dark:bg-slate-900/50 border-t-2 border-slate-300 dark:border-slate-700 font-bold">
                        <td className="px-2 py-2 text-xs text-slate-900 dark:text-white">TOTAL</td>
                        {data.customerYearlySales.years.map((y) => {
                          const yk = String(y);
                          const yearQty = data.customerYearlySales.customers.reduce((s, c) => s + (c.byYear[yk]?.qty || 0), 0);
                          const yearVal = data.customerYearlySales.customers.reduce((s, c) => s + (c.byYear[yk]?.value || 0), 0);
                          return (
                            <td key={y} className="px-2 py-2 text-right">
                              <div className="text-xs font-mono font-bold text-slate-900 dark:text-white">
                                {yearQty.toLocaleString('pt-BR')}
                              </div>
                              <div className="text-[9px] font-mono text-slate-500 leading-tight">
                                {formatCurrency(yearVal)}
                              </div>
                            </td>
                          );
                        })}
                        <td className="px-2 py-2 text-right">
                          <div className="text-sm font-mono font-bold text-slate-900 dark:text-white">
                            {data.customerYearlySales.customers.reduce((s, c) => s + c.totalQty, 0).toLocaleString('pt-BR')}
                          </div>
                          <div className="text-[9px] font-mono text-slate-500 leading-tight">
                            {formatCurrency(data.customerYearlySales.customers.reduce((s, c) => s + c.totalValue, 0))}
                          </div>
                        </td>
                        <td className="px-2 py-2" />
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Mobile cards — Vendas por Cliente / Ano */}
            <div className="lg:hidden bg-white dark:bg-card-dark border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
              <div className="px-3 py-2 border-b border-slate-200 dark:border-slate-800 bg-slate-50/30 dark:bg-slate-800/20">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Vendas por Cliente / Ano
                </h3>
              </div>
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {data.customerYearlySales.customers.map((c, idx) => (
                  <div key={idx} className="p-4">
                    <p className="text-sm font-bold text-slate-900 dark:text-white truncate" title={c.customerName}>
                      {c.shortName}
                    </p>
                    <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1">
                      <div>
                        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Total Qtd</p>
                        <p className="text-sm font-mono font-bold text-slate-900 dark:text-white">
                          {c.totalQty.toLocaleString('pt-BR')}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Total Valor</p>
                        <p className="text-sm font-mono text-slate-700 dark:text-slate-300">
                          {formatCurrency(c.totalValue)}
                        </p>
                      </div>
                      {c.lastUnitPrice != null && (
                        <div className="col-span-2">
                          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Últ. Preço Unit.</p>
                          <p className="text-sm font-mono text-slate-700 dark:text-slate-300">
                            {formatCurrency(c.lastUnitPrice)}
                          </p>
                        </div>
                      )}
                    </div>
                    {data.customerYearlySales.years.length > 0 && (
                      <div className="mt-2 grid grid-cols-3 gap-2">
                        {data.customerYearlySales.years.map((y) => {
                          const entry = c.byYear[String(y)];
                          return (
                            <div key={y} className="bg-slate-50 dark:bg-slate-800/40 rounded-md px-2 py-1.5">
                              <p className="text-[10px] font-bold text-slate-400 uppercase">{y}</p>
                              {entry && entry.qty > 0 ? (
                                <>
                                  <p className="text-xs font-mono font-bold text-slate-900 dark:text-white">
                                    {entry.qty.toLocaleString('pt-BR')}
                                  </p>
                                  <p className="text-[9px] font-mono text-slate-400 leading-tight">
                                    {formatCurrency(entry.value)}
                                  </p>
                                </>
                              ) : (
                                <p className="text-xs text-slate-300 dark:text-slate-600">—</p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* Detailed Table — desktop */}
        <div className="hidden lg:flex flex-col bg-white dark:bg-card-dark border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
          <div className="px-3 py-2 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/30 dark:bg-slate-800/20">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Detalhamento por Produto
              </h3>
              <span className="px-1.5 py-0.5 rounded-full bg-slate-200 dark:bg-slate-700 text-[10px] font-bold text-slate-600 dark:text-slate-300">
                {data?.products.length || 0}
              </span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800 text-[10px] uppercase text-slate-500 dark:text-slate-400 font-bold tracking-wider">
                  <th className="px-2 py-1.5 cursor-pointer group hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" onClick={() => handleSort('code')}>
                    <div className="flex items-center gap-0.5">Cód {getSortIcon('code')}</div>
                  </th>
                  <th className="px-2 py-1.5 cursor-pointer group hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" onClick={() => handleSort('description')}>
                    <div className="flex items-center gap-0.5">Descrição {getSortIcon('description')}</div>
                  </th>
                  <th className="px-2 py-1.5 text-right cursor-pointer group hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" onClick={() => handleSort('purchasedQty')}>
                    <div className="flex items-center justify-end gap-0.5">Qt Compra {getSortIcon('purchasedQty')}</div>
                  </th>
                  <th className="px-2 py-1.5 text-right cursor-pointer group hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" onClick={() => handleSort('purchasedValue')}>
                    <div className="flex items-center justify-end gap-0.5">Vl Compra {getSortIcon('purchasedValue')}</div>
                  </th>
                  <th className="px-2 py-1.5 text-right cursor-pointer group hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" onClick={() => handleSort('soldQty')}>
                    <div className="flex items-center justify-end gap-0.5">Qt Venda {getSortIcon('soldQty')}</div>
                  </th>
                  <th className="px-2 py-1.5 text-right cursor-pointer group hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" onClick={() => handleSort('soldValue')}>
                    <div className="flex items-center justify-end gap-0.5">Vl Venda {getSortIcon('soldValue')}</div>
                  </th>
                  <th className="px-2 py-1.5 text-right cursor-pointer group hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" onClick={() => handleSort('netQty')}>
                    <div className="flex items-center justify-end gap-0.5">Saldo {getSortIcon('netQty')}</div>
                  </th>
                  <th className="px-2 py-1.5 text-right cursor-pointer group hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" onClick={() => handleSort('avgPurchasePrice')}>
                    <div className="flex items-center justify-end gap-0.5">PM Compra {getSortIcon('avgPurchasePrice')}</div>
                  </th>
                  <th className="px-2 py-1.5 text-right cursor-pointer group hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" onClick={() => handleSort('avgSalePrice')}>
                    <div className="flex items-center justify-end gap-0.5">PM Venda {getSortIcon('avgSalePrice')}</div>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {loading ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 9 }).map((_, j) => (
                        <td key={j} className="px-2 py-1.5"><Skeleton className="h-3 w-12" /></td>
                      ))}
                    </tr>
                  ))
                ) : sortedProducts.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-slate-400">
                      <span className="material-symbols-outlined text-[36px] opacity-30">search_off</span>
                      <p className="mt-1 text-xs font-medium">Nenhum produto encontrado</p>
                    </td>
                  </tr>
                ) : (
                  <>
                    {sortedProducts.map((p) => (
                      <tr key={p.key} className="group hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                        <td className="px-2 py-1.5 text-xs font-mono text-slate-700 dark:text-slate-300">{p.code}</td>
                        <td className="px-2 py-1.5">
                          <div className="text-xs font-medium text-slate-900 dark:text-white truncate max-w-[160px]" title={p.description}>
                            {p.shortName || p.description}
                          </div>
                        </td>
                        <td className="px-2 py-1.5 text-xs text-right font-mono text-slate-700 dark:text-slate-300">
                          {p.purchasedQty.toLocaleString('pt-BR')}
                        </td>
                        <td className="px-2 py-1.5 text-xs text-right font-mono text-slate-700 dark:text-slate-300">
                          {formatCurrency(p.purchasedValue)}
                        </td>
                        <td className="px-2 py-1.5 text-xs text-right font-mono text-slate-700 dark:text-slate-300">
                          {p.soldQty.toLocaleString('pt-BR')}
                        </td>
                        <td className="px-2 py-1.5 text-xs text-right font-mono text-slate-700 dark:text-slate-300">
                          {formatCurrency(p.soldValue)}
                        </td>
                        <td className={`px-2 py-1.5 text-xs text-right font-mono font-bold ${
                          p.netQty > 0 ? 'text-emerald-600 dark:text-emerald-400' : p.netQty < 0 ? 'text-red-600 dark:text-red-400' : 'text-slate-500'
                        }`}>
                          {p.netQty > 0 ? '+' : ''}{p.netQty.toLocaleString('pt-BR')}
                        </td>
                        <td className="px-2 py-1.5 text-xs text-right font-mono text-slate-700 dark:text-slate-300">
                          {p.avgPurchasePrice != null ? formatCurrency(p.avgPurchasePrice) : '—'}
                        </td>
                        <td className="px-2 py-1.5 text-xs text-right font-mono text-slate-700 dark:text-slate-300">
                          {p.avgSalePrice != null ? formatCurrency(p.avgSalePrice) : '—'}
                        </td>
                      </tr>
                    ))}
                    {totals && (
                      <tr className="bg-slate-50 dark:bg-slate-900/50 border-t-2 border-slate-300 dark:border-slate-700 font-bold">
                        <td className="px-2 py-2 text-xs text-slate-900 dark:text-white" colSpan={2}>TOTAL</td>
                        <td className="px-2 py-2 text-xs text-right font-mono text-slate-900 dark:text-white">
                          {totals.purchasedQty.toLocaleString('pt-BR')}
                        </td>
                        <td className="px-2 py-2 text-xs text-right font-mono text-slate-900 dark:text-white">
                          {formatCurrency(totals.purchasedValue)}
                        </td>
                        <td className="px-2 py-2 text-xs text-right font-mono text-slate-900 dark:text-white">
                          {totals.soldQty.toLocaleString('pt-BR')}
                        </td>
                        <td className="px-2 py-2 text-xs text-right font-mono text-slate-900 dark:text-white">
                          {formatCurrency(totals.soldValue)}
                        </td>
                        <td className={`px-2 py-2 text-xs text-right font-mono font-bold ${
                          totals.netQty > 0 ? 'text-emerald-600 dark:text-emerald-400' : totals.netQty < 0 ? 'text-red-600 dark:text-red-400' : 'text-slate-500'
                        }`}>
                          {totals.netQty > 0 ? '+' : ''}{totals.netQty.toLocaleString('pt-BR')}
                        </td>
                        <td className="px-2 py-2 text-xs text-right font-mono text-slate-900 dark:text-white">
                          {totals.purchasedQty > 0 ? formatCurrency(totals.purchasedValue / totals.purchasedQty) : '—'}
                        </td>
                        <td className="px-2 py-2 text-xs text-right font-mono text-slate-900 dark:text-white">
                          {totals.soldQty > 0 ? formatCurrency(totals.soldValue / totals.soldQty) : '—'}
                        </td>
                      </tr>
                    )}
                  </>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Detailed Table — mobile cards */}
        <div className="lg:hidden bg-white dark:bg-card-dark border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
          <div className="px-3 py-2 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2 bg-slate-50/30 dark:bg-slate-800/20">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Detalhamento por Produto
            </h3>
            <span className="px-1.5 py-0.5 rounded-full bg-slate-200 dark:bg-slate-700 text-[10px] font-bold text-slate-600 dark:text-slate-300">
              {data?.products.length || 0}
            </span>
          </div>
          {loading ? (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="p-4 flex flex-col gap-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                  <div className="grid grid-cols-2 gap-2 mt-1">
                    <Skeleton className="h-8" />
                    <Skeleton className="h-8" />
                    <Skeleton className="h-8" />
                    <Skeleton className="h-8" />
                  </div>
                </div>
              ))}
            </div>
          ) : sortedProducts.length === 0 ? (
            <div className="px-4 py-8 text-center text-slate-400">
              <span className="material-symbols-outlined text-[36px] opacity-30">search_off</span>
              <p className="mt-1 text-xs font-medium">Nenhum produto encontrado</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {sortedProducts.map((p) => (
                <div key={p.key} className="p-4">
                  <p className="text-sm font-bold text-slate-900 dark:text-white" title={p.description}>
                    {p.shortName || p.description}
                  </p>
                  <p className="text-[10px] font-mono text-slate-400 mt-0.5">{p.code}</p>
                  <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2">
                    <div>
                      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Qt Comprada</p>
                      <p className="text-sm font-mono text-slate-700 dark:text-slate-300">
                        {p.purchasedQty.toLocaleString('pt-BR')}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Vl Comprado</p>
                      <p className="text-sm font-mono text-slate-700 dark:text-slate-300">
                        {formatCurrency(p.purchasedValue)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Qt Vendida</p>
                      <p className="text-sm font-mono text-slate-700 dark:text-slate-300">
                        {p.soldQty.toLocaleString('pt-BR')}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Vl Vendido</p>
                      <p className="text-sm font-mono text-slate-700 dark:text-slate-300">
                        {formatCurrency(p.soldValue)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Saldo</p>
                      <p className={`text-sm font-mono font-bold ${
                        p.netQty > 0 ? 'text-emerald-600 dark:text-emerald-400' : p.netQty < 0 ? 'text-red-600 dark:text-red-400' : 'text-slate-500'
                      }`}>
                        {p.netQty > 0 ? '+' : ''}{p.netQty.toLocaleString('pt-BR')}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">PM Compra</p>
                      <p className="text-sm font-mono text-slate-700 dark:text-slate-300">
                        {p.avgPurchasePrice != null ? formatCurrency(p.avgPurchasePrice) : '—'}
                      </p>
                    </div>
                    <div className="col-span-2">
                      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">PM Venda</p>
                      <p className="text-sm font-mono text-slate-700 dark:text-slate-300">
                        {p.avgSalePrice != null ? formatCurrency(p.avgSalePrice) : '—'}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </>
  );
}
