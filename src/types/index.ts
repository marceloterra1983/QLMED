export interface Invoice {
  id: string;
  accessKey: string;
  type: InvoiceType;
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

export interface DashboardStats {
  docsReceived: number;
  totalValue: number;
  pendingManifest: number;
  errors: number;
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
