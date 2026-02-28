'use client';

import React, { useEffect, useCallback, useState } from 'react';
import { toast } from 'sonner';
import dynamic from 'next/dynamic';
import Skeleton from '@/components/ui/Skeleton';
import MobileFilterWrapper from '@/components/ui/MobileFilterWrapper';
import { useModalBackButton } from '@/hooks/useModalBackButton';
import { formatCnpj, formatCurrency, formatDate, getDateGroupLabel } from '@/lib/utils';
import { useRole } from '@/hooks/useRole';

const InvoiceDetailsModal = dynamic(() => import('@/components/InvoiceDetailsModal'), { ssr: false });

function parseCurrencyInput(value: string): number {
  const text = String(value || '').trim();
  if (!text) return Number.NaN;
  const sanitized = text
    .replace(/\s+/g, '')
    .replace(/R\$/gi, '')
    .replace(/[^0-9,.-]/g, '');

  const normalized = (() => {
    if (sanitized.includes(',')) {
      return sanitized.replace(/\./g, '').replace(',', '.');
    }
    if (!sanitized.includes('.')) {
      return sanitized;
    }
    const parts = sanitized.split('.');
    const decimalPart = parts[parts.length - 1];
    if (decimalPart.length <= 2) {
      return `${parts.slice(0, -1).join('')}.${decimalPart}`;
    }
    return parts.join('');
  })();

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function toCurrencyInput(value: number): string {
  if (!Number.isFinite(value)) return '';
  return formatCurrency(roundMoney(value));
}

function getNextDupNumero(rows: Array<Pick<DuplicataEditForm, 'dupNumero'>>): string {
  const maxNumber = rows.reduce((max, row) => {
    const digits = String(row.dupNumero || '').replace(/\D/g, '');
    const parsed = digits ? parseInt(digits, 10) : Number.NaN;
    return Number.isFinite(parsed) ? Math.max(max, parsed) : max;
  }, 0);
  return String(maxNumber + 1).padStart(3, '0');
}

function createEditRowId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

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
  dupNumeroOriginal: string;
  dupVencimento: string;
  dupVencimentoOriginal: string;
  dupValor: number;
  dupDesconto?: number;
  status: 'overdue' | 'due_today' | 'due_soon' | 'upcoming';
  diasAtraso: number;
  diasParaVencer: number;
  parcelaTotal?: number;
}

interface InvoiceHeader {
  id: string;
  number: string;
  issueDate: string;
  totalValue: number;
  clienteNome: string;
  clienteCnpj: string;
}

interface DuplicataEditForm {
  id: string;
  invoiceId: string;
  dupNumeroOriginal: string;
  dupVencimentoOriginal: string;
  dupNumero: string;
  dupVencimento: string;
  dupValor: string;
  dupDesconto: string;
}

