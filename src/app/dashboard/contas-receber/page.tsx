'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import Skeleton from '@/components/ui/Skeleton';
import { formatCnpj, formatCurrency, formatDate } from '@/lib/utils';

interface Duplicata {
  invoiceId: string;
  accessKey: string;
  nfNumero: string;
  clienteCnpj: string;
  clienteNome: string;
  nfEmissao: string;
  nfValorTotal: number;
  faturaNumero: string;
  faturaValorOriginal: number;
  faturaValorLiquido: number;
  dupNumero: string;
  dupVencimento: string;
  dupValor: number;
  status: 'overdue' | 'due_today' | 'due_soon' | 'upcoming';
  diasAtraso: number;
  diasParaVencer: number;
}

interface Summary {
  total: number;
  totalValor: number;
  vencidas: number;
  vencidasValor: number;
  venceHoje: number;
  venceHojeValor: number;
  aVencer: number;
  aVencerValor: number;
}

const statusConfig: Record<string, { label: string; classes: string; icon: string }> = {
  overdue: {
    label: 'Vencida',
    classes: 'text-red-600 bg-red-50 border-red-200 dark:text-red-400 dark:bg-red-900/30 dark:border-red-800',
    icon: 'error',
  },
  due_today: {
    label: 'Vence Hoje',
    classes: 'text-amber-600 bg-amber-50 border-amber-200 dark:text-amber-400 dark:bg-amber-900/30 dark:border-amber-800',
    icon: 'schedule',
  },
  due_soon: {
    label: 'Próxima',
    classes: 'text-orange-600 bg-orange-50 border-orange-200 dark:text-orange-400 dark:bg-orange-900/30 dark:border-orange-800',
    icon: 'upcoming',
  },
  upcoming: {
    label: 'A Vencer',
    classes: 'text-emerald-600 bg-emerald-50 border-emerald-200 dark:text-emerald-400 dark:bg-emerald-900/30 dark:border-emerald-800',
    icon: 'check_circle',
  },
};

