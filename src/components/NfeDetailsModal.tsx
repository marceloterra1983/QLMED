'use client';

import { useState, useEffect, useRef, Fragment } from 'react';
import { toast } from 'sonner';
import { useModalBackButton } from '@/hooks/useModalBackButton';

interface NfeDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoiceId: string | null;
}

function Field({ label, value, className = '' }: { label: string; value?: string; className?: string }) {
  return (
    <div className={className}>
      <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-0.5">{label}</p>
      <p className="text-[13px] font-medium text-slate-800 dark:text-slate-200 break-words">{value || '-'}</p>
    </div>
  );
}

function SectionBlock({ title, icon, iconColor = 'text-primary', children }: { title: string; icon: string; iconColor?: string; children: React.ReactNode }) {
  const bgMap: Record<string, string> = {
    'text-primary': 'bg-primary/10 dark:bg-primary/20 ring-primary/20 dark:ring-primary/30',
    'text-indigo-500': 'bg-indigo-500/10 dark:bg-indigo-500/20 ring-indigo-500/20 dark:ring-indigo-500/30',
    'text-teal-500': 'bg-teal-500/10 dark:bg-teal-500/20 ring-teal-500/20 dark:ring-teal-500/30',
    'text-amber-500': 'bg-amber-500/10 dark:bg-amber-500/20 ring-amber-500/20 dark:ring-amber-500/30',
    'text-emerald-500': 'bg-emerald-500/10 dark:bg-emerald-500/20 ring-emerald-500/20 dark:ring-emerald-500/30',
    'text-rose-500': 'bg-rose-500/10 dark:bg-rose-500/20 ring-rose-500/20 dark:ring-rose-500/30',
    'text-orange-500': 'bg-orange-500/10 dark:bg-orange-500/20 ring-orange-500/20 dark:ring-orange-500/30',
    'text-violet-500': 'bg-violet-500/10 dark:bg-violet-500/20 ring-violet-500/20 dark:ring-violet-500/30',
  };
  const bg = bgMap[iconColor] || bgMap['text-primary'];

  return (
    <div className="bg-white dark:bg-card-dark rounded-2xl ring-1 ring-slate-200/60 dark:ring-slate-800/50 overflow-hidden">
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-slate-100 dark:border-slate-800/60">
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center ring-1 shrink-0 ${bg}`}>
          <span className={`material-symbols-outlined text-[15px] ${iconColor}`}>{icon}</span>
        </div>
        <h4 className="text-[13px] font-bold text-slate-900 dark:text-white">{title}</h4>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function TaxCard({ label, color, data }: { label: string; color: string; data: any }) {
  if (!data) return null;
  const colorMap: Record<string, string> = {
    blue: 'from-blue-500/10 to-blue-500/5 ring-blue-500/15 dark:from-blue-500/20 dark:to-blue-500/10 dark:ring-blue-500/25',
    emerald: 'from-emerald-500/10 to-emerald-500/5 ring-emerald-500/15 dark:from-emerald-500/20 dark:to-emerald-500/10 dark:ring-emerald-500/25',
    amber: 'from-amber-500/10 to-amber-500/5 ring-amber-500/15 dark:from-amber-500/20 dark:to-amber-500/10 dark:ring-amber-500/25',
    violet: 'from-violet-500/10 to-violet-500/5 ring-violet-500/15 dark:from-violet-500/20 dark:to-violet-500/10 dark:ring-violet-500/25',
  };
  const textMap: Record<string, string> = {
    blue: 'text-blue-600 dark:text-blue-400',
    emerald: 'text-emerald-600 dark:text-emerald-400',
    amber: 'text-amber-600 dark:text-amber-400',
    violet: 'text-violet-600 dark:text-violet-400',
  };
  const cls = colorMap[color] || colorMap.blue;
  const txtCls = textMap[color] || textMap.blue;

  return (
    <div className={`rounded-xl bg-gradient-to-br ring-1 p-3 ${cls}`}>
      <p className={`text-[10px] font-bold uppercase tracking-wider mb-2 ${txtCls}`}>{label}</p>
      <div className="grid grid-cols-2 gap-2.5">
        <Field label="Origem" value={data.orig} />
        <Field label="CST" value={data.cst} />
        <Field label="Base Cálculo" value={formatMoney(data.baseCalculo)} />
        <Field label="Alíquota" value={data.aliquota ? `${data.aliquota}%` : '-'} />
        <Field label="Valor" value={formatMoney(data.valor)} />
      </div>
    </div>
  );
}

function formatDateBr(dateStr: string) {
  if (!dateStr) return '-';
  try {
    const d = new Date(dateStr);
    return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return dateStr;
  }
}

function formatMoney(val: string) {
  if (!val || val === '') return '-';
  const n = parseFloat(val);
  if (isNaN(n)) return val;
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatCnpjDisplay(cnpj: string) {
  if (!cnpj) return '-';
  const clean = cnpj.replace(/\D/g, '');
  if (clean.length === 14) return clean.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  if (clean.length === 11) return clean.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
  return cnpj;
}

const TABS = [
  { id: 'nfe', label: 'NF-e', icon: 'description' },
  { id: 'emitente', label: 'Emitente', icon: 'storefront' },
  { id: 'destinatario', label: 'Destinatário', icon: 'person' },
  { id: 'produtos', label: 'Produtos', icon: 'inventory_2' },
  { id: 'totais', label: 'Totais', icon: 'calculate' },
  { id: 'transporte', label: 'Transporte', icon: 'local_shipping' },
  { id: 'cobranca', label: 'Cobrança', icon: 'account_balance' },
  { id: 'infAdicionais', label: 'Inf. Adicionais', icon: 'info' },
];

// --- Tab Content Components ---

function TabNfe({ data }: { data: any }) {
  const nfe = data.nfe;
  return (
    <div className="space-y-4">
      <SectionBlock title="Dados da NF-e" icon="receipt_long" iconColor="text-primary">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-x-3 sm:gap-x-6 gap-y-2 sm:gap-y-3">
          <Field label="Modelo" value={nfe.modelo} />
          <Field label="Série" value={nfe.serie} />
          <Field label="Número" value={nfe.numero} />
          <Field label="Data Emissão" value={formatDateBr(nfe.dataEmissao)} />
          <Field label="Data Saída/Entrada" value={formatDateBr(nfe.dataSaidaEntrada)} />
          <Field label="Valor Total" value={formatMoney(nfe.valorTotal)} />
        </div>
      </SectionBlock>

      <SectionBlock title="Emitente" icon="storefront" iconColor="text-orange-500">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-x-3 sm:gap-x-6 gap-y-2 sm:gap-y-3">
          <Field label="CNPJ" value={formatCnpjDisplay(nfe.emitente?.cnpj)} />
          <Field label="Nome/Razão Social" value={nfe.emitente?.razaoSocial} />
          <Field label="Inscrição Estadual" value={nfe.emitente?.ie} />
          <Field label="UF" value={nfe.emitente?.uf} />
        </div>
      </SectionBlock>

      <SectionBlock title="Destinatário" icon="person" iconColor="text-indigo-500">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-x-3 sm:gap-x-6 gap-y-2 sm:gap-y-3">
          <Field label="CNPJ" value={formatCnpjDisplay(nfe.destinatario?.cnpj)} />
          <Field label="Nome/Razão Social" value={nfe.destinatario?.razaoSocial} />
          <Field label="Inscrição Estadual" value={nfe.destinatario?.ie} />
          <Field label="UF" value={nfe.destinatario?.uf} />
        </div>
      </SectionBlock>

      <SectionBlock title="Destino da Operação" icon="swap_horiz" iconColor="text-teal-500">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-x-3 sm:gap-x-6 gap-y-2 sm:gap-y-3">
          <Field label="Destino da Operação" value={nfe.destinoOperacao} />
          <Field label="Consumidor Final" value={nfe.consumidorFinal} />
          <Field label="Presença do Comprador" value={nfe.presencaComprador} />
        </div>
      </SectionBlock>

      <SectionBlock title="Emissão" icon="settings" iconColor="text-amber-500">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-x-3 sm:gap-x-6 gap-y-2 sm:gap-y-3">
          <Field label="Processo" value={nfe.processo} />
          <Field label="Versão do Processo" value={nfe.versaoProcesso} />
          <Field label="Tipo de Emissão" value={nfe.tipoEmissao} />
          <Field label="Finalidade" value={nfe.finalidade} />
        </div>
      </SectionBlock>

      <SectionBlock title="Operação" icon="assignment" iconColor="text-violet-500">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-x-3 sm:gap-x-6 gap-y-2 sm:gap-y-3">
          <Field label="Natureza da Operação" value={nfe.naturezaOperacao} />
          <Field label="Tipo da Operação" value={nfe.tipoOperacao} />
          <Field label="Digest Value da NF-e" value={nfe.digestValue} />
        </div>
      </SectionBlock>
    </div>
  );
}

function TabEmitDest({ data, type }: { data: any; type: 'emitente' | 'destinatario' }) {
  const entity = data[type];
  if (!entity) return (
    <div className="flex flex-col items-center justify-center py-16 gap-2">
      <span className="material-symbols-outlined text-[36px] text-slate-300 dark:text-slate-600">person_off</span>
      <span className="text-[13px] text-slate-400">Dados não disponíveis</span>
    </div>
  );

  const isEmit = type === 'emitente';
  const title = isEmit ? 'Dados do Emitente' : 'Dados do Destinatário';
  const icon = isEmit ? 'storefront' : 'person';
  const iconColor = isEmit ? 'text-orange-500' : 'text-indigo-500';

  const crtMap: Record<string, string> = {
    '1': '1 - Simples Nacional',
    '2': '2 - Simples Nacional - excesso de sublimite de receita bruta',
    '3': '3 - Regime Normal',
  };

  return (
    <SectionBlock title={title} icon={icon} iconColor={iconColor}>
      <div className="space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-3 sm:gap-x-6 gap-y-2 sm:gap-y-3">
          <Field label="Nome / Razão Social" value={entity.razaoSocial} />
          <Field label="Nome Fantasia" value={entity.fantasia} />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-3 sm:gap-x-6 gap-y-2 sm:gap-y-3">
          <Field label="CNPJ" value={formatCnpjDisplay(entity.cnpj)} />
          <Field label="Endereço" value={entity.endereco} />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-3 sm:gap-x-6 gap-y-2 sm:gap-y-3">
          <Field label="Bairro / Distrito" value={entity.bairro} />
          <Field label="CEP" value={entity.cep} />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-3 sm:gap-x-6 gap-y-2 sm:gap-y-3">
          <Field label="Município" value={entity.municipio} />
          <Field label="Telefone" value={entity.telefone} />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-3 sm:gap-x-6 gap-y-2 sm:gap-y-3">
          <Field label="UF" value={entity.uf} />
          <Field label="País" value={entity.pais} />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-3 sm:gap-x-6 gap-y-2 sm:gap-y-3">
          <Field label="Inscrição Estadual" value={entity.ie} />
          <Field label="IE Substituto Tributário" value={entity.ieSt} />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-3 sm:gap-x-6 gap-y-2 sm:gap-y-3">
          <Field label="Inscrição Municipal" value={entity.im} />
          <Field label="Município ICMS" value={entity.municipioIcms} />
        </div>
        {isEmit && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-3 sm:gap-x-6 gap-y-2 sm:gap-y-3">
            <Field label="CNAE Fiscal" value={entity.cnae} />
            <Field label="Regime Tributário" value={crtMap[entity.crt] || entity.crt} />
          </div>
        )}
      </div>
    </SectionBlock>
  );
}

function TabProdutos({ data }: { data: any }) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const produtos = data.produtos || [];

  const toggle = (idx: number) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  if (produtos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-2">
        <span className="material-symbols-outlined text-[36px] text-slate-300 dark:text-slate-600">inventory_2</span>
        <span className="text-[13px] text-slate-400">Nenhum produto encontrado</span>
      </div>
    );
  }

  return (
    <SectionBlock title={`Produtos e Serviços (${produtos.length})`} icon="inventory_2" iconColor="text-emerald-500">
      {/* Mobile Cards */}
      <div className="sm:hidden space-y-1.5">
        {produtos.map((prod: any, idx: number) => (
          <div key={`m-${idx}`} className="rounded-lg ring-1 ring-slate-200/50 dark:ring-slate-800/50">
            <button
              onClick={() => toggle(idx)}
              className={`w-full text-left p-2.5 ${expanded.has(idx) ? 'bg-slate-50 dark:bg-slate-800/40' : ''}`}
            >
              <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 mb-1">{prod.descricao}</p>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-[10px] text-slate-500 dark:text-slate-400">
                  <span>{prod.quantidade} {prod.unidade}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-slate-900 dark:text-white">{formatMoney(prod.valorTotal)}</span>
                  <span className={`material-symbols-outlined text-[14px] text-slate-400 transition-transform ${expanded.has(idx) ? 'rotate-180' : ''}`}>expand_more</span>
                </div>
              </div>
            </button>
            {expanded.has(idx) && (
              <div className="px-2.5 pb-2.5 border-t border-slate-100 dark:border-slate-800/60 pt-2">
                <div className="grid grid-cols-2 gap-2 mb-2">
                  <Field label="Código" value={prod.codigo} />
                  <Field label="NCM" value={prod.ncm} />
                  <Field label="CFOP" value={prod.cfop} />
                  <Field label="Valor Unitário" value={formatMoney(prod.valorUnitario)} />
                </div>
                <div className="grid grid-cols-1 gap-2">
                  <TaxCard label="ICMS" color="blue" data={prod.icms} />
                  <TaxCard label="IPI" color="emerald" data={prod.ipi} />
                  <TaxCard label="PIS" color="amber" data={prod.pis} />
                  <TaxCard label="COFINS" color="violet" data={prod.cofins} />
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Desktop Table */}
      <div className="hidden sm:block overflow-x-auto rounded-xl ring-1 ring-slate-200/50 dark:ring-slate-800/50">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10">
            <tr className="bg-slate-50 dark:bg-slate-900/70 border-b border-slate-200 dark:border-slate-800 text-[10px] uppercase text-slate-400 dark:text-slate-500 font-bold tracking-wider">
              <th className="px-3 py-2.5 w-8"></th>
              <th className="px-3 py-2.5 text-left">Num.</th>
              <th className="px-3 py-2.5 text-left">Descrição</th>
              <th className="px-3 py-2.5 text-right">Qtd.</th>
              <th className="px-3 py-2.5 text-left">Unid.</th>
              <th className="px-3 py-2.5 text-right">Valor (R$)</th>
            </tr>
          </thead>
          <tbody>
            {produtos.map((prod: any, idx: number) => (
              <Fragment key={idx}>
                <tr
                  onClick={() => toggle(idx)}
                  className={`border-b border-slate-100 dark:border-slate-800/60 cursor-pointer transition-colors ${
                    expanded.has(idx) ? 'bg-slate-50 dark:bg-slate-800/40' : 'hover:bg-slate-50/70 dark:hover:bg-slate-800/20'
                  }`}
                >
                  <td className="px-3 py-2.5">
                    <span className={`material-symbols-outlined text-[16px] text-slate-400 transition-transform duration-200 ${expanded.has(idx) ? 'rotate-180' : ''}`}>
                      expand_more
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-xs font-mono text-slate-500 dark:text-slate-400">{prod.num}</td>
                  <td className="px-3 py-2.5 text-xs font-semibold text-slate-800 dark:text-slate-200">{prod.descricao}</td>
                  <td className="px-3 py-2.5 text-right text-xs tabular-nums text-slate-600 dark:text-slate-300">{prod.quantidade}</td>
                  <td className="px-3 py-2.5 text-xs text-slate-500 dark:text-slate-400">{prod.unidade}</td>
                  <td className="px-3 py-2.5 text-right text-xs font-bold tabular-nums text-slate-900 dark:text-white">{formatMoney(prod.valorTotal)}</td>
                </tr>
                {expanded.has(idx) && (
                  <tr>
                    <td colSpan={6} className="bg-slate-50/50 dark:bg-slate-900/30 px-4 py-4">
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-x-3 sm:gap-x-6 gap-y-2 sm:gap-y-3 mb-4">
                        <Field label="Código" value={prod.codigo} />
                        <Field label="NCM" value={prod.ncm} />
                        <Field label="CFOP" value={prod.cfop} />
                        <Field label="EAN" value={prod.ean} />
                        <Field label="CEST" value={prod.cest} />
                        <Field label="Valor Unitário" value={formatMoney(prod.valorUnitario)} />
                        <Field label="Desconto" value={formatMoney(prod.valorDesconto)} />
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <TaxCard label="ICMS" color="blue" data={prod.icms} />
                        <TaxCard label="IPI" color="emerald" data={prod.ipi} />
                        <TaxCard label="PIS" color="amber" data={prod.pis} />
                        <TaxCard label="COFINS" color="violet" data={prod.cofins} />
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </SectionBlock>
  );
}

function TabTotais({ data }: { data: any }) {
  const t = data.totais || {};
  return (
    <SectionBlock title="Totais da NF-e" icon="calculate" iconColor="text-emerald-500">
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-x-3 sm:gap-x-6 gap-y-2 sm:gap-y-3">
        <Field label="Base de Cálculo do ICMS" value={formatMoney(t.baseCalculoIcms)} />
        <Field label="Valor do ICMS" value={formatMoney(t.valorIcms)} />
        <Field label="Valor do ICMS Desonerado" value={formatMoney(t.icmsDesonerado)} />
        <Field label="Valor do FCP" value={formatMoney(t.fcp)} />
        <Field label="Valor Total ICMS FCP" value={formatMoney(t.fcpSt)} />
        <Field label="ICMS Interestadual UF Destino" value={formatMoney(t.icmsInterestadual)} />
        <Field label="ICMS Interestadual UF Rem." value={formatMoney(t.icmsInterestadualRem)} />
        <Field label="Base Cálc. ICMS ST" value={formatMoney(t.baseCalculoIcmsSt)} />
        <Field label="Valor ICMS Substituição" value={formatMoney(t.icmsSubstituicao)} />
        <Field label="FCP retido por ST" value={formatMoney(t.fcpRetidoSt)} />
        <Field label="FCP retido ant. por ST" value={formatMoney(t.fcpRetidoAnteriormenteSt)} />
        <Field label="Total dos Produtos" value={formatMoney(t.valorTotalProdutos)} />
        <Field label="Valor do Frete" value={formatMoney(t.valorFrete)} />
        <Field label="Valor do Seguro" value={formatMoney(t.valorSeguro)} />
        <Field label="Total dos Descontos" value={formatMoney(t.valorDescontos)} />
        <Field label="Valor Total do II" value={formatMoney(t.valorII)} />
        <Field label="Valor Total do IPI" value={formatMoney(t.valorIpi)} />
        <Field label="Valor do IPI Devolvido" value={formatMoney(t.valorIpiDevolvido)} />
        <Field label="Valor do PIS" value={formatMoney(t.valorPis)} />
        <Field label="Valor da COFINS" value={formatMoney(t.valorCofins)} />
        <Field label="Outras Despesas" value={formatMoney(t.outrasDespesas)} />
        <Field label="Valor Total da NFe" value={formatMoney(t.valorTotalNfe)} />
        <Field label="Aprox. Tributos" value={formatMoney(t.valorAproximadoTributos)} />
      </div>
    </SectionBlock>
  );
}

function TabTransporte({ data }: { data: any }) {
  const transp = data.transporte;
  if (!transp) return (
    <div className="flex flex-col items-center justify-center py-16 gap-2">
      <span className="material-symbols-outlined text-[36px] text-slate-300 dark:text-slate-600">local_shipping</span>
      <span className="text-[13px] text-slate-400">Dados de transporte não disponíveis</span>
    </div>
  );

  return (
    <div className="space-y-4">
      <SectionBlock title="Dados do Transporte" icon="local_shipping" iconColor="text-teal-500">
        <Field label="Modalidade do Frete" value={transp.modalidadeFrete} />
      </SectionBlock>

      {transp.transportador?.cnpj && (
        <SectionBlock title="Transportador" icon="badge" iconColor="text-indigo-500">
          <div className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-3 sm:gap-x-6 gap-y-2 sm:gap-y-3">
              <Field label="CNPJ" value={formatCnpjDisplay(transp.transportador.cnpj)} />
              <Field label="Razão Social / Nome" value={transp.transportador.razaoSocial} />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-x-3 sm:gap-x-6 gap-y-2 sm:gap-y-3">
              <Field label="Inscrição Estadual" value={transp.transportador.ie} />
              <Field label="Endereço" value={transp.transportador.endereco} />
              <Field label="Município" value={transp.transportador.municipio} />
              <Field label="UF" value={transp.transportador.uf} />
            </div>
          </div>
        </SectionBlock>
      )}

      {transp.volumes?.length > 0 && (
        <SectionBlock title="Volumes" icon="package_2" iconColor="text-amber-500">
          {transp.volumes.map((vol: any, i: number) => (
            <div key={i} className={`grid grid-cols-2 sm:grid-cols-3 gap-x-3 sm:gap-x-6 gap-y-2 sm:gap-y-3 ${i > 0 ? 'mt-4 pt-4 border-t border-slate-100 dark:border-slate-800/60' : ''}`}>
              <Field label="Quantidade" value={vol.quantidade} />
              <Field label="Espécie" value={vol.especie} />
              <Field label="Marca" value={vol.marca} />
              <Field label="Numeração" value={vol.numeracao} />
              <Field label="Peso Líquido" value={vol.pesoLiquido} />
              <Field label="Peso Bruto" value={vol.pesoBruto} />
            </div>
          ))}
        </SectionBlock>
      )}
    </div>
  );
}

function TabCobranca({ data }: { data: any }) {
  const cobr = data.cobranca || {};

  const hasContent = cobr.formasPagamento?.length || cobr.fatura || cobr.duplicatas?.length;
  if (!hasContent) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-2">
        <span className="material-symbols-outlined text-[36px] text-slate-300 dark:text-slate-600">account_balance</span>
        <span className="text-[13px] text-slate-400">Dados de cobrança não disponíveis</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {cobr.formasPagamento?.length > 0 && (
        <SectionBlock title="Formas de Pagamento" icon="credit_card" iconColor="text-primary">
          {cobr.formasPagamento.map((p: any, i: number) => (
            <div key={i} className={i > 0 ? 'mt-4 pt-4 border-t border-slate-100 dark:border-slate-800/60' : ''}>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-x-3 sm:gap-x-6 gap-y-2 sm:gap-y-3 mb-3">
                <Field label="Forma de Pagamento" value={p.forma} />
                <Field label="Valor" value={formatMoney(p.valor)} />
                <Field label="Tipo Integração" value={p.tipoIntegracao} />
                <Field label="CNPJ Credenciadora" value={p.cnpjCredenciadora} />
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-x-3 sm:gap-x-6 gap-y-2 sm:gap-y-3">
                <Field label="Autorização" value={p.autorizacao} />
                <Field label="Troco" value={formatMoney(p.troco)} />
                <Field label="Bandeira" value={p.bandeira} />
              </div>
            </div>
          ))}
        </SectionBlock>
      )}

      {cobr.fatura && (
        <SectionBlock title="Fatura" icon="receipt" iconColor="text-amber-500">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-x-3 sm:gap-x-6 gap-y-2 sm:gap-y-3">
            <Field label="Número" value={cobr.fatura.numero} />
            <Field label="Valor Original" value={formatMoney(cobr.fatura.valorOriginal)} />
            <Field label="Valor Desconto" value={formatMoney(cobr.fatura.valorDesconto)} />
            <Field label="Valor Líquido" value={formatMoney(cobr.fatura.valorLiquido)} />
          </div>
        </SectionBlock>
      )}

      {cobr.duplicatas?.length > 0 && (
        <SectionBlock title="Duplicatas" icon="payments" iconColor="text-rose-500">
          {/* Mobile Cards */}
          <div className="sm:hidden space-y-1.5">
            {cobr.duplicatas.map((d: any, i: number) => (
              <div key={`m-${i}`} className="flex items-center justify-between rounded-lg ring-1 ring-slate-200/50 dark:ring-slate-800/50 px-2.5 py-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">{d.numero}</span>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400">{d.vencimento}</span>
                </div>
                <span className="text-xs font-bold text-slate-900 dark:text-white">{formatMoney(d.valor)}</span>
              </div>
            ))}
          </div>
          {/* Desktop Table */}
          <div className="hidden sm:block overflow-x-auto rounded-xl ring-1 ring-slate-200/50 dark:ring-slate-800/50">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-900/70 border-b border-slate-200 dark:border-slate-800 text-[10px] uppercase text-slate-400 dark:text-slate-500 font-bold tracking-wider">
                  <th className="px-3 py-2.5 text-left">Número</th>
                  <th className="px-3 py-2.5 text-left">Vencimento</th>
                  <th className="px-3 py-2.5 text-right">Valor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {cobr.duplicatas.map((d: any, i: number) => (
                  <tr key={i} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/20 transition-colors">
                    <td className="px-3 py-2.5 text-xs font-semibold text-slate-800 dark:text-slate-200">{d.numero}</td>
                    <td className="px-3 py-2.5 text-xs text-slate-600 dark:text-slate-300">{d.vencimento}</td>
                    <td className="px-3 py-2.5 text-right text-xs font-bold tabular-nums text-slate-900 dark:text-white">{formatMoney(d.valor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionBlock>
      )}
    </div>
  );
}

function TabInfAdicionais({ data }: { data: any }) {
  const inf = data.infAdicionais || {};
  return (
    <div className="space-y-4">
      <SectionBlock title="Informações Adicionais" icon="info" iconColor="text-violet-500">
        <Field label="Formato de Impressão DANFE" value={inf.formatoImpressao} />
      </SectionBlock>

      {inf.infComplementar && (
        <SectionBlock title="Informações Complementares" icon="article" iconColor="text-indigo-500">
          <div>
            <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">Descrição</p>
            <p className="text-[13px] text-slate-800 dark:text-slate-200 whitespace-pre-wrap leading-relaxed">{inf.infComplementar}</p>
          </div>
        </SectionBlock>
      )}

      {inf.infFisco && (
        <SectionBlock title="Informações do Fisco" icon="gavel" iconColor="text-amber-500">
          <p className="text-[13px] text-slate-800 dark:text-slate-200 whitespace-pre-wrap leading-relaxed">{inf.infFisco}</p>
        </SectionBlock>
      )}
    </div>
  );
}

// --- Main Modal ---

export default function NfeDetailsModal({ isOpen, onClose, invoiceId }: NfeDetailsModalProps) {
  useModalBackButton(isOpen, onClose);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('nfe');
  const tabsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen || !invoiceId) return;
    setLoading(true);
    setError(null);
    setActiveTab('nfe');
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
      case 'nfe': return <TabNfe data={data} />;
      case 'emitente': return <TabEmitDest data={data} type="emitente" />;
      case 'destinatario': return <TabEmitDest data={data} type="destinatario" />;
      case 'produtos': return <TabProdutos data={data} />;
      case 'totais': return <TabTotais data={data} />;
      case 'transporte': return <TabTransporte data={data} />;
      case 'cobranca': return <TabCobranca data={data} />;
      case 'infAdicionais': return <TabInfAdicionais data={data} />;
      default: return null;
    }
  };

  const activeTabData = TABS.find(t => t.id === activeTab);

  return (
    <div className="fixed inset-0 z-50 sm:flex sm:items-center sm:justify-center sm:p-4 sm:bg-black/60 sm:backdrop-blur-sm">
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
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 dark:from-primary/30 dark:to-primary/10 flex items-center justify-center ring-1 ring-primary/20 dark:ring-primary/30 shrink-0 hidden sm:flex">
                <span className="material-symbols-outlined text-[22px] text-primary">description</span>
              </div>
              <div className="min-w-0">
                <h3 className="text-[15px] font-bold text-slate-900 dark:text-white leading-tight">
                  {data ? `NF-e ${data.number}` : 'Detalhes da NF-e'}
                </h3>
                {data?.series && (
                  <span className="text-[11px] text-slate-400 dark:text-slate-500">Série {data.series}</span>
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

          {/* Access Key Bar */}
          {data?.accessKey && (
            <div className="flex items-center gap-2.5 mt-3 px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-700/50">
              <span className="material-symbols-outlined text-[14px] text-slate-400">key</span>
              <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider shrink-0">Chave</span>
              <span className="text-[11px] font-mono text-slate-600 dark:text-slate-300 tracking-wider truncate select-all">
                {data.accessKey.replace(/\D/g, '').replace(/(.{4})/g, '$1 ').trim()}
              </span>
              <button
                onClick={copyAccessKey}
                className="flex-shrink-0 p-1 rounded-lg hover:bg-white dark:hover:bg-slate-700 text-slate-400 hover:text-primary transition-colors"
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
          <div
            ref={tabsRef}
            className="flex-1 flex items-center overflow-x-auto gap-0.5 px-1"
            style={{ scrollbarWidth: 'none' }}
          >
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-2.5 text-[12px] font-bold whitespace-nowrap transition-all border-b-2 -mb-px rounded-t-lg ${
                  activeTab === tab.id
                    ? 'text-primary border-primary bg-primary/5 dark:bg-primary/10'
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
              <div className="w-14 h-14 rounded-2xl bg-primary/10 dark:bg-primary/20 flex items-center justify-center ring-1 ring-primary/20 dark:ring-primary/30">
                <span className="material-symbols-outlined text-[28px] text-primary animate-spin">progress_activity</span>
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
