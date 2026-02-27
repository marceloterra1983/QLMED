'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { toast } from 'sonner';
import { useModalBackButton } from '@/hooks/useModalBackButton';
import Skeleton from '@/components/ui/Skeleton';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import RowActions from '@/components/ui/RowActions';
import InvoiceDetailsModal from '@/components/InvoiceDetailsModal';
import NfeDetailsModal from '@/components/NfeDetailsModal';
import { formatDate, formatCurrency } from '@/lib/utils';
import {
  formatDocument,
  formatQuantity,
  formatPrice,
  normalizeDateOnly,
  formatDueDate,
  getDuplicateStatus,
  formatInstallmentCode,
  formatInstallmentDisplay,
} from '@/lib/modal-helpers';

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
  cfopTag: string;
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

interface ContactFiscalData {
  ie: string | null;
  im: string | null;
  crt: string | null;
  crtLabel: string | null;
  uf: string | null;
}

interface CustomerDetailsResponse {
  customer: CustomerDetails;
  contactFiscal: ContactFiscalData | null;
  purchases: CustomerPurchases;
  priceTable: CustomerPriceRow[];
  invoices: CustomerInvoice[];
  duplicates: CustomerDuplicate[];
  meta: CustomerMeta;
}

interface CnpjData {
  razaoSocial: string | null;
  nomeFantasia: string | null;
  situacaoCadastral: string | null;
  cnaePrincipal: { codigo: string; descricao: string } | null;
  porte: string | null;
  naturezaJuridica: string | null;
  capitalSocial: number | null;
  simplesNacional: boolean | null;
  mei: boolean | null;
  telefone: string | null;
  email: string | null;
  endereco: {
    logradouro: string | null;
    numero: string | null;
    bairro: string | null;
    municipio: string | null;
    uf: string | null;
    cep: string | null;
  } | null;
}

function parseCnpjResponse(data: any): CnpjData {
  return {
    razaoSocial: data.razaoSocial || null,
    nomeFantasia: data.nomeFantasia || null,
    situacaoCadastral: data.situacaoCadastral || data.descSituacao || null,
    cnaePrincipal: data.cnaePrincipal || null,
    porte: data.porte || null,
    naturezaJuridica: data.naturezaJuridica || null,
    capitalSocial: data.capitalSocial ?? null,
    simplesNacional: data.simplesNacional ?? null,
    mei: data.mei ?? null,
    telefone: data.telefone || null,
    email: data.email || null,
    endereco: data.endereco || null,
  };
}

interface AddressDivergence {
  field: string;
  label: string;
  xmlValue: string;
  apiValue: string;
}

function normalizeForCompare(value: string | null | undefined): string {
  if (!value) return '';
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[.,\-\/\\]/g, ' ').replace(/\s+/g, ' ').trim();
}

function compareAddressFields(
  xmlAddr: { street: string | null; number: string | null; district: string | null; city: string | null; state: string | null; zipCode: string | null } | null,
  apiAddr: { logradouro: string | null; numero: string | null; bairro: string | null; municipio: string | null; uf: string | null; cep: string | null } | null,
): AddressDivergence[] {
  if (!xmlAddr || !apiAddr) return [];
  const result: AddressDivergence[] = [];
  const pairs: Array<{ label: string; field: string; xml: string | null; api: string | null; isCep?: boolean }> = [
    { label: 'Logradouro', field: 'street', xml: xmlAddr.street, api: apiAddr.logradouro },
    { label: 'Numero', field: 'number', xml: xmlAddr.number, api: apiAddr.numero },
    { label: 'Bairro', field: 'district', xml: xmlAddr.district, api: apiAddr.bairro },
    { label: 'Municipio', field: 'city', xml: xmlAddr.city, api: apiAddr.municipio },
    { label: 'UF', field: 'state', xml: xmlAddr.state, api: apiAddr.uf },
    { label: 'CEP', field: 'zipCode', xml: xmlAddr.zipCode, api: apiAddr.cep, isCep: true },
  ];
  for (const p of pairs) {
    if (!p.xml && !p.api) continue;
    const match = p.isCep
      ? (p.xml || '').replace(/\D/g, '') === (p.api || '').replace(/\D/g, '')
      : normalizeForCompare(p.xml) === normalizeForCompare(p.api) || (normalizeForCompare(p.xml).includes(normalizeForCompare(p.api)) || normalizeForCompare(p.api).includes(normalizeForCompare(p.xml)));
    if (!match) {
      result.push({ field: p.field, label: p.label, xmlValue: p.xml || '(vazio)', apiValue: p.api || '(vazio)' });
    }
  }
  return result;
}

