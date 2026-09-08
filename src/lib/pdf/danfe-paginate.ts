export function splitProductsForPages<T>(products: T[], pageCount: number): T[][] {
  const source = products.slice();
  if (pageCount <= 1) return [source];

  const first = Math.max(
    1,
    Math.min(
      source.length - (pageCount - 1),
      Math.round(source.length / (pageCount + 0.6)),
    ),
  );
  const firstChunk = source.slice(0, Math.min(first, source.length));
  const remaining = source.slice(firstChunk.length);
  const restPages = pageCount - 1;
  const chunks: T[][] = [firstChunk];
  const base = Math.floor(remaining.length / restPages);
  let extra = remaining.length % restPages;
  let offset = 0;
  for (let i = 0; i < restPages; i++) {
    const size = base + (extra > 0 ? 1 : 0);
    if (extra > 0) extra -= 1;
    chunks.push(remaining.slice(offset, offset + size));
    offset += size;
  }
  return chunks;
}
