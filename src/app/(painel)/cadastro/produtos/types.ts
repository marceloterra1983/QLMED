export interface ProductRow {
  key: string;
  codigo?: string | null;
  code: string;
  description: string;
  ncm: string | null;
  unit: string;
  ean?: string | null;
  anvisa: string | null;
  anvisaMatchMethod?: 'xml' | 'manual' | 'issued_nfe' | 'catalog_code_exact' | 'catalog_name' | null;
  anvisaConfidence?: number | null;
  anvisaMatchedProductName?: string | null;
  anvisaHolder?: string | null;
  anvisaProcess?: string | null;
  anvisaStatus?: string | null;
  anvisaExpiration?: string | null;
  anvisaRiskClass?: string | null;
  anvisaManufacturer?: string | null;
  anvisaManufacturerCountry?: string | null;
  totalQuantity: number;
  invoiceCount: number;
  lastPrice: number;
  lastIssueDate: string | null;
  lastSaleDate: string | null;
  lastSalePrice: number | null;
  lastSupplierName?: string | null;
  lastInvoiceId?: string | null;
  lastInvoiceNumber?: string | null;
  shortName?: string | null;
  manufacturerShortName?: string | null;
  productType?: string | null;
  productSubtype?: string | null;
  productSubgroup?: string | null;
  outOfLine?: boolean;
  fiscalSitTributaria?: string | null;
  fiscalNomeTributacao?: string | null;
  fiscalIcms?: number | null;
  fiscalPis?: number | null;
  fiscalCofins?: number | null;
  fiscalObs?: string | null;
  fiscalCest?: string | null;
  fiscalOrigem?: string | null;
  fiscalIpi?: number | null;
  fiscalFcp?: number | null;
}

export interface ProductsSummary {
  totalProducts: number;
  productsWithAnvisa: number;
  totalQuantity: number;
  invoicesProcessed: number;
}

export interface ProductsResponse {
  products: ProductRow[];
  summary: ProductsSummary;
  pagination: { page: number; limit: number; total: number; pages: number };
  meta?: {
    invoicesLimited?: boolean;
    maxInvoices?: number;
    anvisaStats?: { manual: number; xml: number; issuedNfe: number; catalog: number; missing: number };
  };
}

export type SortField = 'description' | 'code' | 'ncm' | 'anvisa' | 'lastPrice' | 'lastIssueDate' | 'lastSaleDate' | 'supplier' | 'productType' | 'totalQuantity' | 'invoiceCount';
