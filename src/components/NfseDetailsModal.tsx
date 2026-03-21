'use client';

import { useState, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { useModalBackButton } from '@/hooks/useModalBackButton';
import { Field, SectionBlock } from '@/components/ui/InvoiceDetailHelpers';
import type { NfseDetails } from '@/types/invoice-details';

interface NfseDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoiceId: string | null;
}

function formatMoney(val: string) {
  if (!val || val === '') return '-';
  const n = parseFloat(val);
  if (isNaN(n)) return val;
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDateBr(dateStr: string) {
  if (!dateStr) return '-';
  try {
    const d = new Date(dateStr);
    return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return dateStr;
  }
}

function formatCnpjDisplay(cnpj: string) {
  if (!cnpj) return '-';
  const clean = cnpj.replace(/\D/g, '');
  if (clean.length === 14) return clean.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  if (clean.length === 11) return clean.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
  return cnpj;
}

const TABS = [
  { id: 'nfse', label: 'NFS-e', icon: 'receipt_long' },
  { id: 'prestador', label: 'Prestador', icon: 'storefront' },
  { id: 'tomador', label: 'Tomador', icon: 'person' },
  { id: 'servico', label: 'Serviço', icon: 'handyman' },
];

function TabNfse({ data }: { data: NfseDetails }) {
  const n = data.nfse;
  return (
    <div className="space-y-4">
      <SectionBlock title="Dados da NFS-e" icon="receipt_long" iconColor="text-primary">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-3 sm:gap-x-6 gap-y-2 sm:gap-y-3">
          <Field label="Número" value={n.numero} />
          <Field label="Data de Emissão" value={formatDateBr(n.dataEmissao)} />
          {n.dataProcessamento && <Field label="Data Processamento" value={formatDateBr(n.dataProcessamento)} />}
          {n.codigoVerificacao && <Field label="Código de Verificação" value={n.codigoVerificacao} />}
          {n.locPrestacao && <Field label="Local de Prestação" value={n.locPrestacao} />}
          <Field label="Valor do Serviço" value={n.valorServico ? `R$ ${formatMoney(n.valorServico)}` : '-'} />
          <Field label="Valor Líquido" value={n.valorLiquido ? `R$ ${formatMoney(n.valorLiquido)}` : '-'} />
        </div>
      </SectionBlock>
    </div>
  );
}

function TabParty({ data, partyKey, title, icon, iconColor }: { data: NfseDetails; partyKey: 'prestador' | 'tomador'; title: string; icon: string; iconColor: string }) {
  const party = data[partyKey];
  if (!party) return <p className="text-sm text-slate-400 text-center py-8">Dados não disponíveis</p>;
  return (
    <div className="space-y-4">
      <SectionBlock title={title} icon={icon} iconColor={iconColor}>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-3 sm:gap-x-6 gap-y-2 sm:gap-y-3">
          <Field label="CNPJ/CPF" value={formatCnpjDisplay(party.cnpj)} />
          <Field label="Razão Social" value={party.razaoSocial} className="sm:col-span-2" />
          {party.im && <Field label="Inscrição Municipal" value={party.im} />}
          {party.email && <Field label="E-mail" value={party.email} />}
          {party.telefone && <Field label="Telefone" value={party.telefone} />}
        </div>
      </SectionBlock>

      {(party.endereco || party.municipio) && (
        <SectionBlock title="Endereço" icon="location_on" iconColor="text-teal-500">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-3 sm:gap-x-6 gap-y-2 sm:gap-y-3">
            {party.endereco && <Field label="Endereço" value={party.endereco} className="sm:col-span-2" />}
            {party.bairro && <Field label="Bairro" value={party.bairro} />}
            {party.municipio && <Field label="Município" value={party.municipio} />}
            {party.uf && <Field label="UF" value={party.uf} />}
            {party.cep && <Field label="CEP" value={party.cep} />}
          </div>
        </SectionBlock>
      )}
    </div>
  );
}

function TabServico({ data }: { data: NfseDetails }) {
  const s = data.servico;
  if (!s) return <p className="text-sm text-slate-400 text-center py-8">Dados não disponíveis</p>;
  return (
    <div className="space-y-4">
      <SectionBlock title="Descrição do Serviço" icon="handyman" iconColor="text-violet-500">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-3 sm:gap-x-6 gap-y-2 sm:gap-y-3">
          {s.codigoNacional && <Field label="Código Nacional" value={s.codigoNacional} />}
          {s.codigoMunicipal && <Field label="Código Municipal" value={s.codigoMunicipal} />}
          {s.municipio && <Field label="Município de Prestação" value={s.municipio} />}
          {s.descricao && <Field label="Discriminação" value={s.descricao} className="col-span-2 sm:col-span-3" />}
        </div>
      </SectionBlock>

      <SectionBlock title="Valores e ISSQN" icon="calculate" iconColor="text-emerald-500">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-3 sm:gap-x-6 gap-y-2 sm:gap-y-3">
          <Field label="Valor do Serviço" value={s.valorServico ? `R$ ${formatMoney(s.valorServico)}` : '-'} />
          <Field label="Valor Líquido" value={s.valorLiquido ? `R$ ${formatMoney(s.valorLiquido)}` : '-'} />
          {s.baseCalculo && <Field label="Base de Cálculo" value={`R$ ${formatMoney(s.baseCalculo)}`} />}
          {s.aliquota && <Field label="Alíquota ISSQN" value={`${s.aliquota}%`} />}
          {s.valorIss && <Field label="Valor ISSQN" value={`R$ ${formatMoney(s.valorIss)}`} />}
          {s.issRetido && <Field label="ISS Retido" value={s.issRetido} />}
        </div>
      </SectionBlock>
    </div>
  );
}

export default function NfseDetailsModal({ isOpen, onClose, invoiceId }: NfseDetailsModalProps) {
  useModalBackButton(isOpen, onClose);
  const [data, setData] = useState<NfseDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('nfse');
  const tabsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen || !invoiceId) return;
    setLoading(true);
    setError(null);
    setActiveTab('nfse');
    setData(null);

    fetch(`/api/invoices/${invoiceId}/details`)
      .then(res => {
        if (!res.ok) throw new Error('Erro ao carregar detalhes');
        return res.json();
      })
      .then(setData)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [isOpen, invoiceId]);

  if (!isOpen || !invoiceId) return null;

  const copyAccessKey = () => {
    if (!data?.accessKey) return;
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(data.accessKey).then(() => toast.success('Chave copiada!'));
    } else {
      const textarea = document.createElement('textarea');
      textarea.value = data.accessKey;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      toast.success('Chave copiada!');
    }
  };

  const scrollTabs = (dir: 'left' | 'right') => {
    tabsRef.current?.scrollBy({ left: dir === 'left' ? -200 : 200, behavior: 'smooth' });
  };

  const renderTabContent = () => {
    if (!data) return null;
    switch (activeTab) {
      case 'nfse': return <TabNfse data={data} />;
      case 'prestador': return <TabParty data={data} partyKey="prestador" title="Dados do Prestador" icon="storefront" iconColor="text-orange-500" />;
      case 'tomador': return <TabParty data={data} partyKey="tomador" title="Dados do Tomador" icon="person" iconColor="text-indigo-500" />;
      case 'servico': return <TabServico data={data} />;
      default: return null;
    }
  };

  return (
    <div className="fixed inset-0 z-50 !mt-0 sm:flex sm:items-center sm:justify-center sm:p-4 sm:bg-black/60 sm:backdrop-blur-sm">
      <div className="absolute inset-0 hidden sm:block" onClick={onClose} aria-hidden="true" />
      <div
        className="absolute inset-0 sm:relative sm:inset-auto bg-slate-50 dark:bg-[#1a1e2e] sm:rounded-2xl w-full sm:max-w-5xl sm:h-[92vh] flex flex-col overflow-hidden sm:shadow-2xl sm:ring-1 ring-black/5 dark:ring-white/5"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="px-4 sm:px-6 py-4 bg-white dark:bg-card-dark border-b border-slate-200 dark:border-slate-700 shrink-0 shadow-[0_2px_8px_rgba(0,0,0,0.08)] sm:shadow-none">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500/20 to-violet-500/5 dark:from-violet-500/30 dark:to-violet-500/10 flex items-center justify-center ring-1 ring-violet-500/20 dark:ring-violet-500/30 shrink-0 hidden sm:flex">
                <span className="material-symbols-outlined text-[22px] text-violet-500">receipt_long</span>
              </div>
              <div className="min-w-0">
                <h3 className="text-[15px] font-bold text-slate-900 dark:text-white leading-tight">
                  {data ? `NFS-e ${data.number}` : 'Detalhes da NFS-e'}
                </h3>
              </div>
            </div>
            <button
              onClick={onClose}
              aria-label="Fechar"
              className="hidden sm:flex p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0"
            >
              <span className="material-symbols-outlined text-[20px]">close</span>
            </button>
          </div>

          {data?.accessKey && (
            <div className="flex items-center gap-2.5 mt-3 px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-700/50">
              <span className="material-symbols-outlined text-[14px] text-slate-400">key</span>
              <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider shrink-0">Chave</span>
              <span className="text-[11px] font-mono text-slate-600 dark:text-slate-300 tracking-wider truncate select-all">
                {data.accessKey.replace(/\D/g, '').replace(/(.{4})/g, '$1 ').trim()}
              </span>
              <button
                onClick={copyAccessKey}
                className="flex-shrink-0 p-1 rounded-lg hover:bg-white dark:hover:bg-slate-700 text-slate-400 hover:text-violet-500 transition-colors"
                title="Copiar chave de acesso"
              >
                <span className="material-symbols-outlined text-[15px]">content_copy</span>
              </button>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="flex items-center border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-card-dark px-1 shrink-0">
          <button
            onClick={() => scrollTabs('left')}
            className="flex-shrink-0 p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            aria-label="Scroll esquerda"
          >
            <span className="material-symbols-outlined text-[18px]">chevron_left</span>
          </button>
          <div ref={tabsRef} className="flex-1 flex items-center overflow-x-auto gap-0.5 px-1" style={{ scrollbarWidth: 'none' }}>
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-2.5 text-[12px] font-bold whitespace-nowrap transition-all border-b-2 -mb-px rounded-t-lg ${
                  activeTab === tab.id
                    ? 'text-violet-600 dark:text-violet-400 border-violet-500 bg-violet-500/5 dark:bg-violet-500/10'
                    : 'text-slate-400 dark:text-slate-500 border-transparent hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/30'
                }`}
              >
                <span className="material-symbols-outlined text-[15px]">{tab.icon}</span>
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            ))}
          </div>
          <button
            onClick={() => scrollTabs('right')}
            className="flex-shrink-0 p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            aria-label="Scroll direita"
          >
            <span className="material-symbols-outlined text-[18px]">chevron_right</span>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {loading && (
            <div className="flex flex-col items-center justify-center h-full gap-3">
              <div className="w-14 h-14 rounded-2xl bg-violet-500/10 dark:bg-violet-500/20 flex items-center justify-center ring-1 ring-violet-500/20 dark:ring-violet-500/30">
                <span className="material-symbols-outlined text-[28px] text-violet-500 animate-spin">progress_activity</span>
              </div>
              <p className="text-[13px] font-medium text-slate-400">Carregando detalhes...</p>
            </div>
          )}
          {error && (
            <div className="flex flex-col items-center justify-center h-full gap-3">
              <div className="w-14 h-14 rounded-2xl bg-red-500/10 dark:bg-red-500/20 flex items-center justify-center ring-1 ring-red-500/20 dark:ring-red-500/30">
                <span className="material-symbols-outlined text-[28px] text-red-500">error</span>
              </div>
              <p className="text-[13px] font-medium text-red-400">{error}</p>
            </div>
          )}
          {data && !loading && renderTabContent()}
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
  );
}
