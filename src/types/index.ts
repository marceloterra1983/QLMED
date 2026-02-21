export type InvoiceDirection = 'received' | 'issued';

export interface Invoice {
  id: string;
  accessKey: string;
  type: InvoiceType;
  direction?: InvoiceDirection;
  number: string;
  series: string | null;
  issueDate: string;
  senderCnpj: string;
  senderName: string;
  recipientCnpj: string;
  recipientName: string;
  totalValue: number;
  status: InvoiceStatus;
  xmlContent?: string;
  company?: { razaoSocial: string; cnpj: string };
}

export interface DashboardDocStats {
  count: number;
  totalValue: number;
}

export interface DashboardStats {
  nfeReceived: DashboardDocStats;
  nfeIssued: DashboardDocStats;
  cte: DashboardDocStats;
  pendingManifest: number;
  errors: number;
  period: {
    type: 'month' | 'quarter' | 'year';
    label: string;
  };
  recentInvoices: Invoice[];
}

export interface FinanceiroSummary {
  total: number;
  totalValor: number;
  vencidas: number;
  vencidasValor: number;
  venceHoje: number;
  venceHojeValor: number;
  aVencer: number;
  aVencerValor: number;
}

export interface Company {
  id: string;
  cnpj: string;
  razaoSocial: string;
  nomeFantasia?: string | null;
}

export interface SyncLog {
  id: string;
  companyId: string;
  syncMethod: string;
  status: string;
  newDocs: number;
  updatedDocs: number;
  errorMessage: string | null;
  startedAt: string;
  completedAt: string | null;
}

export type InvoiceStatus = 'received' | 'confirmed' | 'rejected';
export type InvoiceType = 'NFE' | 'CTE' | 'NFSE';
export type SyncState = 'idle' | 'syncing' | 'polling' | 'completed' | 'error';
