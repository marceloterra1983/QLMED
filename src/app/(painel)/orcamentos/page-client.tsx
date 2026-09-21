'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import PageHeader from '@/components/PageHeader';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Card from '@/components/ui/Card';
import EmptyState from '@/components/ui/EmptyState';
import Spinner from '@/components/ui/Spinner';
import ListPagination from '@/components/ui/ListPagination';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { RowActionsBase } from '@/components/ui/RowActions';
import { useRole } from '@/hooks/useRole';
import { FILTER_INPUT_CLS, formatCurrency, formatDocumentDate } from '@/lib/utils';

type QuoteRow = {
  id: string;
  numberLabel: string;
  issuedAt: string;
  status: 'draft' | 'issued' | 'cancelled';
  customerName: string;
  total: string;
};

const STATUS_LABEL: Record<QuoteRow['status'], string> = {
  draft: 'Rascunho',
  issued: 'Emitido',
  cancelled: 'Cancelado',
};

const STATUS_TONE: Record<QuoteRow['status'], 'neutral' | 'success' | 'danger'> = {
  draft: 'neutral',
  issued: 'success',
  cancelled: 'danger',
};

export default function OrcamentosPageClient() {
  const router = useRouter();
  const { canWrite } = useRole();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<QuoteRow[]>([]);
  const [pages, setPages] = useState(1);
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (q.trim()) params.set('q', q.trim());
    if (status) params.set('status', status);
    params.set('page', String(page));
    return params.toString();
  }, [q, status, page]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/orcamentos?${query}`);
      if (!res.ok) {
        toast.error('Não foi possível carregar os orçamentos');
        return;
      }
      const payload = (await res.json()) as {
        quotes: QuoteRow[];
        pagination: { pages: number };
      };
      setRows(payload.quotes);
      setPages(payload.pagination.pages);
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    void load();
  }, [load]);

  async function duplicar(id: string) {
    const res = await fetch(`/api/orcamentos/${id}/duplicar`, { method: 'POST' });
    if (!res.ok) {
      toast.error('Não foi possível duplicar');
      return;
    }
    const created = (await res.json()) as { id: string };
    toast.success('Orçamento duplicado');
    router.push(`/orcamentos/${created.id}`);
  }

  async function confirmarCancelar() {
    if (!cancelId) return;
    setCancelling(true);
    try {
      const res = await fetch(`/api/orcamentos/${cancelId}/cancelar`, { method: 'POST' });
      if (!res.ok) {
        toast.error('Não foi possível cancelar');
        return;
      }
      toast.success('Orçamento cancelado');
      setCancelId(null);
      await load();
    } finally {
      setCancelling(false);
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        icon="contract"
        title="Orçamentos"
        subtitle="Monte propostas com clientes e produtos do cadastro"
        actions={
          canWrite ? (
            <Button href="/orcamentos/novo" icon="add">
              Novo orçamento
            </Button>
          ) : null
        }
      />

      <div className="flex flex-col sm:flex-row gap-3">
        <input
          className={`${FILTER_INPUT_CLS} sm:max-w-sm`}
          placeholder="Buscar número ou cliente"
          aria-label="Buscar orçamento por número ou cliente"
          value={q}
          onChange={(e) => {
            setPage(1);
            setQ(e.target.value);
          }}
        />
        <select
          className={`${FILTER_INPUT_CLS} sm:w-48`}
          aria-label="Filtrar por situação"
          value={status}
          onChange={(e) => {
            setPage(1);
            setStatus(e.target.value);
          }}
        >
          <option value="">Todas as situações</option>
          <option value="draft">Rascunho</option>
          <option value="issued">Emitido</option>
          <option value="cancelled">Cancelado</option>
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon="contract"
          title="Nenhum orçamento"
          hint="Crie o primeiro orçamento com um cliente e os produtos do catálogo."
        />
      ) : (
        <Card padding="none" className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-500 border-b border-slate-200 dark:border-slate-800">
                <th className="px-4 py-3">Número</th>
                <th className="px-4 py-3">Data</th>
                <th className="px-4 py-3">Cliente</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3">Situação</th>
                <th className="px-4 py-3 text-center">Ações</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-slate-100 dark:border-slate-800 last:border-0">
                  <td className="px-4 py-3 font-semibold">
                    <Link href={`/orcamentos/${row.id}`} className="text-primary dark:text-blue-400 hover:underline">
                      {row.numberLabel}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{formatDocumentDate(row.issuedAt)}</td>
                  <td className="px-4 py-3">{row.customerName}</td>
                  <td className="px-4 py-3 text-right font-medium">{formatCurrency(Number(row.total))}</td>
                  <td className="px-4 py-3">
                    <Badge tone={STATUS_TONE[row.status]}>{STATUS_LABEL[row.status]}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <RowActionsBase
                      compact
                      inline={[
                        { label: 'Abrir', icon: 'edit', onSelect: () => router.push(`/orcamentos/${row.id}`) },
                        { label: 'PDF', icon: 'picture_as_pdf', onSelect: () => window.open(`/api/orcamentos/${row.id}/pdf`, '_blank') },
                      ]}
                      menu={[
                        ...(canWrite
                          ? [
                              { label: 'Duplicar', icon: 'content_copy', onSelect: () => void duplicar(row.id) },
                              ...(row.status !== 'cancelled'
                                ? [{ label: 'Cancelar', icon: 'cancel', danger: true, onSelect: () => setCancelId(row.id) }]
                                : []),
                            ]
                          : []),
                      ]}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <ListPagination page={page} pages={pages} loading={loading} onPageChange={setPage} />

      <ConfirmDialog
        isOpen={Boolean(cancelId)}
        onClose={() => setCancelId(null)}
        onConfirm={() => void confirmarCancelar()}
        title="Cancelar orçamento"
        message="O orçamento permanece no histórico e o PDF passa a mostrar CANCELADO."
        confirmLabel="Cancelar orçamento"
        confirmVariant="danger"
        loading={cancelling}
      />
    </div>
  );
}
