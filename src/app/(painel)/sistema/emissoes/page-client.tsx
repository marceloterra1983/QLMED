'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import PageHeader from '@/components/PageHeader';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Spinner from '@/components/ui/Spinner';

type EmissionRow = {
  id: string;
  status: string;
};

export default function EmissoesHubPageClient() {
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [rejected, setRejected] = useState(0);
  const [authorized, setAuthorized] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/nfe-emissions');
        if (!res.ok) throw new Error('fail');
        const data = await res.json();
        const rows: EmissionRow[] = Array.isArray(data.emissions) ? data.emissions : [];
        if (cancelled) return;
        setTotal(rows.length);
        setRejected(rows.filter((r) => r.status === 'rejected').length);
        setAuthorized(rows.filter((r) => r.status === 'authorized').length);
      } catch {
        if (!cancelled) {
          setTotal(0);
          setRejected(0);
          setAuthorized(0);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader
        icon="receipt_long"
        title="Emissões"
        subtitle="Trilha operacional das emissões fiscais feitas pelo QLMED, com foco em rejeições da SEFAZ."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Link
          href="/sistema/emissoes/nfe"
          className="block rounded-xl"
        >
          <Card className="h-full transition-colors hover:border-primary/40 hover:bg-slate-50/80 dark:hover:bg-slate-900/40">
            <div className="flex items-start gap-3">
              <span className="material-symbols-outlined text-3xl text-primary dark:text-blue-400">
                description
              </span>
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                    Notas Fiscais
                  </h2>
                  <span className="material-symbols-outlined text-slate-500 text-lg">
                    chevron_right
                  </span>
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Rascunhos, envios e rejeições SEFAZ da emissão NF-e pelo portal.
                </p>
                <div className="flex flex-wrap gap-2 pt-1">
                  {loading ? (
                    <Spinner size="sm" />
                  ) : (
                    <>
                      <Badge tone="neutral">{total} recentes</Badge>
                      <Badge tone="danger">{rejected} rejeitadas</Badge>
                      <Badge tone="success">{authorized} autorizadas</Badge>
                    </>
                  )}
                </div>
              </div>
            </div>
          </Card>
        </Link>
      </div>
    </div>
  );
}
