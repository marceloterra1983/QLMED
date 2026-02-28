'use client';

import { useState, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { useModalBackButton } from '@/hooks/useModalBackButton';

interface CteDetailsModalProps {
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

function SectionBlock({ title, icon, iconColor = 'text-teal-500', children }: { title: string; icon: string; iconColor?: string; children: React.ReactNode }) {
  const bgMap: Record<string, string> = {
    'text-primary': 'bg-primary/10 dark:bg-primary/20 ring-primary/20 dark:ring-primary/30',
    'text-indigo-500': 'bg-indigo-500/10 dark:bg-indigo-500/20 ring-indigo-500/20 dark:ring-indigo-500/30',
    'text-teal-500': 'bg-teal-500/10 dark:bg-teal-500/20 ring-teal-500/20 dark:ring-teal-500/30',
    'text-amber-500': 'bg-amber-500/10 dark:bg-amber-500/20 ring-amber-500/20 dark:ring-amber-500/30',
    'text-emerald-500': 'bg-emerald-500/10 dark:bg-emerald-500/20 ring-emerald-500/20 dark:ring-emerald-500/30',
    'text-rose-500': 'bg-rose-500/10 dark:bg-rose-500/20 ring-rose-500/20 dark:ring-rose-500/30',
    'text-orange-500': 'bg-orange-500/10 dark:bg-orange-500/20 ring-orange-500/20 dark:ring-orange-500/30',
    'text-violet-500': 'bg-violet-500/10 dark:bg-violet-500/20 ring-violet-500/20 dark:ring-violet-500/30',
    'text-blue-500': 'bg-blue-500/10 dark:bg-blue-500/20 ring-blue-500/20 dark:ring-blue-500/30',
  };
  const bg = bgMap[iconColor] || bgMap['text-teal-500'];

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
  { id: 'cte', label: 'CT-e', icon: 'local_shipping' },
  { id: 'emitente', label: 'Emitente', icon: 'storefront' },
  { id: 'remetente', label: 'Remetente', icon: 'warehouse' },
  { id: 'destinatario', label: 'Destinatário', icon: 'person' },
  { id: 'carga', label: 'Carga', icon: 'package_2' },
  { id: 'documentos', label: 'Documentos', icon: 'description' },
  { id: 'impostos', label: 'Impostos', icon: 'calculate' },
  { id: 'infAdicionais', label: 'Inf. Adicionais', icon: 'info' },
];

// --- Tab Content Components ---

function TabCte({ data }: { data: any }) {
  const cte = data.cte;
  return (
    <div className="space-y-4">
      <SectionBlock title="Dados do CT-e" icon="receipt_long" iconColor="text-teal-500">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-x-6 gap-y-3">
          <Field label="Modelo" value={cte.modelo} />
          <Field label="Série" value={cte.serie} />
          <Field label="Número" value={cte.numero} />
          <Field label="Data Emissão" value={formatDateBr(cte.dataEmissao)} />
          <Field label="CFOP" value={cte.cfop} />
          <Field label="Natureza da Operação" value={cte.natOp} />
          <Field label="Tipo CT-e" value={cte.tipoCte} />
          <Field label="Tipo de Serviço" value={cte.tipoServico} />
        </div>
      </SectionBlock>

      <SectionBlock title="Transporte" icon="route" iconColor="text-primary">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-x-6 gap-y-3">
          <Field label="Modal" value={cte.modal} />
          <Field label="Tomador do Serviço" value={cte.tomador} />
          <Field label="Município Origem" value={cte.municipioOrigem} />
          <Field label="UF Origem" value={cte.ufOrigem} />
          <Field label="Município Destino" value={cte.municipioDestino} />
          <Field label="UF Destino" value={cte.ufDestino} />
        </div>
      </SectionBlock>

      <SectionBlock title="Valores da Prestação" icon="payments" iconColor="text-emerald-500">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3 mb-4">
          <Field label="Valor Total da Prestação" value={formatMoney(cte.valorPrestacao)} />
          <Field label="Valor a Receber" value={formatMoney(cte.valorReceber)} />
        </div>
        {data.componentes?.length > 0 && (
          <>
            {/* Mobile */}
            <div className="sm:hidden space-y-1">
              {data.componentes.map((c: any, i: number) => (
                <div key={`m-${i}`} className="flex items-center justify-between rounded-lg ring-1 ring-slate-200/50 dark:ring-slate-800/50 px-2.5 py-2">
                  <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">{c.nome}</span>
                  <span className="text-xs font-bold text-slate-900 dark:text-white">{formatMoney(c.valor)}</span>
                </div>
              ))}
            </div>
            {/* Desktop */}
            <div className="hidden sm:block overflow-x-auto rounded-xl ring-1 ring-slate-200/50 dark:ring-slate-800/50">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-900/70 border-b border-slate-200 dark:border-slate-800 text-[10px] uppercase text-slate-400 dark:text-slate-500 font-bold tracking-wider">
                    <th className="px-3 py-2.5 text-left">Componente</th>
                    <th className="px-3 py-2.5 text-right">Valor (R$)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                  {data.componentes.map((c: any, i: number) => (
                    <tr key={i} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/20 transition-colors">
                      <td className="px-3 py-2.5 text-xs font-semibold text-slate-800 dark:text-slate-200">{c.nome}</td>
                      <td className="px-3 py-2.5 text-right text-xs font-bold tabular-nums text-slate-900 dark:text-white">{formatMoney(c.valor)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </SectionBlock>

      <SectionBlock title="Protocolo de Autorização" icon="verified" iconColor="text-amber-500">
        <div className="grid grid-cols-2 gap-x-6 gap-y-3">
          <Field label="Nº Protocolo" value={cte.protocolo} />
          <Field label="Data Autorização" value={formatDateBr(cte.dataAutorizacao)} />
        </div>
      </SectionBlock>
    </div>
  );
}

function TabParty({ data, partyKey, title, icon, iconColor }: { data: any; partyKey: string; title: string; icon: string; iconColor: string }) {
  const entity = data[partyKey];
  if (!entity || !entity.cnpj) return (
    <div className="flex flex-col items-center justify-center py-16 gap-2">
      <span className="material-symbols-outlined text-[36px] text-slate-300 dark:text-slate-600">person_off</span>
      <span className="text-[13px] text-slate-400">Dados não disponíveis</span>
    </div>
  );

  return (
    <SectionBlock title={title} icon={icon} iconColor={iconColor}>
      <div className="space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
          <Field label="Nome / Razão Social" value={entity.razaoSocial} />
          <Field label="Nome Fantasia" value={entity.fantasia} />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
          <Field label="CNPJ/CPF" value={formatCnpjDisplay(entity.cnpj)} />
          <Field label="Inscrição Estadual" value={entity.ie} />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
          <Field label="Endereço" value={entity.endereco} />
          <Field label="Bairro / Distrito" value={entity.bairro} />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
          <Field label="CEP" value={entity.cep} />
          <Field label="Município" value={entity.municipio} />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
          <Field label="UF" value={entity.uf} />
          <Field label="País" value={entity.pais} />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
          <Field label="Telefone" value={entity.telefone} />
          <Field label="Email" value={entity.email} />
        </div>
      </div>
    </SectionBlock>
  );
}

function TabCarga({ data }: { data: any }) {
  const carga = data.carga;
  if (!carga) return (
    <div className="flex flex-col items-center justify-center py-16 gap-2">
      <span className="material-symbols-outlined text-[36px] text-slate-300 dark:text-slate-600">package_2</span>
      <span className="text-[13px] text-slate-400">Dados de carga não disponíveis</span>
    </div>
  );

  return (
    <div className="space-y-4">
      <SectionBlock title="Informações da Carga" icon="package_2" iconColor="text-amber-500">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3">
          <Field label="Valor Total da Carga" value={formatMoney(carga.valorCarga)} />
          <Field label="Produto Predominante" value={carga.produtoPredominante} />
          <Field label="Outras Características" value={carga.outrCaract} />
        </div>
      </SectionBlock>

      {carga.medidas?.length > 0 && (
        <SectionBlock title="Medidas" icon="straighten" iconColor="text-indigo-500">
          {/* Mobile */}
          <div className="sm:hidden space-y-1">
            {carga.medidas.map((m: any, i: number) => (
              <div key={`m-${i}`} className="flex items-center justify-between rounded-lg ring-1 ring-slate-200/50 dark:ring-slate-800/50 px-2.5 py-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">{m.tipoMedida || '-'}</span>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400">{m.unidade}</span>
                </div>
                <span className="text-xs font-bold text-slate-900 dark:text-white">{m.quantidade}</span>
              </div>
            ))}
          </div>
          {/* Desktop */}
          <div className="hidden sm:block overflow-x-auto rounded-xl ring-1 ring-slate-200/50 dark:ring-slate-800/50">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-900/70 border-b border-slate-200 dark:border-slate-800 text-[10px] uppercase text-slate-400 dark:text-slate-500 font-bold tracking-wider">
                  <th className="px-3 py-2.5 text-left">Tipo Medida</th>
                  <th className="px-3 py-2.5 text-left">Unidade</th>
                  <th className="px-3 py-2.5 text-right">Quantidade</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {carga.medidas.map((m: any, i: number) => (
                  <tr key={i} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/20 transition-colors">
                    <td className="px-3 py-2.5 text-xs font-semibold text-slate-800 dark:text-slate-200">{m.tipoMedida || '-'}</td>
                    <td className="px-3 py-2.5 text-xs text-slate-600 dark:text-slate-300">{m.unidade}</td>
                    <td className="px-3 py-2.5 text-right text-xs font-bold tabular-nums text-slate-900 dark:text-white">{m.quantidade}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionBlock>
      )}

      {data.seguro && (data.seguro.nomeSeguradora || data.seguro.apolice) && (
        <SectionBlock title="Seguro" icon="shield" iconColor="text-rose-500">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3">
            <Field label="Responsável" value={data.seguro.responsavel} />
            <Field label="Seguradora" value={data.seguro.nomeSeguradora} />
            <Field label="Nº Apólice" value={data.seguro.apolice} />
          </div>
        </SectionBlock>
      )}
    </div>
  );
}

function TabDocumentos({ data }: { data: any }) {
  const docs = data.documentos;
  const hasContent = docs?.nfeRefs?.length || docs?.nfRefs?.length || docs?.outrosRefs?.length;

  if (!hasContent) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-2">
        <span className="material-symbols-outlined text-[36px] text-slate-300 dark:text-slate-600">description</span>
        <span className="text-[13px] text-slate-400">Nenhum documento referenciado</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {docs.nfeRefs?.length > 0 && (
        <SectionBlock title={`NF-e Referenciadas (${docs.nfeRefs.length})`} icon="receipt_long" iconColor="text-primary">
          {/* Mobile */}
          <div className="sm:hidden space-y-1">
            {docs.nfeRefs.map((n: any, i: number) => (
              <div key={`m-${i}`} className="rounded-lg ring-1 ring-slate-200/50 dark:ring-slate-800/50 px-2.5 py-2">
                <span className="text-[10px] text-slate-400">#{i + 1}</span>
                <p className="text-[10px] font-mono text-slate-800 dark:text-slate-200 break-all">{n.chave || '-'}</p>
              </div>
            ))}
          </div>
          {/* Desktop */}
          <div className="hidden sm:block overflow-x-auto rounded-xl ring-1 ring-slate-200/50 dark:ring-slate-800/50">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-900/70 border-b border-slate-200 dark:border-slate-800 text-[10px] uppercase text-slate-400 dark:text-slate-500 font-bold tracking-wider">
                  <th className="px-3 py-2.5 text-left">#</th>
                  <th className="px-3 py-2.5 text-left">Chave de Acesso</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {docs.nfeRefs.map((n: any, i: number) => (
                  <tr key={i} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/20 transition-colors">
                    <td className="px-3 py-2.5 text-xs font-mono text-slate-500">{i + 1}</td>
                    <td className="px-3 py-2.5 text-xs font-mono text-slate-800 dark:text-slate-200 tracking-wider">
                      {n.chave?.replace(/(.{4})/g, '$1 ').trim() || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionBlock>
      )}

      {docs.nfRefs?.length > 0 && (
        <SectionBlock title={`NF Referenciadas (${docs.nfRefs.length})`} icon="article" iconColor="text-indigo-500">
          {/* Mobile */}
          <div className="sm:hidden space-y-1">
            {docs.nfRefs.map((n: any, i: number) => (
              <div key={`m-${i}`} className="rounded-lg ring-1 ring-slate-200/50 dark:ring-slate-800/50 px-2.5 py-2">
                <div className="flex items-center justify-between mb-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">Nº {n.numero || '-'}</span>
                    <span className="text-[10px] text-slate-400">Série {n.serie || '-'}</span>
                  </div>
                  <span className="text-xs font-bold text-slate-900 dark:text-white">{formatMoney(n.valorTotal)}</span>
                </div>
                <span className="text-[10px] text-slate-500 dark:text-slate-400">{n.dataEmissao || '-'}</span>
              </div>
            ))}
          </div>
          {/* Desktop */}
          <div className="hidden sm:block overflow-x-auto rounded-xl ring-1 ring-slate-200/50 dark:ring-slate-800/50">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-900/70 border-b border-slate-200 dark:border-slate-800 text-[10px] uppercase text-slate-400 dark:text-slate-500 font-bold tracking-wider">
                  <th className="px-3 py-2.5 text-left">Série</th>
                  <th className="px-3 py-2.5 text-left">Número</th>
                  <th className="px-3 py-2.5 text-left">Data Emissão</th>
                  <th className="px-3 py-2.5 text-right">Valor (R$)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {docs.nfRefs.map((n: any, i: number) => (
                  <tr key={i} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/20 transition-colors">
                    <td className="px-3 py-2.5 text-xs text-slate-600 dark:text-slate-300">{n.serie || '-'}</td>
                    <td className="px-3 py-2.5 text-xs font-semibold text-slate-800 dark:text-slate-200">{n.numero || '-'}</td>
                    <td className="px-3 py-2.5 text-xs text-slate-600 dark:text-slate-300">{n.dataEmissao || '-'}</td>
                    <td className="px-3 py-2.5 text-right text-xs font-bold tabular-nums text-slate-900 dark:text-white">{formatMoney(n.valorTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionBlock>
      )}

      {docs.outrosRefs?.length > 0 && (
        <SectionBlock title={`Outros Documentos (${docs.outrosRefs.length})`} icon="folder_open" iconColor="text-amber-500">
          {/* Mobile */}
          <div className="sm:hidden space-y-1">
            {docs.outrosRefs.map((o: any, i: number) => (
              <div key={`m-${i}`} className="rounded-lg ring-1 ring-slate-200/50 dark:ring-slate-800/50 px-2.5 py-2">
                <div className="flex items-center justify-between mb-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">{o.descricao || '-'}</span>
                    <span className="text-[10px] text-slate-400">{o.tipo || '-'}</span>
                  </div>
                  <span className="text-xs font-bold text-slate-900 dark:text-white">{formatMoney(o.valor)}</span>
                </div>
                <span className="text-[10px] text-slate-500 dark:text-slate-400">Nº {o.numero || '-'}</span>
              </div>
            ))}
          </div>
          {/* Desktop */}
          <div className="hidden sm:block overflow-x-auto rounded-xl ring-1 ring-slate-200/50 dark:ring-slate-800/50">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-900/70 border-b border-slate-200 dark:border-slate-800 text-[10px] uppercase text-slate-400 dark:text-slate-500 font-bold tracking-wider">
                  <th className="px-3 py-2.5 text-left">Tipo</th>
                  <th className="px-3 py-2.5 text-left">Descrição</th>
                  <th className="px-3 py-2.5 text-left">Número</th>
                  <th className="px-3 py-2.5 text-right">Valor (R$)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {docs.outrosRefs.map((o: any, i: number) => (
                  <tr key={i} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/20 transition-colors">
                    <td className="px-3 py-2.5 text-xs text-slate-600 dark:text-slate-300">{o.tipo || '-'}</td>
                    <td className="px-3 py-2.5 text-xs font-semibold text-slate-800 dark:text-slate-200">{o.descricao || '-'}</td>
                    <td className="px-3 py-2.5 text-xs text-slate-600 dark:text-slate-300">{o.numero || '-'}</td>
                    <td className="px-3 py-2.5 text-right text-xs font-bold tabular-nums text-slate-900 dark:text-white">{formatMoney(o.valor)}</td>
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

function TabImpostos({ data }: { data: any }) {
  const imp = data.impostos;
  if (!imp) return (
    <div className="flex flex-col items-center justify-center py-16 gap-2">
      <span className="material-symbols-outlined text-[36px] text-slate-300 dark:text-slate-600">calculate</span>
      <span className="text-[13px] text-slate-400">Dados de impostos não disponíveis</span>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-gradient-to-br from-blue-500/10 to-blue-500/5 ring-1 ring-blue-500/15 dark:from-blue-500/20 dark:to-blue-500/10 dark:ring-blue-500/25 p-4">
        <p className="text-[10px] font-bold uppercase tracking-wider mb-3 text-blue-600 dark:text-blue-400">ICMS</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3">
          <Field label="CST" value={imp.icms?.cst} />
          <Field label="Base de Cálculo" value={formatMoney(imp.icms?.baseCalculo)} />
          <Field label="Alíquota" value={imp.icms?.aliquota ? `${imp.icms.aliquota}%` : '-'} />
          <Field label="Valor ICMS" value={formatMoney(imp.icms?.valor)} />
          <Field label="Redução BC" value={imp.icms?.reducaoBC ? `${imp.icms.reducaoBC}%` : '-'} />
          <Field label="ICMS Outra UF" value={formatMoney(imp.icms?.icmsOutraUF)} />
        </div>
      </div>

      {imp.valorTotalTributos && (
        <SectionBlock title="Total de Tributos" icon="account_balance" iconColor="text-violet-500">
          <Field label="Valor Total dos Tributos" value={formatMoney(imp.valorTotalTributos)} />
        </SectionBlock>
      )}
    </div>
  );
}

function TabInfAdicionais({ data }: { data: any }) {
  const inf = data.infAdicionais || {};
  const hasContent = inf.infAdFisco || inf.infCpl;

  if (!hasContent) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-2">
        <span className="material-symbols-outlined text-[36px] text-slate-300 dark:text-slate-600">info</span>
        <span className="text-[13px] text-slate-400">Sem informações adicionais</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {inf.infCpl && (
        <SectionBlock title="Informações Complementares" icon="article" iconColor="text-indigo-500">
          <p className="text-[13px] text-slate-800 dark:text-slate-200 whitespace-pre-wrap leading-relaxed">{inf.infCpl}</p>
        </SectionBlock>
      )}

      {inf.infAdFisco && (
        <SectionBlock title="Informações do Fisco" icon="gavel" iconColor="text-amber-500">
          <p className="text-[13px] text-slate-800 dark:text-slate-200 whitespace-pre-wrap leading-relaxed">{inf.infAdFisco}</p>
        </SectionBlock>
      )}
    </div>
  );
}

// --- Main Modal ---

export default function CteDetailsModal({ isOpen, onClose, invoiceId }: CteDetailsModalProps) {
  useModalBackButton(isOpen, onClose);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('cte');
  const tabsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen || !invoiceId) return;
    setLoading(true);
    setError(null);
    setActiveTab('cte');
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
      case 'cte': return <TabCte data={data} />;
      case 'emitente': return <TabParty data={data} partyKey="emitente" title="Dados do Emitente" icon="storefront" iconColor="text-orange-500" />;
      case 'remetente': return <TabParty data={data} partyKey="remetente" title="Dados do Remetente" icon="warehouse" iconColor="text-teal-500" />;
      case 'destinatario': return <TabParty data={data} partyKey="destinatario" title="Dados do Destinatário" icon="person" iconColor="text-indigo-500" />;
      case 'carga': return <TabCarga data={data} />;
      case 'documentos': return <TabDocumentos data={data} />;
      case 'impostos': return <TabImpostos data={data} />;
      case 'infAdicionais': return <TabInfAdicionais data={data} />;
      default: return null;
    }
  };

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
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-teal-500/20 to-teal-500/5 dark:from-teal-500/30 dark:to-teal-500/10 flex items-center justify-center ring-1 ring-teal-500/20 dark:ring-teal-500/30 shrink-0 hidden sm:flex">
                <span className="material-symbols-outlined text-[22px] text-teal-500">local_shipping</span>
              </div>
              <div className="min-w-0">
                <h3 className="text-[15px] font-bold text-slate-900 dark:text-white leading-tight">
                  {data ? `CT-e ${data.number}` : 'Detalhes do CT-e'}
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
                className="flex-shrink-0 p-1 rounded-lg hover:bg-white dark:hover:bg-slate-700 text-slate-400 hover:text-teal-500 transition-colors"
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
                    ? 'text-teal-600 dark:text-teal-400 border-teal-500 bg-teal-500/5 dark:bg-teal-500/10'
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
              <div className="w-14 h-14 rounded-2xl bg-teal-500/10 dark:bg-teal-500/20 flex items-center justify-center ring-1 ring-teal-500/20 dark:ring-teal-500/30">
                <span className="material-symbols-outlined text-[28px] text-teal-500 animate-spin">progress_activity</span>
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
