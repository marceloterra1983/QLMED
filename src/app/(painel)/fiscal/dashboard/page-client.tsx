'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import Skeleton from '@/components/ui/Skeleton';

type Period = 'month' | 'quarter' | 'year';

interface DashboardTotals {
  icms: number;
  pis: number;
  cofins: number;
  ipi: number;
  frete: number;
  tribAprox: number;
  fcp: number;
  icmsSt: number;
  baseCalculo: number;
  descontos: number;
  invoiceCount: number;
}

interface MonthlyRow {
  year: number;
  month: number;
  icms: number;
  pis: number;
  cofins: number;
  ipi: number;
  frete: number;
  tribAprox: number;
  invoiceCount: number;
}

interface TopSupplier {
  name: string;
  cnpj: string;
  icms: number;
  pisCofins: number;
  ipi: number;
  invoiceCount: number;
}

interface CfopRow {
  cfop: string;
  direction: string;
  itemCount: number;
  totalValue: number;
  icms: number;
  pis: number;
  cofins: number;
  ipi: number;
}

function formatCurrency(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatCurrencyShort(value: number): string {
  if (value >= 1_000_000) return `R$ ${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `R$ ${(value / 1_000).toFixed(1)}k`;
  return formatCurrency(value);
}

const MONTH_NAMES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

function StatCard({ label, value, icon, color }: { label: string; value: number; icon: string; color: string }) {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color}`}>
          <span className="material-symbols-outlined text-[20px]">{icon}</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">{label}</p>
          <p className="text-lg font-bold text-slate-800 dark:text-slate-100 tabular-nums">{formatCurrencyShort(value)}</p>
        </div>
      </div>
    </div>
  );
}

