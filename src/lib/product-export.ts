export interface ProductExportQuery {
  search?: string;
  sort: string;
  order: 'asc' | 'desc';
  lineStatus: 'active' | 'outOfLine' | 'all';
  productType?: string;
  productSubtype?: string;
  productSubgroup?: string;
  onlyMissingAnvisa?: boolean;
}

function setTrimmedParam(params: URLSearchParams, key: string, value: string | undefined) {
  const trimmed = (value || '').trim();
  if (trimmed) params.set(key, trimmed);
}

export function buildProductExportUrl(query: ProductExportQuery) {
  const params = new URLSearchParams({
    exportAll: '1',
    sort: query.sort,
    order: query.order,
    lineStatus: query.lineStatus,
  });

  setTrimmedParam(params, 'search', query.search);
  setTrimmedParam(params, 'productType', query.productType);
  setTrimmedParam(params, 'productSubtype', query.productSubtype);
  setTrimmedParam(params, 'productSubgroup', query.productSubgroup);

  if (query.onlyMissingAnvisa) {
    params.set('onlyMissingAnvisa', '1');
  }

  return `/api/products/list?${params.toString()}`;
}

export function escapeCsvValue(value: string | null | undefined) {
  const raw = value || '';
  const guarded = /^[\s]*[=+\-@]/.test(raw) || /^[\t\r\n]/.test(raw)
    ? `'${raw}`
    : raw;

  return /[;"\r\n]/.test(guarded)
    ? `"${guarded.replace(/"/g, '""')}"`
    : guarded;
}
