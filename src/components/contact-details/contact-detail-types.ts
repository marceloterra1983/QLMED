// Shared types for contact detail modals (Supplier & Customer)

export interface ContactRef {
  cnpj: string;
  name: string;
}

export interface ContactDetails {
  name: string;
  fantasyName: string | null;
  cnpj: string;
  stateRegistration: string | null;
  municipalRegistration: string | null;
  phone: string | null;
  email: string | null;
  address: {
    street: string | null;
    number: string | null;
    complement: string | null;
    district: string | null;
    city: string | null;
    state: string | null;
    zipCode: string | null;
    country: string | null;
  };
}

export interface ContactPurchases {
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
}

export interface ContactPriceRow {
  code: string;
  description: string;
  unit: string;
  invoiceCount: number;
  totalQuantity: number;
  averagePrice: number;
  minPrice: number;
  maxPrice: number;
  lastPrice: number;
  lastIssueDate: string | null;
  lastInvoiceNumber: string | null;
}

export interface ContactInvoice {
  id: string;
  number: string;
  series: string | null;
  issueDate: string;
  totalValue: number;
  status: string;
  accessKey: string;
  cfopTag: string;
}

export interface ContactDuplicate {
  invoiceId: string;
  invoiceNumber: string;
  installmentNumber: string;
  dueDate: string | null;
  installmentValue: number;
  installmentTotal: number;
}

export interface ContactMeta {
  totalPriceRows: number;
  priceRowsLimited: boolean;
}

export interface ContactFiscalData {
  ie: string | null;
  im: string | null;
  crt: string | null;
  crtLabel: string | null;
  uf: string | null;
}

export interface ContactOverrideData {
  phone: string | null;
  email: string | null;
  street: string | null;
  number: string | null;
  complement: string | null;
  district: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  country: string | null;
}

export interface AddressDivergence {
  field: string;
  label: string;
  xmlValue: string;
  apiValue: string;
}

export type PriceSortKey = 'description' | 'code' | 'totalQuantity' | 'lastPrice' | 'lastIssueDate';
export type SortDirection = 'asc' | 'desc';
