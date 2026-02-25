'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import Skeleton from '@/components/ui/Skeleton';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import RowActions from '@/components/ui/RowActions';
import InvoiceDetailsModal from '@/components/InvoiceDetailsModal';
import NfeDetailsModal from '@/components/NfeDetailsModal';
import { formatCnpj, formatDate, formatCurrency } from '@/lib/utils';

interface CustomerRef {
  cnpj: string;
  name: string;
}

interface CustomerDetails {
  name: string;
  fantasyName: string | null;
  cnpj: string;
  stateRegistration: string | null;
  municipalRegistration: string | null;
  phone: string | null;
  email: string | null;
  address: {
    street: string | null;
    number: string | null;
    complement: string | null;
    district: string | null;
    city: string | null;
    state: string | null;
    zipCode: string | null;
    country: string | null;
  };
}

interface CustomerPurchases {
  totalInvoices: number;
  totalValue: number;
  totalPurchasedItems: number;
  totalProductsPurchased: number;
  averageTicket: number;
  firstIssueDate: string | null;
  lastIssueDate: string | null;
  confirmedInvoices: number;
  pendingInvoices: number;
  rejectedInvoices: number;
}

interface CustomerPriceRow {
  code: string;
  description: string;
  unit: string;
  invoiceCount: number;
  totalQuantity: number;
  averagePrice: number;
  minPrice: number;
  maxPrice: number;
  lastPrice: number;
  lastIssueDate: string | null;
  lastInvoiceNumber: string | null;
}

interface CustomerInvoice {
  id: string;
  number: string;
  series: string | null;
  issueDate: string;
  totalValue: number;
  status: string;
  accessKey: string;
}

interface CustomerDuplicate {
  invoiceId: string;
  invoiceNumber: string;
  installmentNumber: string;
  dueDate: string | null;
  installmentValue: number;
  installmentTotal: number;
}

interface CustomerMeta {
  totalPriceRows: number;
  priceRowsLimited: boolean;
}

interface CustomerDetailsResponse {
  customer: CustomerDetails;
  purchases: CustomerPurchases;
  priceTable: CustomerPriceRow[];
  invoices: CustomerInvoice[];
  duplicates: CustomerDuplicate[];
  meta: CustomerMeta;
}

interface CustomerDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  customer: CustomerRef | null;
  inline?: boolean;
}

type PriceSortKey = 'description' | 'code' | 'totalQuantity' | 'lastPrice' | 'lastIssueDate';
type SortDirection = 'asc' | 'desc';

function formatDocument(document: string) {
  const digits = (document || '').replace(/\D/g, '');
  if (digits.length === 14) return formatCnpj(digits);
  if (digits.length === 11) {
    return digits
      .replace(/^(\d{3})(\d)/, '$1.$2')
      .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/\.(\d{3})(\d)/, '.$1-$2');
  }
  return document || '-';
}

function formatQuantity(value: number) {
  return value.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
}

