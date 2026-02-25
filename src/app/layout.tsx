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

/* ── Material Symbols Outlined — self-hosted ──
 * Font files: public/fonts/material-symbols-{a,b}.woff2
 * @font-face rules in globals.css
 * Icon lists kept here for the check-icons.sh validation script.
 * When adding a new icon: add to the correct chunk (alphabetical),
 * re-download woff2 files, then run:  bash scripts/check-icons.sh
 */
const MATERIAL_ICONS_A = [
  'account_balance','account_tree','add','add_circle','analytics','arrow_back',
  'arrow_downward','arrow_upward','article','assignment','auto_fix_high',
  'badge','biotech','block','business',
  'calculate','calendar_month','call_made','call_received','cancel',
  'category','check','check_circle','checklist','chevron_left',
  'chevron_right','close','cloud_off','cloud_sync','cloud_upload',
  'code','code_off','content_copy','credit_card',
  'dark_mode','dashboard','data_object','delete','delete_forever',
  'description','desktop_windows','download',
  'edit','edit_note','error','event','event_repeat',
  'expand_less','expand_more','fact_check','factory','filter_alt',
  'filter_alt_off','first_page','folder','folder_open','folder_zip',
  'forward_to_inbox','gavel','group','group_off',
  'history','home','hourglass_top',
].join(',');

const MATERIAL_ICONS_B = [
  'hub','inbox','info','inventory_2',
  'key','last_page','light_mode','link','list_alt','local_shipping',
  'location_on','login','logout',
  'manage_accounts','menu','money_off','monitoring','more_vert',
  'no_encryption','notification_important','notifications',
  'open_in_new','output',
  'package_2','palette','payments','pending','pending_actions',
  'person','person_add','person_off','picture_as_pdf','print','progress_activity',
  'receipt','receipt_long','refresh','request_quote','route',
  'save','schedule','search','search_off','settings','shield','shopping_cart',
  'storage','storefront','storefront_off','straighten','swap_horiz','switch_account','sync',
  'table_chart','table_rows','table_view','tag','today','toggle_on',
  'trending_down','trending_up','tune',
  'unfold_less','unfold_more','upcoming',
  'verified','verified_user','visibility',
  'warehouse','warning','wifi_tethering',
].join(',');

// Keep references so check-icons.sh can still parse them
void MATERIAL_ICONS_A;
void MATERIAL_ICONS_B;

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
      </head>
      <body suppressHydrationWarning className="bg-background-light dark:bg-background-dark text-slate-800 dark:text-slate-100 antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
