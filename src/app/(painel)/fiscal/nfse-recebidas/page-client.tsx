'use client';

import React, { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import dynamic from 'next/dynamic';
import Skeleton from '@/components/ui/Skeleton';
import RowActions from '@/components/ui/RowActions';
import MobileFilterWrapper from '@/components/ui/MobileFilterWrapper';
import type { Invoice } from '@/types';
import { formatCnpj, formatAmount, formatDate, formatTime, getDateGroupLabel } from '@/lib/utils';
import { useRole } from '@/hooks/useRole';

const InvoiceDetailsModal = dynamic(() => import('@/components/InvoiceDetailsModal'), { ssr: false });
const NfseDetailsModal = dynamic(() => import('@/components/NfseDetailsModal'), { ssr: false });

export default function NfseReceivedPage() {
  const { canWrite } = useRole();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [total, setTotal] = useState(0);
  const [sortBy, setSortBy] = useState('emission');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [dateFrom, setDateFrom] = useState(() => `${new Date().getFullYear()}-01-01`);
  const [dateTo, setDateTo] = useState('');
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [availableYears, setAvailableYears] = useState<number[]>([]);
  const [hideValues, setHideValues] = useState(false);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [detailsInvoiceId, setDetailsInvoiceId] = useState<string | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [collapsedInitialized, setCollapsedInitialized] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const toggleGroup = (group: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  };

  const selectYear = (year: number | null) => {
    const cy = new Date().getFullYear();
    if (year === null) { setDateFrom(`${cy}-01-01`); setDateTo(''); }
    else { setDateFrom(`${year}-01-01`); setDateTo(`${year}-12-31`); }
    setSelectedYear(year);
    setCollapsedInitialized(false);
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    void loadInvoices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, sortBy, sortOrder, dateFrom, dateTo]);

  useEffect(() => {
    const cy = new Date().getFullYear();
    Promise.all([cy - 1, cy - 2, cy - 3, cy - 4].map(y =>
      fetch(`/api/invoices?limit=1&page=1&type=NFSE&dateFrom=${y}-01-01&dateTo=${y}-12-31`)
        .then(r => r.ok ? r.json() : null)
        .then(d => (d?.pagination?.total ?? 0) > 0 ? y : null)
        .catch(() => null)
    )).then(res => setAvailableYears(res.filter((y): y is number => y !== null)));
  }, []);

  useEffect(() => {
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
    };
  }, []);

  async function loadInvoices() {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: '1',
        limit: '2000',
        type: 'NFSE',
        sort: sortBy,
        order: sortOrder,
      });
      if (search) params.set('search', search);
      if (dateFrom) params.set('dateFrom', dateFrom);
      if (dateTo) params.set('dateTo', dateTo);

      const res = await fetch(`/api/invoices?${params}`);
      if (!res.ok) {
        toast.error('Erro ao carregar NFS-e');
        return;
      }

      const data = await res.json();
      const loaded: Invoice[] = data.invoices || [];
      setInvoices(loaded);
      setTotal(data.pagination?.total || 0);
      if (!collapsedInitialized && loaded.length > 0) {
        const groups = Array.from(new Set(loaded.map(inv => getDateGroupLabel(inv.issueDate))));
        const toCollapse = new Set(groups.filter(g => g !== 'Hoje' && g !== 'Esta semana'));
        setCollapsedGroups(toCollapse);
        setCollapsedInitialized(true);
      }
    } catch {
      toast.error('Erro de conexão ao carregar NFS-e');
    } finally {
      setLoading(false);
    }
  }

  function handleSort(field: string) {
    if (sortBy === field) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortBy(field);
    setSortOrder('desc');
  }

  function openModal(id: string) {
    setSelectedInvoiceId(id);
    setIsModalOpen(true);
  }

  function openDetails(id: string) {
    setDetailsInvoiceId(id);
    setIsDetailsOpen(true);
  }

  async function handleSyncReceitaNfse() {
    if (syncing || !canWrite) return;

    setSyncing(true);
    setSyncMessage('Iniciando sincronização...');

    try {
      const res = await fetch('/api/nsdocs/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method: 'receita_nfse' }),
      });
      const data = await res.json();

      if (!res.ok || data.error || !data.syncLogId) {
        setSyncing(false);
        setSyncMessage('');
        toast.error(data.error || 'Erro ao iniciar sincronização NFS-e');
        return;
      }

      setSyncMessage('Sincronizando NFS-e via Receita...');
      let attempts = 0;
      const maxAttempts = 90;

      pollingRef.current = setInterval(async () => {
        attempts++;
        try {
          const pollRes = await fetch(`/api/nsdocs/sync?syncLogId=${data.syncLogId}`);
          const pollData = await pollRes.json();

          if (pollData.status === 'completed') {
            if (pollingRef.current) clearInterval(pollingRef.current);
            setSyncing(false);
            setSyncMessage('');
            toast.success(`Sincronização concluída: ${pollData.newDocs || 0} novo(s), ${pollData.updatedDocs || 0} atualizado(s).`);
            void loadInvoices();
            return;
          }

          if (pollData.status === 'error') {
            if (pollingRef.current) clearInterval(pollingRef.current);
            setSyncing(false);
            setSyncMessage('');
            toast.error(pollData.error || 'Erro na sincronização NFS-e');
            return;
          }

          if (attempts >= maxAttempts) {
            if (pollingRef.current) clearInterval(pollingRef.current);
            setSyncing(false);
            setSyncMessage('');
            toast.error('Timeout da sincronização NFS-e. Verifique o histórico em Sistema > Sincronizar.');
          }
        } catch {
          if (pollingRef.current) clearInterval(pollingRef.current);
          setSyncing(false);
          setSyncMessage('');
          toast.error('Erro de conexão durante a sincronização NFS-e');
        }
      }, 3000);
    } catch {
      setSyncing(false);
      setSyncMessage('');
      toast.error('Erro ao iniciar sincronização NFS-e');
    }
  }

  const val = (amount: number) => hideValues
    ? <span className="tracking-widest text-slate-300 dark:text-slate-600 select-none">••••</span>
    : <>{formatAmount(amount)}</>;

  const yearNavButtons = ([null, ...availableYears] as Array<number | null>).map((y) => (
    <button key={y ?? 'current'} onClick={() => selectYear(y)} className={`px-2.5 py-1 rounded-md text-xs font-bold transition-colors ${(y === null ? selectedYear === null : selectedYear === y) ? 'bg-primary text-white shadow-sm' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-700 dark:hover:text-slate-200'}`}>
      {y ?? new Date().getFullYear()}
    </button>
  ));

  function getSortIcon(field: string) {
    if (sortBy !== field) {
      return <span className="material-symbols-outlined text-[16px] text-slate-300 opacity-0 group-hover:opacity-50">unfold_more</span>;
    }
    return (
      <span className="material-symbols-outlined text-[16px] text-primary">
        {sortOrder === 'asc' ? 'expand_less' : 'expand_more'}
      </span>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="hidden sm:block min-w-0">
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">NFS-e</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">Notas de serviço recebidas e emitidas pela QLMED</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="text-xs text-slate-500 dark:text-slate-400 font-medium whitespace-nowrap">
            {total} documento(s)
          </div>
          <button
            onClick={() => setHideValues(v => !v)}
            className="hidden sm:flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-card-dark border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 transition-colors shadow-sm"
            title={hideValues ? 'Mostrar valores' : 'Ocultar valores'}
          >
            <span className="material-symbols-outlined text-[20px]">{hideValues ? 'visibility' : 'visibility_off'}</span>
          </button>
          <button
            onClick={handleSyncReceitaNfse}
            disabled={syncing || !canWrite}
            className="px-3 py-2 rounded-lg bg-primary text-white text-xs font-semibold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 whitespace-nowrap"
            title={canWrite ? 'Sincronizar NFS-e via Receita' : 'Sem permissão para sincronizar'}
          >
            <span className="material-symbols-outlined text-[16px]">
              {syncing ? 'sync' : 'cloud_sync'}
            </span>
            {syncing ? 'Sincronizando...' : 'Sincronizar NFS-e'}
          </button>
        </div>
      </div>

      {syncMessage ? (
        <div className="text-xs text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2">
          {syncMessage}
        </div>
      ) : null}

      <MobileFilterWrapper activeFilterCount={[search, dateFrom, dateTo].filter(Boolean).length}>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5">
          <div className="sm:col-span-2 md:col-span-2">
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Busca</label>
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Número, prestador, CNPJ ou chave"
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">De</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Até</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
        </div>
      </MobileFilterWrapper>

      {/* Mobile Cards */}
      <div className="sm:hidden space-y-2">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-white dark:bg-card-dark border border-slate-200 dark:border-slate-800 rounded-xl p-3 space-y-2">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-3 w-44" />
              <Skeleton className="h-3 w-24" />
            </div>
          ))
        ) : invoices.length === 0 ? (
          <div className="bg-white dark:bg-card-dark border border-slate-200 dark:border-slate-800 rounded-xl p-8 text-center text-slate-400">
            <span className="material-symbols-outlined text-[48px] opacity-30">receipt_long</span>
            <p className="mt-2 text-sm font-medium">Nenhuma NFS-e encontrada</p>
          </div>
        ) : (
          (() => {
            let lastGroup = '';
            return invoices.map((invoice, idx) => {
              const group = getDateGroupLabel(invoice.issueDate);
              const showDivider = group !== lastGroup;
              lastGroup = group;
              return (
                <React.Fragment key={`m-${invoice.id}-${idx}`}>
                  {showDivider && group && (
                    <div className="cursor-pointer select-none" onClick={() => toggleGroup(group)}>
                      <div className="flex items-center gap-2.5 px-2 py-2 bg-gradient-to-r from-slate-100 via-slate-100/70 to-transparent dark:from-slate-800/70 dark:via-slate-800/40 dark:to-transparent rounded-lg">
                        <span className="material-symbols-outlined text-[16px] text-slate-400 dark:text-slate-500 transition-transform duration-200" style={{ transform: collapsedGroups.has(group) ? 'rotate(-90deg)' : 'rotate(0deg)' }}>expand_more</span>
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">{group}</span>
                      </div>
                    </div>
                  )}
                  {!collapsedGroups.has(group) && (
                    <div onClick={() => openDetails(invoice.id)} className="bg-white dark:bg-card-dark border border-slate-200 dark:border-slate-800 rounded-xl p-3 cursor-pointer">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold text-slate-900 dark:text-white">{invoice.number || '-'}</span>
                        <span className="text-xs font-bold text-slate-900 dark:text-white">{formatDate(invoice.issueDate)}</span>
                      </div>
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-xs font-bold text-slate-900 dark:text-white truncate">{invoice.senderName || '-'}</p>
                        <span className="text-[10px] text-slate-400 shrink-0 ml-2">{formatTime(invoice.issueDate)}</span>
                      </div>
                      <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100 dark:border-slate-800" onClick={(e) => e.stopPropagation()}>
                        <span className="text-sm font-bold font-mono text-slate-900 dark:text-white">{val(invoice.totalValue)}</span>
                        <RowActions invoiceId={invoice.id} onView={openModal} onDetails={openDetails} onViewProducts={openDetails} />
                      </div>
                    </div>
                  )}
                </React.Fragment>
              );
            });
          })()
        )}
      </div>

      {/* Mobile Year Navigation */}
      <div className="sm:hidden flex items-center gap-1 pt-2 border-t border-slate-200 dark:border-slate-700">
        <span className="text-xs text-slate-400 mr-1">Ano:</span>
        {yearNavButtons}
      </div>

      {/* Desktop Table */}
      <div className="hidden sm:block bg-white dark:bg-card-dark rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1040px]">
            <thead className="bg-slate-50 dark:bg-slate-900/40 border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="px-2 py-2 w-px whitespace-nowrap text-left text-xs font-semibold text-slate-600 dark:text-slate-300">
                  <button onClick={() => handleSort('emission')} className="group inline-flex items-center gap-1">
                    Emissão {getSortIcon('emission')}
                  </button>
                </th>
                <th className="px-2 py-2 w-px whitespace-nowrap text-left text-xs font-semibold text-slate-600 dark:text-slate-300">
                  <button onClick={() => handleSort('number')} className="group inline-flex items-center gap-1">
                    Número {getSortIcon('number')}
                  </button>
                </th>
                <th className="px-2 py-2 w-px whitespace-nowrap text-right text-xs font-semibold text-slate-600 dark:text-slate-300">
                  <button onClick={() => handleSort('value')} className="group inline-flex items-center gap-1">
                    Valor {getSortIcon('value')}
                  </button>
                </th>
                <th className="px-2 py-2 text-left text-xs font-semibold text-slate-600 dark:text-slate-300">
                  Prestador
                </th>
                <th className="px-2 py-2 text-left text-xs font-semibold text-slate-600 dark:text-slate-300">
                  CNPJ Prestador
                </th>
                <th className="px-2 py-2 text-left text-xs font-semibold text-slate-600 dark:text-slate-300">
                  Cidade
                </th>
                <th className="px-2 py-2 text-center text-xs font-semibold text-slate-600 dark:text-slate-300">
                  Ações
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading ? (
                Array.from({ length: 8 }).map((_, index) => (
                  <tr key={`sk-${index}`}>
                    <td className="px-2 py-1.5"><Skeleton className="h-4 w-16" /></td>
                    <td className="px-2 py-1.5"><Skeleton className="h-4 w-12" /></td>
                    <td className="px-2 py-1.5"><Skeleton className="h-4 w-20 ml-auto" /></td>
                    <td className="px-2 py-1.5"><Skeleton className="h-4 w-56" /></td>
                    <td className="px-2 py-1.5"><Skeleton className="h-4 w-36" /></td>
                    <td className="px-2 py-1.5"><Skeleton className="h-4 w-28" /></td>
                    <td className="px-2 py-1.5"><Skeleton className="h-6 w-24 mx-auto" /></td>
                  </tr>
                ))
              ) : invoices.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-10 text-center text-sm text-slate-500 dark:text-slate-400">
                    Nenhuma NFS-e encontrada para os filtros informados.
                  </td>
                </tr>
              ) : (
                (() => {
                  let lastGroup = '';
                  return invoices.map((invoice) => {
                    const group = getDateGroupLabel(invoice.issueDate);
                    const showDivider = group !== lastGroup;
                    lastGroup = group;
                    return (
                      <React.Fragment key={invoice.id}>
                        {showDivider && (
                          <tr className="cursor-pointer select-none" onClick={() => toggleGroup(group)}>
                            <td colSpan={7} className="px-4 py-2 bg-slate-100/80 dark:bg-slate-800/60 border-y border-slate-200 dark:border-slate-700">
                              <div className="flex items-center gap-2">
                                <span className="material-symbols-outlined text-[16px] text-slate-400 transition-transform" style={{ transform: collapsedGroups.has(group) ? 'rotate(-90deg)' : 'rotate(0deg)' }}>expand_more</span>
                                <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{group}</span>
                              </div>
                            </td>
                          </tr>
                        )}
                        {!collapsedGroups.has(group) && (
                        <tr className="hover:bg-slate-50/70 dark:hover:bg-slate-900/20">
                          <td className="px-2 py-1.5 text-xs text-slate-700 dark:text-slate-300 whitespace-nowrap">
                            {formatDate(invoice.issueDate)}
                          </td>
                          <td className="px-2 py-1.5 text-xs font-semibold text-slate-800 dark:text-slate-100 whitespace-nowrap">
                            {invoice.number || '-'}
                          </td>
                          <td className="px-2 py-1.5 text-xs text-right font-semibold text-slate-800 dark:text-slate-100 whitespace-nowrap">
                            {val(invoice.totalValue)}
                          </td>
                          <td className="px-2 py-1.5 text-xs text-slate-800 dark:text-slate-100">
                            {invoice.senderName || '-'}
                          </td>
                          <td className="px-2 py-1.5 text-xs text-slate-600 dark:text-slate-400 font-mono">
                            {invoice.senderCnpj ? formatCnpj(invoice.senderCnpj.replace(/\D/g, '')) || invoice.senderCnpj : '-'}
                          </td>
                          <td className="px-2 py-1.5 text-xs text-slate-700 dark:text-slate-300">
                            {invoice.senderCity || '-'}
                          </td>
                          <td className="px-2 py-1.5">
                            <div className="flex justify-center">
                              <RowActions
                                invoiceId={invoice.id}
                                onView={openModal}
                                onDetails={openDetails}
                              />
                            </div>
                          </td>
                        </tr>
                        )}
                      </React.Fragment>
                    );
                  });
                })()
              )}
            </tbody>
          </table>
        </div>

        <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/30 dark:bg-slate-800/20">
          <div className="flex items-center gap-1">
            <span className="text-xs text-slate-400 mr-1.5">Ano:</span>
            {yearNavButtons}
          </div>
          <span className="text-xs text-slate-500">{total} documento(s)</span>
        </div>
      </div>

      {selectedInvoiceId && (
        <InvoiceDetailsModal
          invoiceId={selectedInvoiceId}
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
        />
      )}
      {detailsInvoiceId && (
        <NfseDetailsModal
          invoiceId={detailsInvoiceId}
          isOpen={isDetailsOpen}
          onClose={() => setIsDetailsOpen(false)}
        />
      )}
    </div>
  );
}
