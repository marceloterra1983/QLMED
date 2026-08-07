'use client';

import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import dynamic from 'next/dynamic';
import Skeleton from '@/components/ui/Skeleton';
import { formatCnpj, formatDate, getDateGroupLabel } from '@/lib/utils';
import MobileFilterWrapper from '@/components/ui/MobileFilterWrapper';

const CustomerDetailsModal = dynamic(() => import('@/components/CustomerDetailsModal'), { ssr: false });
const CustomerPriceTableModal = dynamic(() => import('@/components/CustomerPriceTableModal'), { ssr: false });
const SupplierDetailsModal = dynamic(() => import('@/components/SupplierDetailsModal'), { ssr: false });
const SupplierPriceTableModal = dynamic(() => import('@/components/SupplierPriceTableModal'), { ssr: false });

export type ContactListKind = 'customer' | 'supplier';

interface ContactRow {
  cnpj: string;
  name: string;
  shortName: string | null;
  invoiceCount: number;
  priceItemCount: number | null;
  city: string | null;
  lastIssueDate: string | null;
}

type Cfg = {
  kind: ContactListKind;
  apiList: string;
  listKey: 'customers' | 'suppliers';
  detailsPath: string;
  showCity: boolean;
  icon: string;
  title: string;
  subtitle: string;
  searchLabel: string;
  partyColumn: string;
  emptyTitle: string;
  emptyHint: string;
  loadError: string;
  exportLoading: string;
  exportEmpty: string;
  exportDone: (n: string) => string;
  csvName: string;
  csvParty: string;
  csvInvoiceCount: string;
  csvTotal: string;
  detailsAria: string;
};

const CFG: Record<ContactListKind, Cfg> = {
  customer: {
    kind: 'customer',
    apiList: '/api/customers',
    listKey: 'customers',
    detailsPath: '/cadastro/clientes/detalhes',
    showCity: true,
    icon: 'group',
    title: 'Clientes',
    subtitle: 'Captura automática dos clientes que receberam NF-e emitidas pela sua empresa',
    searchLabel: 'Buscar por CNPJ/CPF ou Nome do Cliente',
    partyColumn: 'Cliente',
    emptyTitle: 'Nenhum cliente encontrado',
    emptyHint: 'Os clientes aparecem automaticamente quando houver NF-e emitidas.',
    loadError: 'Erro ao carregar cadastro de clientes',
    exportLoading: 'Exportando clientes...',
    exportEmpty: 'Nenhum cliente para exportar',
    exportDone: (n) => `${n} clientes exportados`,
    csvName: 'clientes',
    csvParty: 'Cliente',
    csvInvoiceCount: 'NF-e Emitidas',
    csvTotal: 'Total Vendido',
    detailsAria: 'Visualizar cadastro do cliente',
  },
  supplier: {
    kind: 'supplier',
    apiList: '/api/suppliers',
    listKey: 'suppliers',
    detailsPath: '/cadastro/fornecedores/detalhes',
    showCity: false,
    icon: 'storefront',
    title: 'Fornecedores',
    subtitle: 'Captura automática dos fornecedores que enviaram NF-e para sua empresa',
    searchLabel: 'Buscar por CNPJ/CPF ou Nome do Fornecedor',
    partyColumn: 'Fornecedor',
    emptyTitle: 'Nenhum fornecedor encontrado',
    emptyHint: 'Os fornecedores aparecem automaticamente quando houver NF-e recebidas.',
    loadError: 'Erro ao carregar cadastro de fornecedores',
    exportLoading: 'Exportando fornecedores...',
    exportEmpty: 'Nenhum fornecedor para exportar',
    exportDone: (n) => `${n} fornecedores exportados`,
    csvName: 'fornecedores',
    csvParty: 'Fornecedor',
    csvInvoiceCount: 'NF-e Recebidas',
    csvTotal: 'Total Comprado',
    detailsAria: 'Visualizar cadastro do fornecedor',
  },
};

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

