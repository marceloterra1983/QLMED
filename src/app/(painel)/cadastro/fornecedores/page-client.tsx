'use client';

import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import dynamic from 'next/dynamic';
import Skeleton from '@/components/ui/Skeleton';
const SupplierDetailsModal = dynamic(() => import('@/components/SupplierDetailsModal'), { ssr: false });
const SupplierPriceTableModal = dynamic(() => import('@/components/SupplierPriceTableModal'), { ssr: false });
import { formatCnpj, formatDate, getDateGroupLabel } from '@/lib/utils';
import MobileFilterWrapper from '@/components/ui/MobileFilterWrapper';

interface Supplier {
  cnpj: string;
  name: string;
  shortName: string | null;
  invoiceCount: number;
  priceItemCount: number | null;
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

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [limit, setLimit] = useState(50);
  const [sortBy, setSortBy] = useState('lastIssue');
  const [sortOrder, setSortOrder] = useState('desc');
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [selectedPriceSupplier, setSelectedPriceSupplier] = useState<Supplier | null>(null);
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
    loadSuppliers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, limit, search, sortBy, sortOrder]);

  useEffect(() => {
    fetch('/api/contacts/cnpj-monitor')
      .then((r) => r.json())
      .then((data) => setCnpjChanges(data.changes?.length || 0))
      .catch(() => {});
  }, []);

  const loadSuppliers = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
        sort: sortBy,
        order: sortOrder,
      });
      if (search) params.set('search', search);

      const res = await fetch(`/api/suppliers?${params}`);
      if (!res.ok) {
        throw new Error('Falha ao carregar fornecedores');
      }

      const data = await res.json();
      const supps: Supplier[] = data.suppliers || [];
      setSuppliers(supps);
      setTotalPages(data.pagination?.pages || 1);
      setTotal(data.pagination?.total || 0);
      if (data.pagination?.page && data.pagination.page !== page) {
        setPage(data.pagination.page);
      }

      // Fetch CNPJ status in background
      const cnpjs = supps
        .map((s) => s.cnpj?.replace(/\D/g, ''))
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
      toast.error('Erro ao carregar cadastro de fornecedores');
    } finally {
      setLoading(false);
    }
  };

  const handleSort = (field: string) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
      return;
    }

    setSortBy(field);
    if (field === 'name') {
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
    const toastId = toast.loading('Exportando fornecedores...');
    try {
      const res = await fetch('/api/suppliers?exportAll=1&sort=name&order=asc');
      if (!res.ok) throw new Error();
      const data = await res.json();
      interface ReceitaData { razaoSocial?: string; nomeFantasia?: string; situacao?: string; cnaePrincipal?: string; porte?: string; naturezaJuridica?: string; simplesNacional?: boolean | null; mei?: boolean | null; capitalSocial?: number | null; telefone?: string; email?: string; endereco?: Record<string, string | null> | null }
      interface OverrideData { phone?: string; email?: string; street?: string; number?: string; complement?: string; district?: string; city?: string; state?: string; zipCode?: string }
      interface ExportSupplier { name: string; shortName?: string; cnpj: string; invoiceCount: number; totalValue: number; firstIssueDate?: string; lastIssueDate?: string; priceItemCount?: number | null; receita?: ReceitaData; override?: OverrideData }
      const all: ExportSupplier[] = data.suppliers || [];
      if (all.length === 0) { toast.dismiss(toastId); toast.info('Nenhum fornecedor para exportar'); return; }

      const esc = (v: string | null | undefined) => {
        const s = v || '';
        return s.includes(';') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
      };
      const fmtCur = (v: number | null | undefined) => v != null ? v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '';
      const fmtAddr = (e: Record<string, string | null> | null | undefined) => {
        if (!e) return '';
        return [e.logradouro, e.numero, e.bairro, e.municipio, e.uf, e.cep].filter(Boolean).join(', ');
      };

      const headers = [
        'Fornecedor', 'Nome Abreviado', 'CNPJ/CPF',
        'NF-e Recebidas', 'Total Comprado', 'Primeira NF-e', 'Última NF-e', 'Itens Tab. Preço',
        'Razão Social (Receita)', 'Nome Fantasia', 'Situação Cadastral',
        'CNAE Principal', 'Porte', 'Natureza Jurídica',
        'Simples Nacional', 'MEI', 'Capital Social',
        'Telefone (Receita)', 'Email (Receita)', 'Endereço (Receita)',
        'Telefone (Editado)', 'Email (Editado)', 'Endereço (Editado)',
      ];
      const rows = all.map((s: ExportSupplier) => {
        const r = s.receita || {};
        const o = s.override || {};
        const ovrAddr = [o.street, o.number, o.complement, o.district, o.city, o.state, o.zipCode].filter(Boolean).join(', ');
        return [
          esc(s.name), esc(s.shortName), formatDocument(s.cnpj),
          String(s.invoiceCount || 0), fmtCur(s.totalValue),
          s.firstIssueDate ? formatDate(s.firstIssueDate) : '', s.lastIssueDate ? formatDate(s.lastIssueDate) : '',
          s.priceItemCount != null ? String(s.priceItemCount) : '',
          esc(r.razaoSocial), esc(r.nomeFantasia), esc(r.situacao),
          esc(r.cnaePrincipal), esc(r.porte), esc(r.naturezaJuridica),
          r.simplesNacional === true ? 'Sim' : r.simplesNacional === false ? 'Não' : '',
          r.mei === true ? 'Sim' : r.mei === false ? 'Não' : '',
          r.capitalSocial != null ? fmtCur(r.capitalSocial) : '',
          esc(r.telefone), esc(r.email), esc(fmtAddr(r.endereco)),
          esc(o.phone), esc(o.email), esc(ovrAddr),
        ];
      });

      const csv = '\uFEFF' + [headers.join(';'), ...rows.map((r: string[]) => r.join(';'))].join('\n');
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
      const a = document.createElement('a');
      a.href = url; a.download = `fornecedores-${new Date().toISOString().split('T')[0]}.csv`; a.click();
      URL.revokeObjectURL(url);
      toast.success(`${all.length.toLocaleString('pt-BR')} fornecedores exportados`, { id: toastId });
    } catch {
      toast.error('Erro ao exportar', { id: toastId });
    } finally {
      setIsExporting(false);
    }
  };

  const buildSupplierDetailsUrl = (supplier: Supplier) => {
    const params = new URLSearchParams();
    if (supplier.cnpj) params.set('cnpj', supplier.cnpj);
    if (supplier.name) params.set('name', supplier.name);
    return `/cadastro/fornecedores/detalhes?${params.toString()}`;
  };

  const openSupplierInNewTab = (supplier: Supplier) => {
    const url = buildSupplierDetailsUrl(supplier);
    const newTab = window.open(url, '_blank', 'noopener,noreferrer');

    if (!newTab) {
      toast.error('Não foi possível abrir nova aba. Verifique se o navegador bloqueou pop-ups.');
    }
  };

  return (
    <>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="hidden sm:flex items-center gap-3 min-w-0">
          <span className="material-symbols-outlined text-[28px] text-primary flex-shrink-0">storefront</span>
          <div className="min-w-0">
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-2 flex-wrap">
              Fornecedores
              {cnpjChanges > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 text-[10px] font-bold" title={`${cnpjChanges} mudança(s) de status CNPJ nos últimos 30 dias`}>
                  {cnpjChanges} mudança{cnpjChanges > 1 ? 's' : ''} CNPJ
                </span>
              )}
            </h2>
            <p className="text-slate-500 dark:text-slate-400 text-xs font-medium">
              Captura automática dos fornecedores que enviaram NF-e para sua empresa
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleExport}
            disabled={suppliers.length === 0 || isExporting}
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
              Buscar por CNPJ/CPF ou Nome do Fornecedor
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
                <th
                  className="px-4 py-1.5 cursor-pointer group hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  onClick={() => handleSort('lastIssue')}
                >
                  <div className="flex items-center gap-1">Última NF-e {getSortIcon('lastIssue')}</div>
                </th>
                <th
                  className="px-4 py-1.5 cursor-pointer group hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  onClick={() => handleSort('name')}
                >
                  <div className="flex items-center gap-1">Fornecedor {getSortIcon('name')}</div>
                </th>
                <th className="px-4 py-1.5 text-center">
                  <div className="flex flex-col items-center leading-tight">
                    <span>Tabela de Preço</span>
                    <span className="text-[10px] normal-case tracking-normal text-slate-400 dark:text-slate-500">
                      (itens)
                    </span>
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
                    <td className="px-4 py-1"><Skeleton className="h-4 w-28 mx-auto" /></td>
                    <td className="px-4 py-1"><Skeleton className="h-4 w-16 mx-auto" /></td>
                  </tr>
                ))
              ) : suppliers.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-slate-400">
                    <span className="material-symbols-outlined text-[48px] opacity-30">storefront</span>
                    <p className="mt-2 text-sm font-medium">Nenhum fornecedor encontrado</p>
                    <p className="text-xs mt-1">
                      Os fornecedores aparecem automaticamente quando houver NF-e recebidas.
                    </p>
                  </td>
                </tr>
              ) : (
                (() => {
                  let lastGroup = '';
                  return suppliers.map((supplier) => {
                    const group = supplier.lastIssueDate
                      ? getDateGroupLabel(supplier.lastIssueDate)
                      : 'Sem data';
                    const showDivider = group !== lastGroup;
                    lastGroup = group;
                    return (
                      <React.Fragment key={`${supplier.cnpj}-${supplier.name}`}>
                        {showDivider && (
                          <tr className="cursor-pointer select-none" onClick={() => toggleGroup(group)}>
                            <td colSpan={4} className="px-4 py-1.5 bg-slate-100/80 dark:bg-slate-800/60 border-y border-slate-200 dark:border-slate-700">
                              <div className="flex items-center gap-2">
                                <span className="material-symbols-outlined text-[16px] text-slate-400 transition-transform" style={{ transform: collapsedGroups.has(group) ? 'rotate(-90deg)' : 'rotate(0deg)' }}>expand_more</span>
                                <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{group}</span>
                              </div>
                            </td>
                          </tr>
                        )}
                        {!collapsedGroups.has(group) && (
                          <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors cursor-pointer" onClick={() => { setSelectedSupplier(supplier); setIsDetailsOpen(true); }}>
                            <td className="px-4 py-1">
                              <span className="text-[13px] font-medium text-slate-700 dark:text-slate-300">
                                {supplier.lastIssueDate ? formatDate(supplier.lastIssueDate) : '-'}
                              </span>
                            </td>
                            <td className="px-4 py-1">
                              {(() => {
                                const isCpf = (supplier.cnpj || '').replace(/\D/g, '').length === 11;
                                const display = supplier.shortName
                                  ? supplier.shortName
                                  : isCpf
                                    ? `PARTICULAR / ${supplier.name}`
                                    : supplier.name;
                                return <div className="text-[13px] font-bold leading-tight text-slate-900 dark:text-white hover:text-primary transition-colors">{display}</div>;
                              })()}
                            </td>
                            <td className="px-4 py-1" onClick={(e) => e.stopPropagation()}>
                              <div className="flex items-center justify-center gap-2">
                                <span className="text-[12px] font-bold text-slate-800 dark:text-slate-200">
                                  {supplier.priceItemCount != null ? supplier.priceItemCount.toLocaleString('pt-BR') : '-'}
                                </span>
                                <button
                                  onClick={() => {
                                    setSelectedPriceSupplier(supplier);
                                    setIsPriceTableOpen(true);
                                  }}
                                  className="p-2 rounded-lg text-slate-500 hover:text-primary hover:bg-primary/10 transition-colors"
                                  title="Visualizar itens da tabela de preço"
                                  aria-label="Visualizar itens da tabela de preço"
                                >
                                  <span className="material-symbols-outlined text-[20px]">table_view</span>
                                </button>
                              </div>
                            </td>
                            <td className="px-4 py-1" onClick={(e) => e.stopPropagation()}>
                              <div className="flex items-center justify-center gap-1">
                                <button
                                  onClick={() => {
                                    setSelectedSupplier(supplier);
                                    setIsDetailsOpen(true);
                                  }}
                                  className="p-2 rounded-lg text-slate-500 hover:text-primary hover:bg-primary/10 transition-colors"
                                  title="Visualizar cadastro do fornecedor"
                                  aria-label="Visualizar cadastro do fornecedor"
                                >
                                  <span className="material-symbols-outlined text-[20px]">search</span>
                                </button>
                                <button
                                  onClick={() => openSupplierInNewTab(supplier)}
                                  className="p-2 rounded-lg text-slate-500 hover:text-primary hover:bg-primary/10 transition-colors"
                                  title="Abrir detalhes em nova aba"
                                  aria-label="Abrir detalhes em nova aba"
                                >
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
          ) : suppliers.length === 0 ? (
            <div className="px-6 py-12 text-center text-slate-400">
              <span className="material-symbols-outlined text-[48px] opacity-30">storefront</span>
              <p className="mt-2 text-sm font-medium">Nenhum fornecedor encontrado</p>
              <p className="text-xs mt-1">Os fornecedores aparecem automaticamente quando houver NF-e recebidas.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {(() => {
                let lastGroup = '';
                return suppliers.map((supplier) => {
                  const group = supplier.lastIssueDate ? getDateGroupLabel(supplier.lastIssueDate) : 'Sem data';
                  const showDivider = group !== lastGroup;
                  lastGroup = group;
                  const isCpf = (supplier.cnpj || '').replace(/\D/g, '').length === 11;
                  const label = supplier.shortName || (isCpf ? 'PARTICULAR' : null);
                  const digits = (supplier.cnpj || '').replace(/\D/g, '');
                  const st = cnpjStatus.get(digits);
                  return (
                    <React.Fragment key={`m-${supplier.cnpj}-${supplier.name}`}>
                      {showDivider && (
                        <div className="cursor-pointer select-none" onClick={() => toggleGroup(group)}>
                          <div className="flex items-center gap-2 px-4 py-1.5 bg-slate-100/80 dark:bg-slate-800/60 border-y border-slate-200 dark:border-slate-700">
                            <span className="material-symbols-outlined text-[16px] text-slate-400 transition-transform" style={{ transform: collapsedGroups.has(group) ? 'rotate(-90deg)' : 'rotate(0deg)' }}>expand_more</span>
                            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{group}</span>
                          </div>
                        </div>
                      )}
                      {!collapsedGroups.has(group) && (
                        <div className="p-3 active:bg-slate-50 dark:active:bg-slate-800/40" onClick={() => { setSelectedSupplier(supplier); setIsDetailsOpen(true); }}>
                          <div className="flex items-start justify-between mb-1">
                            <div className="flex-1 min-w-0">
                              <p className="font-bold text-slate-900 dark:text-white truncate text-[13px]">{label || supplier.name}</p>
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
                              <p className="font-medium text-slate-700 dark:text-slate-300">{supplier.lastIssueDate ? formatDate(supplier.lastIssueDate) : '-'}</p>
                            </div>
                            <div>
                              <p className="text-slate-400">Tabela de Preço</p>
                              <p className="font-medium text-slate-700 dark:text-slate-300">{supplier.priceItemCount != null ? `${supplier.priceItemCount.toLocaleString('pt-BR')} itens` : '-'}</p>
                            </div>
                          </div>
                          <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={() => { setSelectedSupplier(supplier); setIsDetailsOpen(true); }}
                              className="flex-1 inline-flex items-center justify-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-primary hover:border-primary/30 hover:bg-primary/5 transition-colors"
                            >
                              <span className="material-symbols-outlined text-[16px]">search</span>
                              Detalhes
                            </button>
                            <button
                              onClick={() => { setSelectedPriceSupplier(supplier); setIsPriceTableOpen(true); }}
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
            <span className="text-xs sm:text-sm text-slate-500">Mostrando {suppliers.length} de {total}</span>
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

            <span className="text-xs text-slate-500 sm:hidden">{page}/{totalPages}</span>
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
      <SupplierDetailsModal
        isOpen={isDetailsOpen}
        onClose={() => setIsDetailsOpen(false)}
        supplier={selectedSupplier ? { cnpj: selectedSupplier.cnpj, name: selectedSupplier.name } : null}
      />
      <SupplierPriceTableModal
        isOpen={isPriceTableOpen}
        onClose={() => setIsPriceTableOpen(false)}
        supplier={selectedPriceSupplier ? { cnpj: selectedPriceSupplier.cnpj, name: selectedPriceSupplier.name } : null}
      />
    </>
  );
}
