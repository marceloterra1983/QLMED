'use client';

import { useState, useEffect, useRef } from 'react';
import { toast } from 'sonner';

interface NfeDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoiceId: string | null;
}

interface FieldProps {
  label: string;
  value?: string;
  className?: string;
}

function Field({ label, value, className = '' }: FieldProps) {
  return (
    <div className={className}>
      <p className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">{label}</p>
      <p className="text-sm text-slate-800 dark:text-slate-200 break-words">{value || '-'}</p>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-b border-slate-200 dark:border-slate-700 pb-2 mb-4">
      <h4 className="text-sm font-bold text-slate-900 dark:text-white">{children}</h4>
    </div>
  );
}

function SectionCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-l-2 border-primary/30 bg-slate-50/50 dark:bg-slate-800/30 rounded-r-lg p-5 mb-5">
      {children}
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
  if (clean.length === 14) {
    return clean.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  }
  if (clean.length === 11) {
    return clean.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
  }
  return cnpj;
}

const TABS = [
  { id: 'nfe', label: 'NF-e' },
  { id: 'emitente', label: 'Emitente' },
  { id: 'destinatario', label: 'Destinatário' },
  { id: 'produtos', label: 'Produtos e Serviços' },
  { id: 'totais', label: 'Totais' },
  { id: 'transporte', label: 'Transporte' },
  { id: 'cobranca', label: 'Cobrança' },
  { id: 'infAdicionais', label: 'Inf. Adicionais' },
];

// --- Tab Content Components ---

function TabNfe({ data }: { data: any }) {
  const nfe = data.nfe;
  return (
    <div className="space-y-5">
      <SectionCard>
        <SectionTitle>Dados da NF-e</SectionTitle>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
          <Field label="Modelo" value={nfe.modelo} />
          <Field label="Série" value={nfe.serie} />
          <Field label="Número" value={nfe.numero} />
          <Field label="Data Emissão" value={formatDateBr(nfe.dataEmissao)} />
          <Field label="Data Saída/Entrada" value={formatDateBr(nfe.dataSaidaEntrada)} />
          <Field label="Valor Total" value={formatMoney(nfe.valorTotal)} />
        </div>
      </SectionCard>

      <SectionCard>
        <SectionTitle>Emitente</SectionTitle>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Field label="CNPJ" value={formatCnpjDisplay(nfe.emitente?.cnpj)} />
          <Field label="Nome/Razão Social" value={nfe.emitente?.razaoSocial} />
          <Field label="Inscrição Estadual" value={nfe.emitente?.ie} />
          <Field label="UF" value={nfe.emitente?.uf} />
        </div>
      </SectionCard>

      <SectionCard>
        <SectionTitle>Destinatário</SectionTitle>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Field label="CNPJ" value={formatCnpjDisplay(nfe.destinatario?.cnpj)} />
          <Field label="Nome/Razão Social" value={nfe.destinatario?.razaoSocial} />
          <Field label="Inscrição Estadual" value={nfe.destinatario?.ie} />
          <Field label="UF" value={nfe.destinatario?.uf} />
        </div>
      </SectionCard>

      <SectionCard>
        <SectionTitle>Destino da Operação</SectionTitle>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <Field label="Destino da Operação" value={nfe.destinoOperacao} />
          <Field label="Consumidor Final" value={nfe.consumidorFinal} />
          <Field label="Presença do Comprador" value={nfe.presencaComprador} />
        </div>
      </SectionCard>

      <SectionCard>
        <SectionTitle>Emissão</SectionTitle>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Field label="Processo" value={nfe.processo} />
          <Field label="Versão do Processo" value={nfe.versaoProcesso} />
          <Field label="Tipo de Emissão" value={nfe.tipoEmissao} />
          <Field label="Finalidade" value={nfe.finalidade} />
        </div>
      </SectionCard>

      <SectionCard>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <Field label="Natureza da Operação" value={nfe.naturezaOperacao} />
          <Field label="Tipo da Operação" value={nfe.tipoOperacao} />
          <Field label="Digest Value da NF-e" value={nfe.digestValue} />
        </div>
      </SectionCard>
    </div>
  );
}

