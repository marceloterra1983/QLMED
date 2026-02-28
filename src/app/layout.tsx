import type { Metadata } from 'next';
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
  themeColor: '#2952b8',
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

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" className={manrope.variable} suppressHydrationWarning>
      <head />
      <body suppressHydrationWarning className="bg-background-light dark:bg-background-dark text-slate-800 dark:text-slate-100 antialiased">
        <PWARegister />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
