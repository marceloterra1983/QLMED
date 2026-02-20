'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import Modal from '@/components/ui/Modal';
import Skeleton from '@/components/ui/Skeleton';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import RowActions from '@/components/ui/RowActions';
import InvoiceDetailsModal from '@/components/InvoiceDetailsModal';
import NfeDetailsModal from '@/components/NfeDetailsModal';
import { formatCnpj, formatDate, formatCurrency } from '@/lib/utils';

interface SupplierRef {
  cnpj: string;
  name: string;
}

interface SupplierDetails {
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

interface SupplierPurchases {
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

interface SupplierPriceRow {
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

interface SupplierInvoice {
  id: string;
  number: string;
  series: string | null;
  issueDate: string;
  totalValue: number;
  status: string;
  accessKey: string;
}

interface SupplierDuplicate {
  invoiceNumber: string;
  installmentNumber: string;
  dueDate: string | null;
  installmentValue: number;
}

interface SupplierMeta {
  totalPriceRows: number;
  priceRowsLimited: boolean;
}

interface SupplierDetailsResponse {
  supplier: SupplierDetails;
  purchases: SupplierPurchases;
  priceTable: SupplierPriceRow[];
  invoices: SupplierInvoice[];
  duplicates: SupplierDuplicate[];
  meta: SupplierMeta;
}

interface SupplierDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  supplier: SupplierRef | null;
}

interface CollapsibleCardProps {
  title: string;
  subtitle?: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
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
      classes: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    };
  }

  return {
    label: 'A vencer',
    classes: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  };
}

function InfoField({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">{label}</p>
      <p className="text-xs font-medium text-slate-900 dark:text-white break-words">{value || '-'}</p>
    </div>
  );
}

function CollapsibleCard({ title, subtitle, open, onToggle, children }: CollapsibleCardProps) {
  return (
    <div className="bg-white dark:bg-card-dark border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full px-3 py-2.5 flex items-center justify-between text-left bg-slate-50/70 dark:bg-slate-900/40 hover:bg-slate-100 dark:hover:bg-slate-900/60 transition-colors"
      >
        <div>
          <p className="text-sm font-bold text-slate-900 dark:text-white">{title}</p>
          {subtitle && <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{subtitle}</p>}
        </div>
        <span className="material-symbols-outlined text-slate-500">
          {open ? 'expand_less' : 'expand_more'}
        </span>
      </button>
      {open && <div className="p-3">{children}</div>}
    </div>
  );
}

function StatCard({ label, value, icon }: { label: string; value: string; icon: string }) {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/30 p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">{label}</p>
          <p className="text-base font-bold text-slate-900 dark:text-white mt-1">{value}</p>
        </div>
        <span className="material-symbols-outlined text-primary text-[20px]">{icon}</span>
      </div>
    </div>
  );
}

async function fetchSupplierDetails(targetSupplier: SupplierRef): Promise<SupplierDetailsResponse> {
  const params = new URLSearchParams();
  if (targetSupplier.cnpj) params.set('cnpj', targetSupplier.cnpj);
  if (targetSupplier.name) params.set('name', targetSupplier.name);

  const res = await fetch(`/api/suppliers/details?${params}`);
  if (!res.ok) {
    throw new Error('Falha ao carregar dados do fornecedor');
  }

  return res.json();
}