function TabEmitDest({ data, type }: { data: any; type: 'emitente' | 'destinatario' }) {
  const entity = data[type];
  if (!entity) return <p className="text-sm text-slate-400 p-4">Dados não disponíveis</p>;
  const title = type === 'emitente' ? 'Dados do Emitente' : 'Dados do Destinatário';

  const crtMap: Record<string, string> = {
    '1': '1 - Simples Nacional',
    '2': '2 - Simples Nacional - excesso de sublimite de receita bruta',
    '3': '3 - Regime Normal',
  };

  return (
    <SectionCard>
      <SectionTitle>{title}</SectionTitle>
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Nome / Razão Social" value={entity.razaoSocial} />
          <Field label="Nome Fantasia" value={entity.fantasia} />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="CNPJ" value={formatCnpjDisplay(entity.cnpj)} />
          <Field label="Endereço" value={entity.endereco} />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Bairro / Distrito" value={entity.bairro} />
          <Field label="CEP" value={entity.cep} />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Município" value={entity.municipio} />
          <Field label="Telefone" value={entity.telefone} />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="UF" value={entity.uf} />
          <Field label="País" value={entity.pais} />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Inscrição Estadual" value={entity.ie} />
          <Field label="Inscrição Estadual do Substituto Tributário" value={entity.ieSt} />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Inscrição Municipal" value={entity.im} />
          <Field label="Município da Ocorrência do Fato Gerador do ICMS" value={entity.municipioIcms} />
        </div>
        {type === 'emitente' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="CNAE Fiscal" value={entity.cnae} />
            <Field label="Código de Regime Tributário" value={crtMap[entity.crt] || entity.crt} />
          </div>
        )}
      </div>
    </SectionCard>
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
    return <p className="text-sm text-slate-400 p-4">Nenhum produto encontrado</p>;
  }

  return (
    <SectionCard>
      <SectionTitle>Dados dos Produtos e Serviços</SectionTitle>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-700 text-xs uppercase text-slate-500 font-bold tracking-wider">
              <th className="px-3 py-3 w-8"></th>
              <th className="px-3 py-3 text-left">Num.</th>
              <th className="px-3 py-3 text-left">Descrição</th>
              <th className="px-3 py-3 text-right">Quantidade</th>
              <th className="px-3 py-3 text-left">Unidade Comercial</th>
              <th className="px-3 py-3 text-right">Valor (R$)</th>
            </tr>
          </thead>
          <tbody>
            {produtos.map((prod: any, idx: number) => (
              <>
                <tr
                  key={`row-${idx}`}
                  onClick={() => toggle(idx)}
                  className={`border-b border-slate-100 dark:border-slate-800 cursor-pointer transition-colors ${
                    expanded.has(idx) ? 'bg-slate-100 dark:bg-slate-800/60' : 'hover:bg-slate-50 dark:hover:bg-slate-800/30'
                  }`}
                >
                  <td className="px-3 py-3">
                    <span className={`material-symbols-outlined text-[18px] text-slate-400 transition-transform ${expanded.has(idx) ? 'rotate-180' : ''}`}>
                      expand_more
                    </span>
                  </td>
                  <td className="px-3 py-3 text-slate-600 dark:text-slate-300">{prod.num}</td>
                  <td className="px-3 py-3 text-slate-800 dark:text-slate-200 font-medium">{prod.descricao}</td>
                  <td className="px-3 py-3 text-right text-slate-600 dark:text-slate-300">{prod.quantidade}</td>
                  <td className="px-3 py-3 text-slate-600 dark:text-slate-300">{prod.unidade}</td>
                  <td className="px-3 py-3 text-right font-bold text-slate-800 dark:text-slate-200">{formatMoney(prod.valorTotal)}</td>
                </tr>
                {expanded.has(idx) && (
                  <tr key={`detail-${idx}`}>
                    <td colSpan={6} className="bg-slate-50 dark:bg-slate-900/40 px-6 py-4">
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 mb-4">
                        <Field label="Código" value={prod.codigo} />
                        <Field label="NCM" value={prod.ncm} />
                        <Field label="CFOP" value={prod.cfop} />
                        <Field label="EAN" value={prod.ean} />
                        <Field label="CEST" value={prod.cest} />
                        <Field label="Valor Unitário" value={formatMoney(prod.valorUnitario)} />
                        <Field label="Desconto" value={formatMoney(prod.valorDesconto)} />
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-3">
                          <p className="text-xs font-bold text-primary mb-2">ICMS</p>
                          <div className="grid grid-cols-2 gap-3">
                            <Field label="Origem" value={prod.icms?.orig} />
                            <Field label="CST" value={prod.icms?.cst} />
                            <Field label="Base Cálculo" value={formatMoney(prod.icms?.baseCalculo)} />
                            <Field label="Alíquota" value={prod.icms?.aliquota ? `${prod.icms.aliquota}%` : '-'} />
                            <Field label="Valor" value={formatMoney(prod.icms?.valor)} />
                          </div>
                        </div>
                        <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-3">
                          <p className="text-xs font-bold text-primary mb-2">IPI</p>
                          <div className="grid grid-cols-2 gap-3">
                            <Field label="CST" value={prod.ipi?.cst} />
                            <Field label="Base Cálculo" value={formatMoney(prod.ipi?.baseCalculo)} />
                            <Field label="Alíquota" value={prod.ipi?.aliquota ? `${prod.ipi.aliquota}%` : '-'} />
                            <Field label="Valor" value={formatMoney(prod.ipi?.valor)} />
                          </div>
                        </div>
                        <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-3">
                          <p className="text-xs font-bold text-primary mb-2">PIS</p>
                          <div className="grid grid-cols-2 gap-3">
                            <Field label="CST" value={prod.pis?.cst} />
                            <Field label="Base Cálculo" value={formatMoney(prod.pis?.baseCalculo)} />
                            <Field label="Alíquota" value={prod.pis?.aliquota ? `${prod.pis.aliquota}%` : '-'} />
                            <Field label="Valor" value={formatMoney(prod.pis?.valor)} />
                          </div>
                        </div>
                        <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-3">
                          <p className="text-xs font-bold text-primary mb-2">COFINS</p>
                          <div className="grid grid-cols-2 gap-3">
                            <Field label="CST" value={prod.cofins?.cst} />
                            <Field label="Base Cálculo" value={formatMoney(prod.cofins?.baseCalculo)} />
                            <Field label="Alíquota" value={prod.cofins?.aliquota ? `${prod.cofins.aliquota}%` : '-'} />
                            <Field label="Valor" value={formatMoney(prod.cofins?.valor)} />
                          </div>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}

function TabTotais({ data }: { data: any }) {
  const t = data.totais || {};
  return (
    <SectionCard>
      <SectionTitle>Totais</SectionTitle>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
        <Field label="Base de Cálculo do ICMS" value={formatMoney(t.baseCalculoIcms)} />
        <Field label="Valor do ICMS" value={formatMoney(t.valorIcms)} />
        <Field label="Valor do ICMS Desonerado" value={formatMoney(t.icmsDesonerado)} />
        <Field label="Valor do FCP" value={formatMoney(t.fcp)} />
        <Field label="Valor Total ICMS FCP" value={formatMoney(t.fcpSt)} />
        <Field label="Valor Total ICMS Interestadual UF Destino" value={formatMoney(t.icmsInterestadual)} />
        <Field label="Valor Total ICMS Interestadual UF Rem." value={formatMoney(t.icmsInterestadualRem)} />
        <Field label="Base de Cálc. ICMS ST" value={formatMoney(t.baseCalculoIcmsSt)} />
        <Field label="Valor ICMS Substituição" value={formatMoney(t.icmsSubstituicao)} />
        <Field label="Valor Total do FCP retido por ST" value={formatMoney(t.fcpRetidoSt)} />
        <Field label="Valor do FCP retido anteriormente por ST" value={formatMoney(t.fcpRetidoAnteriormenteSt)} />
        <Field label="Valor Total dos Produtos" value={formatMoney(t.valorTotalProdutos)} />
        <Field label="Valor do Frete" value={formatMoney(t.valorFrete)} />
        <Field label="Valor do Seguro" value={formatMoney(t.valorSeguro)} />
        <Field label="Valor Total dos Descontos" value={formatMoney(t.valorDescontos)} />
        <Field label="Valor Total do II" value={formatMoney(t.valorII)} />
        <Field label="Valor Total do IPI" value={formatMoney(t.valorIpi)} />
        <Field label="Valor do IPI Devolvido" value={formatMoney(t.valorIpiDevolvido)} />
        <Field label="Valor do PIS" value={formatMoney(t.valorPis)} />
        <Field label="Valor da COFINS" value={formatMoney(t.valorCofins)} />
        <Field label="Outras Despesas Acessórias" value={formatMoney(t.outrasDespesas)} />
        <Field label="Valor Total da NFe" value={formatMoney(t.valorTotalNfe)} />
        <Field label="Valor Aproximado dos Tributos" value={formatMoney(t.valorAproximadoTributos)} />
      </div>
    </SectionCard>
  );
}

function TabTransporte({ data }: { data: any }) {
  const transp = data.transporte;
  if (!transp) return <p className="text-sm text-slate-400 p-4">Dados de transporte não disponíveis</p>;

  return (
    <div className="space-y-5">
      <SectionCard>
        <SectionTitle>Dados do Transporte</SectionTitle>
        <Field label="Modalidade do Frete" value={transp.modalidadeFrete} />
      </SectionCard>

      {transp.transportador?.cnpj && (
        <SectionCard>
          <SectionTitle>Transportador</SectionTitle>
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="CNPJ" value={formatCnpjDisplay(transp.transportador.cnpj)} />
              <Field label="Razão Social / Nome" value={transp.transportador.razaoSocial} />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Field label="Inscrição Estadual" value={transp.transportador.ie} />
              <Field label="Endereço Completo" value={transp.transportador.endereco} />
              <Field label="Município" value={transp.transportador.municipio} />
              <Field label="UF" value={transp.transportador.uf} />
            </div>
          </div>
        </SectionCard>
      )}

      {transp.volumes?.length > 0 && (
        <SectionCard>
          <SectionTitle>Volumes</SectionTitle>
          {transp.volumes.map((vol: any, i: number) => (
            <div key={i} className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-3">
              <Field label="Quantidade" value={vol.quantidade} />
              <Field label="Espécie" value={vol.especie} />
              <Field label="Marca dos Volumes" value={vol.marca} />
              <Field label="Numeração" value={vol.numeracao} />
              <Field label="Peso Líquido" value={vol.pesoLiquido} />
              <Field label="Peso Bruto" value={vol.pesoBruto} />
            </div>
          ))}
        </SectionCard>
      )}
    </div>
  );
}

function TabCobranca({ data }: { data: any }) {
  const cobr = data.cobranca || {};

  return (
    <div className="space-y-5">
      {cobr.formasPagamento?.length > 0 && (
        <SectionCard>
          <SectionTitle>Formas de Pagamento</SectionTitle>
          {cobr.formasPagamento.map((p: any, i: number) => (
            <div key={i} className="mb-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-2">
                <Field label="Forma de Pagamento" value={p.forma} />
                <Field label="Valor do Pagamento" value={formatMoney(p.valor)} />
                <Field label="Tipo de Integração Pagamento" value={p.tipoIntegracao} />
                <Field label="CNPJ da Credenciadora" value={p.cnpjCredenciadora} />
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <Field label="Número de autorização" value={p.autorizacao} />
                <Field label="Troco" value={formatMoney(p.troco)} />
                <Field label="Bandeira da operadora" value={p.bandeira} />
              </div>
            </div>
          ))}
        </SectionCard>
      )}

      {cobr.fatura && (
        <SectionCard>
          <SectionTitle>Fatura</SectionTitle>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Field label="Número" value={cobr.fatura.numero} />
            <Field label="Valor Original" value={formatMoney(cobr.fatura.valorOriginal)} />
            <Field label="Valor Desconto" value={formatMoney(cobr.fatura.valorDesconto)} />
            <Field label="Valor Líquido" value={formatMoney(cobr.fatura.valorLiquido)} />
          </div>
        </SectionCard>
      )}

      {cobr.duplicatas?.length > 0 && (
        <SectionCard>
          <SectionTitle>Duplicatas</SectionTitle>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700 text-xs uppercase text-slate-500 font-bold">
                  <th className="px-3 py-2 text-left">Número</th>
                  <th className="px-3 py-2 text-left">Vencimento</th>
                  <th className="px-3 py-2 text-right">Valor</th>
                </tr>
              </thead>
              <tbody>
                {cobr.duplicatas.map((d: any, i: number) => (
                  <tr key={i} className={`border-b border-slate-100 dark:border-slate-800 ${i % 2 === 0 ? 'bg-slate-50/50 dark:bg-slate-800/20' : ''}`}>
                    <td className="px-3 py-2.5 text-slate-700 dark:text-slate-300">{d.numero}</td>
                    <td className="px-3 py-2.5 text-slate-700 dark:text-slate-300">{d.vencimento}</td>
                    <td className="px-3 py-2.5 text-right font-bold text-slate-800 dark:text-slate-200">{formatMoney(d.valor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}

      {!cobr.formasPagamento?.length && !cobr.fatura && !cobr.duplicatas?.length && (
        <p className="text-sm text-slate-400 p-4">Dados de cobrança não disponíveis</p>
      )}
    </div>
  );
}

function TabInfAdicionais({ data }: { data: any }) {
  const inf = data.infAdicionais || {};
  return (
    <div className="space-y-5">
      <SectionCard>
        <SectionTitle>Informações Adicionais</SectionTitle>
        <Field label="Formato de Impressão DANFE" value={inf.formatoImpressao} />
      </SectionCard>

      {inf.infComplementar && (
        <SectionCard>
          <SectionTitle>Informações Complementares de Interesse do Contribuinte</SectionTitle>
          <div>
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">Descrição</p>
            <p className="text-sm text-slate-800 dark:text-slate-200 whitespace-pre-wrap leading-relaxed">{inf.infComplementar}</p>
          </div>
        </SectionCard>
      )}

      {inf.infFisco && (
        <SectionCard>
          <SectionTitle>Informações de Interesse do Fisco</SectionTitle>
          <p className="text-sm text-slate-800 dark:text-slate-200 whitespace-pre-wrap leading-relaxed">{inf.infFisco}</p>
        </SectionCard>
      )}
    </div>
  );
}

// --- Main Modal ---

export default function NfeDetailsModal({ isOpen, onClose, invoiceId }: NfeDetailsModalProps) {
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
    navigator.clipboard.writeText(data.accessKey).then(() => toast.success('Chave copiada!'));
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

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-slate-900/50 backdrop-blur-sm">
      <div className="absolute inset-0" onClick={onClose} aria-hidden="true" />
      <div
        className="relative bg-white dark:bg-card-dark rounded-t-xl sm:rounded-xl shadow-2xl w-full max-w-5xl h-full sm:h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
          <h3 className="text-xl font-bold text-slate-900 dark:text-white">Detalhes da NF-e</h3>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            aria-label="Fechar"
          >
            <span className="material-symbols-outlined text-[22px]">close</span>
          </button>
        </div>

        {/* Key Info Bar */}
        {data && (
          <div className="flex items-center justify-between px-6 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30">
            <div className="flex items-center gap-8">
              <div>
                <p className="text-xs text-slate-400 font-medium">Número</p>
                <p className="text-base font-bold text-primary">{data.number}</p>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-slate-400 font-medium">Chave de Acesso</p>
                <div className="flex items-center gap-2">
                  <p
                    className="text-sm font-mono bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded text-slate-700 dark:text-slate-300 truncate cursor-pointer select-all"
                    onClick={copyAccessKey}
                    title="Clique para copiar"
                  >
                    {data.accessKey}
                  </p>
                  <button onClick={copyAccessKey} className="flex-shrink-0 p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 hover:text-primary transition-colors" title="Copiar">
                    <span className="material-symbols-outlined text-[16px]">content_copy</span>
                  </button>
                </div>
              </div>
            </div>
            <div className="text-right flex-shrink-0">
              <p className="text-xs text-slate-400 font-medium">Série</p>
              <p className="text-base font-bold text-primary">{data.series || '-'}</p>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex items-center border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-card-dark">
          <button
            onClick={() => scrollTabs('left')}
            className="flex-shrink-0 p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
            aria-label="Scroll esquerda"
          >
            <span className="material-symbols-outlined text-[20px]">chevron_left</span>
          </button>
          <div
            ref={tabsRef}
            className="flex-1 flex items-center overflow-x-auto scrollbar-none gap-1"
            style={{ scrollbarWidth: 'none' }}
          >
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-px ${
                  activeTab === tab.id
                    ? 'text-primary border-primary font-bold'
                    : 'text-slate-500 dark:text-slate-400 border-transparent hover:text-slate-700 dark:hover:text-slate-200 hover:border-slate-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <button
            onClick={() => scrollTabs('right')}
            className="flex-shrink-0 p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
            aria-label="Scroll direita"
          >
            <span className="material-symbols-outlined text-[20px]">chevron_right</span>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading && (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-400">
              <span className="material-symbols-outlined text-[40px] animate-spin">progress_activity</span>
              <p className="text-sm font-medium">Carregando detalhes...</p>
            </div>
          )}
          {error && (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-red-400">
              <span className="material-symbols-outlined text-[40px]">error</span>
              <p className="text-sm font-medium">{error}</p>
            </div>
          )}
          {data && !loading && renderTabContent()}
        </div>
      </div>
    </div>
  );
}
