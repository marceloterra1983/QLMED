'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import PageHeader from '@/components/PageHeader';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import EmptyState from '@/components/ui/EmptyState';
import Spinner from '@/components/ui/Spinner';
import ProductLinkPicker, { type LinkScope } from '@/components/nfe-item-link/ProductLinkPicker';
import { useRole } from '@/hooks/useRole';
import { formatCnpj, formatDate } from '@/lib/utils';

interface PendingGroup {
  supplierCnpj: string;
  supplierName: string | null;
  supplierCode: string;
  description: string | null;
  ncm: string | null;
  itemCount: number;
  invoiceCount: number;
  lastIssueDate: string | null;
  sampleLinkId: string;
}

interface PendingResponse {
  groups: PendingGroup[];
  totalGroups: number;
  totalItems: number;
}

const PAGE = 50;

/**
 * SPEC-047: itens de NF-e recebida sem produto Spica, agrupados por fornecedor +
 * cProd. "Relacionar" vincula o grupo inteiro e ensina o sistema (S6).
 * Vive sob /cadastro/produtos porque é o catálogo que resolve a pendência.
 */
export default function VinculosNfePage() {
  const { canWrite, isAdmin } = useRole();
  const [data, setData] = useState<PendingResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [offset, setOffset] = useState(0);
  const [target, setTarget] = useState<PendingGroup | null>(null);
  const [sweeping, setSweeping] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: String(PAGE), offset: String(offset) });
      if (search.trim()) params.set('search', search.trim());
      const res = await fetch(`/api/products/nfe-item-links?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
    } catch {
      toast.error('Falha ao carregar pendências');
    } finally {
      setLoading(false);
    }
  }, [offset, search]);

  useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
  }, [load]);

  async function runSweep() {
    setSweeping(true);
    try {
      const res = await fetch('/api/products/nfe-item-links/sweep', { method: 'POST' });
      const body = await res.json().catch(() => ({}));
      if (res.status === 409) { toast.warning(body.error || 'Varredura já em andamento'); return; }
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      toast.success(`Varredura: ${body.linked} vinculados, ${body.pending} pendentes (${body.invoices} notas)`);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Falha na varredura');
    } finally {
      setSweeping(false);
    }
  }

  const scope: LinkScope | null = target ? { supplierCnpj: target.supplierCnpj, supplierCode: target.supplierCode } : null;
  const groups = data?.groups ?? [];
  const totalGroups = data?.totalGroups ?? 0;

  return (
    <>
      <PageHeader
        icon="link_off"
        title="Itens de NF sem vínculo"
        subtitle="Produtos de notas recebidas que ainda não foram relacionados a um código Spica. Relacionar um grupo vincula todas as notas do fornecedor com esse código e ensina o sistema."
        actions={(
          <>
            <Button href="/cadastro/produtos" variant="secondary" icon="arrow_back">Produtos</Button>
            {isAdmin && (
              <Button type="button" variant="secondary" icon="sync" loading={sweeping} onClick={runSweep} title="Reprocessar todas as notas recebidas desde 2021">
                Varrer notas
              </Button>
            )}
          </>
        )}
      />

      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
        <div className="relative flex-1">
          <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-[18px] text-slate-500 dark:text-slate-400" aria-hidden="true">search</span>
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setOffset(0); }}
            placeholder="Fornecedor, CNPJ, código ou descrição"
            aria-label="Buscar pendências"
            className="block w-full pl-9 pr-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-900/50 text-slate-900 dark:text-white placeholder-slate-400 text-sm"
          />
        </div>
        {data && (
          <p className="text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap" role="status">
            <strong className="text-slate-800 dark:text-slate-200">{data.totalItems}</strong> itens em <strong className="text-slate-800 dark:text-slate-200">{totalGroups}</strong> grupos
          </p>
        )}
      </div>

      <div className="rounded-xl ring-1 ring-slate-200/60 dark:ring-slate-800/60 bg-white dark:bg-card-dark overflow-hidden">
        {loading && !data ? (
          <div className="flex justify-center py-12"><Spinner size="lg" /></div>
        ) : groups.length === 0 ? (
          <EmptyState icon="task_alt" title={search ? 'Nenhuma pendência para essa busca' : 'Todos os itens de NF recebida estão vinculados'} />
        ) : (
          <>
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-900/70 border-b border-slate-200 dark:border-slate-800 text-xs uppercase text-slate-500 dark:text-slate-400 font-bold tracking-wider">
                    <th className="px-3 py-2.5 text-left">Fornecedor</th>
                    <th className="px-3 py-2.5 text-left">cProd</th>
                    <th className="px-3 py-2.5 text-left">Descrição na nota</th>
                    <th className="px-3 py-2.5 text-left">NCM</th>
                    <th className="px-3 py-2.5 text-right">Itens</th>
                    <th className="px-3 py-2.5 text-right">Notas</th>
                    <th className="px-3 py-2.5 text-left">Última</th>
                    <th className="px-3 py-2.5 text-right"></th>
                  </tr>
                </thead>
                <tbody>
                  {groups.map((g) => (
                    <tr key={`${g.supplierCnpj}:${g.supplierCode}`} className="border-b border-slate-100 dark:border-slate-800/60 hover:bg-slate-50/70 dark:hover:bg-slate-800/20">
                      <td className="px-3 py-2.5">
                        <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate max-w-[220px]" title={g.supplierName || ''}>{g.supplierName || '—'}</p>
                        <p className="text-xs font-mono text-slate-500 dark:text-slate-400">{formatCnpj(g.supplierCnpj)}</p>
                      </td>
                      <td className="px-3 py-2.5 text-xs font-mono text-slate-700 dark:text-slate-300">{g.supplierCode || '—'}</td>
                      <td className="px-3 py-2.5 text-xs text-slate-700 dark:text-slate-300 max-w-[360px] truncate" title={g.description || ''}>{g.description || '—'}</td>
                      <td className="px-3 py-2.5 text-xs font-mono text-slate-500 dark:text-slate-400">{g.ncm || '—'}</td>
                      <td className="px-3 py-2.5 text-right"><Badge tone="warning" dot={false}>{g.itemCount}</Badge></td>
                      <td className="px-3 py-2.5 text-right text-xs tabular-nums text-slate-600 dark:text-slate-300">{g.invoiceCount}</td>
                      <td className="px-3 py-2.5 text-xs text-slate-500 dark:text-slate-400">{g.lastIssueDate ? formatDate(g.lastIssueDate) : '—'}</td>
                      <td className="px-3 py-2.5 text-right">
                        {canWrite && (
                          <Button type="button" size="xs" variant="soft" icon="add_link" onClick={() => setTarget(g)}>Relacionar</Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="md:hidden divide-y divide-slate-100 dark:divide-slate-800/60">
              {groups.map((g) => (
                <li key={`${g.supplierCnpj}:${g.supplierCode}`} className="p-3 space-y-1.5">
                  <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">{g.description || '—'}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{g.supplierName || formatCnpj(g.supplierCnpj)} · cProd <span className="font-mono">{g.supplierCode || '—'}</span></p>
                  <div className="flex items-center justify-between gap-2">
                    <Badge tone="warning" dot={false}>{g.itemCount} itens · {g.invoiceCount} notas</Badge>
                    {canWrite && <Button type="button" size="xs" variant="soft" icon="add_link" onClick={() => setTarget(g)}>Relacionar</Button>}
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      {totalGroups > PAGE && (
        <div className="flex items-center justify-between mt-3 text-xs text-slate-500 dark:text-slate-400">
          <Button type="button" size="xs" variant="ghost" icon="chevron_left" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))}>Anterior</Button>
          <span>{offset + 1}–{Math.min(offset + PAGE, totalGroups)} de {totalGroups} grupos</span>
          <Button type="button" size="xs" variant="ghost" icon="chevron_right" disabled={offset + PAGE >= totalGroups} onClick={() => setOffset(offset + PAGE)}>Próxima</Button>
        </div>
      )}

      <ProductLinkPicker
        isOpen={target !== null}
        onClose={() => setTarget(null)}
        scope={scope}
        itemLabel={target ? `${target.supplierCode} · ${target.description || ''} (${target.supplierName || formatCnpj(target.supplierCnpj)})` : ''}
        initialSearch={target?.supplierCode}
        affectedCount={target?.itemCount}
        onLinked={() => load()}
      />
    </>
  );
}