export default function SupplierDetailsModal({ isOpen, onClose, supplier }: SupplierDetailsModalProps) {
  const [loading, setLoading] = useState(false);
  const [details, setDetails] = useState<SupplierDetailsResponse | null>(null);
  const [isRegistrationOpen, setIsRegistrationOpen] = useState(false);
  const [isGeneralOpen, setIsGeneralOpen] = useState(true);
  const [isPriceTableOpen, setIsPriceTableOpen] = useState(true);
  const [isInvoicesOpen, setIsInvoicesOpen] = useState(true);
  const [isDuplicatesOpen, setIsDuplicatesOpen] = useState(true);
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
      setIsRegistrationOpen(false);
      setIsGeneralOpen(true);
      setIsPriceTableOpen(true);
      setIsInvoicesOpen(true);
      setIsDuplicatesOpen(true);
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
    if (!isOpen || !supplier) return;

    let cancelled = false;

    const loadSupplierDetails = async () => {
      setDetails(null);
      setLoading(true);
      try {
        const data = await fetchSupplierDetails(supplier);
        if (!cancelled) {
          setDetails(data);
        }
      } catch {
        if (!cancelled) {
          toast.error('Erro ao carregar detalhes do fornecedor');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadSupplierDetails();

    return () => {
      cancelled = true;
    };
  }, [isOpen, supplier]);

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

      if (supplier && isOpen) {
        setLoading(true);
        try {
          const refreshedDetails = await fetchSupplierDetails(supplier);
          setDetails(refreshedDetails);
        } catch {
          toast.error('Erro ao atualizar dados do fornecedor');
        } finally {
          setLoading(false);
        }
      }
    } catch {
      toast.error('Erro de rede ao excluir');
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

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title={details?.supplier.name || supplier?.name || 'Visualizar fornecedor'}
        width="max-w-6xl"
      >
      {loading && (
        <div className="space-y-5">
          <Skeleton className="h-14 w-full" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      )}

      {!loading && details && (
        <div className="space-y-5">
          <CollapsibleCard
            title="Dados de Cadastro"
            subtitle="Dados fiscais e endereço do emitente na última NF-e recebida"
            open={isRegistrationOpen}
            onToggle={() => setIsRegistrationOpen((prev) => !prev)}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <InfoField label="Razão social" value={details.supplier.name} />
              <InfoField label="Nome fantasia" value={details.supplier.fantasyName} />
              <InfoField label="CNPJ/CPF" value={formatDocument(details.supplier.cnpj)} />
              <InfoField label="Inscrição estadual" value={details.supplier.stateRegistration} />
              <InfoField label="Inscrição municipal" value={details.supplier.municipalRegistration} />
              <InfoField label="Telefone" value={details.supplier.phone} />
              <InfoField label="E-mail" value={details.supplier.email} />
            </div>

            <div className="mt-3 rounded-lg border border-slate-200 dark:border-slate-800 p-3 bg-slate-50 dark:bg-slate-900/30">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Endereço</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <InfoField label="Logradouro" value={details.supplier.address.street} />
                <InfoField label="Número" value={details.supplier.address.number} />
                <InfoField label="Complemento" value={details.supplier.address.complement} />
                <InfoField label="Bairro" value={details.supplier.address.district} />
                <InfoField label="Cidade" value={details.supplier.address.city} />
                <InfoField label="UF" value={details.supplier.address.state} />
                <InfoField label="CEP" value={details.supplier.address.zipCode} />
                <InfoField label="País" value={details.supplier.address.country} />
              </div>
            </div>
          </CollapsibleCard>

          <CollapsibleCard
            title="Dados Gerais de Compras"
            subtitle="Resumo consolidado das compras deste fornecedor"
            open={isGeneralOpen}
            onToggle={() => setIsGeneralOpen((prev) => !prev)}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
              <StatCard label="NF-e recebidas" value={details.purchases.totalInvoices.toLocaleString('pt-BR')} icon="receipt_long" />
              <StatCard label="Total comprado" value={formatCurrency(details.purchases.totalValue)} icon="payments" />
              <StatCard
                label="Itens comprados"
                value={details.purchases.totalPurchasedItems.toLocaleString('pt-BR', { maximumFractionDigits: 4 })}
                icon="shopping_cart"
              />
              <StatCard
                label="Produtos comprados"
                value={details.purchases.totalProductsPurchased.toLocaleString('pt-BR')}
                icon="inventory_2"
              />
              <StatCard
                label="Última compra"
                value={details.purchases.lastIssueDate ? formatDate(details.purchases.lastIssueDate) : '-'}
                icon="event"
              />
            </div>
          </CollapsibleCard>

          <CollapsibleCard
            title="Tabela de Preço"
            subtitle="Histórico por item com base nas NF-e recebidas deste fornecedor"
            open={isPriceTableOpen}
            onToggle={() => setIsPriceTableOpen((prev) => !prev)}
          >
            {details.priceTable.length === 0 ? (
              <div className="px-4 py-10 text-center text-slate-400 text-sm">Sem itens para compor tabela de preço.</div>
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
                      className="w-full h-9 pl-9 pr-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/30 text-sm text-slate-700 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/40"
                    />
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
                    {filteredAndSortedPriceTable.length} item(ns)
                  </p>
                </div>

                {filteredAndSortedPriceTable.length === 0 ? (
                  <div className="px-4 py-8 text-center text-slate-400 text-sm">
                    Nenhum produto encontrado para o filtro informado.
                  </div>
                ) : (
                  <div className="overflow-x-auto max-h-[320px]">
                    <table className="w-full text-left border-collapse min-w-[760px]">
                      <thead>
                        <tr className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800 text-[11px] uppercase text-slate-500 dark:text-slate-400 font-bold tracking-wider">
                          <th className="px-3 py-2">
                            <button type="button" onClick={() => togglePriceSort('code')} className="inline-flex items-center gap-1 hover:text-slate-700 dark:hover:text-slate-200 transition-colors whitespace-nowrap">
                              Código
                              <span className="material-symbols-outlined text-[14px]">{getSortIcon('code')}</span>
                            </button>
                          </th>
                          <th className="px-3 py-2">
                            <button type="button" onClick={() => togglePriceSort('description')} className="inline-flex items-center gap-1 hover:text-slate-700 dark:hover:text-slate-200 transition-colors whitespace-nowrap">
                              Produto
                              <span className="material-symbols-outlined text-[14px]">{getSortIcon('description')}</span>
                            </button>
                          </th>
                          <th className="px-3 py-2 text-right">
                            <button type="button" onClick={() => togglePriceSort('totalQuantity')} className="ml-auto inline-flex items-center gap-1 hover:text-slate-700 dark:hover:text-slate-200 transition-colors whitespace-nowrap">
                              Qtd.
                              <span className="material-symbols-outlined text-[14px]">{getSortIcon('totalQuantity')}</span>
                            </button>
                          </th>
                          <th className="px-3 py-2 text-right">
                            <button type="button" onClick={() => togglePriceSort('lastPrice')} className="ml-auto inline-flex items-center gap-1 hover:text-slate-700 dark:hover:text-slate-200 transition-colors whitespace-nowrap">
                              Último Preço
                              <span className="material-symbols-outlined text-[14px]">{getSortIcon('lastPrice')}</span>
                            </button>
                          </th>
                          <th className="px-3 py-2">
                            <button type="button" onClick={() => togglePriceSort('lastIssueDate')} className="inline-flex items-center gap-1 hover:text-slate-700 dark:hover:text-slate-200 transition-colors whitespace-nowrap">
                              Última NF-e
                              <span className="material-symbols-outlined text-[14px]">{getSortIcon('lastIssueDate')}</span>
                            </button>
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                        {filteredAndSortedPriceTable.map((row) => (
                          <tr key={`${row.code}-${row.description}-${row.unit}`} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                            <td className="px-3 py-1.5 text-xs font-mono text-slate-700 dark:text-slate-300">{row.code}</td>
                            <td className="px-3 py-1.5">
                              <div className="text-xs font-semibold text-slate-900 dark:text-white">{row.description}</div>
                            </td>
                            <td className="px-3 py-1.5 text-right text-xs font-medium text-slate-700 dark:text-slate-300">
                              {formatQuantity(row.totalQuantity)}
                            </td>
                            <td className="px-3 py-1.5 text-right text-xs font-bold text-slate-900 dark:text-white">
                              {formatPrice(row.lastPrice)}
                            </td>
                            <td className="px-3 py-1.5">
                              <div className="text-xs text-slate-700 dark:text-slate-300">
                                {row.lastInvoiceNumber || '-'}
                              </div>
                              <div className="text-[11px] text-slate-500 dark:text-slate-400">
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
              <div className="px-4 py-2 border-t border-slate-200 dark:border-slate-800 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20">
                Exibindo {details.priceTable.length} de {details.meta.totalPriceRows} itens para preservar desempenho.
              </div>
            )}
          </CollapsibleCard>

          <CollapsibleCard
            title="Relação de Notas Fiscais Emitidas pelo Fornecedor"
            subtitle="Histórico de notas recebidas onde este fornecedor é o emitente"
            open={isInvoicesOpen}
            onToggle={() => setIsInvoicesOpen((prev) => !prev)}
          >
            {details.invoices.length === 0 ? (
              <div className="px-4 py-10 text-center text-slate-400 text-sm">Nenhuma nota fiscal encontrada para este fornecedor.</div>
            ) : (
              <div className="overflow-x-auto max-h-[360px]">
                <table className="w-full text-left border-collapse min-w-[560px]">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800 text-[11px] uppercase text-slate-500 dark:text-slate-400 font-bold tracking-wider">
                      <th className="px-3 py-2">Número</th>
                      <th className="px-3 py-2">Emissão</th>
                      <th className="px-3 py-2 text-right">Valor</th>
                      <th className="px-3 py-2 text-center">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {details.invoices.map((invoice) => (
                      <tr key={invoice.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                        <td className="px-3 py-1.5 text-xs font-semibold text-slate-900 dark:text-white">{invoice.number}</td>
                        <td className="px-3 py-1.5 text-xs text-slate-700 dark:text-slate-300">{formatDate(invoice.issueDate)}</td>
                        <td className="px-3 py-1.5 text-right text-xs font-bold font-mono text-slate-900 dark:text-white">
                          {formatCurrency(invoice.totalValue)}
                        </td>
                        <td className="px-3 py-1">
                          <RowActions
                            invoiceId={invoice.id}
                            onView={openInvoiceViewer}
                            onDetails={openInvoiceDetails}
                            onDelete={confirmDelete}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CollapsibleCard>

          <CollapsibleCard
            title="Relação de Duplicatas"
            subtitle="Parcelas encontradas nas notas fiscais deste fornecedor"
            open={isDuplicatesOpen}
            onToggle={() => setIsDuplicatesOpen((prev) => !prev)}
          >
            {details.duplicates.length === 0 ? (
              <div className="px-4 py-8 text-center text-slate-400 text-sm">Nenhuma duplicata encontrada para este fornecedor.</div>
            ) : (
              <div className="overflow-x-auto max-h-[320px]">
                <table className="w-full text-left border-collapse min-w-[680px]">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800 text-[11px] uppercase text-slate-500 dark:text-slate-400 font-bold tracking-wider">
                      <th className="px-3 py-2">Nº Nota</th>
                      <th className="px-3 py-2">Parcela</th>
                      <th className="px-3 py-2">Vencimento</th>
                      <th className="px-3 py-2 text-right">Valor Parcela</th>
                      <th className="px-3 py-2 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {details.duplicates.map((duplicate, index) => {
                      const status = getDuplicateStatus(duplicate.dueDate);

                      return (
                        <tr key={`${duplicate.invoiceNumber}-${duplicate.installmentNumber}-${duplicate.dueDate || 'sem-data'}-${index}`} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                          <td className="px-3 py-1.5 text-xs font-semibold text-slate-900 dark:text-white">{duplicate.invoiceNumber}</td>
                          <td className="px-3 py-1.5 text-xs text-slate-700 dark:text-slate-300">{duplicate.installmentNumber}</td>
                          <td className="px-3 py-1.5 text-xs text-slate-700 dark:text-slate-300">{formatDueDate(duplicate.dueDate)}</td>
                          <td className="px-3 py-1.5 text-right text-xs font-bold text-slate-900 dark:text-white">
                            {formatCurrency(duplicate.installmentValue)}
                          </td>
                          <td className="px-3 py-1.5 text-center">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold ${status.classes}`}>
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
          </CollapsibleCard>
        </div>
      )}

      {!loading && !details && (
        <div className="py-10 text-center text-slate-400">
          <span className="material-symbols-outlined text-[44px] opacity-40">storefront</span>
          <p className="mt-2 text-sm font-medium">Sem dados para este fornecedor</p>
        </div>
      )}
      </Modal>

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
