'use client';

import type { CnpjResult } from '@/lib/cnpj-result';
import Badge from '@/components/ui/Badge';
import Spinner from '@/components/ui/Spinner';
import { formatCurrency } from '@/lib/utils';

interface FiscalSectionProps {
  cnpjData: CnpjResult;
  cnpjLoading: boolean;
  onSync: () => void;
  /** Optional CNAE mismatch warning (supplier-only) */
  cnaeMismatchWarning?: string | null;
}

export default function FiscalSection({ cnpjData, cnpjLoading, onSync, cnaeMismatchWarning }: FiscalSectionProps) {
  return (
    <div className="mt-3 rounded-lg ring-1 ring-blue-200/60 dark:ring-blue-800/40 p-2.5 bg-blue-50/30 dark:bg-blue-900/10">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <span className="material-symbols-outlined text-[13px] text-blue-500">account_balance</span>
          <p className="text-xs font-bold text-blue-500 dark:text-blue-400 uppercase tracking-wider">Receita Federal</p>
          {cnpjData.situacaoCadastral && (
            <Badge tone={
              cnpjData.situacaoCadastral.toUpperCase().includes('ATIVA')
                ? 'success'
                : cnpjData.situacaoCadastral.toUpperCase().includes('SUSPENS')
                  ? 'warning'
                  : 'danger'
            }>
              {cnpjData.situacaoCadastral}
            </Badge>
          )}
        </div>
        <button
          onClick={onSync}
          disabled={cnpjLoading}
          className="flex items-center gap-1 text-xs font-medium text-blue-500 hover:text-blue-600 transition-colors disabled:opacity-40"
          title="Atualizar dados da Receita Federal"
        >
          {cnpjLoading ? <Spinner size="sm" label="Sincronizando" /> : <span className="material-symbols-outlined text-[13px]">sync</span>}
          Sincronizar
        </button>
      </div>
      <div className="space-y-1.5 text-xs">
        {cnpjData.razaoSocial && (
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="font-bold text-slate-700 dark:text-slate-300">{cnpjData.razaoSocial}</span>
            {cnpjData.nomeFantasia && <span className="text-slate-500 dark:text-slate-400 text-xs">({cnpjData.nomeFantasia})</span>}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-slate-500 dark:text-slate-400">
          {cnpjData.cnaePrincipal && (
            <span title={cnpjData.cnaePrincipal.descricao}>
              CNAE <span className="font-mono text-blue-600 dark:text-blue-400">{cnpjData.cnaePrincipal.codigo}</span>
              <span className="text-xs ml-0.5">{cnpjData.cnaePrincipal.descricao.length > 40 ? cnpjData.cnaePrincipal.descricao.slice(0, 40) + '...' : cnpjData.cnaePrincipal.descricao}</span>
            </span>
          )}
          {cnpjData.naturezaJuridica && <span>{cnpjData.naturezaJuridica}</span>}
        </div>
        {cnaeMismatchWarning && (
          <div className="flex items-start gap-1 text-amber-600 dark:text-amber-400 text-xs bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40 rounded-lg px-2 py-1">
            <span className="material-symbols-outlined text-[11px] mt-0.5 shrink-0">warning</span>
            <span>{cnaeMismatchWarning}</span>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-slate-500 dark:text-slate-400">
          {cnpjData.porte && <span>{cnpjData.porte}</span>}
          {cnpjData.capitalSocial != null && <span>Capital {formatCurrency(cnpjData.capitalSocial)}</span>}
          <span>Simples: {cnpjData.simplesNacional === true ? 'Sim' : cnpjData.simplesNacional === false ? 'Não' : '-'}</span>
          {cnpjData.mei != null && <span>MEI: {cnpjData.mei ? 'Sim' : 'Não'}</span>}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-slate-500 dark:text-slate-400 text-xs">
          {cnpjData.telefone && <span><span className="material-symbols-outlined text-[11px] align-middle mr-0.5">phone</span>{cnpjData.telefone}</span>}
          {cnpjData.email && <span><span className="material-symbols-outlined text-[11px] align-middle mr-0.5">mail</span>{cnpjData.email}</span>}
          {cnpjData.endereco && (
            <span>
              <span className="material-symbols-outlined text-[11px] align-middle mr-0.5">location_on</span>
              {[cnpjData.endereco.logradouro, cnpjData.endereco.numero ? `n. ${cnpjData.endereco.numero}` : null].filter(Boolean).join(', ')}
              {' — '}{[cnpjData.endereco.bairro, cnpjData.endereco.municipio, cnpjData.endereco.uf].filter(Boolean).join(', ')}
              {cnpjData.endereco.cep && <span> · CEP {cnpjData.endereco.cep}</span>}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
