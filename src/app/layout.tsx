import type { Metadata, Viewport } from 'next';
import { Manrope } from 'next/font/google';
import { Providers } from './providers';
import { PWARegister } from '@/components/PWARegister';
import './globals.css';

const manrope = Manrope({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  display: 'swap',
  variable: '--font-manrope',
});

/* ── Material Symbols Outlined ──
 * Self-hosted font: public/fonts/material-symbols.woff2
 * @font-face + .material-symbols-outlined rules in globals.css
 * Validation:  bash scripts/check-icons.sh
 */

export const metadata: Metadata = {
  title: 'QLMED - Gestão de Notas Fiscais',
  description: 'Plataforma completa para gerenciamento de notas fiscais eletrônicas. Receba, consulte e gerencie XMLs de NF-e, CT-e e NFS-e.',
  keywords: ['notas fiscais', 'XML', 'NF-e', 'CT-e', 'NFS-e', 'gestão fiscal'],
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'QLMED',
  },
  icons: {
    icon: [
      { url: '/icon-192-v2.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512-v2.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/apple-touch-icon-v2.png', sizes: '180x180', type: 'image/png' }],
  },
};

export const viewport: Viewport = {
  themeColor: '#2952b8',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" className={manrope.variable} suppressHydrationWarning>
      <head />
      <body suppressHydrationWarning className="bg-background-light dark:bg-background-dark text-slate-800 dark:text-slate-100 antialiased">
        {process.env.NODE_ENV === 'development' && (
          <div className="bg-yellow-400 w-full sticky top-0 z-[9999]" style={{ height: '15px' }} />
        )}
        <PWARegister />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
