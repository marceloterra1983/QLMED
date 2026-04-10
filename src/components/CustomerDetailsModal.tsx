'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { toast } from 'sonner';
import { useModalBackButton } from '@/hooks/useModalBackButton';
import Skeleton from '@/components/ui/Skeleton';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import InvoiceDetailsModal from '@/components/InvoiceDetailsModal';
import NfeDetailsModal from '@/components/NfeDetailsModal';
import { formatDate, formatAmount } from '@/lib/utils';
import { formatDocument, normalizeDateOnly } from '@/lib/modal-helpers';
import { parseCnpjResponse, type CnpjData } from '@/lib/cnpj-utils';
import type {
  ContactDetails, ContactPriceRow, ContactInvoice, ContactDuplicate,
  ContactMeta, ContactFiscalData, ContactOverrideData,
} from '@/components/contact-details/contact-detail-types';
import { SectionCard, StatCard } from '@/components/contact-details/contact-detail-utils';
import ContactInfoSection from '@/components/contact-details/ContactInfoSection';
import AddressSection from '@/components/contact-details/AddressSection';
import FiscalSection from '@/components/contact-details/FiscalSection';
import PriceTableSection from '@/components/contact-details/PriceTableSection';
import { InvoiceTable, MovimentacoesTable, DuplicatasTable } from '@/components/contact-details/InvoiceListSection';

interface CustomerRef {
  cnpj: string;
  name: string;
}

interface CustomerDetailsResponse {
  customer: ContactDetails;
  contactFiscal: ContactFiscalData | null;
  purchases: {
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
  };
  priceTable: ContactPriceRow[];
  invoices: ContactInvoice[];
  duplicates: ContactDuplicate[];
  meta: ContactMeta;
}

async function fetchCustomerDetails(targetCustomer: CustomerRef): Promise<CustomerDetailsResponse> {
  const params = new URLSearchParams();
  if (targetCustomer.cnpj) params.set('cnpj', targetCustomer.cnpj);
  if (targetCustomer.name) params.set('name', targetCustomer.name);
  const res = await fetch(`/api/customers/details?${params}`);
  if (!res.ok) throw new Error('Falha ao carregar dados do cliente');
  return res.json();
}

interface CustomerDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  customer: CustomerRef | null;
  inline?: boolean;
}

