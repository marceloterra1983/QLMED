'use client';

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import Spinner from '@/components/ui/Spinner';
import EmptyState from '@/components/ui/EmptyState';

interface PickerProduct {
  id: string;
  codigo: string | null;
  code: string;
  description: string;
  ncm: string | null;
  manufacturerShortName: string | null;
  outOfLine: boolean;
}

/** Alvo do vínculo: um item (linkId) ou o grupo fornecedor + cProd. */
export type LinkScope =
  | { linkId: string }
  | { supplierCnpj: string; supplierCode: string };

export interface ProductLinkPickerProps {
  isOpen: boolean;
  onClose: () => void;
  scope: LinkScope | null;
  /** Texto de contexto: descrição do item do fornecedor. */
  itemLabel: string;
  /** Sugestão inicial de busca (cProd ou descrição). */
  initialSearch?: string;
  /** Quantos itens o vínculo em grupo afeta (só informativo). */
  affectedCount?: number;
  onLinked: (result: { updated: number; codigo: string | null; productId: string }) => void;
}

/**
 * SPEC-047: seletor de produto Spica para vínculo MANUAL. Busca em
 * /api/products/list?search= (código, referência ou descrição) e grava em
 * POST /api/products/nfe-item-links.
 */
export default function ProductLinkPicker({ isOpen, onClose, scope, itemLabel, initialSearch, affectedCount, onLinked }: ProductLinkPickerProps) {
  const [search, setSearch] = useState(initialSearch || '');
  const [results, setResults] = useState<PickerProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    setSearch(initialSearch || '');
    setResults([]);
    const t = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, [isOpen, initialSearch]);

  useEffect(() => {
    if (!isOpen) return;
    const term = search.trim();
    if (term.length < 2) { setResults([]); return; }
    const controller = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/products/list?search=${encodeURIComponent(term)}&limit=25&sort=description&order=asc`, { signal: controller.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = await res.json();
        setResults((body.products || []) as PickerProduct[]);
      } catch (error) {
        if ((error as Error).name !== 'AbortError') toast.error('Falha ao buscar produtos');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 250);
    return () => { clearTimeout(t); controller.abort(); };
  }, [search, isOpen]);

  async function pick(product: PickerProduct) {
    if (!scope) return;
    setSaving(product.id);
    try {
      const res = await fetch('/api/products/nfe-item-links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productRegistryId: product.id, ...scope }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      if (body.updated === 0) {
        toast.warning('Nenhum item atualizado: a nota ainda não foi varrida. Execute a varredura em Rotinas.');
      } else {
        toast.success(`${body.updated} ${body.updated === 1 ? 'item vinculado' : 'itens vinculados'} ao código ${body.codigo || product.code}`);
      }
      onLinked({ updated: body.updated ?? 0, codigo: body.codigo ?? product.codigo, productId: product.id });
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Falha ao vincular');
    } finally {
      setSaving(null);
    }
  }

  const groupScope = scope && 'supplierCnpj' in scope;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Relacionar a produto Spica"
      subtitle={itemLabel}
      width="sm:max-w-2xl"
      zIndex="z-[60]"
      bodyClassName="p-4 sm:p-5 space-y-3"
    >
      {groupScope && (
        <p className="text-xs text-amber-900 dark:text-amber-200 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200/60 dark:border-amber-800/40 px-3 py-2">
          O vínculo vale para <strong>todos os itens</strong> deste fornecedor com este código{affectedCount ? ` (${affectedCount})` : ''} e ensina o sistema para as próximas notas.
        </p>
      )}
      <div className="relative">
        <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-[18px] text-slate-500 dark:text-slate-400" aria-hidden="true">search</span>
        <input
          ref={inputRef}
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Código Spica, referência ou descrição"
          aria-label="Buscar produto Spica"
          className="block w-full pl-9 pr-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-900/50 text-slate-900 dark:text-white placeholder-slate-400 text-sm"
        />
      </div>
      <div className="max-h-[50vh] overflow-y-auto rounded-xl ring-1 ring-slate-200/60 dark:ring-slate-800/60">
        {loading && results.length === 0 ? (
          <div className="flex justify-center py-8"><Spinner /></div>
        ) : results.length === 0 ? (
          <EmptyState icon="search" title={search.trim().length < 2 ? 'Digite ao menos 2 caracteres' : 'Nenhum produto encontrado'} />
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800/60">
            {results.map((p) => (
              <li key={p.id} className="flex items-center gap-3 px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800/40">
                <span className={`text-xs font-mono font-bold w-16 shrink-0 ${p.outOfLine ? 'text-slate-500 dark:text-slate-400' : 'text-emerald-800 dark:text-emerald-300'}`}>{p.codigo || '—'}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">{p.description}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                    Ref. {p.code}{p.manufacturerShortName ? ` · ${p.manufacturerShortName}` : ''}{p.ncm ? ` · NCM ${p.ncm}` : ''}{p.outOfLine ? ' · fora de linha' : ''}
                  </p>
                </div>
                <Button type="button" size="xs" variant="primary" icon="link" loading={saving === p.id} disabled={!!saving} onClick={() => pick(p)}>
                  Vincular
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}