export default function FiscalDashboardPage() {
  const [period, setPeriod] = useState<Period>('year');
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [loading, setLoading] = useState(true);
  const [totals, setTotals] = useState<DashboardTotals | null>(null);
  const [monthly, setMonthly] = useState<MonthlyRow[]>([]);
  const [topSuppliers, setTopSuppliers] = useState<TopSupplier[]>([]);
  const [cfopData, setCfopData] = useState<CfopRow[]>([]);
  const [cfopLoading, setCfopLoading] = useState(false);
  const [totalNfe, setTotalNfe] = useState(0);
  const [withTaxData, setWithTaxData] = useState(0);
  const [backfilling, setBackfilling] = useState(false);
  const [backfillProgress, setBackfillProgress] = useState('');

  useEffect(() => {
    loadDashboard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, year, month]);

  useEffect(() => {
    loadCfop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year]);

  const loadDashboard = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ period, year: String(year), month: String(month) });
      const res = await fetch(`/api/fiscal/dashboard?${params}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setTotals(data.totals);
      setMonthly(data.monthly || []);
      setTopSuppliers(data.topSuppliers || []);
      setTotalNfe(data.totalNfe ?? 0);
      setWithTaxData(data.withTaxData ?? 0);
    } catch {
      toast.error('Erro ao carregar dashboard fiscal');
    } finally {
      setLoading(false);
    }
  };

  const loadCfop = async () => {
    setCfopLoading(true);
    try {
      const res = await fetch(`/api/fiscal/by-cfop?year=${year}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setCfopData(data.byCfop || []);
    } catch {
      toast.error('Erro ao carregar dados por CFOP');
    } finally {
      setCfopLoading(false);
    }
  };

  const runBackfill = async () => {
    setBackfilling(true);
    let totalProcessed = 0;
    let totalErrors = 0;
    try {
      let remaining = 1; // start loop
      while (remaining > 0) {
        setBackfillProgress(`Processando... (${totalProcessed} concluidos)`);
        const res = await fetch('/api/invoices/backfill-tax', { method: 'POST' });
        if (!res.ok) throw new Error('Erro na requisicao');
        const data = await res.json();
        totalProcessed += data.processed || 0;
        totalErrors += data.errors || 0;
        remaining = data.remaining ?? 0;
        setWithTaxData(prev => prev + (data.processed || 0));
        setBackfillProgress(`Processando... (${totalProcessed} concluidos, ${remaining} restantes)`);
      }
      toast.success(`Backfill concluido: ${totalProcessed} notas processadas${totalErrors > 0 ? `, ${totalErrors} erros` : ''}`);
      // Reload dashboard data
      loadDashboard();
      loadCfop();
    } catch {
      toast.error('Erro durante o backfill');
    } finally {
      setBackfilling(false);
      setBackfillProgress('');
    }
  };

  const needsBackfill = totalNfe > 0 && withTaxData < totalNfe;
  const hasData = totals && totals.invoiceCount > 0;

  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="hidden sm:block min-w-0">
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Impostos</h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">Visão consolidada de impostos por período</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap flex-shrink-0">
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-medium text-slate-700 dark:text-slate-300"
          >
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          {period === 'month' && (
            <select
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
              className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-medium text-slate-700 dark:text-slate-300"
            >
              {MONTH_NAMES.map((name, i) => <option key={i} value={i + 1}>{name}</option>)}
            </select>
          )}
          <div className="flex rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
            {(['month', 'quarter', 'year'] as Period[]).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                  period === p
                    ? 'bg-primary text-white'
                    : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                {p === 'month' ? 'Mes' : p === 'quarter' ? 'Trimestre' : 'Ano'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Backfill Banner */}
      {!loading && needsBackfill && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-amber-600 dark:text-amber-400">sync</span>
            <div>
              <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                {withTaxData === 0
                  ? `${totalNfe.toLocaleString('pt-BR')} NF-e sem dados fiscais extraidos`
                  : `${(totalNfe - withTaxData).toLocaleString('pt-BR')} de ${totalNfe.toLocaleString('pt-BR')} NF-e ainda sem dados fiscais`
                }
              </p>
              {backfillProgress && (
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">{backfillProgress}</p>
              )}
              {!backfilling && withTaxData > 0 && (
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
                  {withTaxData.toLocaleString('pt-BR')} ja processadas ({Math.round(withTaxData / totalNfe * 100)}%)
                </p>
              )}
            </div>
          </div>
          <button
            onClick={runBackfill}
            disabled={backfilling}
            className="w-full sm:w-auto px-4 py-2 rounded-xl text-sm font-bold bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
          >
            {backfilling ? 'Processando...' : 'Extrair Dados Fiscais'}
          </button>
        </div>
      )}

      {/* Stat Cards */}
      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4">
              <Skeleton className="h-10 w-10 rounded-xl mb-2" />
              <Skeleton className="h-3 w-16 mb-1" />
              <Skeleton className="h-6 w-24" />
            </div>
          ))}
        </div>
      ) : hasData ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <StatCard label="ICMS" value={totals.icms} icon="account_balance" color="bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400" />
          <StatCard label="PIS" value={totals.pis} icon="receipt_long" color="bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400" />
          <StatCard label="COFINS" value={totals.cofins} icon="receipt" color="bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400" />
          <StatCard label="IPI" value={totals.ipi} icon="factory" color="bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400" />
          <StatCard label="Frete" value={totals.frete} icon="local_shipping" color="bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400" />
          <StatCard label="Trib. Aprox." value={totals.tribAprox} icon="calculate" color="bg-rose-100 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400" />
        </div>
      ) : !needsBackfill ? (
        <div className="text-center py-12 text-slate-400">Sem dados fiscais para o periodo selecionado.</div>
      ) : null}

      {/* Monthly Table */}
      {!loading && monthly.length > 0 && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
          <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-800">
            <h2 className="text-sm font-bold text-slate-700 dark:text-slate-300">Impostos por Mes</h2>
          </div>
          {/* Mobile Cards */}
          <div className="sm:hidden p-3 space-y-1.5">
            {monthly.map((row) => (
              <div key={`m-${row.year}-${row.month}`} className="rounded-lg border border-slate-200 dark:border-slate-800 p-2.5">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm font-bold text-slate-700 dark:text-slate-300">{MONTH_NAMES[row.month - 1]} {row.year}</span>
                  <span className="text-xs font-mono text-slate-400">{row.invoiceCount} NF-e</span>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs">
                  <div className="flex justify-between"><span className="text-slate-400">ICMS</span><span className="tabular-nums text-slate-600 dark:text-slate-400">{formatCurrencyShort(row.icms)}</span></div>
                  <div className="flex justify-between"><span className="text-slate-400">PIS</span><span className="tabular-nums text-slate-600 dark:text-slate-400">{formatCurrencyShort(row.pis)}</span></div>
                  <div className="flex justify-between"><span className="text-slate-400">COFINS</span><span className="tabular-nums text-slate-600 dark:text-slate-400">{formatCurrencyShort(row.cofins)}</span></div>
                  <div className="flex justify-between"><span className="text-slate-400">IPI</span><span className="tabular-nums text-slate-600 dark:text-slate-400">{formatCurrencyShort(row.ipi)}</span></div>
                  <div className="flex justify-between"><span className="text-slate-400">Frete</span><span className="tabular-nums text-slate-600 dark:text-slate-400">{formatCurrencyShort(row.frete)}</span></div>
                </div>
              </div>
            ))}
          </div>
          {/* Desktop Table */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/50">
                <tr>
                  <th className="px-4 py-2 text-left text-[10px] font-bold text-slate-400 uppercase">Mes</th>
                  <th className="px-4 py-2 text-right text-[10px] font-bold text-slate-400 uppercase">ICMS</th>
                  <th className="px-4 py-2 text-right text-[10px] font-bold text-slate-400 uppercase">PIS</th>
                  <th className="px-4 py-2 text-right text-[10px] font-bold text-slate-400 uppercase">COFINS</th>
                  <th className="px-4 py-2 text-right text-[10px] font-bold text-slate-400 uppercase">IPI</th>
                  <th className="px-4 py-2 text-right text-[10px] font-bold text-slate-400 uppercase">Frete</th>
                  <th className="px-4 py-2 text-right text-[10px] font-bold text-slate-400 uppercase">NF-e</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {monthly.map((row) => (
                  <tr key={`${row.year}-${row.month}`} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="px-4 py-2 font-medium text-slate-700 dark:text-slate-300">{MONTH_NAMES[row.month - 1]} {row.year}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-slate-600 dark:text-slate-400">{formatCurrency(row.icms)}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-slate-600 dark:text-slate-400">{formatCurrency(row.pis)}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-slate-600 dark:text-slate-400">{formatCurrency(row.cofins)}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-slate-600 dark:text-slate-400">{formatCurrency(row.ipi)}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-slate-600 dark:text-slate-400">{formatCurrency(row.frete)}</td>
                    <td className="px-4 py-2 text-right font-mono text-slate-500">{row.invoiceCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* CFOP Table */}
      {!cfopLoading && cfopData.length > 0 && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
          <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-800">
            <h2 className="text-sm font-bold text-slate-700 dark:text-slate-300">Por CFOP</h2>
          </div>
          {/* Mobile Cards */}
          <div className="sm:hidden p-3 space-y-1.5">
            {cfopData.map((row) => (
              <div key={`c-${row.cfop}`} className="rounded-lg border border-slate-200 dark:border-slate-800 p-2.5">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-sm text-slate-700 dark:text-slate-300">{row.cfop}</span>
                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                      row.direction === 'entrada'
                        ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                        : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                    }`}>
                      {row.direction === 'entrada' ? 'Entrada' : 'Saida'}
                    </span>
                  </div>
                  <span className="text-xs font-mono text-slate-400">{row.itemCount} itens</span>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs">
                  <div className="flex justify-between"><span className="text-slate-400">Total</span><span className="tabular-nums text-slate-600 dark:text-slate-400">{formatCurrencyShort(row.totalValue)}</span></div>
                  <div className="flex justify-between"><span className="text-slate-400">ICMS</span><span className="tabular-nums text-slate-600 dark:text-slate-400">{formatCurrencyShort(row.icms)}</span></div>
                  <div className="flex justify-between"><span className="text-slate-400">PIS</span><span className="tabular-nums text-slate-600 dark:text-slate-400">{formatCurrencyShort(row.pis)}</span></div>
                  <div className="flex justify-between"><span className="text-slate-400">COFINS</span><span className="tabular-nums text-slate-600 dark:text-slate-400">{formatCurrencyShort(row.cofins)}</span></div>
                </div>
              </div>
            ))}
          </div>
          {/* Desktop Table */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/50">
                <tr>
                  <th className="px-4 py-2 text-left text-[10px] font-bold text-slate-400 uppercase">CFOP</th>
                  <th className="px-4 py-2 text-left text-[10px] font-bold text-slate-400 uppercase">Direcao</th>
                  <th className="px-4 py-2 text-right text-[10px] font-bold text-slate-400 uppercase">Itens</th>
                  <th className="px-4 py-2 text-right text-[10px] font-bold text-slate-400 uppercase">Valor Total</th>
                  <th className="px-4 py-2 text-right text-[10px] font-bold text-slate-400 uppercase">ICMS</th>
                  <th className="px-4 py-2 text-right text-[10px] font-bold text-slate-400 uppercase">PIS</th>
                  <th className="px-4 py-2 text-right text-[10px] font-bold text-slate-400 uppercase">COFINS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {cfopData.map((row) => (
                  <tr key={row.cfop} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="px-4 py-2 font-mono font-bold text-slate-700 dark:text-slate-300">{row.cfop}</td>
                    <td className="px-4 py-2">
                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                        row.direction === 'entrada'
                          ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                          : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                      }`}>
                        {row.direction === 'entrada' ? 'Entrada' : 'Saida'}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-slate-500">{row.itemCount}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-slate-600 dark:text-slate-400">{formatCurrency(row.totalValue)}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-slate-600 dark:text-slate-400">{formatCurrency(row.icms)}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-slate-600 dark:text-slate-400">{formatCurrency(row.pis)}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-slate-600 dark:text-slate-400">{formatCurrency(row.cofins)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Top Suppliers */}
      {!loading && topSuppliers.length > 0 && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
          <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-800">
            <h2 className="text-sm font-bold text-slate-700 dark:text-slate-300">Top 10 Fornecedores por Imposto</h2>
          </div>
          {/* Mobile Cards */}
          <div className="sm:hidden p-3 space-y-1.5">
            {topSuppliers.map((s, i) => (
              <div key={`s-${i}`} className="rounded-lg border border-slate-200 dark:border-slate-800 p-2.5">
                <div className="flex items-start justify-between mb-1.5">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-sm text-slate-700 dark:text-slate-300 truncate">{s.name || 'N/A'}</div>
                    <div className="text-[10px] font-mono text-slate-400">{s.cnpj}</div>
                  </div>
                  <span className="text-xs font-mono text-slate-400 ml-2 shrink-0">{s.invoiceCount} NF-e</span>
                </div>
                <div className="grid grid-cols-3 gap-x-2 text-xs">
                  <div><span className="text-slate-400 block text-[10px]">ICMS</span><span className="tabular-nums text-slate-600 dark:text-slate-400">{formatCurrencyShort(s.icms)}</span></div>
                  <div><span className="text-slate-400 block text-[10px]">PIS+COF</span><span className="tabular-nums text-slate-600 dark:text-slate-400">{formatCurrencyShort(s.pisCofins)}</span></div>
                  <div><span className="text-slate-400 block text-[10px]">IPI</span><span className="tabular-nums text-slate-600 dark:text-slate-400">{formatCurrencyShort(s.ipi)}</span></div>
                </div>
              </div>
            ))}
          </div>
          {/* Desktop Table */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/50">
                <tr>
                  <th className="px-4 py-2 text-left text-[10px] font-bold text-slate-400 uppercase">Fornecedor</th>
                  <th className="px-4 py-2 text-right text-[10px] font-bold text-slate-400 uppercase">ICMS</th>
                  <th className="px-4 py-2 text-right text-[10px] font-bold text-slate-400 uppercase">PIS+COFINS</th>
                  <th className="px-4 py-2 text-right text-[10px] font-bold text-slate-400 uppercase">IPI</th>
                  <th className="px-4 py-2 text-right text-[10px] font-bold text-slate-400 uppercase">NF-e</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {topSuppliers.map((s, i) => (
                  <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="px-4 py-2">
                      <div className="font-medium text-slate-700 dark:text-slate-300 text-[13px]">{s.name || 'N/A'}</div>
                      <div className="text-[10px] font-mono text-slate-400">{s.cnpj}</div>
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-slate-600 dark:text-slate-400">{formatCurrency(s.icms)}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-slate-600 dark:text-slate-400">{formatCurrency(s.pisCofins)}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-slate-600 dark:text-slate-400">{formatCurrency(s.ipi)}</td>
                    <td className="px-4 py-2 text-right font-mono text-slate-500">{s.invoiceCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
