export const CACHE_PROFILES = {
  dashboard: 'private, max-age=30',           // Dashboard stats refresh every 30s
  list: 'private, max-age=10',                 // Lists refresh every 10s
  lookup: 'public, max-age=3600',              // NCM, CNPJ lookups cache 1 hour
  detail: 'private, max-age=60',               // Single record details
  none: 'no-store',                             // Mutations, uploads
} as const;

type CacheProfile = keyof typeof CACHE_PROFILES;

export function cacheHeaders(profile: CacheProfile): HeadersInit {
  return { 'Cache-Control': CACHE_PROFILES[profile] };
}