export default function ContasReceberPage() {
  const [duplicatas, setDuplicatas] = useState<Duplicata[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [limit, setLimit] = useState(20);
  const [sortBy, setSortBy] = useState('vencimento');
  const [sortOrder, setSortOrder] = useState('asc');

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    loadData();
  }, [page, limit, search, statusFilter, dateFrom, dateTo, sortBy, sortOrder]);

  const loadData = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
        sort: sortBy,
        order: sortOrder,
      });
      if (search) params.set('search', search);
      if (statusFilter) params.set('status', statusFilter);
      if (dateFrom) params.set('dateFrom', dateFrom);
      if (dateTo) params.set('dateTo', dateTo);

      const res = await fetch(`/api/financeiro/contas-receber?${params}`);
      if (!res.ok) throw new Error('Erro ao carregar dados');
      const data = await res.json();
      setDuplicatas(data.duplicatas);
      setSummary(data.summary);
      setTotal(data.pagination.total);
      setTotalPages(data.pagination.pages);
    } catch {
      toast.error('Erro ao carregar contas a receber');
    } finally {
      setLoading(false);
    }
  };

  const handleSort = (col: string) => {
    if (sortBy === col) {
      setSortOrder(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(col);
      setSortOrder('asc');
    }
    setPage(1);
  };

  const handleExport = () => {
    const headers = ['Cliente', 'CNPJ', 'NF-e', 'Fatura', 'Duplicata', 'Vencimento', 'Valor', 'Status'];
    const rows = duplicatas.map(d => [
      d.clienteNome,
      d.clienteCnpj,
      d.nfNumero,
      d.faturaNumero,
      d.dupNumero,
      formatDate(d.dupVencimento + 'T00:00:00'),
      d.dupValor.toFixed(2).replace('.', ','),
      statusConfig[d.status]?.label || d.status,
    ]);
    const csvContent = '\uFEFF' + [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `contas-receber-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success('CSV exportado com sucesso!');
  };

  const SortIcon = ({ col }: { col: string }) => (
    <span className={`material-symbols-outlined text-[14px] ml-0.5 ${sortBy === col ? 'text-primary' : 'text-slate-300 dark:text-slate-600'}`}>
      {sortBy === col && sortOrder === 'desc' ? 'arrow_downward' : 'arrow_upward'}
    </span>
  );

  const formatVencimento = (dateStr: string) => {
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('pt-BR');
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Contas a Receber</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Duplicatas das NF-e emitidas
          </p>
        </div>
        <button
          onClick={handleExport}
          disabled={duplicatas.length === 0}
          className="hidden sm:flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
        >
          <span className="material-symbols-outlined text-[18px]">download</span>
          Exportar CSV
        </button>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="bg-white dark:bg-card-dark rounded-xl border border-slate-200 dark:border-slate-700 p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center">
                <span className="material-symbols-outlined text-blue-600 dark:text-blue-400 text-[20px]">request_quote</span>
              </div>
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400">Total</p>
                <p className="text-lg font-bold text-slate-900 dark:text-white">{formatCurrency(summary.totalValor)}</p>
                <p className="text-xs text-slate-400">{summary.total} duplicata{summary.total !== 1 ? 's' : ''}</p>
              </div>
            </div>
          </div>

          <div
            className="bg-white dark:bg-card-dark rounded-xl border border-slate-200 dark:border-slate-700 p-4 cursor-pointer hover:border-red-300 dark:hover:border-red-700 transition-colors"
            onClick={() => { setStatusFilter(statusFilter === 'overdue' ? '' : 'overdue'); setPage(1); }}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-red-50 dark:bg-red-900/30 flex items-center justify-center">
                <span className="material-symbols-outlined text-red-600 dark:text-red-400 text-[20px]">warning</span>
              </div>
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400">Vencidas</p>
                <p className="text-lg font-bold text-red-600 dark:text-red-400">{formatCurrency(summary.vencidasValor)}</p>
                <p className="text-xs text-slate-400">{summary.vencidas} duplicata{summary.vencidas !== 1 ? 's' : ''}</p>
              </div>
            </div>
          </div>

          <div
            className="bg-white dark:bg-card-dark rounded-xl border border-slate-200 dark:border-slate-700 p-4 cursor-pointer hover:border-amber-300 dark:hover:border-amber-700 transition-colors"
            onClick={() => { setStatusFilter(statusFilter === 'due_today' ? '' : 'due_today'); setPage(1); }}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-amber-50 dark:bg-amber-900/30 flex items-center justify-center">
                <span className="material-symbols-outlined text-amber-600 dark:text-amber-400 text-[20px]">schedule</span>
              </div>
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400">Vence Hoje</p>
                <p className="text-lg font-bold text-amber-600 dark:text-amber-400">{formatCurrency(summary.venceHojeValor)}</p>
                <p className="text-xs text-slate-400">{summary.venceHoje} duplicata{summary.venceHoje !== 1 ? 's' : ''}</p>
              </div>
            </div>
          </div>

          <div
            className="bg-white dark:bg-card-dark rounded-xl border border-slate-200 dark:border-slate-700 p-4 cursor-pointer hover:border-emerald-300 dark:hover:border-emerald-700 transition-colors"
            onClick={() => { setStatusFilter(statusFilter === 'upcoming' ? '' : 'upcoming'); setPage(1); }}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-emerald-50 dark:bg-emerald-900/30 flex items-center justify-center">
                <span className="material-symbols-outlined text-emerald-600 dark:text-emerald-400 text-[20px]">event_available</span>
              </div>
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400">A Receber</p>
                <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{formatCurrency(summary.aVencerValor)}</p>
                <p className="text-xs text-slate-400">{summary.aVencer} duplicata{summary.aVencer !== 1 ? 's' : ''}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white dark:bg-card-dark rounded-xl border border-slate-200 dark:border-slate-700 p-4 mb-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[20px]">search</span>
            <input
              type="text"
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              placeholder="Buscar por cliente, CNPJ, NF-e..."
              className="w-full pl-10 pr-4 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
            />
          </div>

          <select
            value={statusFilter}
            onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
            className="px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
          >
            <option value="">Todos os status</option>
            <option value="overdue">Vencidas</option>
            <option value="due_today">Vence Hoje</option>
            <option value="due_soon">Próximas (7 dias)</option>
            <option value="upcoming">A Receber</option>
          </select>

          <input
            type="date"
            value={dateFrom}
            onChange={e => { setDateFrom(e.target.value); setPage(1); }}
            className="px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
            title="Vencimento a partir de"
          />
          <input
            type="date"
            value={dateTo}
            onChange={e => { setDateTo(e.target.value); setPage(1); }}
            className="px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
            title="Vencimento até"
          />

          {(search || statusFilter || dateFrom || dateTo) && (
            <button
              onClick={() => { setSearchInput(''); setSearch(''); setStatusFilter(''); setDateFrom(''); setDateTo(''); setPage(1); }}
              className="px-3 py-2 text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-white border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
            >
              <span className="material-symbols-outlined text-[18px]">filter_alt_off</span>
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-card-dark rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-12 rounded-lg" />
            ))}
          </div>
        ) : duplicatas.length === 0 ? (
          <div className="p-12 text-center">
            <span className="material-symbols-outlined text-[48px] text-slate-300 dark:text-slate-600">request_quote</span>
            <p className="mt-4 text-slate-500 dark:text-slate-400">
              {search || statusFilter || dateFrom || dateTo
                ? 'Nenhuma duplicata encontrada com os filtros aplicados.'
                : 'Nenhuma duplicata encontrada nas NF-e emitidas.'}
            </p>
          </div>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
                    <th
                      className="text-left px-4 py-3 font-semibold text-slate-500 dark:text-slate-400 cursor-pointer hover:text-primary select-none"
                      onClick={() => handleSort('cliente')}
                    >
                      <div className="flex items-center">Cliente <SortIcon col="cliente" /></div>
                    </th>
                    <th
                      className="text-left px-4 py-3 font-semibold text-slate-500 dark:text-slate-400 cursor-pointer hover:text-primary select-none"
                      onClick={() => handleSort('nfNumero')}
                    >
                      <div className="flex items-center">NF-e <SortIcon col="nfNumero" /></div>
                    </th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-500 dark:text-slate-400">
                      Parcela
                    </th>
                    <th
                      className="text-left px-4 py-3 font-semibold text-slate-500 dark:text-slate-400 cursor-pointer hover:text-primary select-none"
                      onClick={() => handleSort('vencimento')}
                    >
                      <div className="flex items-center">Vencimento <SortIcon col="vencimento" /></div>
                    </th>
                    <th
                      className="text-right px-4 py-3 font-semibold text-slate-500 dark:text-slate-400 cursor-pointer hover:text-primary select-none"
                      onClick={() => handleSort('valor')}
                    >
                      <div className="flex items-center justify-end">Valor <SortIcon col="valor" /></div>
                    </th>
                    <th
                      className="text-center px-4 py-3 font-semibold text-slate-500 dark:text-slate-400 cursor-pointer hover:text-primary select-none"
                      onClick={() => handleSort('status')}
                    >
                      <div className="flex items-center justify-center">Status <SortIcon col="status" /></div>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {duplicatas.map((dup, idx) => {
                    const cfg = statusConfig[dup.status];
                    return (
                      <tr
                        key={`${dup.invoiceId}-${dup.dupNumero}-${idx}`}
                        className={`border-b border-slate-50 dark:border-slate-800/50 hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-colors ${
                          dup.status === 'overdue' ? 'bg-red-50/30 dark:bg-red-900/5' : ''
                        }`}
                      >
                        <td className="px-4 py-3">
                          <div>
                            <p className="font-medium text-slate-900 dark:text-white truncate max-w-[250px]" title={dup.clienteNome}>
                              {dup.clienteNome}
                            </p>
                            <p className="text-xs text-slate-400">{formatCnpj(dup.clienteCnpj)}</p>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-mono text-slate-700 dark:text-slate-300">{dup.nfNumero}</p>
                          {dup.faturaNumero && (
                            <p className="text-xs text-slate-400">Fat. {dup.faturaNumero}</p>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-mono text-slate-600 dark:text-slate-400">{dup.dupNumero}</span>
                        </td>
                        <td className="px-4 py-3">
                          <p className={`font-medium ${dup.status === 'overdue' ? 'text-red-600 dark:text-red-400' : 'text-slate-700 dark:text-slate-300'}`}>
                            {formatVencimento(dup.dupVencimento)}
                          </p>
                          {dup.status === 'overdue' && (
                            <p className="text-xs text-red-500">{dup.diasAtraso} dia{dup.diasAtraso !== 1 ? 's' : ''} em atraso</p>
                          )}
                          {dup.status === 'due_soon' && (
                            <p className="text-xs text-orange-500">em {dup.diasParaVencer} dia{dup.diasParaVencer !== 1 ? 's' : ''}</p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="font-bold text-slate-900 dark:text-white">
                            {formatCurrency(dup.dupValor)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-semibold rounded-full border ${cfg.classes}`}>
                            <span className="material-symbols-outlined text-[12px]">{cfg.icon}</span>
                            {cfg.label}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards */}
            <div className="lg:hidden divide-y divide-slate-100 dark:divide-slate-800">
              {duplicatas.map((dup, idx) => {
                const cfg = statusConfig[dup.status];
                return (
                  <div
                    key={`m-${dup.invoiceId}-${dup.dupNumero}-${idx}`}
                    className={`p-4 ${dup.status === 'overdue' ? 'bg-red-50/30 dark:bg-red-900/5' : ''}`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-slate-900 dark:text-white truncate">{dup.clienteNome}</p>
                        <p className="text-xs text-slate-400">{formatCnpj(dup.clienteCnpj)}</p>
                      </div>
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-semibold rounded-full border ${cfg.classes} ml-2 flex-shrink-0`}>
                        <span className="material-symbols-outlined text-[12px]">{cfg.icon}</span>
                        {cfg.label}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div>
                        <p className="text-slate-400">NF-e</p>
                        <p className="font-mono text-slate-700 dark:text-slate-300">{dup.nfNumero}</p>
                      </div>
                      <div>
                        <p className="text-slate-400">Parcela</p>
                        <p className="font-mono text-slate-700 dark:text-slate-300">{dup.dupNumero}</p>
                      </div>
                      <div>
                        <p className="text-slate-400">Vencimento</p>
                        <p className={`font-medium ${dup.status === 'overdue' ? 'text-red-600 dark:text-red-400' : 'text-slate-700 dark:text-slate-300'}`}>
                          {formatVencimento(dup.dupVencimento)}
                        </p>
                      </div>
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-lg font-bold text-slate-900 dark:text-white">{formatCurrency(dup.dupValor)}</span>
                      {dup.status === 'overdue' && (
                        <span className="text-xs text-red-500">{dup.diasAtraso} dia{dup.diasAtraso !== 1 ? 's' : ''} em atraso</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/30 dark:bg-slate-800/20">
              <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                <span>Mostrando {((page - 1) * limit) + 1}-{Math.min(page * limit, total)} de {total}</span>
                <select
                  value={limit}
                  onChange={e => { setLimit(Number(e.target.value)); setPage(1); }}
                  className="ml-2 px-2 py-1 text-xs border border-slate-200 dark:border-slate-700 rounded bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300"
                >
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage(1)}
                  disabled={page === 1}
                  className="p-1.5 rounded text-slate-500 hover:text-primary hover:bg-primary/10 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-500 transition-colors"
                >
                  <span className="material-symbols-outlined text-[18px]">first_page</span>
                </button>
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="p-1.5 rounded text-slate-500 hover:text-primary hover:bg-primary/10 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-500 transition-colors"
                >
                  <span className="material-symbols-outlined text-[18px]">chevron_left</span>
                </button>
                <span className="px-3 py-1 text-sm font-medium text-slate-700 dark:text-slate-300">
                  {page} / {totalPages}
                </span>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="p-1.5 rounded text-slate-500 hover:text-primary hover:bg-primary/10 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-500 transition-colors"
                >
                  <span className="material-symbols-outlined text-[18px]">chevron_right</span>
                </button>
                <button
                  onClick={() => setPage(totalPages)}
                  disabled={page === totalPages}
                  className="p-1.5 rounded text-slate-500 hover:text-primary hover:bg-primary/10 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-500 transition-colors"
                >
                  <span className="material-symbols-outlined text-[18px]">last_page</span>
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
