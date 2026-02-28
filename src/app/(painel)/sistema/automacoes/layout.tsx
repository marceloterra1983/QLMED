import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Automações | QLMED' };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
