export type SyncMethod = 'sefaz' | 'nsdocs' | 'receita_nfse';

export interface SyncRunContext {
  companyId: string;
  cnpj: string;
  razaoSocial: string;
  existingSyncLogId?: string;
}

export interface SyncStrategy<TConfig> {
  method: SyncMethod;
  run(context: SyncRunContext, config: TConfig): Promise<void>;
}