interface Summary {
  total: number;
  totalValor: number;
  hoje: number;
  hojeValor: number;
  esteMes: number;
  esteMesValor: number;
  proximoMes: number;
  proximoMesValor: number;
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
  const { canWrite } = useRole();
  const [duplicatas, setDuplicatas] = useState<Duplicata[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('upcoming');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [limit, setLimit] = useState(50);
  const [sortBy, setSortBy] = useState('vencimento');
  const [sortOrder, setSortOrder] = useState('asc');
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
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
      const loaded = data.duplicatas || [];
      setDuplicatas(loaded);
      setSummary(data.summary);
      setTotal(data.pagination.total);
      setTotalPages(data.pagination.pages);
      const cnpjs = Array.from(new Set(loaded.map((d: any) => d.clienteCnpj).filter(Boolean)));
      if (cnpjs.length > 0) {
        const p = new URLSearchParams();
        cnpjs.forEach((c: any) => p.append('cnpjs', c));
        const nr = await fetch(`/api/contacts/nickname/batch?${p}`);
        if (nr.ok) { const nd = await nr.json(); setNicknames(new Map(Object.entries(nd.nicknames || {}))); }
      } else { setNicknames(new Map()); }
    } catch {
      toast.error('Erro ao carregar contas a receber');
    } finally {
      setLoading(false);
    }
  };

  const getNick = (cnpj: string | null | undefined, name: string | null | undefined) => {
    const full = (name || '').trim() || '-';
    if (!cnpj) return { display: full, full: null };
    const nick = nicknames.get(cnpj);
    if (nick) return { display: nick, full };
    const isCpf = cnpj.replace(/\D/g, '').length === 11;
    return isCpf ? { display: 'PARTICULAR', full } : { display: full, full: null };
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
      d.clienteNome,
      d.clienteCnpj,
      d.nfNumero,
      d.faturaNumero,
      d.dupNumero,
      formatDate(d.dupVencimento + 'T00:00:00'),
      d.dupValor.toFixed(2).replace('.', ','),
      statusConfig[d.status]?.label || d.status,
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

  const SortIcon = ({ col }: { col: string }) => (
    <span className={`material-symbols-outlined text-[14px] ml-0.5 ${sortBy === col ? 'text-primary' : 'text-slate-300 dark:text-slate-600'}`}>
      {sortBy === col && sortOrder === 'desc' ? 'arrow_downward' : 'arrow_upward'}
    </span>
  );

  const formatVencimento = (dateStr: string) => {
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('pt-BR');
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

  const updateEditingDuplicata = (
    index: number,
    field: 'dupVencimento' | 'dupValor' | 'dupDesconto',
    value: string
  ) => {
    setEditingDuplicatas((prev) => prev.map((item, i) => (
      i === index
        ? { ...item, [field]: value }
        : item
    )));
  };

  const normalizeEditingCurrencyField = (index: number, field: 'dupValor' | 'dupDesconto') => {
    setEditingDuplicatas((prev) => prev.map((item, i) => {
      if (i !== index) return item;
      const parsedValue = parseCurrencyInput(item[field]);
      return {
        ...item,
        [field]: Number.isFinite(parsedValue) ? toCurrencyInput(parsedValue) : '',
      };
    }));
  };

  const addInstallment = () => {
    setEditingDuplicatas((prev) => {
      const invoiceId = invoiceHeader?.id || selectedDuplicata?.invoiceId || prev[0]?.invoiceId || '';
      const nextNumber = getNextDupNumero(prev);
      const lastDueDate = prev[prev.length - 1]?.dupVencimento || '';
      return [
        ...prev,
        {
          id: createEditRowId(),
          invoiceId,
          dupNumeroOriginal: nextNumber,
          dupVencimentoOriginal: lastDueDate,
          dupNumero: nextNumber,
          dupVencimento: lastDueDate,
          dupValor: '',
          dupDesconto: toCurrencyInput(0),
        },
      ];
    });
  };

  const removeInstallment = (index: number) => {
    setEditingDuplicatas((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((_, i) => i !== index);
    });
  };

  const handleSaveDetails = async () => {
    if (!invoiceHeader || editingDuplicatas.length === 0) return;

    const seenDupNumero = new Set<string>();
    const installmentsPayload: Array<{ dupNumero: string; dupVencimento: string; dupValor: number; dupDesconto: number }> = [];

    for (const row of editingDuplicatas) {
      if (!row.dupVencimento) {
        toast.error('Informe o vencimento de todas as parcelas.');
        return;
      }
      const dupNumero = String(row.dupNumero || '').trim() || String(installmentsPayload.length + 1).padStart(3, '0');
      if (seenDupNumero.has(dupNumero)) {
        toast.error('Existem parcelas com o mesmo número. Ajuste antes de salvar.');
        return;
      }
      seenDupNumero.add(dupNumero);

      const parsedValue = parseCurrencyInput(row.dupValor);
      if (!Number.isFinite(parsedValue) || parsedValue < 0) {
        toast.error('Informe um valor válido para todas as parcelas.');
        return;
      }
      const parsedDiscount = parseCurrencyInput(row.dupDesconto);
      if (!Number.isFinite(parsedDiscount) || parsedDiscount < 0) {
        toast.error('Informe um desconto válido para todas as parcelas.');
        return;
      }
      if (parsedDiscount > parsedValue) {
        toast.error('O desconto não pode ser maior que o valor da parcela.');
        return;
      }

      installmentsPayload.push({
        dupNumero,
        dupVencimento: row.dupVencimento,
        dupValor: roundMoney(parsedValue),
        dupDesconto: roundMoney(parsedDiscount),
      });
    }

    const totalParcelas = roundMoney(
      installmentsPayload.reduce((sum, item) => sum + Math.max(0, item.dupValor - item.dupDesconto), 0)
    );
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

  const formatParcela = (dup: Duplicata) => {
    const digits = (dup.dupNumero || '').replace(/\D/g, '');
    const parsed = digits ? parseInt(digits, 10) : Number.NaN;
    const parcelaAtual = Number.isFinite(parsed)
      ? String(parsed).padStart(3, '0')
      : (dup.dupNumero || '001');
    const parcelaTotal = Math.max(1, dup.parcelaTotal || 1);
    return parcelaTotal > 1
      ? `${parcelaAtual} / ${String(parcelaTotal).padStart(3, '0')}`
      : parcelaAtual;
  };

  const getParcelaLabel = (dupNumero: string, idx: number, total: number) => {
    const digits = (dupNumero || '').replace(/\D/g, '');
    const parsed = digits ? parseInt(digits, 10) : Number.NaN;
    const parcelaAtual = Number.isFinite(parsed)
      ? String(parsed).padStart(3, '0')
      : String(idx + 1).padStart(3, '0');
    if (total <= 1) return parcelaAtual;
    return `${parcelaAtual} / ${String(total).padStart(3, '0')}`;
  };

  const parsedEditingValues = editingDuplicatas.map((row) => parseCurrencyInput(row.dupValor));
  const parsedEditingDiscounts = editingDuplicatas.map((row) => parseCurrencyInput(row.dupDesconto));
  const hasInvalidEditingValue = parsedEditingValues.some((value) => !Number.isFinite(value) || value < 0)
    || parsedEditingDiscounts.some((value) => !Number.isFinite(value) || value < 0)
    || parsedEditingValues.some((value, idx) => Number.isFinite(value) && Number.isFinite(parsedEditingDiscounts[idx]) && parsedEditingDiscounts[idx] > value);
  const totalParcelasEdicao = roundMoney(
    parsedEditingValues.reduce((sum, value, idx) => {
      const safeValue = Number.isFinite(value) ? Math.max(0, value) : 0;
      const discount = parsedEditingDiscounts[idx];
      const safeDiscount = Number.isFinite(discount) ? Math.max(0, discount) : 0;
      return sum + Math.max(0, safeValue - safeDiscount);
    }, 0)
  );
  const totalDescontoEdicao = roundMoney(
    parsedEditingDiscounts.reduce((sum, value) => sum + (Number.isFinite(value) ? Math.max(0, value) : 0), 0)
  );
  const totalNotaEdicao = roundMoney(invoiceHeader?.totalValue || selectedDuplicata?.nfValorTotal || 0);
  const diferencaEdicao = roundMoney(totalNotaEdicao - totalParcelasEdicao);
  const parcelasConferem = Math.abs(diferencaEdicao) <= 0.01;
  const totaisValidos = parcelasConferem && !hasInvalidEditingValue;
  const canSaveDetails = !savingDetails && !loadingDetails && editingDuplicatas.length > 0 && totaisValidos;

  return (
    <div className="w-full min-w-0 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 mb-6">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white truncate">Contas a Receber</h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
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
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4 mb-6">
          <div className="bg-white dark:bg-card-dark rounded-xl border border-slate-200 dark:border-slate-700 p-2.5 sm:p-4 overflow-hidden">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="hidden sm:flex w-10 h-10 rounded-lg bg-amber-50 dark:bg-amber-900/30 items-center justify-center flex-shrink-0">
                <span className="material-symbols-outlined text-amber-600 dark:text-amber-400 text-[20px]">today</span>
              </div>
              <div className="min-w-0">
                <p className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400">Hoje</p>
                <p className="text-sm sm:text-lg font-bold text-amber-600 dark:text-amber-400 truncate">{formatCurrency(summary.hojeValor)}</p>
                <p className="text-[10px] sm:text-xs text-slate-400">{summary.hoje} dup.</p>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-card-dark rounded-xl border border-slate-200 dark:border-slate-700 p-2.5 sm:p-4 overflow-hidden">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="hidden sm:flex w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-900/30 items-center justify-center flex-shrink-0">
                <span className="material-symbols-outlined text-blue-600 dark:text-blue-400 text-[20px]">calendar_month</span>
              </div>
              <div className="min-w-0">
                <p className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400">Este Mês</p>
                <p className="text-sm sm:text-lg font-bold text-blue-600 dark:text-blue-400 truncate">{formatCurrency(summary.esteMesValor)}</p>
                <p className="text-[10px] sm:text-xs text-slate-400">{summary.esteMes} dup.</p>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-card-dark rounded-xl border border-slate-200 dark:border-slate-700 p-2.5 sm:p-4 overflow-hidden">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="hidden sm:flex w-10 h-10 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 items-center justify-center flex-shrink-0">
                <span className="material-symbols-outlined text-indigo-600 dark:text-indigo-400 text-[20px]">event_repeat</span>
              </div>
              <div className="min-w-0">
                <p className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400">Próx. Mês</p>
                <p className="text-sm sm:text-lg font-bold text-indigo-600 dark:text-indigo-400 truncate">{formatCurrency(summary.proximoMesValor)}</p>
                <p className="text-[10px] sm:text-xs text-slate-400">{summary.proximoMes} dup.</p>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-card-dark rounded-xl border border-slate-200 dark:border-slate-700 p-2.5 sm:p-4 overflow-hidden">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="hidden sm:flex w-10 h-10 rounded-lg bg-slate-100 dark:bg-slate-800 items-center justify-center flex-shrink-0">
                <span className="material-symbols-outlined text-slate-600 dark:text-slate-300 text-[20px]">request_quote</span>
              </div>
              <div className="min-w-0">
                <p className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400">Total</p>
                <p className="text-sm sm:text-lg font-bold text-slate-900 dark:text-white truncate">{formatCurrency(summary.totalValor)}</p>
                <p className="text-[10px] sm:text-xs text-slate-400">{summary.total} dup.</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="mb-4">
      <MobileFilterWrapper activeFilterCount={[search, statusFilter !== 'upcoming' ? statusFilter : '', dateFrom, dateTo].filter(Boolean).length} title="Filtros" icon="request_quote">
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

          {(search || statusFilter !== 'upcoming' || dateFrom || dateTo) && (
            <button
              onClick={() => { setSearchInput(''); setSearch(''); setStatusFilter('upcoming'); setDateFrom(''); setDateTo(''); setPage(1); }}
              className="px-3 py-2 text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-white border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
            >
              <span className="material-symbols-outlined text-[18px]">filter_alt_off</span>
            </button>
          )}
        </div>
      </MobileFilterWrapper>
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
              {search || statusFilter !== 'upcoming' || dateFrom || dateTo
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
                      onClick={() => handleSort('vencimento')}
                    >
                      <div className="flex items-center">Vencimento <SortIcon col="vencimento" /></div>
                    </th>
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
                    <th className="text-center px-4 py-3 font-semibold text-slate-500 dark:text-slate-400">
                      Ações
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    let lastGroup = '';
                    return duplicatas.map((dup, idx) => {
                      const group = getDateGroupLabel(dup.dupVencimento + 'T00:00:00');
                      const showDivider = group !== lastGroup;
                      lastGroup = group;
                      const cfg = statusConfig[dup.status];
                      return (
                        <React.Fragment key={`${dup.invoiceId}-${dup.dupNumero}-${idx}`}>
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
                            <tr
                              className={`border-b border-slate-50 dark:border-slate-800/50 hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-colors cursor-pointer ${
                                dup.status === 'overdue' ? 'bg-red-50/30 dark:bg-red-900/5' : ''
                              }`}
                              onClick={() => openDetails(dup)}
                            >
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
                              <td className="px-4 py-3">
                                <div>
                                  {(() => { const n = getNick(dup.clienteCnpj, dup.clienteNome); return n.full ? (<><p className="font-bold text-slate-900 dark:text-white truncate max-w-[250px]" title={n.full}>{n.display}</p><p className="text-[10px] text-slate-400 dark:text-slate-500">{n.full}</p></>) : (<p className="font-medium text-slate-900 dark:text-white truncate max-w-[250px]" title={n.display}>{n.display}</p>); })()}
                                  <p className="text-xs text-slate-400">{formatCnpj(dup.clienteCnpj)}</p>
                                </div>
                              </td>
                              <td className="px-4 py-3">
                                <p className="font-mono text-slate-700 dark:text-slate-300">{dup.nfNumero}</p>
                              </td>
                              <td className="px-4 py-3">
                                <span className="font-mono text-slate-600 dark:text-slate-400">{formatParcela(dup)}</span>
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
                              <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                                <button
                                  onClick={() => openDetails(dup)}
                                  className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-slate-500 hover:text-primary hover:bg-primary/10 transition-colors"
                                  title="Visualizar e editar"
                                >
                                  <span className="material-symbols-outlined text-[18px]">visibility</span>
                                </button>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    });
                  })()}
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
                    className={`p-2.5 space-y-1.5 cursor-pointer active:bg-slate-50 dark:active:bg-slate-800/40 ${dup.status === 'overdue' ? 'bg-red-50/30 dark:bg-red-900/5' : ''}`}
                    onClick={() => openDetails(dup)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        {(() => { const n = getNick(dup.clienteCnpj, dup.clienteNome); return n.full ? (<><p className="text-xs font-bold text-slate-900 dark:text-white truncate">{n.display}</p><p className="text-[10px] text-slate-400 dark:text-slate-500 truncate">{n.full}</p></>) : (<p className="text-xs font-medium text-slate-900 dark:text-white truncate">{n.display}</p>); })()}
                        <p className="text-[10px] text-slate-400 truncate">{formatCnpj(dup.clienteCnpj)}</p>
                      </div>
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold rounded-full border ${cfg.classes} flex-shrink-0`}>
                        <span className="material-symbols-outlined text-[12px]">{cfg.icon}</span>
                        {cfg.label}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-1.5 text-[10px] min-w-0">
                      <div className="min-w-0">
                        <p className="text-[9px] text-slate-400">NF-e</p>
                        <p className="font-mono text-slate-700 dark:text-slate-300 truncate">{dup.nfNumero}</p>
                      </div>
                      <div className="min-w-0">
                        <p className="text-[9px] text-slate-400">Parcela</p>
                        <p className="font-mono text-slate-700 dark:text-slate-300 truncate">{formatParcela(dup)}</p>
                      </div>
                      <div className="min-w-0">
                        <p className="text-[9px] text-slate-400">Vencimento</p>
                        <p className={`font-medium truncate ${dup.status === 'overdue' ? 'text-red-600 dark:text-red-400' : 'text-slate-700 dark:text-slate-300'}`}>
                          {formatVencimento(dup.dupVencimento)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-900 dark:text-white">{formatCurrency(dup.dupValor)}</span>
                      {dup.status === 'overdue' && (
                        <span className="text-[10px] text-red-500">{dup.diasAtraso} dia{dup.diasAtraso !== 1 ? 's' : ''} em atraso</span>
                      )}
                      <button
                        onClick={(e) => { e.stopPropagation(); openDetails(dup); }}
                        className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-primary hover:border-primary/30 hover:bg-primary/5 transition-colors"
                      >
                        <span className="material-symbols-outlined text-[14px]">visibility</span>
                        Ver
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Pagination */}
            <div className="flex flex-wrap items-center justify-between gap-2 px-3 sm:px-4 py-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/30 dark:bg-slate-800/20">
              <div className="flex items-center gap-2 text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                <span>{((page - 1) * limit) + 1}-{Math.min(page * limit, total)} de {total}</span>
                <select
                  value={limit}
                  onChange={e => { setLimit(Number(e.target.value)); setPage(1); }}
                  className="ml-1 px-2 py-1 text-xs border border-slate-200 dark:border-slate-700 rounded bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300"
                >
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>
              <div className="flex items-center gap-0.5 sm:gap-1">
                <button
                  onClick={() => setPage(1)}
                  disabled={page === 1}
                  className="p-1 sm:p-1.5 rounded text-slate-500 hover:text-primary hover:bg-primary/10 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-500 transition-colors"
                >
                  <span className="material-symbols-outlined text-[18px]">first_page</span>
                </button>
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="p-1 sm:p-1.5 rounded text-slate-500 hover:text-primary hover:bg-primary/10 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-500 transition-colors"
                >
                  <span className="material-symbols-outlined text-[18px]">chevron_left</span>
                </button>
                <span className="px-2 sm:px-3 py-1 text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-300">
                  {page} / {totalPages}
                </span>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="p-1 sm:p-1.5 rounded text-slate-500 hover:text-primary hover:bg-primary/10 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-500 transition-colors"
                >
                  <span className="material-symbols-outlined text-[18px]">chevron_right</span>
                </button>
                <button
                  onClick={() => setPage(totalPages)}
                  disabled={page === totalPages}
                  className="p-1 sm:p-1.5 rounded text-slate-500 hover:text-primary hover:bg-primary/10 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-500 transition-colors"
                >
                  <span className="material-symbols-outlined text-[18px]">last_page</span>
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {isDetailsOpen && (selectedDuplicata || invoiceHeader) && (
        <div className="fixed inset-0 z-50 sm:flex sm:items-center sm:justify-center sm:p-4 sm:bg-black/60 sm:backdrop-blur-sm">
          <div className="absolute inset-0 hidden sm:block" onClick={closeDetails} aria-hidden="true" />
          <div className="absolute inset-0 sm:relative sm:inset-auto bg-slate-50 dark:bg-[#1a1e2e] sm:rounded-2xl w-full sm:max-w-4xl sm:h-auto sm:max-h-[90vh] flex flex-col overflow-hidden sm:shadow-2xl sm:ring-1 ring-black/5 dark:ring-white/5" role="dialog" aria-modal="true">
            {/* Fixed Header */}
            <div className="px-4 sm:px-6 py-4 bg-white dark:bg-card-dark border-b border-slate-200 dark:border-slate-700 shrink-0 shadow-[0_2px_8px_rgba(0,0,0,0.08)] sm:shadow-none">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 dark:from-primary/30 dark:to-primary/10 flex items-center justify-center ring-1 ring-primary/20 dark:ring-primary/30 shrink-0 hidden sm:flex">
                    <span className="material-symbols-outlined text-[22px] text-primary">receipt_long</span>
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-[15px] font-bold text-slate-900 dark:text-white leading-tight truncate">
                      Duplicatas — NF-e {invoiceHeader?.number || selectedDuplicata?.nfNumero}
                    </h3>
                    <span className="text-[11px] text-slate-400 dark:text-slate-500">
                      {(() => { const cnpj = invoiceHeader?.clienteCnpj || selectedDuplicata?.clienteCnpj; const nome = invoiceHeader?.clienteNome || selectedDuplicata?.clienteNome; const n = getNick(cnpj, nome); return n.display; })()}
                    </span>
                  </div>
                </div>
                <button onClick={closeDetails} aria-label="Fechar" className="hidden sm:flex p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0" title="Fechar">
                  <span className="material-symbols-outlined text-[20px]">close</span>
                </button>
              </div>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6">
              <div className="space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 bg-white/60 dark:bg-slate-800/40">
                    <p className="text-[11px] uppercase tracking-wider text-slate-400">Número da NF-e</p>
                    <div className="mt-1 flex items-center gap-2">
                      <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                        {invoiceHeader?.number || selectedDuplicata?.nfNumero}
                      </p>
                      <button
                        onClick={() => openInvoiceModal((invoiceHeader?.id || selectedDuplicata?.invoiceId || ''))}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold text-primary border border-primary/30 hover:bg-primary/10 transition-colors"
                        disabled={!(invoiceHeader?.id || selectedDuplicata?.invoiceId)}
                      >
                        <span className="material-symbols-outlined text-[14px]">open_in_new</span>
                        Ver NF-e
                      </button>
                    </div>
                  </div>
                  <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 bg-white/60 dark:bg-slate-800/40">
                    <p className="text-[11px] uppercase tracking-wider text-slate-400">Emissão</p>
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                      {formatDate(invoiceHeader?.issueDate || selectedDuplicata?.nfEmissao || '')}
                    </p>
                  </div>
                  <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 bg-white/60 dark:bg-slate-800/40">
                    <p className="text-[11px] uppercase tracking-wider text-slate-400">Cliente</p>
                    {(() => { const cnpj = invoiceHeader?.clienteCnpj || selectedDuplicata?.clienteCnpj; const nome = invoiceHeader?.clienteNome || selectedDuplicata?.clienteNome; const n = getNick(cnpj, nome); return n.full ? (<><p className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate" title={n.full}>{n.display}</p><p className="text-[10px] text-slate-400 dark:text-slate-500">{n.full}</p></>) : (<p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate" title={n.display}>{n.display}</p>); })()}
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      {formatCnpj(invoiceHeader?.clienteCnpj || selectedDuplicata?.clienteCnpj || '')}
                    </p>
                  </div>
                </div>

                <div className="border-t border-slate-200 dark:border-slate-700 pt-5">
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <h4 className="text-sm font-bold text-slate-700 dark:text-slate-200">
                      Parcelas da Nota
                    </h4>
                    {canWrite && (
                      <button
                        type="button"
                        onClick={addInstallment}
                        disabled={loadingDetails || savingDetails}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-lg border border-primary/30 text-primary hover:bg-primary/10 transition-colors disabled:opacity-50"
                      >
                        <span className="material-symbols-outlined text-[16px]">add</span>
                        Adicionar parcela
                      </button>
                    )}
                  </div>
                  {loadingDetails ? (
                    <div className="space-y-2">
                      {Array.from({ length: 4 }).map((_, idx) => (
                        <Skeleton key={idx} className="h-12 rounded-lg" />
                      ))}
                    </div>
                  ) : editingDuplicatas.length === 0 ? (
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      Nenhuma parcela encontrada para esta nota.
                    </p>
                  ) : (
                    <>
                    {/* Mobile cards */}
                    <div className="sm:hidden space-y-1.5">
                      {editingDuplicatas.map((row, idx) => (
                        <div key={row.id} className="rounded-lg border border-slate-200 dark:border-slate-700 p-2.5 bg-white dark:bg-slate-800/40">
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-xs font-bold font-mono text-slate-700 dark:text-slate-200">
                              Parcela {getParcelaLabel(row.dupNumero, idx, editingDuplicatas.length)}
                            </span>
                            {canWrite && (
                              <button
                                type="button"
                                onClick={() => removeInstallment(idx)}
                                disabled={editingDuplicatas.length <= 1 || savingDetails}
                                className="inline-flex items-center justify-center w-7 h-7 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-40"
                                title="Remover parcela"
                              >
                                <span className="material-symbols-outlined text-[16px]">delete</span>
                              </button>
                            )}
                          </div>
                          <div className="space-y-1.5">
                            <div>
                              <label className="text-[10px] uppercase tracking-wider text-slate-400">Vencimento</label>
                              <input
                                type="date"
                                value={row.dupVencimento}
                                onChange={(e) => updateEditingDuplicata(idx, 'dupVencimento', e.target.value)}
                                readOnly={!canWrite}
                                className={`w-full px-2.5 py-1.5 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white${!canWrite ? ' opacity-60 cursor-not-allowed' : ''}`}
                              />
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="text-[10px] uppercase tracking-wider text-slate-400">Valor</label>
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  value={row.dupValor}
                                  onChange={(e) => updateEditingDuplicata(idx, 'dupValor', e.target.value)}
                                  onBlur={() => normalizeEditingCurrencyField(idx, 'dupValor')}
                                  placeholder="R$ 0,00"
                                  readOnly={!canWrite}
                                  className={`w-full px-2.5 py-1.5 text-sm text-right border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white${!canWrite ? ' opacity-60 cursor-not-allowed' : ''}`}
                                />
                              </div>
                              <div>
                                <label className="text-[10px] uppercase tracking-wider text-slate-400">Desconto</label>
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  value={row.dupDesconto}
                                  onChange={(e) => updateEditingDuplicata(idx, 'dupDesconto', e.target.value)}
                                  onBlur={() => normalizeEditingCurrencyField(idx, 'dupDesconto')}
                                  placeholder="R$ 0,00"
                                  readOnly={!canWrite}
                                  className={`w-full px-2.5 py-1.5 text-sm text-right border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white${!canWrite ? ' opacity-60 cursor-not-allowed' : ''}`}
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Desktop table */}
                    <div className="hidden sm:block overflow-x-auto border border-slate-200 dark:border-slate-700 rounded-lg">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700">
                          <tr>
                            <th className="text-left px-3 py-2 font-semibold text-slate-500 dark:text-slate-400">Parcela</th>
                            <th className="text-left px-3 py-2 font-semibold text-slate-500 dark:text-slate-400">Vencimento</th>
                            <th className="text-right px-3 py-2 font-semibold text-slate-500 dark:text-slate-400">Valor</th>
                            <th className="text-right px-3 py-2 font-semibold text-slate-500 dark:text-slate-400">Desconto</th>
                            {canWrite && <th className="text-center px-3 py-2 font-semibold text-slate-500 dark:text-slate-400">Ação</th>}
                          </tr>
                        </thead>
                        <tbody>
                          {editingDuplicatas.map((row, idx) => (
                            <tr key={row.id} className="border-b border-slate-100 dark:border-slate-800 last:border-b-0">
                              <td className="px-3 py-2 font-mono text-slate-700 dark:text-slate-200">
                                {getParcelaLabel(row.dupNumero, idx, editingDuplicatas.length)}
                              </td>
                              <td className="px-3 py-2">
                                <input
                                  type="date"
                                  value={row.dupVencimento}
                                  onChange={(e) => updateEditingDuplicata(idx, 'dupVencimento', e.target.value)}
                                  readOnly={!canWrite}
                                  className={`w-full px-2.5 py-1.5 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white${!canWrite ? ' opacity-60 cursor-not-allowed' : ''}`}
                                />
                              </td>
                              <td className="px-3 py-2">
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  value={row.dupValor}
                                  onChange={(e) => updateEditingDuplicata(idx, 'dupValor', e.target.value)}
                                  onBlur={() => normalizeEditingCurrencyField(idx, 'dupValor')}
                                  placeholder="R$ 0,00"
                                  readOnly={!canWrite}
                                  className={`w-full px-2.5 py-1.5 text-sm text-right border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white${!canWrite ? ' opacity-60 cursor-not-allowed' : ''}`}
                                />
                              </td>
                              <td className="px-3 py-2">
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  value={row.dupDesconto}
                                  onChange={(e) => updateEditingDuplicata(idx, 'dupDesconto', e.target.value)}
                                  onBlur={() => normalizeEditingCurrencyField(idx, 'dupDesconto')}
                                  placeholder="R$ 0,00"
                                  readOnly={!canWrite}
                                  className={`w-full px-2.5 py-1.5 text-sm text-right border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white${!canWrite ? ' opacity-60 cursor-not-allowed' : ''}`}
                                />
                              </td>
                              {canWrite && (
                              <td className="px-3 py-2 text-center">
                                <button
                                  type="button"
                                  onClick={() => removeInstallment(idx)}
                                  disabled={editingDuplicatas.length <= 1 || savingDetails}
                                  className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-slate-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-40"
                                  title="Remover parcela"
                                >
                                  <span className="material-symbols-outlined text-[18px]">delete</span>
                                </button>
                              </td>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    </>
                  )}
                  {!loadingDetails && editingDuplicatas.length > 0 && (
                    <div className={`mt-3 rounded-lg border px-3 py-2 text-xs sm:text-sm ${
                      totaisValidos
                        ? 'border-emerald-200 bg-emerald-50/60 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300'
                        : 'border-amber-200 bg-amber-50/70 text-amber-700 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300'
                    }`}>
                      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs sm:text-sm">
                        <span>Nota: <strong>{formatCurrency(totalNotaEdicao)}</strong></span>
                        <span>Parcelas: <strong>{formatCurrency(totalParcelasEdicao)}</strong></span>
                        <span>Desconto: <strong>{formatCurrency(totalDescontoEdicao)}</strong></span>
                        <span>Diferença: <strong>{formatCurrency(Math.abs(diferencaEdicao))}</strong></span>
                      </div>
                      {hasInvalidEditingValue ? (
                        <p className="mt-1 text-xs">
                          Preencha valores e descontos válidos (ex.: R$ 12.542,83) e mantenha desconto menor ou igual ao valor.
                        </p>
                      ) : !parcelasConferem && (
                        <p className="mt-1 text-xs">
                          A soma das parcelas deve ser igual ao valor total da nota para salvar.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Fixed Footer */}
            <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-card-dark shrink-0 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] sm:shadow-none">
              {/* Mobile */}
              <div className="sm:hidden flex gap-2">
                <button
                  onClick={closeDetails}
                  className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl bg-primary text-white font-bold text-base active:bg-primary-dark transition-colors shadow-sm"
                >
                  <span className="material-symbols-outlined text-[20px]">arrow_back</span>
                  Voltar
                </button>
                {canWrite && (
                  <button
                    onClick={handleSaveDetails}
                    disabled={!canSaveDetails}
                    className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl bg-emerald-600 text-white font-bold text-base active:bg-emerald-700 transition-colors shadow-sm disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    <span className="material-symbols-outlined text-[20px]">save</span>
                    {savingDetails ? 'Salvando...' : 'Salvar'}
                  </button>
                )}
              </div>
              {/* Desktop */}
              <div className="hidden sm:flex items-center justify-end gap-2">
                <button
                  onClick={closeDetails}
                  disabled={savingDetails}
                  className="px-3 py-2 text-sm font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-60"
                >
                  {canWrite ? 'Cancelar' : 'Fechar'}
                </button>
                {canWrite && (
                  <button
                    onClick={handleSaveDetails}
                    disabled={!canSaveDetails}
                    className="px-3 py-2 text-sm font-semibold rounded-lg bg-primary text-white hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {savingDetails ? 'Salvando...' : 'Salvar Alterações'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      <InvoiceDetailsModal
        isOpen={isInvoiceModalOpen}
        onClose={() => setIsInvoiceModalOpen(false)}
        invoiceId={detailsInvoiceId}
      />
    </div>
  );
}
