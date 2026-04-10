'use client';

import React, { useEffect, useCallback, useState } from 'react';
import { toast } from 'sonner';
import dynamic from 'next/dynamic';
import MobileFilterWrapper from '@/components/ui/MobileFilterWrapper';
import { useModalBackButton } from '@/hooks/useModalBackButton';
import { formatCurrency, formatAmount, getDateGroupLabel } from '@/lib/utils';
import { useRole } from '@/hooks/useRole';
import {
  type Duplicata,
  type InvoiceHeader,
  type DuplicataEditForm,
  type Summary,
  parseCurrencyInput,
  roundMoney,
  toCurrencyInput,
  getNextDupNumero,
  createEditRowId,
} from '../components/financeiro-utils';
import FinanceiroTable from '../components/FinanceiroTable';
import DuplicataEditPanel from '../components/DuplicataEditPanel';

const InvoiceDetailsModal = dynamic(() => import('@/components/InvoiceDetailsModal'), { ssr: false });

export default function ContasReceberPage() {
  const { canWrite } = useRole();
  const [duplicatas, setDuplicatas] = useState<Duplicata[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('upcoming');

  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [limit] = useState(50);
  const [sortBy, setSortBy] = useState('vencimento');
  const [sortOrder, setSortOrder] = useState('asc');
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [collapsedInitialized, setCollapsedInitialized] = useState(false);
  const [nicknames, setNicknames] = useState<Map<string, string>>(new Map());
  const [selectedDuplicata, setSelectedDuplicata] = useState<Duplicata | null>(null);
  const [invoiceHeader, setInvoiceHeader] = useState<InvoiceHeader | null>(null);
  const [editingDuplicatas, setEditingDuplicatas] = useState<DuplicataEditForm[]>([]);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [savingDetails, setSavingDetails] = useState(false);
  const [detailsInvoiceId, setDetailsInvoiceId] = useState<string | null>(null);
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);

  const toggleGroup = (group: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  };

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, limit, search, statusFilter, sortBy, sortOrder]);

  const loadData = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: '2000',
        sort: sortBy,
        order: sortOrder,
      });
      if (search) params.set('search', search);
      if (statusFilter) params.set('status', statusFilter);

      const res = await fetch(`/api/financeiro/contas-receber?${params}`);
      if (!res.ok) throw new Error('Erro ao carregar dados');
      const data = await res.json();
      const loaded: Duplicata[] = data.duplicatas || [];
      setDuplicatas(loaded);
      setSummary(data.summary);
      setTotal(data.pagination.total);
      setTotalPages(data.pagination.pages);
      if (!collapsedInitialized && loaded.length > 0) {
        // Auto-collapse groups beyond "Hoje"/"Esta semana"/"Próxima semana" on first load
        const groupOrder: string[] = [];
        for (const d of loaded) {
          const g = getDateGroupLabel(d.dupVencimento + 'T00:00:00');
          if (g && !groupOrder.includes(g)) groupOrder.push(g);
        }
        const firstGroup = groupOrder[0];
        const toCollapse = new Set(groupOrder.filter((g) => g !== firstGroup));
        setCollapsedGroups(toCollapse);
        setCollapsedInitialized(true);
      }
      const cnpjs = Array.from(new Set(loaded.map((d) => d.clienteCnpj).filter(Boolean))) as string[];
      if (cnpjs.length > 0) {
        const p = new URLSearchParams();
        cnpjs.forEach((c) => p.append('cnpjs', c));
        const nr = await fetch(`/api/contacts/nickname/batch?${p}`);
        if (nr.ok) { const nd = await nr.json(); setNicknames(new Map(Object.entries(nd.nicknames || {}))); }
      } else { setNicknames(new Map()); }
    } catch {
      toast.error('Erro ao carregar contas a receber');
    } finally {
      setLoading(false);
    }
  };

  const handleSort = (col: string) => {
    if (sortBy === col) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(col);
      setSortOrder('asc');
    }
    setPage(1);
  };

  const handleExport = () => {
    const headers = ['Cliente', 'CNPJ', 'NF-e', 'Fatura', 'Duplicata', 'Vencimento', 'Valor', 'Status'];
    const rows = duplicatas.map((d) => [
      d.clienteNome || '',
      d.clienteCnpj || '',
      d.nfNumero,
      d.faturaNumero,
      d.dupNumero,
      new Date(d.dupVencimento + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' }),
      d.dupValor.toFixed(2).replace('.', ','),
      ({ overdue: 'Vencida', due_today: 'Vence Hoje', due_soon: 'Próxima', upcoming: 'A Vencer' })[d.status] || d.status,
    ]);
    const csvContent = '\uFEFF' + [headers.join(';'), ...rows.map((r) => r.join(';'))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `contas-receber-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success('CSV exportado com sucesso!');
  };

  const openInvoiceModal = (invoiceId: string) => {
    setDetailsInvoiceId(invoiceId);
    setIsInvoiceModalOpen(true);
  };

  const openDetails = async (dup: Duplicata) => {
    setSelectedDuplicata(dup);
    setInvoiceHeader({
      id: dup.invoiceId,
      number: dup.nfNumero,
      issueDate: dup.nfEmissao,
      totalValue: dup.nfValorTotal,
      clienteNome: dup.clienteNome,
      clienteCnpj: dup.clienteCnpj,
    });
    setEditingDuplicatas([]);
    setIsDetailsOpen(true);
    setLoadingDetails(true);

    try {
      const res = await fetch(`/api/financeiro/contas-receber/invoice/${dup.invoiceId}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Erro ao carregar parcelas da nota');
      }

      const data = await res.json();
      const rows: Duplicata[] = Array.isArray(data.duplicatas) && data.duplicatas.length > 0
        ? data.duplicatas
        : [dup];
      setInvoiceHeader(data.invoice || {
        id: dup.invoiceId,
        number: dup.nfNumero,
        issueDate: dup.nfEmissao,
        totalValue: dup.nfValorTotal,
        clienteNome: dup.clienteNome,
        clienteCnpj: dup.clienteCnpj,
      });
      setEditingDuplicatas(rows.map((row) => ({
        id: createEditRowId(),
        invoiceId: row.invoiceId,
        dupNumeroOriginal: row.dupNumeroOriginal || row.dupNumero,
        dupVencimentoOriginal: row.dupVencimentoOriginal || row.dupVencimento,
        dupNumero: row.dupNumero,
        dupVencimento: row.dupVencimento,
        dupValor: toCurrencyInput(Number(row.dupValor ?? 0)),
        dupDesconto: toCurrencyInput(Number(row.dupDesconto ?? 0)),
      })));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro ao carregar detalhes da duplicata';
      toast.error(message);
      setEditingDuplicatas([{
        id: createEditRowId(),
        invoiceId: dup.invoiceId,
        dupNumeroOriginal: dup.dupNumeroOriginal || dup.dupNumero,
        dupVencimentoOriginal: dup.dupVencimentoOriginal || dup.dupVencimento,
        dupNumero: dup.dupNumero,
        dupVencimento: dup.dupVencimento,
        dupValor: toCurrencyInput(Number(dup.dupValor ?? 0)),
        dupDesconto: toCurrencyInput(Number(dup.dupDesconto ?? 0)),
      }]);
    } finally {
      setLoadingDetails(false);
    }
  };

  const closeDetails = useCallback(() => {
    if (savingDetails) return;
    setIsDetailsOpen(false);
    setSelectedDuplicata(null);
    setInvoiceHeader(null);
    setEditingDuplicatas([]);
  }, [savingDetails]);

  useModalBackButton(isDetailsOpen, closeDetails);

  useEffect(() => {
    if (!isDetailsOpen) return;
    document.body.style.overflow = 'hidden';
    const handleEscape = (e: KeyboardEvent) => { if (e.key === 'Escape') closeDetails(); };
    window.addEventListener('keydown', handleEscape);
    return () => { document.body.style.overflow = 'unset'; window.removeEventListener('keydown', handleEscape); };
  }, [isDetailsOpen, closeDetails]);

  const updateEditingDuplicata = (index: number, field: 'dupVencimento' | 'dupValor' | 'dupDesconto', value: string) => {
    setEditingDuplicatas((prev) => prev.map((item, i) => (i === index ? { ...item, [field]: value } : item)));
  };

  const normalizeEditingCurrencyField = (index: number, field: 'dupValor' | 'dupDesconto') => {
    setEditingDuplicatas((prev) => prev.map((item, i) => {
      if (i !== index) return item;
      const parsedValue = parseCurrencyInput(item[field]);
      return { ...item, [field]: Number.isFinite(parsedValue) ? toCurrencyInput(parsedValue) : '' };
    }));
  };

  const addInstallment = () => {
    setEditingDuplicatas((prev) => {
      const invoiceId = invoiceHeader?.id || selectedDuplicata?.invoiceId || prev[0]?.invoiceId || '';
      const nextNumber = getNextDupNumero(prev);
      const lastDueDate = prev[prev.length - 1]?.dupVencimento || '';
      return [...prev, { id: createEditRowId(), invoiceId, dupNumeroOriginal: nextNumber, dupVencimentoOriginal: lastDueDate, dupNumero: nextNumber, dupVencimento: lastDueDate, dupValor: '', dupDesconto: toCurrencyInput(0) }];
    });
  };

  const removeInstallment = (index: number) => {
    setEditingDuplicatas((prev) => prev.length <= 1 ? prev : prev.filter((_, i) => i !== index));
  };

  const handleSaveDetails = async () => {
    if (!invoiceHeader || editingDuplicatas.length === 0) return;

    const seenDupNumero = new Set<string>();
    const installmentsPayload: Array<{ dupNumero: string; dupVencimento: string; dupValor: number; dupDesconto: number }> = [];

    for (const row of editingDuplicatas) {
      if (!row.dupVencimento) { toast.error('Informe o vencimento de todas as parcelas.'); return; }
      const dupNumero = String(row.dupNumero || '').trim() || String(installmentsPayload.length + 1).padStart(3, '0');
      if (seenDupNumero.has(dupNumero)) { toast.error('Existem parcelas com o mesmo número. Ajuste antes de salvar.'); return; }
      seenDupNumero.add(dupNumero);

      const parsedValue = parseCurrencyInput(row.dupValor);
      if (!Number.isFinite(parsedValue) || parsedValue < 0) { toast.error('Informe um valor válido para todas as parcelas.'); return; }
      const parsedDiscount = parseCurrencyInput(row.dupDesconto);
      if (!Number.isFinite(parsedDiscount) || parsedDiscount < 0) { toast.error('Informe um desconto válido para todas as parcelas.'); return; }
      if (parsedDiscount > parsedValue) { toast.error('O desconto não pode ser maior que o valor da parcela.'); return; }

      installmentsPayload.push({ dupNumero, dupVencimento: row.dupVencimento, dupValor: roundMoney(parsedValue), dupDesconto: roundMoney(parsedDiscount) });
    }

    const totalParcelas = roundMoney(installmentsPayload.reduce((sum, item) => sum + Math.max(0, item.dupValor - item.dupDesconto), 0));
    const totalNota = roundMoney(invoiceHeader.totalValue || 0);
    const diffTotal = roundMoney(totalNota - totalParcelas);
    if (Math.abs(diffTotal) > 0.01) {
      toast.error(`A soma das parcelas (${formatCurrency(totalParcelas)}) deve bater com o valor da nota (${formatCurrency(totalNota)}).`);
      return;
    }

    setSavingDetails(true);
    try {
      const res = await fetch(`/api/financeiro/contas-receber/invoice/${invoiceHeader.id}/installments`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ installments: installmentsPayload }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Erro ao salvar parcelas');
      }

      toast.success('Parcelas atualizadas com sucesso.');
      setIsDetailsOpen(false);
      setSelectedDuplicata(null);
      setInvoiceHeader(null);
      setEditingDuplicatas([]);
      await loadData();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro ao salvar alterações';
      toast.error(message);
    } finally {
      setSavingDetails(false);
    }
  };

  return (
    <div className="w-full min-w-0 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 mb-6">
        <div className="hidden sm:block min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white truncate">Contas a Receber</h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">Duplicatas das NF-e emitidas</p>
        </div>
        <button
          onClick={handleExport}
          disabled={duplicatas.length === 0}
          className="hidden sm:flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-50 flex-shrink-0"
        >
          <span className="material-symbols-outlined text-[18px]">download</span>
          Exportar CSV
        </button>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4 mb-6">
          {[
            { label: 'Hoje', value: summary.hojeValor, count: summary.hoje, color: 'amber', icon: 'today' },
            { label: 'Esta Semana', value: summary.estaSemanaValor ?? 0, count: summary.estaSemana ?? 0, color: 'orange', icon: 'date_range' },
            { label: 'Este Mês', value: summary.esteMesValor, count: summary.esteMes, color: 'blue', icon: 'calendar_month' },
            { label: 'Próx. Mês', value: summary.proximoMesValor, count: summary.proximoMes, color: 'indigo', icon: 'event_repeat' },
          ].map(({ label, value, count, color, icon }) => (
            <div key={label} className="bg-white dark:bg-card-dark rounded-xl border border-slate-200 dark:border-slate-700 p-2.5 sm:p-4 overflow-hidden">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className={`hidden sm:flex w-10 h-10 rounded-lg bg-${color}-50 dark:bg-${color}-900/30 items-center justify-center flex-shrink-0`}>
                  <span className={`material-symbols-outlined text-${color}-600 dark:text-${color}-400 text-[20px]`}>{icon}</span>
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400">{label}</p>
                  <p className={`text-sm sm:text-lg font-bold text-${color}-600 dark:text-${color}-400 truncate`}>{formatAmount(value)}</p>
                  <p className="text-[10px] sm:text-xs text-slate-400">{count} dup.</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="mb-4">
        <MobileFilterWrapper activeFilterCount={[search, statusFilter].filter(Boolean).length} title="Filtros" icon="payments">
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
              <option value="upcoming">A Vencer</option>
            </select>
            {(search || statusFilter) && (
              <button
                onClick={() => { setSearchInput(''); setSearch(''); setStatusFilter(''); setPage(1); }}
                className="px-3 py-2 text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-white border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
              >
                <span className="material-symbols-outlined text-[18px]">filter_alt_off</span>
              </button>
            )}
          </div>
        </MobileFilterWrapper>
      </div>

      <FinanceiroTable
        duplicatas={duplicatas}
        loading={loading}
        total={total}
        search={search}
        statusFilter={statusFilter}
        sortBy={sortBy}
        sortOrder={sortOrder}
        collapsedGroups={collapsedGroups}
        nicknames={nicknames}
        direction="receber"
        onSort={handleSort}
        onToggleGroup={toggleGroup}
        onOpenDetails={openDetails}
      />

      <DuplicataEditPanel
        isOpen={isDetailsOpen}
        onClose={closeDetails}
        selectedDuplicata={selectedDuplicata}
        invoiceHeader={invoiceHeader}
        editingDuplicatas={editingDuplicatas}
        loadingDetails={loadingDetails}
        savingDetails={savingDetails}
        canWrite={canWrite}
        nicknames={nicknames}
        direction="receber"
        onUpdateRow={updateEditingDuplicata}
        onNormalizeCurrency={normalizeEditingCurrencyField}
        onAddInstallment={addInstallment}
        onRemoveInstallment={removeInstallment}
        onSave={handleSaveDetails}
        onOpenInvoice={openInvoiceModal}
      />

      <InvoiceDetailsModal
        isOpen={isInvoiceModalOpen}
        onClose={() => setIsInvoiceModalOpen(false)}
        invoiceId={detailsInvoiceId}
      />
    </div>
  );
}
