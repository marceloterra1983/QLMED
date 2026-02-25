import type { Metadata } from 'next';
import { Manrope } from 'next/font/google';
import { Providers } from './providers';
import './globals.css';

const manrope = Manrope({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  display: 'swap',
  variable: '--font-manrope',
});

const MATERIAL_ICONS = [
  'account_balance','account_tree','add','add_circle','arrow_back',
  'arrow_downward','arrow_upward','auto_fix_high','biotech','block',
  'business','calculate','calendar_month','call_made','call_received',
  'cancel','check','check_circle','checklist','chevron_left',
  'chevron_right','close','cloud_off','cloud_sync','cloud_upload',
  'code','code_off','content_copy','dark_mode','dashboard',
  'data_object','delete','delete_forever','description','desktop_windows',
  'download','edit','edit_note','error','event_repeat',
  'expand_less','expand_more','fact_check','factory','filter_alt',
  'filter_alt_off','first_page','folder_open','folder_zip','forward_to_inbox',
  'group','group_off','history','home','hourglass_top',
  'hub','inbox','info','inventory_2','key',
  'last_page','light_mode','link','list_alt','local_shipping',
  'location_on','login','logout','manage_accounts','menu',
  'money_off','monitoring','more_vert','no_encryption','notification_important',
  'open_in_new','output','package_2','payments','pending',
  'pending_actions','person','person_add','person_off','picture_as_pdf',
  'print','progress_activity','receipt','receipt_long','refresh',
  'request_quote','save','schedule','search','search_off',
  'settings','storefront','storefront_off','switch_account','sync',
  'table_rows','table_view','today','trending_down','trending_up',
  'tune','unfold_less','unfold_more','upcoming','verified',
  'verified_user','visibility','warning','wifi_tethering',
].join(',');

const materialSymbolsUrl = `https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&icon_names=${MATERIAL_ICONS}&display=swap`;

export const metadata: Metadata = {
  title: 'QLMED - Gestão de Notas Fiscais',
  description: 'Plataforma completa para gerenciamento de notas fiscais eletrônicas. Receba, consulte e gerencie XMLs de NF-e, CT-e e NFS-e.',
  keywords: ['notas fiscais', 'XML', 'NF-e', 'CT-e', 'NFS-e', 'gestão fiscal'],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" className={manrope.variable} suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href={materialSymbolsUrl} rel="stylesheet" />
      </head>
      <body suppressHydrationWarning className="bg-background-light dark:bg-background-dark text-slate-800 dark:text-slate-100 antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