function validateIEFormat(ie: string | null | undefined, uf: string | null | undefined): { valid: boolean; message?: string } {
  if (!ie || !uf) return { valid: true };
  const cleanIe = ie.replace(/[\.\-\/\s]/g, '').toUpperCase();
  if (cleanIe === 'ISENTO' || cleanIe === 'ISENTA') return { valid: true };
  const rules: Record<string, RegExp> = {
    AC: /^01\d{11}$/, AL: /^24\d{7}$/, AM: /^\d{9}$/, AP: /^03\d{7}$/,
    BA: /^\d{8,9}$/, CE: /^\d{9}$/, DF: /^07\d{11}$/, ES: /^\d{9}$/,
    GO: /^(10|11|15|20|29)\d{7}$/, MA: /^12\d{7}$/, MG: /^\d{13}$/,
    MS: /^28\d{7}$/, MT: /^\d{11}$/, PA: /^15\d{7}$/, PB: /^\d{9}$/,
    PE: /^\d{9}$|^\d{14}$/, PI: /^\d{9}$/, PR: /^\d{10}$/, RJ: /^\d{8}$/,
    RN: /^20\d{7,8}$/, RO: /^\d{14}$/, RR: /^24\d{6}$/, RS: /^\d{10}$/,
    SC: /^\d{9}$/, SE: /^\d{9}$/, SP: /^\d{12}$|^P\d{12}$/, TO: /^\d{11}$/,
  };
  const regex = rules[uf.toUpperCase()];
  if (!regex) return { valid: true };
  return regex.test(cleanIe) ? { valid: true } : { valid: false, message: `Formato invalido para ${uf}` };
}

interface CustomerDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  customer: CustomerRef | null;
  inline?: boolean;
}

type PriceSortKey = 'description' | 'code' | 'totalQuantity' | 'lastPrice' | 'lastIssueDate';
type SortDirection = 'asc' | 'desc';

function InfoField({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-0.5">{label}</p>
      <p className="text-[13px] font-medium text-slate-800 dark:text-slate-200 break-words truncate">{value || '-'}</p>
    </div>
  );
}

function EditableField({ label, value, field, draft, onChange }: {
  label: string;
  value?: string | null;
  field: string;
  draft: Record<string, string>;
  onChange: (field: string, val: string) => void;
}) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-0.5">{label}</p>
      <input
        type="text"
        value={draft[field] ?? value ?? ''}
        onChange={(e) => onChange(field, e.target.value)}
        className="w-full px-2 py-1 text-[13px] rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/50 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all"
      />
    </div>
  );
}

