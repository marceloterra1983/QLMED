import type { Metadata } from 'next';
import { Suspense } from 'react';
import Card from '@/components/ui/Card';
import CustomerDetailsClient from './customer-details-client';

export const metadata: Metadata = { title: 'Detalhes do Cliente | QLMED' };
export const dynamic = 'force-dynamic';

export default function CustomerDetailsPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-4">
          <Card padding="lg" className="text-center text-sm text-slate-500 dark:text-slate-400">
            Carregando detalhes do cliente...
          </Card>
        </div>
      }
    >
      <CustomerDetailsClient />
    </Suspense>
  );
}