export default function CustomerDetailsModal({ isOpen, onClose, customer, inline = false }: CustomerDetailsModalProps) {
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
      setShortName(''); setShortNameDraft(''); setSavingShortName(false);
      setCnpjData(null); setCnpjLoading(false);
      setIsRegistrationOpen(false); setIsGeneralOpen(true);
      setIsPriceTableOpen(false); setIsInvoicesOpen(false);
      setIsDuplicatesOpen(false); setIsMovimentacoesOpen(false);
      setIsInvoiceModalOpen(false); setIsNfeDetailsOpen(false);
      setSelectedInvoiceId(null); setDetailsInvoiceId(null);
      setShowDeleteConfirm(false); setDeleteTargetId(null);
      setIsEditing(false); setEditDraft({}); setSavingOverride(false); setContactOverride(null);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !customer) return;
    let cancelled = false;

    const loadCustomerDetails = async () => {
      setDetails(null); setLoading(true);
      try {
        const data = await fetchCustomerDetails(customer);
        if (!cancelled) setDetails(data);
      } catch {
        if (!cancelled) toast.error('Erro ao carregar detalhes do cliente');
      } finally {
        if (!cancelled) setLoading(false);
      }

      if (!cancelled && customer.cnpj) {
        try {
          const nickRes = await fetch(`/api/contacts/nickname?cnpj=${encodeURIComponent(customer.cnpj)}`);
          if (!cancelled && nickRes.ok) { const nickData = await nickRes.json(); setShortName(nickData.shortName || ''); setShortNameDraft(nickData.shortName || ''); }
        } catch { /* ignore */ }

        try {
          const ovRes = await fetch(`/api/contacts/override?cnpj=${encodeURIComponent(customer.cnpj)}`);
          if (!cancelled && ovRes.ok) { const ovData = await ovRes.json(); setContactOverride(ovData.override || null); }
        } catch { /* ignore */ }

        const digits = customer.cnpj.replace(/\D/g, '');
        if (digits.length === 14) {
          setCnpjLoading(true);
          try {
            const cnpjRes = await fetch(`/api/cnpj/${digits}`);
            if (!cancelled && cnpjRes.ok) { const data = await cnpjRes.json(); setCnpjData(parseCnpjResponse(data)); }
          } catch { /* graceful */ }
          if (!cancelled) setCnpjLoading(false);
        }
      }
    };

    loadCustomerDetails();
    return () => { cancelled = true; };
  }, [isOpen, customer]);

  useEffect(() => { if (!isOpen) setDetails(null); }, [isOpen]);

  const openInvoiceViewer = (id: string) => { setSelectedInvoiceId(id); setIsInvoiceModalOpen(true); };
  const openInvoiceDetails = (id: string) => { setDetailsInvoiceId(id); setIsNfeDetailsOpen(true); };
  const confirmDelete = (id: string) => { setDeleteTargetId(id); setShowDeleteConfirm(true); };

  const handleDelete = async () => {
    if (!deleteTargetId) return;
    try {
      const res = await fetch('/api/invoices', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: [deleteTargetId] }) });
      if (!res.ok) { toast.error('Erro ao excluir nota fiscal'); return; }
      const data = await res.json();
      toast.success(`${data.deleted} nota(s) excluída(s) com sucesso`);
      setDeleteTargetId(null);
      if (customer && isOpen) {
        setLoading(true);
        try { const refreshedDetails = await fetchCustomerDetails(customer); setDetails(refreshedDetails); }
        catch { toast.error('Erro ao atualizar dados do cliente'); }
        finally { setLoading(false); }
      }
    } catch { toast.error('Erro de rede ao excluir'); }
  };

  const handleSaveShortName = async () => {
    if (!customer?.cnpj) return;
    setSavingShortName(true);
    try {
      const res = await fetch('/api/contacts/nickname', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cnpj: customer.cnpj, shortName: shortNameDraft }) });
      if (res.ok) { const data = await res.json(); setShortName(data.shortName || ''); setShortNameDraft(data.shortName || ''); toast.success('Nome abreviado salvo com sucesso'); }
      else { toast.error('Erro ao salvar nome abreviado'); }
    } catch { toast.error('Erro de rede ao salvar nome abreviado'); }
    finally { setSavingShortName(false); }
  };

  const handleEditField = useCallback((field: string, value: string) => {
    setEditDraft((prev) => ({ ...prev, [field]: value }));
  }, []);

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
      const res = await fetch('/api/contacts/override', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (res.ok) { const data = await res.json(); setContactOverride(data.override || null); setIsEditing(false); setEditDraft({}); toast.success('Dados atualizados com sucesso'); }
      else { toast.error('Erro ao salvar alterações'); }
    } catch { toast.error('Erro de rede ao salvar'); }
    finally { setSavingOverride(false); }
  };

  const handleSyncCnpj = async () => {
    if (!customer?.cnpj) return;
    const digits = customer.cnpj.replace(/\D/g, '');
    if (digits.length !== 14) return;
    setCnpjLoading(true);
    try {
      const res = await fetch(`/api/cnpj/${digits}?refresh=1`);
      if (res.ok) { const data = await res.json(); setCnpjData(parseCnpjResponse(data)); toast.success('Dados da Receita atualizados'); }
      else { toast.error('Erro ao consultar Receita Federal'); }
    } catch { toast.error('Erro de rede'); }
    finally { setCnpjLoading(false); }
  };

  const getField = useCallback((xmlValue: string | null, overrideField: keyof ContactOverrideData): string | null => {
    if (contactOverride?.[overrideField]) return contactOverride[overrideField];
    return xmlValue;
  }, [contactOverride]);

  const handleToggleEdit = useCallback(() => {
    if (isEditing) { setIsEditing(false); setEditDraft({}); }
    else {
      setIsEditing(true);
      const ov = contactOverride;
      const d = details!.customer;
      setEditDraft({
        phone: ov?.phone ?? d.phone ?? '', email: ov?.email ?? d.email ?? '',
        street: ov?.street ?? d.address.street ?? '', number: ov?.number ?? d.address.number ?? '',
        complement: ov?.complement ?? d.address.complement ?? '', district: ov?.district ?? d.address.district ?? '',
        city: ov?.city ?? d.address.city ?? '', state: ov?.state ?? d.address.state ?? '',
        zipCode: ov?.zipCode ?? d.address.zipCode ?? '', country: ov?.country ?? d.address.country ?? '',
      });
    }
  }, [isEditing, contactOverride, details]);

  const invoiceInstallmentsMap = useMemo(() => {
    const map = new Map<string, { totalInstallments: number; firstDueDate: Date | null }>();
    if (!details) return map;
    for (const duplicate of details.duplicates) {
      const key = duplicate.invoiceId;
      const dueDate = normalizeDateOnly(duplicate.dueDate);
      const installmentTotal = duplicate.installmentTotal || 0;
      const existing = map.get(key);
      if (!existing) { map.set(key, { totalInstallments: installmentTotal, firstDueDate: dueDate }); continue; }
      existing.totalInstallments = Math.max(existing.totalInstallments, installmentTotal);
      if (dueDate && (!existing.firstDueDate || dueDate < existing.firstDueDate)) existing.firstDueDate = dueDate;
    }
    return map;
  }, [details]);

  const SALE_TAGS = new Set(['Venda', 'Bonificação']);
  const saleInvoices = useMemo(() => {
    if (!details) return [];
    return details.invoices.filter((inv) => SALE_TAGS.has(inv.cfopTag));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [details]);
  const movimentacaoInvoices = useMemo(() => {
    if (!details) return [];
    return details.invoices.filter((inv) => !SALE_TAGS.has(inv.cfopTag));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [details]);

  const content = (
    <>
      {loading && (
        <div className="space-y-4">
          <Skeleton className="h-14 w-full rounded-2xl" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <Skeleton className="h-20 w-full rounded-xl" /><Skeleton className="h-20 w-full rounded-xl" />
            <Skeleton className="h-20 w-full rounded-xl" /><Skeleton className="h-20 w-full rounded-xl" />
          </div>
          <Skeleton className="h-48 w-full rounded-2xl" /><Skeleton className="h-48 w-full rounded-2xl" />
        </div>
      )}

      {!loading && details && (
        <div className="flex flex-col gap-3">
          {/* Dados de Cadastro */}
          <SectionCard title="Dados de Cadastro" subtitle="Dados fiscais e endereço do destinatário" icon="badge" iconColor="text-indigo-500" open={isRegistrationOpen} onToggle={() => setIsRegistrationOpen((prev) => !prev)}>
            {/* Nome abreviado */}
            <div className="flex items-center gap-2 mb-3">
              <span className="material-symbols-outlined text-[14px] text-indigo-500">edit_note</span>
              <input type="text" value={shortNameDraft} onChange={(e) => setShortNameDraft(e.target.value)} placeholder="Nome abreviado (ex: Farmácia ABC)..." maxLength={60} className="flex-1 px-2 py-1 text-[13px] rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/50 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500 transition-all" />
              <button onClick={handleSaveShortName} disabled={savingShortName || shortNameDraft === shortName} className="flex items-center gap-1 px-2.5 py-1 text-[12px] font-bold bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 transition-colors disabled:opacity-40 shrink-0">
                {savingShortName && <span className="material-symbols-outlined text-[13px] animate-spin">sync</span>}
                {savingShortName ? '...' : 'Salvar'}
              </button>
            </div>

            <ContactInfoSection contact={details.customer} contactFiscal={details.contactFiscal} />

            <AddressSection
              contact={details.customer} contactOverride={contactOverride} cnpjData={cnpjData}
              isEditing={isEditing} editDraft={editDraft} savingOverride={savingOverride}
              accentColor="indigo" onToggleEdit={handleToggleEdit} onEditField={handleEditField}
              onSave={handleSaveOverride} onCancelEdit={() => { setIsEditing(false); setEditDraft({}); }}
              getField={getField}
            />

            {/* Receita Federal */}
            {cnpjLoading && (
              <div className="mt-3 rounded-lg ring-1 ring-blue-200/60 dark:ring-blue-800/40 p-2.5 bg-blue-50/30 dark:bg-blue-900/10">
                <div className="flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[13px] text-blue-500 animate-spin">sync</span>
                  <p className="text-[10px] font-bold text-blue-500 dark:text-blue-400 uppercase tracking-wider">Consultando Receita Federal...</p>
                </div>
              </div>
            )}
            {!cnpjLoading && cnpjData && (
              <FiscalSection cnpjData={cnpjData} cnpjLoading={cnpjLoading} onSync={handleSyncCnpj} />
            )}
            {!cnpjLoading && !cnpjData && customer?.cnpj && customer.cnpj.replace(/\D/g, '').length === 14 && (
              <div className="mt-3 flex justify-center">
                <button onClick={handleSyncCnpj} className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium text-blue-500 hover:text-blue-600 ring-1 ring-blue-200 dark:ring-blue-800 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors">
                  <span className="material-symbols-outlined text-[14px]">account_balance</span>
                  Consultar Receita Federal
                </button>
              </div>
            )}
          </SectionCard>

          <div className="order-first">
            <SectionCard title="Dados Gerais" subtitle="Resumo consolidado das vendas" icon="analytics" iconColor="text-emerald-500" open={isGeneralOpen} onToggle={() => setIsGeneralOpen((prev) => !prev)}>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
                <StatCard label="NF-e emitidas" value={details.purchases.totalInvoices.toLocaleString('pt-BR')} icon="receipt_long" color="primary" />
                <StatCard label="Total vendido" value={formatAmount(details.purchases.totalValue)} icon="payments" color="emerald" />
                <StatCard label="Itens vendidos" value={details.purchases.totalPurchasedItems.toLocaleString('pt-BR', { maximumFractionDigits: 4 })} icon="shopping_cart" color="indigo" />
                <StatCard label="Produtos vendidos" value={details.purchases.totalProductsPurchased.toLocaleString('pt-BR')} icon="inventory_2" color="amber" />
                <StatCard label="Última venda" value={details.purchases.lastIssueDate ? formatDate(details.purchases.lastIssueDate) : '-'} icon="event" color="teal" />
              </div>
            </SectionCard>
          </div>

          {/* Tabela de Preco */}
          <SectionCard title="Tabela de Preço" subtitle="Histórico por item com base nas NF-e emitidas" icon="table_chart" iconColor="text-teal-500" open={isPriceTableOpen} onToggle={() => setIsPriceTableOpen((prev) => !prev)} badge={details.priceTable.length || undefined}>
            <PriceTableSection priceTable={details.priceTable} meta={details.meta} sortAccentColor="text-primary" />
          </SectionCard>

          {/* Notas Fiscais - Vendas */}
          <SectionCard title="Notas Fiscais" subtitle="Vendas e bonificações" icon="receipt_long" iconColor="text-primary" open={isInvoicesOpen} onToggle={() => setIsInvoicesOpen((prev) => !prev)} badge={saleInvoices.length || undefined}>
            <InvoiceTable invoices={saleInvoices} installmentsMap={invoiceInstallmentsMap} emptyLabel="Nenhuma nota de venda ou bonificação encontrada" onView={openInvoiceViewer} onDetails={openInvoiceDetails} onDelete={confirmDelete} />
          </SectionCard>

          {/* Movimentacoes */}
          <SectionCard title="Movimentações" subtitle="Consignação, demonstração, remessa e outros" icon="swap_horiz" iconColor="text-amber-500" open={isMovimentacoesOpen} onToggle={() => setIsMovimentacoesOpen((prev) => !prev)} badge={movimentacaoInvoices.length || undefined}>
            <MovimentacoesTable invoices={movimentacaoInvoices} onView={openInvoiceViewer} onDetails={openInvoiceDetails} onDelete={confirmDelete} />
          </SectionCard>

          {/* Duplicatas */}
          <SectionCard title="Duplicatas" subtitle="Parcelas encontradas nas notas fiscais" icon="account_balance" iconColor="text-rose-500" open={isDuplicatesOpen} onToggle={() => setIsDuplicatesOpen((prev) => !prev)} badge={details.duplicates.length || undefined}>
            <DuplicatasTable duplicates={details.duplicates} />
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
        <div className="fixed inset-0 z-50 !mt-0 sm:flex sm:items-center sm:justify-center sm:p-4 sm:bg-black/60 sm:backdrop-blur-sm">
          <div className="absolute inset-0 hidden sm:block" onClick={onClose} aria-hidden="true" />
          <div className="absolute inset-0 sm:relative sm:inset-auto bg-slate-50 dark:bg-[#1a1e2e] sm:rounded-2xl w-full sm:max-w-6xl sm:h-auto sm:max-h-[90vh] flex flex-col overflow-hidden sm:shadow-2xl sm:ring-1 ring-black/5 dark:ring-white/5" role="dialog" aria-modal="true">
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
                <button onClick={onClose} aria-label="Fechar" className="hidden sm:flex p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0" title="Fechar">
                  <span className="material-symbols-outlined text-[20px]">close</span>
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4 sm:p-6">{content}</div>
            <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-card-dark shrink-0 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] sm:shadow-none">
              <div className="sm:hidden">
                <button onClick={onClose} className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-primary text-white font-bold text-base active:bg-primary-dark transition-colors shadow-sm">
                  <span className="material-symbols-outlined text-[20px]">arrow_back</span>Voltar
                </button>
              </div>
              <div className="hidden sm:flex items-center justify-end">
                <button onClick={onClose} className="px-3 py-2 text-sm font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800">Fechar</button>
              </div>
            </div>
          </div>
        </div>
      )}

      <InvoiceDetailsModal isOpen={isInvoiceModalOpen} onClose={() => setIsInvoiceModalOpen(false)} invoiceId={selectedInvoiceId} />
      <NfeDetailsModal isOpen={isNfeDetailsOpen} onClose={() => setIsNfeDetailsOpen(false)} invoiceId={detailsInvoiceId} />
      <ConfirmDialog isOpen={showDeleteConfirm} onClose={() => { setShowDeleteConfirm(false); setDeleteTargetId(null); }} onConfirm={handleDelete} title="Excluir nota fiscal" message="Tem certeza que deseja excluir esta nota fiscal? Esta ação não pode ser desfeita." confirmLabel="Excluir" confirmVariant="danger" />
    </>
  );
}
