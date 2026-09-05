import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Itens de NF sem vínculo | QLMED' };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