interface ContactOverrideData {
  phone: string | null;
  email: string | null;
  street: string | null;
  number: string | null;
  complement: string | null;
  district: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  country: string | null;
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
  useModalBackButton(isOpen && !inline, onClose);
  const [loading, setLoading] = useState(false);
  const [details, setDetails] = useState<CustomerDetailsResponse | null>(null);
  const [shortName, setShortName] = useState('');
  const [shortNameDraft, setShortNameDraft] = useState('');
  const [savingShortName, setSavingShortName] = useState(false);
  const [cnpjData, setCnpjData] = useState<CnpjData | null>(null);
  const [cnpjLoading, setCnpjLoading] = useState(false);
  const [isRegistrationOpen, setIsRegistrationOpen] = useState(false);
  const [isGeneralOpen, setIsGeneralOpen] = useState(false);
  const [isPriceTableOpen, setIsPriceTableOpen] = useState(false);
  const [isInvoicesOpen, setIsInvoicesOpen] = useState(false);
  const [isMovimentacoesOpen, setIsMovimentacoesOpen] = useState(false);
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
  const [isEditing, setIsEditing] = useState(false);
  const [editDraft, setEditDraft] = useState<Record<string, string>>({});
  const [savingOverride, setSavingOverride] = useState(false);
  const [contactOverride, setContactOverride] = useState<ContactOverrideData | null>(null);