function formatPrice(value: number) {
  return value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

function normalizeDateOnly(value: string | null): Date | null {
  if (!value) return null;

  const onlyDate = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (onlyDate) {
    const year = Number(onlyDate[1]);
    const month = Number(onlyDate[2]);
    const day = Number(onlyDate[3]);
    return new Date(year, month - 1, day);
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
}

function formatDueDate(value: string | null): string {
  if (!value) return '-';
  const parsed = normalizeDateOnly(value);
  if (!parsed) return value;
  return parsed.toLocaleDateString('pt-BR');
}

function getDuplicateStatus(value: string | null): { label: 'A vencer' | 'Vencido'; classes: string } {
  const dueDate = normalizeDateOnly(value);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (dueDate && dueDate < today) {
    return {
      label: 'Vencido',
      classes: 'bg-red-50 text-red-600 ring-1 ring-red-500/20 dark:bg-red-900/30 dark:text-red-400 dark:ring-red-500/30',
    };
  }

  return {
    label: 'A vencer',
    classes: 'bg-emerald-50 text-emerald-600 ring-1 ring-emerald-500/20 dark:bg-emerald-900/30 dark:text-emerald-400 dark:ring-emerald-500/30',
  };
}

function formatInstallmentCode(value: string): string {
  const digits = (value || '').replace(/\D/g, '');
  if (!digits) return '001';
  return digits.slice(-3).padStart(3, '0');
}

function formatInstallmentDisplay(installmentNumber: string, installmentTotal: number): string {
  const current = formatInstallmentCode(installmentNumber);
  if (installmentTotal > 1) {
    return `${current} / ${String(installmentTotal).padStart(3, '0')}`;
  }
  return current;
}

function InfoField({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-0.5">{label}</p>
      <p className="text-[13px] font-medium text-slate-800 dark:text-slate-200 break-words">{value || '-'}</p>
    </div>
  );
}

interface SectionCardProps {
  title: string;
  subtitle?: string;
  icon: string;
  iconColor?: string;
  open: boolean;
  onToggle: () => void;
  badge?: string | number;
  children: React.ReactNode;
}

function SectionCard({ title, subtitle, icon, iconColor = 'text-primary', open, onToggle, badge, children }: SectionCardProps) {
  const iconBgMap: Record<string, string> = {
    'text-primary': 'bg-primary/10 dark:bg-primary/20 ring-primary/20 dark:ring-primary/30',
    'text-indigo-500': 'bg-indigo-500/10 dark:bg-indigo-500/20 ring-indigo-500/20 dark:ring-indigo-500/30',
    'text-amber-500': 'bg-amber-500/10 dark:bg-amber-500/20 ring-amber-500/20 dark:ring-amber-500/30',
    'text-teal-500': 'bg-teal-500/10 dark:bg-teal-500/20 ring-teal-500/20 dark:ring-teal-500/30',
    'text-emerald-500': 'bg-emerald-500/10 dark:bg-emerald-500/20 ring-emerald-500/20 dark:ring-emerald-500/30',
    'text-rose-500': 'bg-rose-500/10 dark:bg-rose-500/20 ring-rose-500/20 dark:ring-rose-500/30',
  };
  const iconBg = iconBgMap[iconColor] || iconBgMap['text-primary'];

  return (
    <div className={`bg-white dark:bg-card-dark rounded-2xl overflow-hidden ring-1 transition-all ${open ? 'ring-slate-200/80 dark:ring-slate-700/60 shadow-sm' : 'ring-slate-200/50 dark:ring-slate-800/50'}`}>
      <button
        onClick={onToggle}
        className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-slate-50/70 dark:hover:bg-slate-800/30 transition-colors"
      >
        <div className={`w-8 h-8 rounded-xl flex items-center justify-center ring-1 shrink-0 ${iconBg}`}>
          <span className={`material-symbols-outlined text-[17px] ${open ? iconColor : 'text-slate-400 dark:text-slate-500'} transition-colors`}>{icon}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-[13px] font-bold text-slate-900 dark:text-white">{title}</p>
            {badge !== undefined && (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 ring-1 ring-slate-200/50 dark:ring-slate-700/50">
                {badge}
              </span>
            )}
          </div>
          {subtitle && <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5 truncate">{subtitle}</p>}
        </div>
        <span className={`material-symbols-outlined text-[18px] text-slate-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}>
          expand_more
        </span>
      </button>
      <div className={`transition-all duration-200 ${open ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0 overflow-hidden'}`}>
        <div className="px-4 pb-4 pt-1">{children}</div>
      </div>
    </div>
  );
}

function StatCard({ label, value, icon, color = 'primary' }: { label: string; value: string; icon: string; color?: string }) {
  const colorMap: Record<string, { bg: string; text: string; ring: string }> = {
    primary: { bg: 'bg-primary/10 dark:bg-primary/20', text: 'text-primary', ring: 'ring-primary/20 dark:ring-primary/30' },
    indigo: { bg: 'bg-indigo-500/10 dark:bg-indigo-500/20', text: 'text-indigo-500', ring: 'ring-indigo-500/20 dark:ring-indigo-500/30' },
    emerald: { bg: 'bg-emerald-500/10 dark:bg-emerald-500/20', text: 'text-emerald-500', ring: 'ring-emerald-500/20 dark:ring-emerald-500/30' },
    amber: { bg: 'bg-amber-500/10 dark:bg-amber-500/20', text: 'text-amber-500', ring: 'ring-amber-500/20 dark:ring-amber-500/30' },
    teal: { bg: 'bg-teal-500/10 dark:bg-teal-500/20', text: 'text-teal-500', ring: 'ring-teal-500/20 dark:ring-teal-500/30' },
  };
  const c = colorMap[color] || colorMap.primary;

  return (
    <div className="rounded-xl bg-slate-50 dark:bg-slate-900/30 p-3 ring-1 ring-slate-200/50 dark:ring-slate-800/50">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">{label}</p>
          <p className="text-base font-bold text-slate-900 dark:text-white mt-1 truncate">{value}</p>
        </div>
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ring-1 ${c.bg} ${c.ring}`}>
          <span className={`material-symbols-outlined text-[17px] ${c.text}`}>{icon}</span>
        </div>
      </div>
    </div>
  );
}

async function fetchCustomerDetails(targetCustomer: CustomerRef): Promise<CustomerDetailsResponse> {
  const params = new URLSearchParams();
  if (targetCustomer.cnpj) params.set('cnpj', targetCustomer.cnpj);
  if (targetCustomer.name) params.set('name', targetCustomer.name);

  const res = await fetch(`/api/customers/details?${params}`);
  if (!res.ok) {
    throw new Error('Falha ao carregar dados do cliente');
  }

  return res.json();
}

const thCls = 'px-3 py-2.5 text-[10px] uppercase font-bold tracking-wider text-slate-400 dark:text-slate-500';
const tdCls = 'px-3 py-2';

export default function CustomerDetailsModal({
  isOpen,
  onClose,
  customer,
  inline = false,
}: CustomerDetailsModalProps) {
  const [loading, setLoading] = useState(false);
  const [details, setDetails] = useState<CustomerDetailsResponse | null>(null);
  const [shortName, setShortName] = useState('');
  const [shortNameDraft, setShortNameDraft] = useState('');
  const [savingShortName, setSavingShortName] = useState(false);
  const [isRegistrationOpen, setIsRegistrationOpen] = useState(false);
  const [isGeneralOpen, setIsGeneralOpen] = useState(true);
  const [isPriceTableOpen, setIsPriceTableOpen] = useState(false);
  const [isInvoicesOpen, setIsInvoicesOpen] = useState(false);
  const [isDuplicatesOpen, setIsDuplicatesOpen] = useState(false);
  const [priceSearchTerm, setPriceSearchTerm] = useState('');
  const [priceSortKey, setPriceSortKey] = useState<PriceSortKey>('totalQuantity');
  const [priceSortDirection, setPriceSortDirection] = useState<SortDirection>('desc');
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);
  const [detailsInvoiceId, setDetailsInvoiceId] = useState<string | null>(null);
  const [isNfeDetailsOpen, setIsNfeDetailsOpen] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setShortName('');
      setShortNameDraft('');
      setSavingShortName(false);
      setIsRegistrationOpen(false);
      setIsGeneralOpen(true);
      setIsPriceTableOpen(false);
      setIsInvoicesOpen(false);
      setIsDuplicatesOpen(false);
      setPriceSearchTerm('');
      setPriceSortKey('totalQuantity');
      setPriceSortDirection('desc');
      setIsInvoiceModalOpen(false);
      setIsNfeDetailsOpen(false);
      setSelectedInvoiceId(null);
      setDetailsInvoiceId(null);
      setShowDeleteConfirm(false);
      setDeleteTargetId(null);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !customer) return;

    let cancelled = false;

    const loadCustomerDetails = async () => {
      setDetails(null);
      setLoading(true);
      try {
        const data = await fetchCustomerDetails(customer);
        if (!cancelled) {
          setDetails(data);
        }
      } catch {
        if (!cancelled) {
          toast.error('Erro ao carregar detalhes do cliente');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }

      if (!cancelled && customer.cnpj) {
        try {
          const nickRes = await fetch(`/api/contacts/nickname?cnpj=${encodeURIComponent(customer.cnpj)}`);
          if (!cancelled && nickRes.ok) {
            const nickData = await nickRes.json();
            setShortName(nickData.shortName || '');
            setShortNameDraft(nickData.shortName || '');
          }
        } catch { /* ignore */ }
      }
    };

    loadCustomerDetails();

    return () => {
      cancelled = true;
    };
  }, [isOpen, customer]);

  useEffect(() => {
    if (!isOpen) {
      setDetails(null);
    }
  }, [isOpen]);

  const openInvoiceViewer = (id: string) => {
    setSelectedInvoiceId(id);
    setIsInvoiceModalOpen(true);
  };

  const openInvoiceDetails = (id: string) => {
    setDetailsInvoiceId(id);
    setIsNfeDetailsOpen(true);
  };

  const confirmDelete = (id: string) => {
    setDeleteTargetId(id);
    setShowDeleteConfirm(true);
  };

  const handleDelete = async () => {
    if (!deleteTargetId) return;

    try {
      const res = await fetch('/api/invoices', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [deleteTargetId] }),
      });

      if (!res.ok) {
        toast.error('Erro ao excluir nota fiscal');
        return;
      }

      const data = await res.json();
      toast.success(`${data.deleted} nota(s) excluída(s) com sucesso`);
      setDeleteTargetId(null);

      if (customer && isOpen) {
        setLoading(true);
        try {
          const refreshedDetails = await fetchCustomerDetails(customer);
          setDetails(refreshedDetails);
        } catch {
          toast.error('Erro ao atualizar dados do cliente');
        } finally {
          setLoading(false);
        }
      }
    } catch {
      toast.error('Erro de rede ao excluir');
    }
  };

  const handleSaveShortName = async () => {
    if (!customer?.cnpj) return;
    setSavingShortName(true);
    try {
      const res = await fetch('/api/contacts/nickname', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cnpj: customer.cnpj, shortName: shortNameDraft }),
      });
      if (res.ok) {
        const data = await res.json();
        setShortName(data.shortName || '');
        setShortNameDraft(data.shortName || '');
        toast.success('Nome abreviado salvo com sucesso');
      } else {
        toast.error('Erro ao salvar nome abreviado');
      }
    } catch {
      toast.error('Erro de rede ao salvar nome abreviado');
    } finally {
      setSavingShortName(false);
    }
  };

  const filteredAndSortedPriceTable = useMemo(() => {
    if (!details) return [];

    const searchValue = priceSearchTerm.trim().toLowerCase();
    const filteredRows = searchValue
      ? details.priceTable.filter((row) =>
        row.description.toLowerCase().includes(searchValue) || row.code.toLowerCase().includes(searchValue))
      : details.priceTable;

    return [...filteredRows].sort((a, b) => {
      let compareValue = 0;

      if (priceSortKey === 'description') {
        compareValue = a.description.localeCompare(b.description, 'pt-BR', { sensitivity: 'base' });
      } else if (priceSortKey === 'code') {
        compareValue = a.code.localeCompare(b.code, 'pt-BR', { sensitivity: 'base' });
      } else if (priceSortKey === 'totalQuantity') {
        compareValue = a.totalQuantity - b.totalQuantity;
      } else if (priceSortKey === 'lastPrice') {
        compareValue = a.lastPrice - b.lastPrice;
      } else {
        const aDate = a.lastIssueDate ? new Date(a.lastIssueDate).getTime() : 0;
        const bDate = b.lastIssueDate ? new Date(b.lastIssueDate).getTime() : 0;
        compareValue = aDate - bDate;
      }

      return priceSortDirection === 'asc' ? compareValue : -compareValue;
    });
  }, [details, priceSearchTerm, priceSortDirection, priceSortKey]);

  const togglePriceSort = (key: PriceSortKey) => {
    if (priceSortKey === key) {
      setPriceSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      return;
    }

    setPriceSortKey(key);
    setPriceSortDirection(key === 'description' || key === 'code' ? 'asc' : 'desc');
  };

  const getSortIcon = (key: PriceSortKey) => {
    if (priceSortKey !== key) return 'unfold_more';
    return priceSortDirection === 'asc' ? 'arrow_upward' : 'arrow_downward';
  };

  const invoiceInstallmentsMap = useMemo(() => {
    const map = new Map<string, { totalInstallments: number; firstDueDate: Date | null }>();
    if (!details) return map;

    for (const duplicate of details.duplicates) {
      const key = duplicate.invoiceId;
      const dueDate = normalizeDateOnly(duplicate.dueDate);
      const installmentTotal = duplicate.installmentTotal || 0;
      const existing = map.get(key);

      if (!existing) {
        map.set(key, { totalInstallments: installmentTotal, firstDueDate: dueDate });
        continue;
      }

      existing.totalInstallments = Math.max(existing.totalInstallments, installmentTotal);
      if (dueDate && (!existing.firstDueDate || dueDate < existing.firstDueDate)) {
        existing.firstDueDate = dueDate;
      }
    }

    return map;
  }, [details]);

  const SortableHeader = ({ label, sortKey, align = 'left' }: { label: string; sortKey: PriceSortKey; align?: 'left' | 'right' }) => (
    <th className={`${thCls} ${align === 'right' ? 'text-right' : ''}`}>
      <button
        type="button"
        onClick={() => togglePriceSort(sortKey)}
        className={`${align === 'right' ? 'ml-auto ' : ''}inline-flex items-center gap-1 hover:text-slate-600 dark:hover:text-slate-300 transition-colors whitespace-nowrap`}
      >
        {label}
        <span className={`material-symbols-outlined text-[13px] ${priceSortKey === sortKey ? 'text-primary' : ''}`}>{getSortIcon(sortKey)}</span>
      </button>
    </th>
  );

  const content = (
    <>
      {loading && (
        <div className="space-y-4">
          <Skeleton className="h-14 w-full rounded-2xl" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <Skeleton className="h-20 w-full rounded-xl" />
            <Skeleton className="h-20 w-full rounded-xl" />
            <Skeleton className="h-20 w-full rounded-xl" />
            <Skeleton className="h-20 w-full rounded-xl" />
          </div>
          <Skeleton className="h-48 w-full rounded-2xl" />
          <Skeleton className="h-48 w-full rounded-2xl" />
        </div>
      )}

      {!loading && details && (
        <div className="space-y-3">
          {/* Dados de Cadastro */}
          <SectionCard
            title="Dados de Cadastro"
            subtitle="Dados fiscais e endereço do destinatário"
            icon="badge"
            iconColor="text-indigo-500"
            open={isRegistrationOpen}
            onToggle={() => setIsRegistrationOpen((prev) => !prev)}
          >
            {/* Short Name */}
            <div className="mb-4 p-3 rounded-xl bg-indigo-50/50 dark:bg-indigo-500/5 ring-1 ring-indigo-500/15 dark:ring-indigo-500/20">
              <div className="flex items-center gap-2 mb-2">
                <span className="material-symbols-outlined text-[14px] text-indigo-500">edit_note</span>
                <p className="text-[10px] font-bold text-indigo-600/70 dark:text-indigo-400/70 uppercase tracking-wider">Nome Abreviado</p>
              </div>
              {shortName && (
                <p className="text-sm font-bold text-slate-800 dark:text-slate-100 mb-2">{shortName}</p>
              )}
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={shortNameDraft}
                  onChange={(e) => setShortNameDraft(e.target.value)}
                  placeholder="Ex: Farmácia ABC, Hospital XYZ..."
                  maxLength={60}
                  className="flex-1 px-3 py-1.5 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/50 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500 transition-all"
                />
                <button
                  onClick={handleSaveShortName}
                  disabled={savingShortName || shortNameDraft === shortName}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-bold bg-indigo-500 text-white rounded-xl hover:bg-indigo-600 transition-colors disabled:opacity-40 shrink-0 shadow-sm shadow-indigo-500/25"
                >
                  {savingShortName && <span className="material-symbols-outlined text-[14px] animate-spin">sync</span>}
                  {savingShortName ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
              <p className="text-[10px] text-slate-400 mt-1.5">Apelido exibido em destaque nas listas. Deixe em branco para usar a razão social.</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
              <InfoField label="Razão social" value={details.customer.name} />
              <InfoField label="Nome fantasia" value={details.customer.fantasyName} />
              <InfoField label="CNPJ/CPF" value={formatDocument(details.customer.cnpj)} />
              <InfoField label="Inscrição estadual" value={details.customer.stateRegistration} />
              <InfoField label="Inscrição municipal" value={details.customer.municipalRegistration} />
              <InfoField label="Telefone" value={details.customer.phone} />
              <InfoField label="E-mail" value={details.customer.email} />
            </div>

            <div className="mt-4 rounded-xl ring-1 ring-slate-200/60 dark:ring-slate-800/60 p-3 bg-slate-50/50 dark:bg-slate-900/20">
              <div className="flex items-center gap-2 mb-3">
                <span className="material-symbols-outlined text-[14px] text-slate-400">location_on</span>
                <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Endereço</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
                <InfoField label="Logradouro" value={details.customer.address.street} />
                <InfoField label="Número" value={details.customer.address.number} />
                <InfoField label="Complemento" value={details.customer.address.complement} />
                <InfoField label="Bairro" value={details.customer.address.district} />
                <InfoField label="Cidade" value={details.customer.address.city} />
                <InfoField label="UF" value={details.customer.address.state} />
                <InfoField label="CEP" value={details.customer.address.zipCode} />
                <InfoField label="País" value={details.customer.address.country} />
              </div>
            </div>
          </SectionCard>

          {/* Dados Gerais */}
          <SectionCard
            title="Dados Gerais"
            subtitle="Resumo consolidado das vendas"
            icon="analytics"
            iconColor="text-emerald-500"
            open={isGeneralOpen}
            onToggle={() => setIsGeneralOpen((prev) => !prev)}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
              <StatCard label="NF-e emitidas" value={details.purchases.totalInvoices.toLocaleString('pt-BR')} icon="receipt_long" color="primary" />
              <StatCard label="Total vendido" value={formatCurrency(details.purchases.totalValue)} icon="payments" color="emerald" />
              <StatCard
                label="Itens vendidos"
                value={details.purchases.totalPurchasedItems.toLocaleString('pt-BR', { maximumFractionDigits: 4 })}
                icon="shopping_cart"
                color="indigo"
              />
              <StatCard
                label="Produtos vendidos"
                value={details.purchases.totalProductsPurchased.toLocaleString('pt-BR')}
                icon="inventory_2"
                color="amber"
              />
              <StatCard
                label="Última venda"
                value={details.purchases.lastIssueDate ? formatDate(details.purchases.lastIssueDate) : '-'}
                icon="event"
                color="teal"
              />
            </div>
          </SectionCard>

          {/* Tabela de Preço */}
          <SectionCard
            title="Tabela de Preço"
            subtitle="Histórico por item com base nas NF-e emitidas"
            icon="table_chart"
            iconColor="text-teal-500"
            open={isPriceTableOpen}
            onToggle={() => setIsPriceTableOpen((prev) => !prev)}
            badge={details.priceTable.length || undefined}
          >
            {details.priceTable.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 gap-2">
                <span className="material-symbols-outlined text-[36px] text-slate-300 dark:text-slate-600">table_rows</span>
                <span className="text-[13px] text-slate-400">Sem itens para compor tabela de preço</span>
              </div>
            ) : (
              <>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="relative w-full max-w-md">
                    <span className="material-symbols-outlined text-[16px] text-slate-400 absolute left-3 top-1/2 -translate-y-1/2">
                      search
                    </span>
                    <input
                      type="text"
                      value={priceSearchTerm}
                      onChange={(e) => setPriceSearchTerm(e.target.value)}
                      placeholder="Filtrar por nome ou código"
                      className="w-full h-9 pl-9 pr-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/30 text-sm text-slate-700 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500 transition-all"
                    />
                  </div>
                  <span className="text-[11px] font-medium text-slate-400 dark:text-slate-500 whitespace-nowrap tabular-nums">
                    {filteredAndSortedPriceTable.length.toLocaleString('pt-BR')} itens
                  </span>
                </div>

                {filteredAndSortedPriceTable.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 gap-2">
                    <span className="material-symbols-outlined text-[32px] text-slate-300 dark:text-slate-600">search_off</span>
                    <span className="text-[13px] text-slate-400">Nenhum produto encontrado</span>
                  </div>
                ) : (
                  <div className="overflow-x-auto max-h-[320px] rounded-xl ring-1 ring-slate-200/50 dark:ring-slate-800/50">
                    <table className="w-full text-left border-collapse min-w-[760px]">
                      <thead className="sticky top-0 z-10">
                        <tr className="bg-slate-50 dark:bg-slate-900/70 border-b border-slate-200 dark:border-slate-800">
                          <SortableHeader label="Código" sortKey="code" />
                          <SortableHeader label="Produto" sortKey="description" />
                          <SortableHeader label="Qtd." sortKey="totalQuantity" align="right" />
                          <SortableHeader label="Último Preço" sortKey="lastPrice" align="right" />
                          <SortableHeader label="Última NF-e" sortKey="lastIssueDate" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                        {filteredAndSortedPriceTable.map((row) => (
                          <tr key={`${row.code}-${row.description}-${row.unit}`} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30 transition-colors">
                            <td className={`${tdCls} text-xs font-mono text-slate-500 dark:text-slate-400`}>{row.code}</td>
                            <td className={tdCls}>
                              <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">{row.description}</div>
                            </td>
                            <td className={`${tdCls} text-right text-xs font-medium tabular-nums text-slate-600 dark:text-slate-300`}>
                              {formatQuantity(row.totalQuantity)}
                            </td>
                            <td className={`${tdCls} text-right text-xs font-bold tabular-nums text-slate-900 dark:text-white`}>
                              {formatPrice(row.lastPrice)}
                            </td>
                            <td className={tdCls}>
                              <div className="text-xs text-slate-600 dark:text-slate-300">
                                {row.lastInvoiceNumber || '-'}
                              </div>
                              <div className="text-[10px] text-slate-400 dark:text-slate-500">
                                {row.lastIssueDate ? formatDate(row.lastIssueDate) : '-'}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}

            {details.meta.priceRowsLimited && (
              <div className="mt-3 flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-50 dark:bg-amber-900/20 ring-1 ring-amber-500/20 dark:ring-amber-500/30 text-xs text-amber-700 dark:text-amber-400">
                <span className="material-symbols-outlined text-[14px]">info</span>
                Exibindo {details.priceTable.length} de {details.meta.totalPriceRows} itens para preservar desempenho.
              </div>
            )}
          </SectionCard>

          {/* Notas Fiscais */}
          <SectionCard
            title="Notas Fiscais"
            subtitle="Histórico de NF-e emitidas"
            icon="receipt_long"
            iconColor="text-primary"
            open={isInvoicesOpen}
            onToggle={() => setIsInvoicesOpen((prev) => !prev)}
            badge={details.invoices.length || undefined}
          >
            {details.invoices.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 gap-2">
                <span className="material-symbols-outlined text-[36px] text-slate-300 dark:text-slate-600">receipt</span>
                <span className="text-[13px] text-slate-400">Nenhuma nota fiscal encontrada</span>
              </div>
            ) : (
              <div className="overflow-x-auto max-h-[360px] rounded-xl ring-1 ring-slate-200/50 dark:ring-slate-800/50">
                <table className="w-full text-left border-collapse min-w-[760px]">
                  <thead className="sticky top-0 z-10">
                    <tr className="bg-slate-50 dark:bg-slate-900/70 border-b border-slate-200 dark:border-slate-800">
                      <th className={thCls}>Número</th>
                      <th className={thCls}>Emissão</th>
                      <th className={`${thCls} text-right`}>Valor</th>
                      <th className={`${thCls} text-center`}>Parcelas</th>
                      <th className={thCls}>1º Vencimento</th>
                      <th className={`${thCls} text-center`}>Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                    {details.invoices.map((invoice) => {
                      const installmentSummary = invoiceInstallmentsMap.get(invoice.id);
                      const totalInstallments = installmentSummary?.totalInstallments || 0;
                      const firstDueDate = installmentSummary?.firstDueDate
                        ? installmentSummary.firstDueDate.toLocaleDateString('pt-BR')
                        : '-';

                      return (
                        <tr key={invoice.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30 transition-colors">
                          <td className={`${tdCls} text-xs font-bold text-slate-800 dark:text-white`}>{invoice.number}</td>
                          <td className={`${tdCls} text-xs text-slate-600 dark:text-slate-300`}>{formatDate(invoice.issueDate)}</td>
                          <td className={`${tdCls} text-right text-xs font-bold font-mono tabular-nums text-slate-900 dark:text-white`}>
                            {formatCurrency(invoice.totalValue)}
                          </td>
                          <td className={`${tdCls} text-center text-xs font-semibold text-slate-600 dark:text-slate-300`}>
                            {totalInstallments.toLocaleString('pt-BR')}
                          </td>
                          <td className={`${tdCls} text-xs text-slate-600 dark:text-slate-300`}>
                            {firstDueDate}
                          </td>
                          <td className={`${tdCls} text-center`}>
                            <RowActions
                              invoiceId={invoice.id}
                              onView={openInvoiceViewer}
                              onDetails={openInvoiceDetails}
                              onDelete={confirmDelete}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>

          {/* Duplicatas */}
          <SectionCard
            title="Duplicatas"
            subtitle="Parcelas encontradas nas notas fiscais"
            icon="account_balance"
            iconColor="text-rose-500"
            open={isDuplicatesOpen}
            onToggle={() => setIsDuplicatesOpen((prev) => !prev)}
            badge={details.duplicates.length || undefined}
          >
            {details.duplicates.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 gap-2">
                <span className="material-symbols-outlined text-[36px] text-slate-300 dark:text-slate-600">money_off</span>
                <span className="text-[13px] text-slate-400">Nenhuma duplicata encontrada</span>
              </div>
            ) : (
              <div className="overflow-x-auto max-h-[320px] rounded-xl ring-1 ring-slate-200/50 dark:ring-slate-800/50">
                <table className="w-full text-left border-collapse min-w-[680px]">
                  <thead className="sticky top-0 z-10">
                    <tr className="bg-slate-50 dark:bg-slate-900/70 border-b border-slate-200 dark:border-slate-800">
                      <th className={thCls}>Nº Nota</th>
                      <th className={thCls}>Parcela</th>
                      <th className={thCls}>Vencimento</th>
                      <th className={`${thCls} text-right`}>Valor</th>
                      <th className={`${thCls} text-center`}>Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                    {details.duplicates.map((duplicate, index) => {
                      const status = getDuplicateStatus(duplicate.dueDate);

                      return (
                        <tr key={`${duplicate.invoiceId}-${duplicate.invoiceNumber}-${duplicate.installmentNumber}-${duplicate.dueDate || 'sem-data'}-${index}`} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30 transition-colors">
                          <td className={`${tdCls} text-xs font-bold text-slate-800 dark:text-white`}>{duplicate.invoiceNumber}</td>
                          <td className={`${tdCls} text-xs font-mono text-slate-600 dark:text-slate-300`}>
                            {formatInstallmentDisplay(duplicate.installmentNumber, duplicate.installmentTotal)}
                          </td>
                          <td className={`${tdCls} text-xs text-slate-600 dark:text-slate-300`}>{formatDueDate(duplicate.dueDate)}</td>
                          <td className={`${tdCls} text-right text-xs font-bold tabular-nums text-slate-900 dark:text-white`}>
                            {formatCurrency(duplicate.installmentValue)}
                          </td>
                          <td className={`${tdCls} text-center`}>
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${status.classes}`}>
                              {status.label}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>
        </div>
      )}

      {!loading && !details && (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <div className="w-16 h-16 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center ring-1 ring-slate-200/50 dark:ring-slate-700/50">
            <span className="material-symbols-outlined text-[32px] text-slate-300 dark:text-slate-600">person_off</span>
          </div>
          <p className="text-[13px] font-medium text-slate-400">Sem dados para este cliente</p>
        </div>
      )}
    </>
  );

  if (!isOpen && !inline) return null;

  return (
    <>
      {inline ? (
        <div className="space-y-3">{content}</div>
      ) : (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm">
          <div
            className="absolute inset-0"
            onClick={onClose}
            aria-hidden="true"
          />
          <div
            className="relative bg-slate-50 dark:bg-[#1a1e2e] rounded-none sm:rounded-2xl shadow-2xl w-full max-w-6xl h-full sm:h-[92vh] flex flex-col overflow-hidden ring-0 sm:ring-1 ring-black/5 dark:ring-white/5"
            role="dialog"
            aria-modal="true"
          >
            {/* Header */}
            <div className="px-4 sm:px-6 py-4 bg-white dark:bg-card-dark border-b border-slate-200 dark:border-slate-700 shrink-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 dark:from-primary/30 dark:to-primary/10 flex items-center justify-center ring-1 ring-primary/20 dark:ring-primary/30 shrink-0">
                    <span className="material-symbols-outlined text-[22px] text-primary">person</span>
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-[15px] font-bold text-slate-900 dark:text-white leading-tight truncate">
                      {details?.customer.name || customer?.name || 'Visualizar cliente'}
                    </h3>
                    {details?.customer.cnpj && (
                      <span className="text-[11px] font-mono text-slate-400 dark:text-slate-500">{formatDocument(details.customer.cnpj)}</span>
                    )}
                  </div>
                </div>

                <button
                  onClick={onClose}
                  aria-label="Fechar"
                  className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0"
                  title="Fechar"
                >
                  <span className="material-symbols-outlined text-[20px]">close</span>
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6">
              {content}
            </div>
          </div>
        </div>
      )}

      <InvoiceDetailsModal
        isOpen={isInvoiceModalOpen}
        onClose={() => setIsInvoiceModalOpen(false)}
        invoiceId={selectedInvoiceId}
      />

      <NfeDetailsModal
        isOpen={isNfeDetailsOpen}
        onClose={() => setIsNfeDetailsOpen(false)}
        invoiceId={detailsInvoiceId}
      />

      <ConfirmDialog
        isOpen={showDeleteConfirm}
        onClose={() => {
          setShowDeleteConfirm(false);
          setDeleteTargetId(null);
        }}
        onConfirm={handleDelete}
        title="Excluir nota fiscal"
        message="Tem certeza que deseja excluir esta nota fiscal? Esta ação não pode ser desfeita."
        confirmLabel="Excluir"
        confirmVariant="danger"
      />
    </>
  );
}
