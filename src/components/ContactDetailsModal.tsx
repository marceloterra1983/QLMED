'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import Modal from '@/components/ui/Modal';
import { toast } from 'sonner';
import Skeleton from '@/components/ui/Skeleton';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import InvoiceDetailsModal from '@/components/InvoiceDetailsModal';
import NfeDetailsModal from '@/components/NfeDetailsModal';
import { formatDate, formatAmount } from '@/lib/utils';
import { formatDocument, normalizeDateOnly } from '@/lib/modal-helpers';
import { parseCnpjResponse, type CnpjResult } from '@/lib/cnpj-result';
import type {
  ContactRef, ContactDetails, ContactPurchases, ContactPriceRow, ContactInvoice,
  ContactDuplicate, ContactMeta, ContactFiscalData, ContactOverrideData,
} from '@/components/contact-details/contact-detail-types';
import { CONTACT_KINDS, type ContactKind } from '@/components/contact-details/contact-kinds';
import { SectionCard, StatCard } from '@/components/contact-details/contact-detail-utils';
import ContactInfoSection from '@/components/contact-details/ContactInfoSection';
import AddressSection from '@/components/contact-details/AddressSection';
import FiscalSection from '@/components/contact-details/FiscalSection';
import PriceTableSection from '@/components/contact-details/PriceTableSection';
import { InvoiceTable, MovimentacoesTable, DuplicatasTable } from '@/components/contact-details/InvoiceListSection';
import Button from '@/components/ui/Button';

/**
 * A rota devolve o contato sob `customer` ou `supplier` conforme o tipo;
 * `productTypes` só vem na de fornecedor.
 */
interface ContactDetailsResponse {
  customer?: ContactDetails;
  supplier?: ContactDetails;
  contactFiscal: ContactFiscalData | null;
  productTypes?: string[];
  purchases: ContactPurchases;
  priceTable: ContactPriceRow[];
  invoices: ContactInvoice[];
  duplicates: ContactDuplicate[];
  meta: ContactMeta;
}

interface ContactDetailsModalProps {
  kind: ContactKind;
  isOpen: boolean;
  onClose: () => void;
  contact: ContactRef | null;
  inline?: boolean;
}