  useEffect(() => {
    if (isOpen) {
      setShortName('');
      setShortNameDraft('');
      setSavingShortName(false);
      setCnpjData(null);
      setCnpjLoading(false);
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
      setIsEditing(false);
      setEditDraft({});
      setSavingOverride(false);
      setContactOverride(null);
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

        // Fetch contact overrides
        try {
          const ovRes = await fetch(`/api/contacts/override?cnpj=${encodeURIComponent(customer.cnpj)}`);
          if (!cancelled && ovRes.ok) {
            const ovData = await ovRes.json();
            setContactOverride(ovData.override || null);
          }
        } catch { /* ignore */ }

        // Fetch CNPJ data from Receita Federal
        const digits = customer.cnpj.replace(/\D/g, '');
        if (digits.length === 14) {
          setCnpjLoading(true);
          try {
            const cnpjRes = await fetch(`/api/cnpj/${digits}`);
            if (!cancelled && cnpjRes.ok) {
              const data = await cnpjRes.json();
              setCnpjData(parseCnpjResponse(data));
              // cards start collapsed
            }
          } catch { /* graceful — section won't appear */ }
          if (!cancelled) setCnpjLoading(false);
        }
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

  const handleEditField = (field: string, value: string) => {
    setEditDraft((prev) => ({ ...prev, [field]: value }));
  };

  const handleSaveOverride = async () => {
    if (!customer?.cnpj || !details) return;
    setSavingOverride(true);
    try {
      const d = details.customer;
      const ov = contactOverride;
      const payload = {
        cnpj: customer.cnpj,
        phone: editDraft.phone ?? ov?.phone ?? d.phone ?? '',
        email: editDraft.email ?? ov?.email ?? d.email ?? '',
        street: editDraft.street ?? ov?.street ?? d.address.street ?? '',
        number: editDraft.number ?? ov?.number ?? d.address.number ?? '',
        complement: editDraft.complement ?? ov?.complement ?? d.address.complement ?? '',
        district: editDraft.district ?? ov?.district ?? d.address.district ?? '',
        city: editDraft.city ?? ov?.city ?? d.address.city ?? '',
        state: editDraft.state ?? ov?.state ?? d.address.state ?? '',
        zipCode: editDraft.zipCode ?? ov?.zipCode ?? d.address.zipCode ?? '',
        country: editDraft.country ?? ov?.country ?? d.address.country ?? '',
      };
      const res = await fetch('/api/contacts/override', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const data = await res.json();
        setContactOverride(data.override || null);
        setIsEditing(false);
        setEditDraft({});
        toast.success('Dados atualizados com sucesso');
      } else {
        toast.error('Erro ao salvar alterações');
      }
    } catch {
      toast.error('Erro de rede ao salvar');
    } finally {
      setSavingOverride(false);
    }
  };

  const handleSyncCnpj = async () => {
    if (!customer?.cnpj) return;
    const digits = customer.cnpj.replace(/\D/g, '');
    if (digits.length !== 14) return;
    setCnpjLoading(true);
    try {
      const res = await fetch(`/api/cnpj/${digits}?refresh=1`);
      if (res.ok) {
        const data = await res.json();
        setCnpjData(parseCnpjResponse(data));
        toast.success('Dados da Receita atualizados');
      } else {
        toast.error('Erro ao consultar Receita Federal');
      }
    } catch {
      toast.error('Erro de rede');
    } finally {
      setCnpjLoading(false);
    }
  };

  const getField = (xmlValue: string | null, overrideField: keyof ContactOverrideData): string | null => {
    if (contactOverride?.[overrideField]) return contactOverride[overrideField];
    return xmlValue;
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

  const SALE_TAGS = new Set(['Venda', 'Bonificação']);
  const saleInvoices = useMemo(() => {
    if (!details) return [];
    return details.invoices.filter((inv) => SALE_TAGS.has(inv.cfopTag));
  }, [details]);
  const movimentacaoInvoices = useMemo(() => {
    if (!details) return [];
    return details.invoices.filter((inv) => !SALE_TAGS.has(inv.cfopTag));
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
        <div className="flex flex-col gap-3">
          {/* Dados de Cadastro */}
          <SectionCard
            title="Dados de Cadastro"
            subtitle="Dados fiscais e endereço do destinatário"
            icon="badge"
            iconColor="text-indigo-500"
            open={isRegistrationOpen}
            onToggle={() => setIsRegistrationOpen((prev) => !prev)}
          >
            {/* Nome abreviado inline */}
            <div className="flex items-center gap-2 mb-3">
              <span className="material-symbols-outlined text-[14px] text-indigo-500">edit_note</span>
              <input
                type="text"
                value={shortNameDraft}
                onChange={(e) => setShortNameDraft(e.target.value)}
                placeholder="Nome abreviado (ex: Farmácia ABC)..."
                maxLength={60}
                className="flex-1 px-2 py-1 text-[13px] rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/50 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500 transition-all"
              />
              <button
                onClick={handleSaveShortName}
                disabled={savingShortName || shortNameDraft === shortName}
                className="flex items-center gap-1 px-2.5 py-1 text-[12px] font-bold bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 transition-colors disabled:opacity-40 shrink-0"
              >
                {savingShortName && <span className="material-symbols-outlined text-[13px] animate-spin">sync</span>}
                {savingShortName ? '...' : 'Salvar'}
              </button>
            </div>

            {/* Dados básicos - inline compacto */}
            {(() => {
              const d = details.customer;
              const ie = d.stateRegistration;
              const ieResult = ie ? validateIEFormat(ie, details.contactFiscal?.uf || d.address?.state) : null;
              return (
                <div className="space-y-1.5 mb-3">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-[12px]">
                    <span className="font-bold text-slate-800 dark:text-slate-200">{d.name}</span>
                    {d.fantasyName && <span className="text-slate-400 dark:text-slate-500 text-[11px]">({d.fantasyName})</span>}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                    <span className="font-mono">{formatDocument(d.cnpj)}</span>
                    {ie && (
                      <span>
                        IE {ie}
                        {ieResult && (
                          ieResult.valid
                            ? <span className="text-emerald-500 ml-1 text-[10px]">OK</span>
                            : <span className="text-amber-600 ml-1 text-[10px]" title={ieResult.message}>Irregular</span>
                        )}
                      </span>
                    )}
                    {d.municipalRegistration && <span>IM {d.municipalRegistration}</span>}
                    {details.contactFiscal?.crtLabel && <span>{details.contactFiscal.crtLabel}</span>}
                  </div>
                </div>
              );
            })()}

            {/* Endereço + Contato */}
            <div className="rounded-lg ring-1 ring-slate-200/60 dark:ring-slate-800/60 p-2.5 bg-slate-50/50 dark:bg-slate-900/20">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[13px] text-slate-400">location_on</span>
                  <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Endereço & Contato</p>
                </div>
                <button
                  onClick={() => {
                    if (isEditing) {
                      setIsEditing(false);
                      setEditDraft({});
                    } else {
                      setIsEditing(true);
                      const ov = contactOverride;
                      const d = details.customer;
                      setEditDraft({
                        phone: ov?.phone ?? d.phone ?? '',
                        email: ov?.email ?? d.email ?? '',
                        street: ov?.street ?? d.address.street ?? '',
                        number: ov?.number ?? d.address.number ?? '',
                        complement: ov?.complement ?? d.address.complement ?? '',
                        district: ov?.district ?? d.address.district ?? '',
                        city: ov?.city ?? d.address.city ?? '',
                        state: ov?.state ?? d.address.state ?? '',
                        zipCode: ov?.zipCode ?? d.address.zipCode ?? '',
                        country: ov?.country ?? d.address.country ?? '',
                      });
                    }
                  }}
                  className="flex items-center gap-1 text-[10px] font-medium text-indigo-500 hover:text-indigo-600 transition-colors"
                >
                  <span className="material-symbols-outlined text-[13px]">{isEditing ? 'close' : 'edit'}</span>
                  {isEditing ? 'Cancelar' : 'Editar'}
                </button>
              </div>
              {isEditing ? (
                <div className="space-y-2">
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-x-3 gap-y-2">
                    <div className="col-span-2">
                      <EditableField label="Logradouro" value={getField(details.customer.address.street, 'street')} field="street" draft={editDraft} onChange={handleEditField} />
                    </div>
                    <EditableField label="Nº" value={getField(details.customer.address.number, 'number')} field="number" draft={editDraft} onChange={handleEditField} />
                    <EditableField label="Compl." value={getField(details.customer.address.complement, 'complement')} field="complement" draft={editDraft} onChange={handleEditField} />
                    <EditableField label="Bairro" value={getField(details.customer.address.district, 'district')} field="district" draft={editDraft} onChange={handleEditField} />
                    <EditableField label="Cidade" value={getField(details.customer.address.city, 'city')} field="city" draft={editDraft} onChange={handleEditField} />
                    <EditableField label="UF" value={getField(details.customer.address.state, 'state')} field="state" draft={editDraft} onChange={handleEditField} />
                    <EditableField label="CEP" value={getField(details.customer.address.zipCode, 'zipCode')} field="zipCode" draft={editDraft} onChange={handleEditField} />
                  </div>
                  <div className="grid grid-cols-2 gap-x-3 pt-1 border-t border-slate-200/40 dark:border-slate-800/30">
                    <EditableField label="Telefone" value={getField(details.customer.phone, 'phone')} field="phone" draft={editDraft} onChange={handleEditField} />
                    <EditableField label="E-mail" value={getField(details.customer.email, 'email')} field="email" draft={editDraft} onChange={handleEditField} />
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-slate-600 dark:text-slate-400">
                  <span>
                    <span className="material-symbols-outlined text-[12px] align-middle mr-0.5">location_on</span>
                    {[
                      getField(details.customer.address.street, 'street'),
                      getField(details.customer.address.number, 'number') ? `nº ${getField(details.customer.address.number, 'number')}` : null,
                      getField(details.customer.address.complement, 'complement'),
                    ].filter(Boolean).join(', ') || '-'}
                    {' — '}
                    {[
                      getField(details.customer.address.district, 'district'),
                      getField(details.customer.address.city, 'city'),
                      getField(details.customer.address.state, 'state'),
                    ].filter(Boolean).join(', ')}
                    {getField(details.customer.address.zipCode, 'zipCode') && (
                      <span className="text-slate-400"> · CEP {getField(details.customer.address.zipCode, 'zipCode')}</span>
                    )}
                  </span>
                  {getField(details.customer.phone, 'phone') && <span><span className="material-symbols-outlined text-[12px] align-middle mr-0.5">phone</span>{getField(details.customer.phone, 'phone')}</span>}
                  {getField(details.customer.email, 'email') && <span><span className="material-symbols-outlined text-[12px] align-middle mr-0.5">mail</span>{getField(details.customer.email, 'email')}</span>}
                </div>
              )}
              {(() => {
                if (!cnpjData?.endereco) return null;
                const divs = compareAddressFields(details.customer.address, cnpjData.endereco);
                if (divs.length === 0) return null;
                return (
                  <details className="mt-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40 p-2">
                    <summary className="flex items-center gap-1.5 cursor-pointer text-amber-700 dark:text-amber-400 text-[10px] font-bold">
                      <span className="material-symbols-outlined text-[13px]">warning</span>
                      Diverge da Receita ({divs.length})
                    </summary>
                    <div className="mt-1.5 space-y-1">
                      {divs.map((d) => (
                        <div key={d.field} className="grid grid-cols-3 gap-2 text-[10px]">
                          <span className="font-bold text-slate-500">{d.label}</span>
                          <span className="text-slate-600 dark:text-slate-400">{d.xmlValue}</span>
                          <span className="text-amber-700 dark:text-amber-400">{d.apiValue}</span>
                        </div>
                      ))}
                    </div>
                  </details>
                );
              })()}
              {/* Save/Cancel inline no endereço */}
              {isEditing && (
                <div className="flex items-center justify-end gap-2 mt-2 pt-2 border-t border-slate-200/60 dark:border-slate-800/40">
                  <button
                    onClick={() => { setIsEditing(false); setEditDraft({}); }}
                    className="px-2.5 py-1 text-[11px] font-medium text-slate-500 hover:text-slate-700 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleSaveOverride}
                    disabled={savingOverride}
                    className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 transition-colors disabled:opacity-40 shadow-sm"
                  >
                    {savingOverride && <span className="material-symbols-outlined text-[12px] animate-spin">sync</span>}
                    {savingOverride ? 'Salvando...' : 'Salvar'}
                  </button>
                </div>
              )}
            </div>

            {/* Dados da Receita Federal */}
            {cnpjLoading && (
              <div className="mt-3 rounded-lg ring-1 ring-blue-200/60 dark:ring-blue-800/40 p-2.5 bg-blue-50/30 dark:bg-blue-900/10">
                <div className="flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[13px] text-blue-500 animate-spin">sync</span>
                  <p className="text-[10px] font-bold text-blue-500 dark:text-blue-400 uppercase tracking-wider">Consultando Receita Federal...</p>
                </div>
              </div>
            )}
            {!cnpjLoading && cnpjData && (
              <div className="mt-3 rounded-lg ring-1 ring-blue-200/60 dark:ring-blue-800/40 p-2.5 bg-blue-50/30 dark:bg-blue-900/10">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[13px] text-blue-500">account_balance</span>
                    <p className="text-[10px] font-bold text-blue-500 dark:text-blue-400 uppercase tracking-wider">Receita Federal</p>
                    {cnpjData.situacaoCadastral && (
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-bold ${
                        cnpjData.situacaoCadastral.toUpperCase().includes('ATIVA')
                          ? 'bg-emerald-50 text-emerald-600 ring-1 ring-emerald-500/20 dark:bg-emerald-900/30 dark:text-emerald-400'
                          : cnpjData.situacaoCadastral.toUpperCase().includes('SUSPENS')
                            ? 'bg-amber-50 text-amber-600 ring-1 ring-amber-500/20 dark:bg-amber-900/30 dark:text-amber-400'
                            : 'bg-red-50 text-red-600 ring-1 ring-red-500/20 dark:bg-red-900/30 dark:text-red-400'
                      }`}>
                        {cnpjData.situacaoCadastral}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={handleSyncCnpj}
                    disabled={cnpjLoading}
                    className="flex items-center gap-1 text-[10px] font-medium text-blue-500 hover:text-blue-600 transition-colors disabled:opacity-40"
                    title="Atualizar dados da Receita Federal"
                  >
                    <span className={`material-symbols-outlined text-[13px] ${cnpjLoading ? 'animate-spin' : ''}`}>sync</span>
                    Sincronizar
                  </button>
                </div>
                <div className="space-y-1.5 text-[11px]">
                  {/* Razão Social e Nome Fantasia da Receita */}
                  {cnpjData.razaoSocial && (
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <span className="font-bold text-slate-700 dark:text-slate-300">{cnpjData.razaoSocial}</span>
                      {cnpjData.nomeFantasia && <span className="text-slate-400 dark:text-slate-500 text-[10px]">({cnpjData.nomeFantasia})</span>}
                    </div>
                  )}
                  {/* Linha de dados fiscais inline */}
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-slate-500 dark:text-slate-400">
                    {cnpjData.cnaePrincipal && (
                      <span title={cnpjData.cnaePrincipal.descricao}>
                        CNAE <span className="font-mono text-blue-600 dark:text-blue-400">{cnpjData.cnaePrincipal.codigo}</span>
                        <span className="text-[10px] ml-0.5">{cnpjData.cnaePrincipal.descricao.length > 40 ? cnpjData.cnaePrincipal.descricao.slice(0, 40) + '...' : cnpjData.cnaePrincipal.descricao}</span>
                      </span>
                    )}
                    {cnpjData.naturezaJuridica && <span>{cnpjData.naturezaJuridica}</span>}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-slate-500 dark:text-slate-400">
                    {cnpjData.porte && <span>{cnpjData.porte}</span>}
                    {cnpjData.capitalSocial != null && <span>Capital {cnpjData.capitalSocial.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>}
                    <span>Simples: {cnpjData.simplesNacional === true ? 'Sim' : cnpjData.simplesNacional === false ? 'Não' : '-'}</span>
                    {cnpjData.mei != null && <span>MEI: {cnpjData.mei ? 'Sim' : 'Não'}</span>}
                  </div>
                  {/* Contato + endereço na mesma linha */}
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-slate-500 dark:text-slate-400 text-[10px]">
                    {cnpjData.telefone && <span><span className="material-symbols-outlined text-[11px] align-middle mr-0.5">phone</span>{cnpjData.telefone}</span>}
                    {cnpjData.email && <span><span className="material-symbols-outlined text-[11px] align-middle mr-0.5">mail</span>{cnpjData.email}</span>}
                    {cnpjData.endereco && (
                      <span>
                        <span className="material-symbols-outlined text-[11px] align-middle mr-0.5">location_on</span>
                        {[cnpjData.endereco.logradouro, cnpjData.endereco.numero ? `nº ${cnpjData.endereco.numero}` : null].filter(Boolean).join(', ')}
                        {' — '}{[cnpjData.endereco.bairro, cnpjData.endereco.municipio, cnpjData.endereco.uf].filter(Boolean).join(', ')}
                        {cnpjData.endereco.cep && <span> · CEP {cnpjData.endereco.cep}</span>}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}
            {!cnpjLoading && !cnpjData && customer?.cnpj && customer.cnpj.replace(/\D/g, '').length === 14 && (
              <div className="mt-3 flex justify-center">
                <button
                  onClick={handleSyncCnpj}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium text-blue-500 hover:text-blue-600 ring-1 ring-blue-200 dark:ring-blue-800 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                >
                  <span className="material-symbols-outlined text-[14px]">account_balance</span>
                  Consultar Receita Federal
                </button>
              </div>
            )}
          </SectionCard>

          <div className="order-first">
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
          </div>

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
                          <SortableHeader label="Referência" sortKey="code" />
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

          {/* Notas Fiscais (Vendas e Bonificações) */}
          <SectionCard
            title="Notas Fiscais"
            subtitle="Vendas e bonificações"
            icon="receipt_long"
            iconColor="text-primary"
            open={isInvoicesOpen}
            onToggle={() => setIsInvoicesOpen((prev) => !prev)}
            badge={saleInvoices.length || undefined}
          >
            {saleInvoices.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 gap-2">
                <span className="material-symbols-outlined text-[36px] text-slate-300 dark:text-slate-600">receipt</span>
                <span className="text-[13px] text-slate-400">Nenhuma nota de venda ou bonificação encontrada</span>
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
                    {saleInvoices.map((invoice) => {
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

          {/* Movimentações (consignação, demonstração, comodato, etc.) */}
          <SectionCard
            title="Movimentações"
            subtitle="Consignação, demonstração, remessa e outros"
            icon="swap_horiz"
            iconColor="text-amber-500"
            open={isMovimentacoesOpen}
            onToggle={() => setIsMovimentacoesOpen((prev) => !prev)}
            badge={movimentacaoInvoices.length || undefined}
          >
            {movimentacaoInvoices.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 gap-2">
                <span className="material-symbols-outlined text-[36px] text-slate-300 dark:text-slate-600">swap_horiz</span>
                <span className="text-[13px] text-slate-400">Nenhuma movimentação encontrada</span>
              </div>
            ) : (
              <div className="overflow-x-auto max-h-[360px] rounded-xl ring-1 ring-slate-200/50 dark:ring-slate-800/50">
                <table className="w-full text-left border-collapse min-w-[760px]">
                  <thead className="sticky top-0 z-10">
                    <tr className="bg-slate-50 dark:bg-slate-900/70 border-b border-slate-200 dark:border-slate-800">
                      <th className={thCls}>Número</th>
                      <th className={thCls}>Emissão</th>
                      <th className={thCls}>Tipo</th>
                      <th className={`${thCls} text-right`}>Valor</th>
                      <th className={`${thCls} text-center`}>Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                    {movimentacaoInvoices.map((invoice) => (
                      <tr key={invoice.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30 transition-colors">
                        <td className={`${tdCls} text-xs font-bold text-slate-800 dark:text-white`}>{invoice.number}</td>
                        <td className={`${tdCls} text-xs text-slate-600 dark:text-slate-300`}>{formatDate(invoice.issueDate)}</td>
                        <td className={tdCls}>
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                            {invoice.cfopTag}
                          </span>
                        </td>
                        <td className={`${tdCls} text-right text-xs font-bold font-mono tabular-nums text-slate-900 dark:text-white`}>
                          {formatCurrency(invoice.totalValue)}
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
                    ))}
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
        <div className="fixed inset-0 z-50 sm:flex sm:items-center sm:justify-center sm:p-4 sm:bg-black/60 sm:backdrop-blur-sm">
          <div
            className="absolute inset-0 hidden sm:block"
            onClick={onClose}
            aria-hidden="true"
          />
          <div
            className="relative bg-slate-50 dark:bg-[#1a1e2e] sm:rounded-2xl w-full sm:max-w-6xl h-full sm:h-[92vh] flex flex-col overflow-hidden sm:shadow-2xl sm:ring-1 ring-black/5 dark:ring-white/5"
            role="dialog"
            aria-modal="true"
          >
            {/* Header */}
            <div className="px-4 sm:px-6 py-4 bg-white dark:bg-card-dark border-b border-slate-200 dark:border-slate-700 shrink-0 shadow-[0_2px_8px_rgba(0,0,0,0.08)] sm:shadow-none">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 dark:from-primary/30 dark:to-primary/10 flex items-center justify-center ring-1 ring-primary/20 dark:ring-primary/30 shrink-0 hidden sm:flex">
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
                  className="hidden sm:flex p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0"
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

            {/* Footer - mobile only */}
            <div className="sm:hidden px-4 py-3 border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-card-dark shrink-0 shadow-[0_-4px_12px_rgba(0,0,0,0.06)]">
              <button
                onClick={onClose}
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-primary text-white font-bold text-base active:bg-primary-dark transition-colors shadow-sm"
              >
                <span className="material-symbols-outlined text-[20px]">arrow_back</span>
                Voltar
              </button>
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
