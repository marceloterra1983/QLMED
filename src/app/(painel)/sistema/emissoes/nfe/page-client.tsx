'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import PageHeader from '@/components/PageHeader';
import Card from '@/components/ui/Card';
import Badge, { type BadgeTone } from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import EmptyState from '@/components/ui/EmptyState';
import Spinner from '@/components/ui/Spinner';
import { formatAmount, formatCnpj, formatDateTime } from '@/lib/utils';
import EmissionDetailModal, { type EmissionListItem } from './EmissionDetailModal';

type StatusFilter = 'all' | 'rejected' | 'authorized' | 'draft' | 'submitted';

function statusBadge(status: string): { tone: BadgeTone; label: string } {
  switch (status) {
    case 'authorized':
      return { tone: 'success', label: 'Autorizada' };
    case 'rejected':
      return { tone: 'danger', label: 'Rejeitada' };
    case 'submitted':
      return { tone: 'warning', label: 'Enviada' };
    default:
      return { tone: 'neutral', label: 'Rascunho' };
  }
}

export default function EmissoesNfePageClient() {
  const [rows, setRows] = useState<EmissionListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/nfe-emissions');
      if (!res.ok) throw new Error('Falha ao carregar emissões');
      const data = await res.json();
      setRows(Array.isArray(data.emissions) ? data.emissions : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    if (filter === 'all') return rows;
    return rows.filter((r) => r.status === filter);
  }, [rows, filter]);

  const selected = selectedId ? rows.find((r) => r.id === selectedId) ?? null : null;

  const rejectedCount = rows.filter((r) => r.status === 'rejected').length;

  return (
    <div className="space-y-6">
      <PageHeader
        icon="description"
        title="Emissões — Notas Fiscais"
        subtitle="Registro de cada tentativa de emissão NF-e pelo QLMED, com cStat e motivo da SEFAZ."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/sistema/emissoes">
              <Button type="button" variant="secondary">
                Voltar
              </Button>
            </Link>
            <Button type="button" onClick={() => void load()} disabled={loading}>
              Atualizar
            </Button>
          </div>
        }
      />

      <div className="flex flex-wrap gap-2">
        {(
          [
            ['all', 'Todas'],
            ['rejected', 'Rejeitadas'],
            ['authorized', 'Autorizadas'],
            ['submitted', 'Enviadas'],
            ['draft', 'Rascunhos'],
          ] as const
        ).map(([value, label]) => (
          <Button
            key={value}
            type="button"
            variant={filter === value ? 'primary' : 'secondary'}
            onClick={() => setFilter(value)}
          >
            {label}
            {value === 'rejected' && rejectedCount > 0 ? ` (${rejectedCount})` : ''}
          </Button>
        ))}
      </div>

      <Card padding="none">
        {loading ? (
          <div className="flex items-center justify-center gap-2 p-10 text-slate-500">
            <Spinner size="md" />
            Carregando emissões…
          </div>
        ) : error ? (
          <EmptyState icon="error" title="Não foi possível carregar" hint={error} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon="receipt_long"
            title="Nenhuma emissão neste filtro"
            hint="Emissões criadas em Fiscal → Emitidas → Nova NF-e aparecem aqui com o retorno da SEFAZ."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-900/50">
                <tr>
                  <th className="px-4 py-3 font-semibold">Quando</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Número</th>
                  <th className="px-4 py-3 font-semibold">Destinatário</th>
                  <th className="px-4 py-3 font-semibold">CFOP</th>
                  <th className="px-4 py-3 font-semibold">Valor</th>
                  <th className="px-4 py-3 font-semibold">SEFAZ</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => {
                  const badge = statusBadge(row.status);
                  const total = Number(row.totalValue);
                  return (
                    <tr
                      key={row.id}
                      className="cursor-pointer border-b border-slate-100 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-900/40"
                      onClick={() => setSelectedId(row.id)}
                    >
                      <td className="whitespace-nowrap px-4 py-3 text-slate-600 dark:text-slate-300">
                        {formatDateTime(row.updatedAt)}
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={badge.tone}>{badge.label}</Badge>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 font-mono text-xs">
                        {row.number ? `${row.series}/${row.number}` : `S${row.series} —`}
                      </td>
                      <td className="max-w-[14rem] truncate px-4 py-3" title={row.destName}>
                        <div className="truncate font-medium text-slate-900 dark:text-white">
                          {row.destName}
                        </div>
                        <div className="font-mono text-xs text-slate-500">
                          {formatCnpj(row.destCnpj)}
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">{row.cfop}</td>
                      <td className="whitespace-nowrap px-4 py-3">
                        {Number.isFinite(total) ? formatAmount(total) : String(row.totalValue)}
                      </td>
                      <td className="max-w-[16rem] px-4 py-3">
                        {row.sefazStat || row.sefazMotivo ? (
                          <div>
                            {row.sefazStat && (
                              <span className="font-mono text-xs font-semibold">
                                cStat {row.sefazStat}
                              </span>
                            )}
                            {row.sefazMotivo && (
                              <p className="truncate text-xs text-slate-500" title={row.sefazMotivo}>
                                {row.sefazMotivo}
                              </p>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-slate-500">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <EmissionDetailModal
        emission={selected}
        isOpen={selectedId != null}
        onClose={() => setSelectedId(null)}
      />
    </div>
  );
}
