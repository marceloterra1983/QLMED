'use client';

import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import dynamic from 'next/dynamic';
import Skeleton from '@/components/ui/Skeleton';
const CustomerDetailsModal = dynamic(() => import('@/components/CustomerDetailsModal'), { ssr: false });
const CustomerPriceTableModal = dynamic(() => import('@/components/CustomerPriceTableModal'), { ssr: false });
import { formatCnpj, formatDate, getDateGroupLabel } from '@/lib/utils';
import MobileFilterWrapper from '@/components/ui/MobileFilterWrapper';

interface Customer {
  cnpj: string;
  name: string;
  shortName: string | null;
  invoiceCount: number;
  priceItemCount: number | null;
  city: string | null;
  lastIssueDate: string | null;
}

function formatDocument(document: string) {
  const digits = (document || '').replace(/\D/g, '');
  if (digits.length === 14) return formatCnpj(digits);
  if (digits.length === 11) {
    return digits
      .replace(/^(\d{3})(\d)/, '$1.$2')
      .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/\.(\d{3})(\d)/, '.$1-$2');
  }
  return document || 'Sem documento';
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [limit, setLimit] = useState(50);
  const [sortBy, setSortBy] = useState('lastIssue');
  const [sortOrder, setSortOrder] = useState('desc');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [selectedPriceCustomer, setSelectedPriceCustomer] = useState<Customer | null>(null);
  const [isPriceTableOpen, setIsPriceTableOpen] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [cnpjStatus, setCnpjStatus] = useState<Map<string, string>>(new Map());
  const [cnpjChanges, setCnpjChanges] = useState(0);

  const toggleGroup = (group: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    loadCustomers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, limit, search, sortBy, sortOrder]);

  useEffect(() => {
    fetch('/api/contacts/cnpj-monitor')
      .then((r) => r.json())
      .then((data) => setCnpjChanges(data.changes?.length || 0))
      .catch(() => {});
  }, []);

  const loadCustomers = async () => {
    setLoading(true);
    try {
      const effectiveLimit = sortBy === 'city' ? 300 : limit;
      const params = new URLSearchParams({
        page: String(page),
        limit: String(effectiveLimit),
        sort: sortBy,
        order: sortOrder,
      });
      if (search) params.set('search', search);

      const res = await fetch(`/api/customers?${params}`);
      if (!res.ok) {
        throw new Error('Falha ao carregar clientes');
      }

      const data = await res.json();
      const custs: Customer[] = data.customers || [];
      setCustomers(custs);
      setTotalPages(data.pagination?.pages || 1);
      setTotal(data.pagination?.total || 0);
      if (data.pagination?.page && data.pagination.page !== page) {
        setPage(data.pagination.page);
      }

      // Fetch CNPJ status in background
      const cnpjs = custs
        .map((c) => c.cnpj?.replace(/\D/g, ''))
        .filter((c) => c && c.length >= 11);
      if (cnpjs.length > 0) {
        fetch(`/api/contacts/cnpj-status?cnpjs=${cnpjs.join(',')}`)
          .then((r) => r.json())
          .then((statuses: Array<{ cnpj: string; status: string | null }>) => {
            const map = new Map<string, string>();
            for (const s of statuses) {
              if (s.status) map.set(s.cnpj, s.status);
            }
            setCnpjStatus(map);
          })
          .catch(() => {});
      }
    } catch {
      toast.error('Erro ao carregar cadastro de clientes');
    } finally {
      setLoading(false);
    }
  };

  const handleSort = (field: string) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
      return;
    }

    setPage(1);
    setSortBy(field);
    if (field === 'name' || field === 'city') {
      setSortOrder('asc');
    } else {
      setSortOrder('desc');
    }
  };

  const getSortIcon = (field: string) => {
    if (sortBy !== field) {
      return (
        <span className="material-symbols-outlined text-[16px] text-slate-300 opacity-0 group-hover:opacity-50">
          unfold_more
        </span>
      );
    }

    return (
      <span className="material-symbols-outlined text-[16px] text-primary">
        {sortOrder === 'asc' ? 'expand_less' : 'expand_more'}
      </span>
    );
  };

  const clearFilters = () => {
    setSearchInput('');
    setSearch('');
    setSortBy('lastIssue');
    setSortOrder('desc');
    setPage(1);
  };

  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
    if (isExporting) return;
    setIsExporting(true);
    const toastId = toast.loading('Exportando clientes...');
    try {
      const res = await fetch('/api/customers?exportAll=1&sort=name&order=asc');
      if (!res.ok) throw new Error();
      const data = await res.json();
      const all: any[] = data.customers || [];
      if (all.length === 0) { toast.dismiss(toastId); toast.info('Nenhum cliente para exportar'); return; }

      const esc = (v: string | null | undefined) => {
        const s = v || '';
        return s.includes(';') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
      };
      const fmtCur = (v: number | null | undefined) => v != null ? v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '';
      const fmtAddr = (e: any) => {
        if (!e) return '';
        return [e.logradouro, e.numero, e.bairro, e.municipio, e.uf, e.cep].filter(Boolean).join(', ');
      };

      const headers = [
        'Cliente', 'Nome Abreviado', 'CNPJ/CPF', 'Cidade',
        'NF-e Emitidas', 'Total Vendido', 'Primeira NF-e', 'Última NF-e', 'Itens Tab. Preço',
        'Razão Social (Receita)', 'Nome Fantasia', 'Situação Cadastral',
        'CNAE Principal', 'Porte', 'Natureza Jurídica',
        'Simples Nacional', 'MEI', 'Capital Social',
        'Telefone (Receita)', 'Email (Receita)', 'Endereço (Receita)',
        'Telefone (Editado)', 'Email (Editado)', 'Endereço (Editado)',
      ];
      const rows = all.map((c: any) => {
        const r = c.receita || {};
        const o = c.override || {};
        const ovrAddr = [o.street, o.number, o.complement, o.district, o.city, o.state, o.zipCode].filter(Boolean).join(', ');
        return [
          esc(c.name), esc(c.shortName), formatDocument(c.cnpj), esc(c.city),
          String(c.invoiceCount || 0), fmtCur(c.totalValue),
          c.firstIssueDate ? formatDate(c.firstIssueDate) : '', c.lastIssueDate ? formatDate(c.lastIssueDate) : '',
          c.priceItemCount != null ? String(c.priceItemCount) : '',
          esc(r.razaoSocial), esc(r.nomeFantasia), esc(r.situacao),
          esc(r.cnaePrincipal), esc(r.porte), esc(r.naturezaJuridica),
          r.simplesNacional === true ? 'Sim' : r.simplesNacional === false ? 'Não' : '',
          r.mei === true ? 'Sim' : r.mei === false ? 'Não' : '',
          r.capitalSocial != null ? fmtCur(r.capitalSocial) : '',
          esc(r.telefone), esc(r.email), esc(fmtAddr(r.endereco)),
          esc(o.phone), esc(o.email), esc(ovrAddr),
        ];
      });

      const csv = '\uFEFF' + [headers.join(';'), ...rows.map((r: any) => r.join(';'))].join('\n');
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
      const a = document.createElement('a');
      a.href = url; a.download = `clientes-${new Date().toISOString().split('T')[0]}.csv`; a.click();
      URL.revokeObjectURL(url);
      toast.success(`${all.length.toLocaleString('pt-BR')} clientes exportados`, { id: toastId });
    } catch {
      toast.error('Erro ao exportar', { id: toastId });
    } finally {
      setIsExporting(false);
    }
  };

  const buildCustomerDetailsUrl = (customer: Customer) => {
    const params = new URLSearchParams();
    if (customer.cnpj) params.set('cnpj', customer.cnpj);
    if (customer.name) params.set('name', customer.name);
    return `/cadastro/clientes/detalhes?${params.toString()}`;
  };

  const openCustomerInNewTab = (customer: Customer) => {
    const url = buildCustomerDetailsUrl(customer);
    const newTab = window.open(url, '_blank', 'noopener,noreferrer');

    if (!newTab) {
      toast.error('Não foi possível abrir nova aba. Verifique se o navegador bloqueou pop-ups.');
    }
  };

  return (
    <>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="hidden sm:flex items-center gap-3 min-w-0">
          <span className="material-symbols-outlined text-[28px] text-primary flex-shrink-0">group</span>
          <div className="min-w-0">
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-2 flex-wrap">
              Clientes
              {cnpjChanges > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 text-[10px] font-bold" title={`${cnpjChanges} mudança(s) de status CNPJ nos últimos 30 dias`}>
                  {cnpjChanges} mudança{cnpjChanges > 1 ? 's' : ''} CNPJ
                </span>
              )}
            </h2>
            <p className="text-slate-500 dark:text-slate-400 text-xs font-medium">
              Captura automática dos clientes que receberam NF-e emitidas pela sua empresa
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleExport}
            disabled={customers.length === 0 || isExporting}
            className="hidden sm:flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-card-dark border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 transition-colors shadow-sm disabled:opacity-40"
          >
            <span className={`material-symbols-outlined text-[20px] ${isExporting ? 'animate-spin' : ''}`}>{isExporting ? 'progress_activity' : 'download'}</span>
            {isExporting ? 'Exportando...' : 'Exportar'}
          </button>
        </div>
      </div>

      <MobileFilterWrapper activeFilterCount={[search, sortBy !== 'lastIssue' ? sortBy : ''].filter(Boolean).length}>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4 items-end">
          <div className="sm:col-span-2 md:col-span-3">
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
              Buscar por CNPJ/CPF ou Nome do Cliente
            </label>
            <input
              type="text"
              placeholder="ex: 00.000.000/0001-91"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="block w-full px-3 py-2.5 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-900/50 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary text-sm transition-all"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
              Ordenar por
            </label>
            <select
              value={sortBy}
              onChange={(e) => {
                const next = e.target.value;
                setSortBy(next);
                setSortOrder(next === 'name' ? 'asc' : 'desc');
                setPage(1);
              }}
              className="block w-full px-3 py-2.5 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-900/50 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary text-sm transition-all"
            >
              <option value="name">Nome</option>
              <option value="city">Cidade</option>
              <option value="lastIssue">Última NF-e</option>
            </select>
          </div>

          <button
            onClick={clearFilters}
            className="flex items-center justify-center gap-2 px-4 py-2.5 bg-white dark:bg-card-dark border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 transition-colors shadow-sm"
          >
            <span className="material-symbols-outlined text-[18px]">filter_alt_off</span>
            Limpar
          </button>
        </div>
      </MobileFilterWrapper>

      <div className="bg-white dark:bg-card-dark border border-slate-200 dark:border-slate-800 rounded-xl shadow-lg shadow-slate-200/50 dark:shadow-none overflow-hidden">
        {/* Desktop Table */}
        <div className="hidden lg:block overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800 text-xs uppercase text-slate-500 dark:text-slate-400 font-bold tracking-wider">
                <th className="px-4 py-3 cursor-pointer group hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" onClick={() => handleSort('lastIssue')}>
                  <div className="flex items-center gap-1">Última NF-e {getSortIcon('lastIssue')}</div>
                </th>
                <th className="px-4 py-3 cursor-pointer group hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" onClick={() => handleSort('name')}>
                  <div className="flex items-center gap-1">Cliente {getSortIcon('name')}</div>
                </th>
                <th className="px-4 py-3 cursor-pointer group hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" onClick={() => handleSort('city')}>
                  <div className="flex items-center gap-1">Cidade {getSortIcon('city')}</div>
                </th>
                <th className="px-4 py-3 text-center">
                  <div className="flex flex-col items-center leading-tight">
                    <span>Tabela de Preço</span>
                    <span className="text-[10px] normal-case tracking-normal text-slate-400 dark:text-slate-500">(itens)</span>
                  </div>
                </th>
                <th className="px-4 py-3 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {loading ? (
                Array.from({ length: limit }).map((_, index) => (
                  <tr key={index}>
                    <td className="px-4 py-2.5"><Skeleton className="h-4 w-24" /></td>
                    <td className="px-4 py-2.5"><Skeleton className="h-4 w-56" /></td>
                    <td className="px-4 py-2.5"><Skeleton className="h-4 w-28" /></td>
                    <td className="px-4 py-2.5"><Skeleton className="h-4 w-28 mx-auto" /></td>
                    <td className="px-4 py-2.5"><Skeleton className="h-4 w-16 mx-auto" /></td>
                  </tr>
                ))
              ) : customers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-400">
                    <span className="material-symbols-outlined text-[48px] opacity-30">group</span>
                    <p className="mt-2 text-sm font-medium">Nenhum cliente encontrado</p>
                    <p className="text-xs mt-1">Os clientes aparecem automaticamente quando houver NF-e emitidas.</p>
                  </td>
                </tr>
              ) : (
                (() => {
                  let lastGroup = '';
                  const cityCountsForPage = sortBy === 'city' ? customers.reduce((acc, c) => {
                    const k = c.city || 'Sem cidade';
                    acc.set(k, (acc.get(k) || 0) + 1);
                    return acc;
                  }, new Map<string, number>()) : null;
                  return customers.map((customer) => {
                    const group = sortBy === 'city'
                      ? (customer.city || 'Sem cidade')
                      : (customer.lastIssueDate ? getDateGroupLabel(customer.lastIssueDate) : 'Sem data');
                    const showDivider = group !== lastGroup;
                    lastGroup = group;
                    return (
                      <React.Fragment key={`${customer.cnpj}-${customer.name}`}>
                        {showDivider && (
                          <tr className="cursor-pointer select-none" onClick={() => toggleGroup(group)}>
                            <td colSpan={5} className="px-4 py-2 bg-slate-100/80 dark:bg-slate-800/60 border-y border-slate-200 dark:border-slate-700">
                              <div className="flex items-center gap-2">
                                <span className="material-symbols-outlined text-[16px] text-slate-400 transition-transform" style={{ transform: collapsedGroups.has(group) ? 'rotate(-90deg)' : 'rotate(0deg)' }}>expand_more</span>
                                <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{group}</span>
                                {cityCountsForPage && (
                                  <span className="text-[10px] font-bold bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">{cityCountsForPage.get(group) || 0}</span>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                        {!collapsedGroups.has(group) && (
                          <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors cursor-pointer" onClick={() => { setSelectedCustomer(customer); setIsDetailsOpen(true); }}>
                            <td className="px-4 py-2.5">
                              <span className="text-[13px] font-medium text-slate-700 dark:text-slate-300">{customer.lastIssueDate ? formatDate(customer.lastIssueDate) : '-'}</span>
                            </td>
                            <td className="px-4 py-2.5">
                              {(() => {
                                const isCpf = (customer.cnpj || '').replace(/\D/g, '').length === 11;
                                const label = customer.shortName || (isCpf ? 'PARTICULAR' : null);
                                return label ? (
                                  <>
                                    <div className="text-[13px] font-bold leading-tight text-slate-900 dark:text-white hover:text-primary transition-colors">{label}</div>
                                    <div className="text-[10px] leading-tight text-slate-400 dark:text-slate-500">{customer.name}</div>
                                  </>
                                ) : (
                                  <div className="text-[13px] font-bold leading-tight text-slate-900 dark:text-white hover:text-primary transition-colors">{customer.name}</div>
                                );
                              })()}
                              <div className="text-[11px] font-mono leading-tight text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                                {(() => {
                                  const digits = (customer.cnpj || '').replace(/\D/g, '');
                                  const st = cnpjStatus.get(digits);
                                  if (!st) return null;
                                  const upper = st.toUpperCase();
                                  const color = upper === 'ATIVA' ? 'bg-emerald-500' : upper.includes('SUSPENS') ? 'bg-amber-500' : upper.includes('BAIXA') || upper.includes('INAPT') ? 'bg-red-500' : 'bg-slate-400';
                                  return <span className={`w-2 h-2 rounded-full inline-block shrink-0 ${color}`} title={st} />;
                                })()}
                                {formatDocument(customer.cnpj)}
                              </div>
                            </td>
                            <td className="px-4 py-2.5"><span className="text-[12px] text-slate-600 dark:text-slate-300">{customer.city || '-'}</span></td>
                            <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
                              <div className="flex items-center justify-center gap-2">
                                <span className="text-[12px] font-bold text-slate-800 dark:text-slate-200">{customer.priceItemCount != null ? customer.priceItemCount.toLocaleString('pt-BR') : '-'}</span>
                                <button onClick={() => { setSelectedPriceCustomer(customer); setIsPriceTableOpen(true); }} className="p-2 rounded-lg text-slate-500 hover:text-primary hover:bg-primary/10 transition-colors" title="Visualizar tabela de preço">
                                  <span className="material-symbols-outlined text-[20px]">table_view</span>
                                </button>
                              </div>
                            </td>
                            <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
                              <div className="flex items-center justify-center gap-1">
                                <button onClick={() => { setSelectedCustomer(customer); setIsDetailsOpen(true); }} className="p-2 rounded-lg text-slate-500 hover:text-primary hover:bg-primary/10 transition-colors" title="Visualizar cadastro do cliente">
                                  <span className="material-symbols-outlined text-[20px]">visibility</span>
                                </button>
                                <button onClick={() => openCustomerInNewTab(customer)} className="p-2 rounded-lg text-slate-500 hover:text-primary hover:bg-primary/10 transition-colors" title="Abrir detalhes em nova aba">
                                  <span className="material-symbols-outlined text-[20px]">open_in_new</span>
                                </button>
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

        {/* Mobile Cards */}
        <div className="lg:hidden">
          {loading ? (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="p-4 space-y-2">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-3 w-32" />
                  <Skeleton className="h-3 w-24" />
                </div>
              ))}
            </div>
          ) : customers.length === 0 ? (
            <div className="px-6 py-12 text-center text-slate-400">
              <span className="material-symbols-outlined text-[48px] opacity-30">group</span>
              <p className="mt-2 text-sm font-medium">Nenhum cliente encontrado</p>
              <p className="text-xs mt-1">Os clientes aparecem automaticamente quando houver NF-e emitidas.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {(() => {
                let lastGroup = '';
                const cityCountsForPage = sortBy === 'city' ? customers.reduce((acc, c) => {
                  const k = c.city || 'Sem cidade';
                  acc.set(k, (acc.get(k) || 0) + 1);
                  return acc;
                }, new Map<string, number>()) : null;
                return customers.map((customer) => {
                  const group = sortBy === 'city'
                    ? (customer.city || 'Sem cidade')
                    : (customer.lastIssueDate ? getDateGroupLabel(customer.lastIssueDate) : 'Sem data');
                  const showDivider = group !== lastGroup;
                  lastGroup = group;
                  const isCpf = (customer.cnpj || '').replace(/\D/g, '').length === 11;
                  const label = customer.shortName || (isCpf ? 'PARTICULAR' : null);
                  const digits = (customer.cnpj || '').replace(/\D/g, '');
                  const st = cnpjStatus.get(digits);
                  return (
                    <React.Fragment key={`m-${customer.cnpj}-${customer.name}`}>
                      {showDivider && (
                        <div className="cursor-pointer select-none" onClick={() => toggleGroup(group)}>
                          <div className="flex items-center gap-2 px-4 py-2 bg-slate-100/80 dark:bg-slate-800/60 border-y border-slate-200 dark:border-slate-700">
                            <span className="material-symbols-outlined text-[16px] text-slate-400 transition-transform" style={{ transform: collapsedGroups.has(group) ? 'rotate(-90deg)' : 'rotate(0deg)' }}>expand_more</span>
                            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{group}</span>
                            {cityCountsForPage && (
                              <span className="text-[10px] font-bold bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">{cityCountsForPage.get(group) || 0}</span>
                            )}
                          </div>
                        </div>
                      )}
                      {!collapsedGroups.has(group) && (
                        <div className="p-3 active:bg-slate-50 dark:active:bg-slate-800/40" onClick={() => { setSelectedCustomer(customer); setIsDetailsOpen(true); }}>
                          <div className="flex items-start justify-between mb-1">
                            <div className="flex-1 min-w-0">
                              <p className="font-bold text-slate-900 dark:text-white truncate text-[13px]">{label || customer.name}</p>
                            </div>
                            {st && st.toUpperCase() !== 'ATIVA' && (() => {
                              const upper = st.toUpperCase();
                              const color = upper.includes('SUSPENS')
                                  ? 'text-amber-600 bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800'
                                  : upper.includes('BAIXA') || upper.includes('INAPT')
                                    ? 'text-red-600 bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
                                    : 'text-slate-500 bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700';
                              return <span className={`ml-2 flex-shrink-0 px-2 py-0.5 text-[10px] font-bold rounded-full border ${color}`}>{st}</span>;
                            })()}
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-[10px] mb-1.5">
                            <div>
                              <p className="text-slate-400">Última NF-e</p>
                              <p className="font-medium text-slate-700 dark:text-slate-300">{customer.lastIssueDate ? formatDate(customer.lastIssueDate) : '-'}</p>
                            </div>
                            <div>
                              <p className="text-slate-400">Tabela de Preço</p>
                              <p className="font-medium text-slate-700 dark:text-slate-300">{customer.priceItemCount != null ? `${customer.priceItemCount.toLocaleString('pt-BR')} itens` : '-'}</p>
                            </div>
                          </div>
                          <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={() => { setSelectedCustomer(customer); setIsDetailsOpen(true); }}
                              className="flex-1 inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-primary hover:border-primary/30 hover:bg-primary/5 transition-colors"
                            >
                              <span className="material-symbols-outlined text-[16px]">visibility</span>
                              Ver Detalhes
                            </button>
                            <button
                              onClick={() => { setSelectedPriceCustomer(customer); setIsPriceTableOpen(true); }}
                              className="flex-1 inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-primary hover:border-primary/30 hover:bg-primary/5 transition-colors"
                            >
                              <span className="material-symbols-outlined text-[16px]">table_view</span>
                              Tabela
                            </button>
                          </div>
                        </div>
                      )}
                    </React.Fragment>
                  );
                });
              })()}
            </div>
          )}
        </div>

        <div className="px-3 sm:px-6 py-4 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 bg-slate-50/30 dark:bg-slate-800/20">
          <div className="flex items-center gap-3">
            <span className="text-xs sm:text-sm text-slate-500">Mostrando {customers.length} de {total}</span>
            <select
              value={limit}
              onChange={(e) => {
                setLimit(Number(e.target.value));
                setPage(1);
              }}
              className="px-2 py-1 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-sm text-slate-600 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              <option value={25}>25 / página</option>
              <option value={50}>50 / página</option>
              <option value={100}>100 / página</option>
            </select>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(1)}
              disabled={page === 1}
              className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-40"
              title="Primeira página"
              aria-label="Primeira página"
            >
              <span className="material-symbols-outlined text-[20px]">first_page</span>
            </button>
            <button
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page === 1}
              className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-40"
              aria-label="Página anterior"
            >
              <span className="material-symbols-outlined text-[20px]">chevron_left</span>
            </button>

            {(() => {
              const pages: number[] = [];
              let start = Math.max(1, page - 2);
              let end = Math.min(totalPages, start + 4);
              start = Math.max(1, end - 4);

              for (let index = start; index <= end; index++) pages.push(index);

              return pages.map((pageNumber) => (
                <button
                  key={pageNumber}
                  onClick={() => setPage(pageNumber)}
                  className={`hidden sm:flex w-9 h-9 items-center justify-center rounded-lg text-sm font-bold transition-colors ${
                    pageNumber === page
                      ? 'bg-primary text-white shadow-md shadow-primary/30'
                      : 'border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700'
                  }`}
                >
                  {pageNumber}
                </button>
              ));
            })()}
            <span className="text-xs text-slate-500 sm:hidden">{page}/{totalPages}</span>

            <button
              onClick={() => setPage(Math.min(totalPages, page + 1))}
              disabled={page === totalPages}
              className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-40"
              aria-label="Próxima página"
            >
              <span className="material-symbols-outlined text-[20px]">chevron_right</span>
            </button>
            <button
              onClick={() => setPage(totalPages)}
              disabled={page === totalPages}
              className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-40"
              title="Última página"
              aria-label="Última página"
            >
              <span className="material-symbols-outlined text-[20px]">last_page</span>
            </button>
          </div>
        </div>
      </div>
      <CustomerDetailsModal
        isOpen={isDetailsOpen}
        onClose={() => setIsDetailsOpen(false)}
        customer={selectedCustomer ? { cnpj: selectedCustomer.cnpj, name: selectedCustomer.name } : null}
      />
      <CustomerPriceTableModal
        isOpen={isPriceTableOpen}
        onClose={() => setIsPriceTableOpen(false)}
        customer={selectedPriceCustomer ? { cnpj: selectedPriceCustomer.cnpj, name: selectedPriceCustomer.name } : null}
      />
    </>
  );
}
