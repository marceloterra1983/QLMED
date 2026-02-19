export { default } from 'next-auth/middleware';

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/api/companies/:path*',
    '/api/invoices/:path*',
    '/api/dashboard/:path*',
    '/api/nsdocs/:path*',
    '/api/certificate/:path*',
  ],
};
