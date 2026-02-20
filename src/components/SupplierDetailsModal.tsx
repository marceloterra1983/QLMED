'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import Modal from '@/components/ui/Modal';
import Skeleton from '@/components/ui/Skeleton';
import { formatCnpj, formatDate, formatCurrency, getManifestBadge } from '@/lib/utils';

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

interface SupplierMeta {
  totalPriceRows: number;
  priceRowsLimited: boolean;
}

interface SupplierDetailsResponse {
  supplier: SupplierDetails;
  purchases: SupplierPurchases;
  priceTable: SupplierPriceRow[];
  invoices: SupplierInvoice[];
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

function formatAccessKey(value: string) {
  return value.replace(/(.{4})/g, '$1 ').trim();
}

function shortenAccessKey(value: string) {
  if (!value || value.length < 16) return value || '-';
  return `${value.slice(0, 8)}...${value.slice(-8)}`;
}

function formatQuantity(value: number) {
  return value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

function formatPrice(value: number) {
  return value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

function formatSupplierStatus(status: string) {
  const badge = getManifestBadge(status);
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold border ${badge.classes}`}>
      {badge.label}
    </span>
  );
}

function InfoField({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">{label}</p>
      <p className="text-sm font-medium text-slate-900 dark:text-white break-words">{value || '-'}</p>
    </div>
  );
}

function CollapsibleCard({ title, subtitle, open, onToggle, children }: CollapsibleCardProps) {
  return (
    <div className="bg-white dark:bg-card-dark border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full px-4 py-3 flex items-center justify-between text-left bg-slate-50/70 dark:bg-slate-900/40 hover:bg-slate-100 dark:hover:bg-slate-900/60 transition-colors"
      >
        <div>
          <p className="text-sm font-bold text-slate-900 dark:text-white">{title}</p>
          {subtitle && <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{subtitle}</p>}
        </div>
        <span className="material-symbols-outlined text-slate-500">
          {open ? 'expand_less' : 'expand_more'}
        </span>
      </button>
      {open && <div className="p-4">{children}</div>}
    </div>
  );
}

function StatCard({ label, value, icon }: { label: string; value: string; icon: string }) {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/30 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">{label}</p>
          <p className="text-lg font-bold text-slate-900 dark:text-white mt-1">{value}</p>
        </div>
        <span className="material-symbols-outlined text-primary text-[22px]">{icon}</span>
      </div>
    </div>
  );
}

export default function SupplierDetailsModal({ isOpen, onClose, supplier }: SupplierDetailsModalProps) {
  const [loading, setLoading] = useState(false);
  const [details, setDetails] = useState<SupplierDetailsResponse | null>(null);
  const [isRegistrationOpen, setIsRegistrationOpen] = useState(true);

  useEffect(() => {
    if (isOpen) {
      setIsRegistrationOpen(true);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !supplier) return;

    let cancelled = false;

    const loadSupplierDetails = async () => {
      setDetails(null);
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (supplier.cnpj) params.set('cnpj', supplier.cnpj);
        if (supplier.name) params.set('name', supplier.name);

        const res = await fetch(`/api/suppliers/details?${params}`);
        if (!res.ok) {
          throw new Error('Falha ao carregar dados do fornecedor');
        }

        const data: SupplierDetailsResponse = await res.json();
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

  return (
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <InfoField label="Razão social" value={details.supplier.name} />
              <InfoField label="Nome fantasia" value={details.supplier.fantasyName} />
              <InfoField label="CNPJ/CPF" value={formatDocument(details.supplier.cnpj)} />
              <InfoField label="Inscrição estadual" value={details.supplier.stateRegistration} />
              <InfoField label="Inscrição municipal" value={details.supplier.municipalRegistration} />
              <InfoField label="Telefone" value={details.supplier.phone} />
              <InfoField label="E-mail" value={details.supplier.email} />
            </div>

            <div className="mt-5 rounded-xl border border-slate-200 dark:border-slate-800 p-4 bg-slate-50 dark:bg-slate-900/30">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Endereço</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
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

          <div className="bg-white dark:bg-card-dark border border-slate-200 dark:border-slate-800 rounded-xl p-4">
            <p className="text-sm font-bold text-slate-900 dark:text-white mb-3">Dados Gerais de Compras</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard label="NF-e recebidas" value={details.purchases.totalInvoices.toLocaleString('pt-BR')} icon="receipt_long" />
              <StatCard label="Total comprado" value={formatCurrency(details.purchases.totalValue)} icon="payments" />
              <StatCard label="Ticket médio" value={formatCurrency(details.purchases.averageTicket)} icon="monitoring" />
              <StatCard
                label="Última compra"
                value={details.purchases.lastIssueDate ? formatDate(details.purchases.lastIssueDate) : '-'}
                icon="event"
              />
            </div>

            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard
                label="Primeira compra"
                value={details.purchases.firstIssueDate ? formatDate(details.purchases.firstIssueDate) : '-'}
                icon="history"
              />
              <StatCard
                label="Confirmadas"
                value={details.purchases.confirmedInvoices.toLocaleString('pt-BR')}
                icon="check_circle"
              />
              <StatCard
                label="Pendentes"
                value={details.purchases.pendingInvoices.toLocaleString('pt-BR')}
                icon="schedule"
              />
              <StatCard
                label="Rejeitadas"
                value={details.purchases.rejectedInvoices.toLocaleString('pt-BR')}
                icon="cancel"
              />
            </div>
          </div>

          <div className="bg-white dark:bg-card-dark border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/40">
              <p className="text-sm font-bold text-slate-900 dark:text-white">Tabela de Preço</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Histórico por item com base nas NF-e recebidas deste fornecedor
              </p>
            </div>

            {details.priceTable.length === 0 ? (
              <div className="px-4 py-10 text-center text-slate-400 text-sm">Sem itens para compor tabela de preço.</div>
            ) : (
              <div className="overflow-x-auto max-h-[320px]">
                <table className="w-full text-left border-collapse min-w-[1000px]">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800 text-xs uppercase text-slate-500 dark:text-slate-400 font-bold tracking-wider">
                      <th className="px-4 py-3">Produto</th>
                      <th className="px-4 py-3">Código</th>
                      <th className="px-4 py-3 text-right">Qtd.</th>
                      <th className="px-4 py-3 text-right">Último</th>
                      <th className="px-4 py-3 text-right">Médio</th>
                      <th className="px-4 py-3 text-right">Mín.</th>
                      <th className="px-4 py-3 text-right">Máx.</th>
                      <th className="px-4 py-3">Última NF-e</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {details.priceTable.map((row) => (
                      <tr key={`${row.code}-${row.description}-${row.unit}`} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                        <td className="px-4 py-3">
                          <div className="text-sm font-semibold text-slate-900 dark:text-white">{row.description}</div>
                          <div className="text-xs text-slate-500 dark:text-slate-400">Unidade: {row.unit}</div>
                        </td>
                        <td className="px-4 py-3 text-sm font-mono text-slate-700 dark:text-slate-300">{row.code}</td>
                        <td className="px-4 py-3 text-right text-sm font-medium text-slate-700 dark:text-slate-300">
                          {formatQuantity(row.totalQuantity)}
                        </td>
                        <td className="px-4 py-3 text-right text-sm font-bold text-slate-900 dark:text-white">
                          {formatPrice(row.lastPrice)}
                        </td>
                        <td className="px-4 py-3 text-right text-sm font-medium text-slate-700 dark:text-slate-300">
                          {formatPrice(row.averagePrice)}
                        </td>
                        <td className="px-4 py-3 text-right text-sm font-medium text-slate-700 dark:text-slate-300">
                          {formatPrice(row.minPrice)}
                        </td>
                        <td className="px-4 py-3 text-right text-sm font-medium text-slate-700 dark:text-slate-300">
                          {formatPrice(row.maxPrice)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-sm text-slate-700 dark:text-slate-300">
                            {row.lastInvoiceNumber || '-'}
                          </div>
                          <div className="text-xs text-slate-500 dark:text-slate-400">
                            {row.lastIssueDate ? formatDate(row.lastIssueDate) : '-'}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {details.meta.priceRowsLimited && (
              <div className="px-4 py-2 border-t border-slate-200 dark:border-slate-800 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20">
                Exibindo {details.priceTable.length} de {details.meta.totalPriceRows} itens para preservar desempenho.
              </div>
            )}
          </div>

          <div className="bg-white dark:bg-card-dark border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/40">
              <p className="text-sm font-bold text-slate-900 dark:text-white">Relação de NF-e Emitidas pelo Fornecedor</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Histórico de notas recebidas onde este fornecedor é o emitente
              </p>
            </div>

            {details.invoices.length === 0 ? (
              <div className="px-4 py-10 text-center text-slate-400 text-sm">Nenhuma nota fiscal encontrada para este fornecedor.</div>
            ) : (
              <div className="overflow-x-auto max-h-[360px]">
                <table className="w-full text-left border-collapse min-w-[900px]">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800 text-xs uppercase text-slate-500 dark:text-slate-400 font-bold tracking-wider">
                      <th className="px-4 py-3">Número</th>
                      <th className="px-4 py-3">Série</th>
                      <th className="px-4 py-3">Emissão</th>
                      <th className="px-4 py-3 text-right">Valor</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Chave</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {details.invoices.map((invoice) => (
                      <tr key={invoice.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                        <td className="px-4 py-3 text-sm font-semibold text-slate-900 dark:text-white">{invoice.number}</td>
                        <td className="px-4 py-3 text-sm text-slate-700 dark:text-slate-300">{invoice.series || '-'}</td>
                        <td className="px-4 py-3 text-sm text-slate-700 dark:text-slate-300">{formatDate(invoice.issueDate)}</td>
                        <td className="px-4 py-3 text-right text-sm font-bold font-mono text-slate-900 dark:text-white">
                          {invoice.totalValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-4 py-3">{formatSupplierStatus(invoice.status)}</td>
                        <td className="px-4 py-3" title={formatAccessKey(invoice.accessKey)}>
                          <span className="text-xs font-mono text-slate-600 dark:text-slate-300">
                            {shortenAccessKey(invoice.accessKey)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {!loading && !details && (
        <div className="py-10 text-center text-slate-400">
          <span className="material-symbols-outlined text-[44px] opacity-40">storefront</span>
          <p className="mt-2 text-sm font-medium">Sem dados para este fornecedor</p>
        </div>
      )}
    </Modal>
  );
}