export default function ContactListPageClient({ kind }: { kind: ContactListKind }) {
  const cfg = CFG[kind];
  const colSpan = cfg.showCity ? 5 : 4;

  const [rows, setRows] = useState<ContactRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [limit, setLimit] = useState(50);
  const [sortBy, setSortBy] = useState('lastIssue');
  const [sortOrder, setSortOrder] = useState('desc');
  const [selected, setSelected] = useState<ContactRow | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [selectedPrice, setSelectedPrice] = useState<ContactRow | null>(null);
  const [isPriceTableOpen, setIsPriceTableOpen] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [cnpjStatus, setCnpjStatus] = useState<Map<string, string>>(new Map());
  const [cnpjChanges, setCnpjChanges] = useState(0);
  const [isExporting, setIsExporting] = useState(false);

  const toggleGroup = (group: string) => {
    setCollapsedGroups((prev) => {
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
    loadRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, limit, search, sortBy, sortOrder]);

  useEffect(() => {
    fetch('/api/contacts/cnpj-monitor')
      .then((r) => r.json())
      .then((data) => setCnpjChanges(data.changes?.length || 0))
      .catch(() => {});
  }, []);

  const loadRows = async () => {
    setLoading(true);
    try {
      const effectiveLimit = cfg.showCity && sortBy === 'city' ? 300 : limit;
      const params = new URLSearchParams({
        page: String(page),
        limit: String(effectiveLimit),
        sort: sortBy,
        order: sortOrder,
      });
      if (search) params.set('search', search);

      const res = await fetch(`${cfg.apiList}?${params}`);
      if (!res.ok) throw new Error('load failed');

      const data = await res.json();
      const list: ContactRow[] = data[cfg.listKey] || [];
      setRows(list);
      setTotalPages(data.pagination?.pages || 1);
      setTotal(data.pagination?.total || 0);
      if (data.pagination?.page && data.pagination.page !== page) {
        setPage(data.pagination.page);
      }

      const cnpjs = list
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
      toast.error(cfg.loadError);
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
    if (field === 'name' || field === 'city') setSortOrder('asc');
    else setSortOrder('desc');
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

  const handleExport = async () => {
    if (isExporting) return;
    setIsExporting(true);
    const toastId = toast.loading(cfg.exportLoading);
    try {
      const res = await fetch(`${cfg.apiList}?exportAll=1&sort=name&order=asc`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      const all = data[cfg.listKey] || [];
      if (all.length === 0) { toast.dismiss(toastId); toast.info(cfg.exportEmpty); return; }

      const esc = (v: string | null | undefined) => {
        const s = v || '';
        return s.includes(';') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
      };
      const fmtCur = (v: number | null | undefined) =>
        v != null ? v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '';
      const fmtAddr = (e: Record<string, string | null> | null | undefined) => {
        if (!e) return '';
        return [e.logradouro, e.numero, e.bairro, e.municipio, e.uf, e.cep].filter(Boolean).join(', ');
      };

      const headers = cfg.showCity
        ? [
            cfg.csvParty, 'Nome Abreviado', 'CNPJ/CPF', 'Cidade',
            cfg.csvInvoiceCount, cfg.csvTotal, 'Primeira NF-e', 'Última NF-e', 'Itens Tab. Preço',
            'Razão Social (Receita)', 'Nome Fantasia', 'Situação Cadastral',
            'CNAE Principal', 'Porte', 'Natureza Jurídica',
            'Simples Nacional', 'MEI', 'Capital Social',
            'Telefone (Receita)', 'Email (Receita)', 'Endereço (Receita)',
            'Telefone (Editado)', 'Email (Editado)', 'Endereço (Editado)',
          ]
        : [
            cfg.csvParty, 'Nome Abreviado', 'CNPJ/CPF',
            cfg.csvInvoiceCount, cfg.csvTotal, 'Primeira NF-e', 'Última NF-e', 'Itens Tab. Preço',
            'Razão Social (Receita)', 'Nome Fantasia', 'Situação Cadastral',
            'CNAE Principal', 'Porte', 'Natureza Jurídica',
            'Simples Nacional', 'MEI', 'Capital Social',
            'Telefone (Receita)', 'Email (Receita)', 'Endereço (Receita)',
            'Telefone (Editado)', 'Email (Editado)', 'Endereço (Editado)',
          ];

      const csvRows = all.map((c: any) => {
        const r = c.receita || {};
        const o = c.override || {};
        const ovrAddr = [o.street, o.number, o.complement, o.district, o.city, o.state, o.zipCode].filter(Boolean).join(', ');
        const base = [
          esc(c.name), esc(c.shortName), formatDocument(c.cnpj),
        ];
        if (cfg.showCity) base.push(esc(c.city));
        base.push(
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
        );
        return base;
      });

      const csv = '\uFEFF' + [headers.join(';'), ...csvRows.map((r: string[]) => r.join(';'))].join('\n');
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
      const a = document.createElement('a');
      a.href = url; a.download = `${cfg.csvName}-${new Date().toISOString().split('T')[0]}.csv`; a.click();
      URL.revokeObjectURL(url);
      toast.success(cfg.exportDone(all.length.toLocaleString('pt-BR')), { id: toastId });
    } catch {
      toast.error('Erro ao exportar', { id: toastId });
    } finally {
      setIsExporting(false);
    }
  };

  const openInNewTab = (row: ContactRow) => {
    const params = new URLSearchParams();
    if (row.cnpj) params.set('cnpj', row.cnpj);
    if (row.name) params.set('name', row.name);
    const url = `${cfg.detailsPath}?${params.toString()}`;
    const newTab = window.open(url, '_blank', 'noopener,noreferrer');
    if (!newTab) toast.error('Não foi possível abrir nova aba. Verifique se o navegador bloqueou pop-ups.');
  };

  const displayName = (row: ContactRow) => {
    const isCpf = (row.cnpj || '').replace(/\D/g, '').length === 11;
    if (row.shortName) return row.shortName;
    if (isCpf) return `PARTICULAR / ${row.name}`;
    return row.name;
  };

  const groupFor = (row: ContactRow) => {
    if (cfg.showCity && sortBy === 'city') return row.city || 'Sem cidade';
    return row.lastIssueDate ? getDateGroupLabel(row.lastIssueDate) : 'Sem data';
  };

  return (
    <>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="hidden sm:flex items-center gap-3 min-w-0">
          <span className="material-symbols-outlined text-[28px] text-primary flex-shrink-0">{cfg.icon}</span>
          <div className="min-w-0">
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-2 flex-wrap">
              {cfg.title}
              {cnpjChanges > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 text-[10px] font-bold" title={`${cnpjChanges} mudança(s) de status CNPJ nos últimos 30 dias`}>
                  {cnpjChanges} mudança{cnpjChanges > 1 ? 's' : ''} CNPJ
                </span>
              )}
            </h2>
            <p className="text-slate-500 dark:text-slate-400 text-xs font-medium">{cfg.subtitle}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleExport}
            disabled={rows.length === 0 || isExporting}
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
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">{cfg.searchLabel}</label>
            <input
              type="text"
              placeholder="ex: 00.000.000/0001-91"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="block w-full px-3 py-2.5 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-900/50 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary text-sm transition-all"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Ordenar por</label>
            <select
              value={sortBy}
              onChange={(e) => {
                const next = e.target.value;
                setSortBy(next);
                setSortOrder(next === 'name' || next === 'city' ? 'asc' : 'desc');
                setPage(1);
              }}
              className="block w-full px-3 py-2.5 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-900/50 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary text-sm transition-all"
            >
              <option value="name">Nome</option>
              {cfg.showCity && <option value="city">Cidade</option>}
              <option value="lastIssue">Última NF-e</option>
            </select>
          </div>
          <button onClick={clearFilters} className="flex items-center justify-center gap-2 px-4 py-2.5 bg-white dark:bg-card-dark border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 transition-colors shadow-sm">
            <span className="material-symbols-outlined text-[18px]">filter_alt_off</span>
            Limpar
          </button>
        </div>
      </MobileFilterWrapper>

      <div className="bg-white dark:bg-card-dark border border-slate-200 dark:border-slate-800 rounded-xl shadow-lg shadow-slate-200/50 dark:shadow-none overflow-hidden">
        <div className="hidden lg:block overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800 text-xs uppercase text-slate-500 dark:text-slate-400 font-bold tracking-wider">
                <th className="px-4 py-1.5 cursor-pointer group hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" onClick={() => handleSort('lastIssue')}>
                  <div className="flex items-center gap-1">Última NF-e {getSortIcon('lastIssue')}</div>
                </th>
                <th className="px-4 py-1.5 cursor-pointer group hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" onClick={() => handleSort('name')}>
                  <div className="flex items-center gap-1">{cfg.partyColumn} {getSortIcon('name')}</div>
                </th>
                {cfg.showCity && (
                  <th className="px-4 py-1.5 cursor-pointer group hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" onClick={() => handleSort('city')}>
                    <div className="flex items-center gap-1">Cidade {getSortIcon('city')}</div>
                  </th>
                )}
                <th className="px-4 py-1.5 text-center">
                  <div className="flex flex-col items-center leading-tight">
                    <span>Tabela de Preço</span>
                    <span className="text-[10px] normal-case tracking-normal text-slate-400 dark:text-slate-500">(itens)</span>
                  </div>
                </th>
                <th className="px-4 py-1.5 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {loading ? (
                Array.from({ length: limit }).map((_, index) => (
                  <tr key={index}>
                    <td className="px-4 py-1"><Skeleton className="h-4 w-24" /></td>
                    <td className="px-4 py-1"><Skeleton className="h-4 w-56" /></td>
                    {cfg.showCity && <td className="px-4 py-1"><Skeleton className="h-4 w-28" /></td>}
                    <td className="px-4 py-1"><Skeleton className="h-4 w-28 mx-auto" /></td>
                    <td className="px-4 py-1"><Skeleton className="h-4 w-16 mx-auto" /></td>
                  </tr>
                ))
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={colSpan} className="px-6 py-12 text-center text-slate-400">
                    <span className="material-symbols-outlined text-[48px] opacity-30">{cfg.icon}</span>
                    <p className="mt-2 text-sm font-medium">{cfg.emptyTitle}</p>
                    <p className="text-xs mt-1">{cfg.emptyHint}</p>
                  </td>
                </tr>
              ) : (
                (() => {
                  let lastGroup = '';
                  const cityCountsForPage =
                    cfg.showCity && sortBy === 'city'
                      ? rows.reduce((acc, c) => {
                          const k = c.city || 'Sem cidade';
                          acc.set(k, (acc.get(k) || 0) + 1);
                          return acc;
                        }, new Map<string, number>())
                      : null;
                  return rows.map((row) => {
                    const group = groupFor(row);
                    const showDivider = group !== lastGroup;
                    lastGroup = group;
                    return (
                      <React.Fragment key={`${row.cnpj}-${row.name}`}>
                        {showDivider && (
                          <tr className="cursor-pointer select-none" onClick={() => toggleGroup(group)}>
                            <td colSpan={colSpan} className="px-4 py-1.5 bg-slate-100/80 dark:bg-slate-800/60 border-y border-slate-200 dark:border-slate-700">
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
                          <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors cursor-pointer" onClick={() => { setSelected(row); setIsDetailsOpen(true); }}>
                            <td className="px-4 py-1">
                              <span className="text-[13px] font-medium text-slate-700 dark:text-slate-300">{row.lastIssueDate ? formatDate(row.lastIssueDate) : '-'}</span>
                            </td>
                            <td className="px-4 py-1">
                              <div className="text-[13px] font-bold leading-tight text-slate-900 dark:text-white hover:text-primary transition-colors">{displayName(row)}</div>
                            </td>
                            {cfg.showCity && (
                              <td className="px-4 py-1"><span className="text-[12px] text-slate-600 dark:text-slate-300">{row.city || '-'}</span></td>
                            )}
                            <td className="px-4 py-1" onClick={(e) => e.stopPropagation()}>
                              <div className="flex items-center justify-center gap-2">
                                <span className="text-[12px] font-bold text-slate-800 dark:text-slate-200">{row.priceItemCount != null ? row.priceItemCount.toLocaleString('pt-BR') : '-'}</span>
                                <button onClick={() => { setSelectedPrice(row); setIsPriceTableOpen(true); }} className="p-2 rounded-lg text-slate-500 hover:text-primary hover:bg-primary/10 transition-colors" title="Visualizar tabela de preço">
                                  <span className="material-symbols-outlined text-[20px]">table_view</span>
                                </button>
                              </div>
                            </td>
                            <td className="px-4 py-1" onClick={(e) => e.stopPropagation()}>
                              <div className="flex items-center justify-center gap-1">
                                <button onClick={() => { setSelected(row); setIsDetailsOpen(true); }} className="p-2 rounded-lg text-slate-500 hover:text-primary hover:bg-primary/10 transition-colors" title={cfg.detailsAria}>
                                  <span className="material-symbols-outlined text-[20px]">search</span>
                                </button>
                                <button onClick={() => openInNewTab(row)} className="p-2 rounded-lg text-slate-500 hover:text-primary hover:bg-primary/10 transition-colors" title="Abrir detalhes em nova aba">
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
          ) : rows.length === 0 ? (
            <div className="px-6 py-12 text-center text-slate-400">
              <span className="material-symbols-outlined text-[48px] opacity-30">{cfg.icon}</span>
              <p className="mt-2 text-sm font-medium">{cfg.emptyTitle}</p>
              <p className="text-xs mt-1">{cfg.emptyHint}</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {(() => {
                let lastGroup = '';
                return rows.map((row) => {
                  const group = groupFor(row);
                  const showDivider = group !== lastGroup;
                  lastGroup = group;
                  const isCpf = (row.cnpj || '').replace(/\D/g, '').length === 11;
                  const label = row.shortName || (isCpf ? 'PARTICULAR' : null);
                  const digits = (row.cnpj || '').replace(/\D/g, '');
                  const st = cnpjStatus.get(digits);
                  return (
                    <React.Fragment key={`m-${row.cnpj}-${row.name}`}>
                      {showDivider && (
                        <div className="cursor-pointer select-none" onClick={() => toggleGroup(group)}>
                          <div className="flex items-center gap-2 px-4 py-1.5 bg-slate-100/80 dark:bg-slate-800/60 border-y border-slate-200 dark:border-slate-700">
                            <span className="material-symbols-outlined text-[16px] text-slate-400 transition-transform" style={{ transform: collapsedGroups.has(group) ? 'rotate(-90deg)' : 'rotate(0deg)' }}>expand_more</span>
                            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{group}</span>
                          </div>
                        </div>
                      )}
                      {!collapsedGroups.has(group) && (
                        <div className="p-3 active:bg-slate-50 dark:active:bg-slate-800/40" onClick={() => { setSelected(row); setIsDetailsOpen(true); }}>
                          <div className="flex items-start justify-between mb-1">
                            <div className="flex-1 min-w-0">
                              <p className="font-bold text-slate-900 dark:text-white truncate text-[13px]">{label || row.name}</p>
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
                              <p className="font-medium text-slate-700 dark:text-slate-300">{row.lastIssueDate ? formatDate(row.lastIssueDate) : '-'}</p>
                            </div>
                            <div>
                              <p className="text-slate-400">Tabela de Preço</p>
                              <p className="font-medium text-slate-700 dark:text-slate-300">{row.priceItemCount != null ? `${row.priceItemCount.toLocaleString('pt-BR')} itens` : '-'}</p>
                            </div>
                          </div>
                          <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={() => { setSelected(row); setIsDetailsOpen(true); }}
                              className="flex-1 inline-flex items-center justify-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-primary hover:border-primary/30 hover:bg-primary/5 transition-colors"
                            >
                              <span className="material-symbols-outlined text-[16px]">search</span>
                              Detalhes
                            </button>
                            <button
                              onClick={() => { setSelectedPrice(row); setIsPriceTableOpen(true); }}
                              className="flex-1 inline-flex items-center justify-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-primary hover:border-primary/30 hover:bg-primary/5 transition-colors"
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
            <span className="text-xs sm:text-sm text-slate-500">Mostrando {rows.length} de {total}</span>
            <select
              value={limit}
              onChange={(e) => { setLimit(Number(e.target.value)); setPage(1); }}
              className="px-2 py-1 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-sm text-slate-600 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              <option value={25}>25 / página</option>
              <option value={50}>50 / página</option>
              <option value={100}>100 / página</option>
            </select>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => setPage(1)} disabled={page === 1} className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-40" title="Primeira página" aria-label="Primeira página">
              <span className="material-symbols-outlined text-[20px]">first_page</span>
            </button>
            <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1} className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-40" aria-label="Página anterior">
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
            <button onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page === totalPages} className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-40" aria-label="Próxima página">
              <span className="material-symbols-outlined text-[20px]">chevron_right</span>
            </button>
            <button onClick={() => setPage(totalPages)} disabled={page === totalPages} className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-40" title="Última página" aria-label="Última página">
              <span className="material-symbols-outlined text-[20px]">last_page</span>
            </button>
          </div>
        </div>
      </div>

      {kind === 'customer' ? (
        <>
          <CustomerDetailsModal
            isOpen={isDetailsOpen}
            onClose={() => setIsDetailsOpen(false)}
            customer={selected ? { cnpj: selected.cnpj, name: selected.name } : null}
          />
          <CustomerPriceTableModal
            isOpen={isPriceTableOpen}
            onClose={() => setIsPriceTableOpen(false)}
            customer={selectedPrice ? { cnpj: selectedPrice.cnpj, name: selectedPrice.name } : null}
          />
        </>
      ) : (
        <>
          <SupplierDetailsModal
            isOpen={isDetailsOpen}
            onClose={() => setIsDetailsOpen(false)}
            supplier={selected ? { cnpj: selected.cnpj, name: selected.name } : null}
          />
          <SupplierPriceTableModal
            isOpen={isPriceTableOpen}
            onClose={() => setIsPriceTableOpen(false)}
            supplier={selectedPrice ? { cnpj: selectedPrice.cnpj, name: selectedPrice.name } : null}
          />
        </>
      )}
    </>
  );
}
