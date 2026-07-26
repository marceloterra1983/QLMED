export { isResaleCustomer } from '@/lib/resale-customers';

export {
  normalizeAnvisaRegistration,
  extractAnvisaFromFreeText,
  extractAnvisa,
} from './anvisa';

export {
  UNIT_ALIASES,
  normalizeUnit,
  buildProductKey,
  type ProductBatch,
  type ProductFromXml,
} from './units';

export { extractProductsFromXml, computeSearchText } from './xml-products';

export {
  aggregateProductsFromInvoices,
  type AggregatedProduct,
} from './aggregate';

export {
  buildProductsListPayload,
  type ProductsListQueryParams,
} from './list-payload';