export default function ContactDetailsModal({ kind, isOpen, onClose, contact, inline = false }: ContactDetailsModalProps) {
  const cfg = CONTACT_KINDS[kind];

  const [loading, setLoading] = useState(false);
  const [details, setDetails] = useState<ContactDetailsResponse | null>(null);
  const [shortName, setShortName] = useState('');
  const [shortNameDraft, setShortNameDraft] = useState('');
  const [savingShortName, setSavingShortName] = useState(false);
  const [cnpjData, setCnpjData] = useState<CnpjResult | null>(null);
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

  const fetchDetails = useCallback(async (target: ContactRef): Promise<ContactDetailsResponse> => {
    const params = new URLSearchParams();
    if (target.cnpj) params.set('cnpj', target.cnpj);
    if (target.name) params.set('name', target.name);
    const res = await fetch(`${cfg.detailsPath}?${params}`);
    if (!res.ok) throw new Error(`Falha ao carregar dados do ${cfg.noun}`);
    return res.json();
  }, [cfg.detailsPath, cfg.noun]);

  const contactData = details ? (details[cfg.responseKey] ?? null) : null;

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
    if (!isOpen || !contact) return;
    let cancelled = false;

    const load = async () => {
      setDetails(null); setLoading(true);
      try {
        const data = await fetchDetails(contact);
        if (!cancelled) setDetails(data);
      } catch {
        if (!cancelled) toast.error(`Erro ao carregar detalhes do ${cfg.noun}`);
      } finally {
        if (!cancelled) setLoading(false);
      }

      if (!cancelled && contact.cnpj) {
        try {
          const nickRes = await fetch(`/api/contacts/nickname?cnpj=${encodeURIComponent(contact.cnpj)}`);
          if (!cancelled && nickRes.ok) { const nickData = await nickRes.json(); setShortName(nickData.shortName || ''); setShortNameDraft(nickData.shortName || ''); }
        } catch { /* ignore */ }

        try {
          const ovRes = await fetch(`/api/contacts/override?cnpj=${encodeURIComponent(contact.cnpj)}`);
          if (!cancelled && ovRes.ok) { const ovData = await ovRes.json(); setContactOverride(ovData.override || null); }
        } catch { /* ignore */ }

        const digits = contact.cnpj.replace(/\D/g, '');
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

    load();
    return () => { cancelled = true; };
  }, [isOpen, contact, fetchDetails, cfg.noun]);

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
      if (contact && isOpen) {
        setLoading(true);
        try { setDetails(await fetchDetails(contact)); }
        catch { toast.error(`Erro ao atualizar dados do ${cfg.noun}`); }
        finally { setLoading(false); }
      }
    } catch { toast.error('Erro de rede ao excluir'); }
  };

  const handleSaveShortName = async () => {
    if (!contact?.cnpj) return;
    setSavingShortName(true);
    try {
      const res = await fetch('/api/contacts/nickname', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cnpj: contact.cnpj, shortName: shortNameDraft }) });
      if (res.ok) { const data = await res.json(); setShortName(data.shortName || ''); setShortNameDraft(data.shortName || ''); toast.success('Nome abreviado salvo com sucesso'); }
      else { toast.error('Erro ao salvar nome abreviado'); }
    } catch { toast.error('Erro de rede ao salvar nome abreviado'); }
    finally { setSavingShortName(false); }
  };

  const handleEditField = useCallback((field: string, value: string) => {
    setEditDraft((prev) => ({ ...prev, [field]: value }));
  }, []);

  const handleSaveOverride = async () => {
    if (!contact?.cnpj || !contactData) return;
    setSavingOverride(true);
    try {
      const d = contactData;
      const ov = contactOverride;
      const payload = {
        cnpj: contact.cnpj,
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
    if (!contact?.cnpj) return;
    const digits = contact.cnpj.replace(/\D/g, '');
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
    if (isEditing) { setIsEditing(false); setEditDraft({}); return; }
    const d = details?.[cfg.responseKey];
    if (!d) return;
    setIsEditing(true);
    const ov = contactOverride;
    setEditDraft({
      phone: ov?.phone ?? d.phone ?? '', email: ov?.email ?? d.email ?? '',
      street: ov?.street ?? d.address.street ?? '', number: ov?.number ?? d.address.number ?? '',
      complement: ov?.complement ?? d.address.complement ?? '', district: ov?.district ?? d.address.district ?? '',
      city: ov?.city ?? d.address.city ?? '', state: ov?.state ?? d.address.state ?? '',
      zipCode: ov?.zipCode ?? d.address.zipCode ?? '', country: ov?.country ?? d.address.country ?? '',
    });
  }, [isEditing, contactOverride, details, cfg.responseKey]);

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

  const [primaryInvoices, movimentacaoInvoices] = useMemo(() => {
    if (!details) return [[], []] as [ContactInvoice[], ContactInvoice[]];
    const tags = new Set(cfg.primaryInvoiceTags);
    const primary: ContactInvoice[] = [];
    const movimentacoes: ContactInvoice[] = [];
    for (const inv of details.invoices) (tags.has(inv.cfopTag) ? primary : movimentacoes).push(inv);
    return [primary, movimentacoes];
  }, [details, cfg.primaryInvoiceTags]);

  const fiscalWarning = useMemo(() => {
    if (!cnpjData || !details || !cfg.fiscalWarning) return null;
    return cfg.fiscalWarning(cnpjData, details.productTypes || []);
  }, [cnpjData, details, cfg]);

  const content = (
    <>
      {loading && (
        <div className="space-y-4">
          <Skeleton className="h-14 w-full rounded-xl" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <Skeleton className="h-20 w-full rounded-xl" /><Skeleton className="h-20 w-full rounded-xl" />
            <Skeleton className="h-20 w-full rounded-xl" /><Skeleton className="h-20 w-full rounded-xl" />
          </div>
          <Skeleton className="h-48 w-full rounded-xl" /><Skeleton className="h-48 w-full rounded-xl" />
        </div>
      )}

      {!loading && details && contactData && (
        <div className="flex flex-col gap-3">
          <SectionCard title="Dados de Cadastro" subtitle={cfg.registrationSubtitle} icon="badge" iconColor={cfg.shortNameIconClass} open={isRegistrationOpen} onToggle={() => setIsRegistrationOpen((prev) => !prev)}>
            <div className="flex items-center gap-2 mb-3">
              <span className={`material-symbols-outlined text-[14px] ${cfg.shortNameIconClass}`}>edit_note</span>
              <input type="text" value={shortNameDraft} onChange={(e) => setShortNameDraft(e.target.value)} placeholder={cfg.shortNamePlaceholder} maxLength={60} className="flex-1 px-2 py-1 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/50 text-slate-900 dark:text-white placeholder-slate-400 transition-all" />
              <button onClick={handleSaveShortName} disabled={savingShortName || shortNameDraft === shortName} className={`flex items-center gap-1 px-2.5 py-1 text-xs font-bold text-white rounded-lg transition-colors disabled:opacity-40 shrink-0 ${cfg.shortNameButtonClass}`}>
                {savingShortName && <span className="material-symbols-outlined text-[13px] animate-spin">sync</span>}
                {savingShortName ? '...' : 'Salvar'}
              </button>
            </div>

            <ContactInfoSection contact={contactData} contactFiscal={details.contactFiscal} />

            <AddressSection
              contact={contactData} contactOverride={contactOverride} cnpjData={cnpjData}
              isEditing={isEditing} editDraft={editDraft} savingOverride={savingOverride}
              accentColor={cfg.addressAccent} onToggleEdit={handleToggleEdit} onEditField={handleEditField}
              onSave={handleSaveOverride} onCancelEdit={() => { setIsEditing(false); setEditDraft({}); }}
              getField={getField}
            />

            {cnpjLoading && (
              <div className="mt-3 rounded-lg ring-1 ring-blue-200/60 dark:ring-blue-800/40 p-2.5 bg-blue-50/30 dark:bg-blue-900/10">
                <div className="flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[13px] text-blue-500 animate-spin">sync</span>
                  <p className="text-xs font-bold text-blue-500 dark:text-blue-400 uppercase tracking-wider">Consultando Receita Federal...</p>
                </div>
              </div>
            )}
            {!cnpjLoading && cnpjData && (
              <FiscalSection cnpjData={cnpjData} cnpjLoading={cnpjLoading} onSync={handleSyncCnpj} cnaeMismatchWarning={fiscalWarning} />
            )}
            {!cnpjLoading && !cnpjData && contact?.cnpj && contact.cnpj.replace(/\D/g, '').length === 14 && (
              <div className="mt-3 flex justify-center">
                <button onClick={handleSyncCnpj} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-500 hover:text-blue-600 ring-1 ring-blue-200 dark:ring-blue-800 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors">
                  <span className="material-symbols-outlined text-[14px]">account_balance</span>
                  Consultar Receita Federal
                </button>
              </div>
            )}
          </SectionCard>

          <div className="order-first">
            <SectionCard title="Dados Gerais" subtitle={cfg.generalSubtitle} icon="analytics" iconColor="text-emerald-500" open={isGeneralOpen} onToggle={() => setIsGeneralOpen((prev) => !prev)}>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
                <StatCard label={cfg.statLabels[0]} value={details.purchases.totalInvoices.toLocaleString('pt-BR')} icon="receipt_long" color={cfg.firstStatColor} />
                <StatCard label={cfg.statLabels[1]} value={formatAmount(details.purchases.totalValue)} icon="payments" color="emerald" />
                <StatCard label={cfg.statLabels[2]} value={details.purchases.totalPurchasedItems.toLocaleString('pt-BR', { maximumFractionDigits: 4 })} icon="shopping_cart" color="indigo" />
                <StatCard label={cfg.statLabels[3]} value={details.purchases.totalProductsPurchased.toLocaleString('pt-BR')} icon="inventory_2" color="amber" />
                <StatCard label={cfg.statLabels[4]} value={details.purchases.lastIssueDate ? formatDate(details.purchases.lastIssueDate) : '-'} icon="event" color="teal" />
              </div>
            </SectionCard>
          </div>

          <SectionCard title="Tabela de Preço" subtitle={cfg.priceTableSubtitle} icon="table_chart" iconColor="text-teal-500" open={isPriceTableOpen} onToggle={() => setIsPriceTableOpen((prev) => !prev)} badge={details.priceTable.length || undefined}>
            <PriceTableSection priceTable={details.priceTable} meta={details.meta} sortAccentColor={cfg.sortAccentColor} />
          </SectionCard>

          <SectionCard title="Notas Fiscais" subtitle={cfg.invoicesSubtitle} icon="receipt_long" iconColor="text-primary dark:text-blue-400" open={isInvoicesOpen} onToggle={() => setIsInvoicesOpen((prev) => !prev)} badge={primaryInvoices.length || undefined}>
            <InvoiceTable invoices={primaryInvoices} installmentsMap={invoiceInstallmentsMap} emptyLabel={cfg.invoicesEmptyLabel} onView={openInvoiceViewer} onDetails={openInvoiceDetails} onDelete={confirmDelete} />
          </SectionCard>

          <SectionCard title="Movimentações" subtitle="Consignação, demonstração, remessa e outros" icon="swap_horiz" iconColor="text-amber-500" open={isMovimentacoesOpen} onToggle={() => setIsMovimentacoesOpen((prev) => !prev)} badge={movimentacaoInvoices.length || undefined}>
            <MovimentacoesTable invoices={movimentacaoInvoices} onView={openInvoiceViewer} onDetails={openInvoiceDetails} onDelete={confirmDelete} />
          </SectionCard>

          <SectionCard title="Duplicatas" subtitle="Parcelas encontradas nas notas fiscais" icon="account_balance" iconColor="text-rose-500" open={isDuplicatesOpen} onToggle={() => setIsDuplicatesOpen((prev) => !prev)} badge={details.duplicates.length || undefined}>
            <DuplicatasTable duplicates={details.duplicates} />
          </SectionCard>
        </div>
      )}

      {!loading && !contactData && (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <div className="w-16 h-16 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center ring-1 ring-slate-200/50 dark:ring-slate-700/50">
            <span className="material-symbols-outlined text-[32px] text-slate-300 dark:text-slate-600">{cfg.emptyIcon}</span>
          </div>
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Sem dados para este {cfg.noun}</p>
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
        <Modal
      isOpen
      onClose={onClose}
      title="Detalhes do contato"
      surface="sunken"
      width="sm:max-w-6xl"
      height="sm:h-auto sm:max-h-[90vh]"
      bodyClassName="p-4 sm:p-6"
      header={
<div className="px-4 sm:px-6 py-4 bg-white dark:bg-card-dark border-b border-slate-200 dark:border-slate-700 shrink-0 shadow-[0_2px_8px_rgba(0,0,0,0.08)] sm:shadow-none">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ring-1 shrink-0 hidden sm:flex ${cfg.headerAvatarClass}`}>
                    <span className={`material-symbols-outlined text-[22px] ${cfg.headerIconClass}`}>{cfg.headerIcon}</span>
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-base font-bold text-slate-900 dark:text-white leading-tight truncate">
                      {contactData?.name || contact?.name || cfg.titleFallback}
                    </h3>
                    {contactData?.cnpj && (
                      <span className="text-xs font-mono text-slate-500 dark:text-slate-400">{formatDocument(contactData.cnpj)}</span>
                    )}
                  </div>
                </div>
                <button onClick={onClose} aria-label="Fechar" className="hidden sm:flex p-2 text-slate-500 dark:text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0" title="Fechar">
                  <span className="material-symbols-outlined text-[20px]">close</span>
                </button>
              </div>
            </div>
      }
      footer={
<div className="px-4 py-3 border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-card-dark shrink-0 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] sm:shadow-none">
              <div className="sm:hidden">
                <Button onClick={onClose} icon="arrow_back" size="lg" block>Voltar</Button>
              </div>
              <div className="hidden sm:flex items-center justify-end">
                <Button onClick={onClose} variant="secondary" size="sm">Fechar</Button>
              </div>
            </div>
      }
    >
{content}
    </Modal>
      )}

      <InvoiceDetailsModal isOpen={isInvoiceModalOpen} onClose={() => setIsInvoiceModalOpen(false)} invoiceId={selectedInvoiceId} />
      <NfeDetailsModal isOpen={isNfeDetailsOpen} onClose={() => setIsNfeDetailsOpen(false)} invoiceId={detailsInvoiceId} />
      <ConfirmDialog isOpen={showDeleteConfirm} onClose={() => { setShowDeleteConfirm(false); setDeleteTargetId(null); }} onConfirm={handleDelete} title="Excluir nota fiscal" message="Tem certeza que deseja excluir esta nota fiscal? Esta ação não pode ser desfeita." confirmLabel="Excluir" confirmVariant="danger" />
    </>
  );
}
