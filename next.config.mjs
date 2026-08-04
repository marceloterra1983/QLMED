/** @type {import('next').NextConfig} */
const isProd = process.env.NODE_ENV === 'production';
const allowedDevOrigins = (process.env.NEXT_ALLOWED_DEV_ORIGINS || '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

// 'unsafe-eval' é exigência só do Next em dev (react-refresh / eval-source-map).
// Em produção fica de fora. 'unsafe-inline' permanece até migrarmos para nonce
// (exige tornar as rotas dinâmicas — backlog). Auditoria 2026-07-21.
// Cloudflare Web Analytics (beacon) é injetado no edge; sem allowlist o browser
// loga CSP violation em todas as páginas (smoke 2026-07-26).
const scriptSrc = isProd
  ? "'self' 'unsafe-inline' https://static.cloudflareinsights.com"
  : "'self' 'unsafe-inline' 'unsafe-eval'";
const connectSrc = isProd
  ? "'self' https://cloudflareinsights.com https://*.cloudflareinsights.com"
  : "'self'";

const nextConfig = {
  ...(isProd ? { output: 'standalone' } : {}),
  compress: true,
  poweredByHeader: false,
  ...(allowedDevOrigins.length > 0 ? { allowedDevOrigins } : {}),
  serverExternalPackages: ['bcryptjs', 'node-forge', 'xml-crypto', 'xml2js'],
  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [
          { key: 'Service-Worker-Allowed', value: '/' },
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
        ],
      },
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          { key: 'Content-Security-Policy', value: `default-src 'self'; script-src ${scriptSrc}; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src ${connectSrc}; worker-src 'self'; manifest-src 'self'; frame-ancestors 'self'` },
        ],
      },
    ];
  },
};

export default nextConfig;
