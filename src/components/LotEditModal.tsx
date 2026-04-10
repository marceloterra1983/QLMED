'use client';

import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { toast } from 'sonner';
import { useModalBackButton } from '@/hooks/useModalBackButton';
import { formatDate, formatAmount, formatCnpj } from '@/lib/utils';

interface LotEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoiceId: string | null;
  canWrite: boolean;
  onSaved?: () => void;
}

interface InvoiceInfo {
  id: string;
  number: string | null;
  supplierName: string | null;
  supplierCnpj: string | null;
  issueDate: string | null;
  totalValue: number | null;
}

interface ProductBatch {
  id?: number;
  lot: string;
  quantity: number | null;
  expiry: string | null;
}

interface InvoiceItem {
  id?: number;
  batchIds?: number[];
  index: number;
  code: string;
  description: string;
  unit: string;
  quantity: number;
  batches: ProductBatch[];
  matchStatus: 'matched' | 'unmatched';
  codigoInterno: string | null;
  registryDescription: string | null;
}

// Draft for a single batch row (keyed by batchId or temp negative id)
interface BatchDraft {
  lot: string;
  expiry: string;
  quantity: string;
  batchId: number;        // existing DB id, or negative for new
  isNew?: boolean;        // true for rows not yet in DB
  sourceItemId?: number;  // for new rows: clone from this DB id
}

// Original values for comparison
interface BatchOriginal {
  lot: string;
  expiry: string;
  quantity: string;
}

function formatBatchDate(d: string | null): string {
  if (!d) return '';
  const iso = d.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1].slice(2)}`;
  const br = d.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) return `${br[1]}/${br[2]}/${br[3].slice(2)}`;
  return d;
}

export default function LotEditModal({ isOpen, onClose, invoiceId, canWrite, onSaved }: LotEditModalProps) {
  useModalBackButton(isOpen, onClose);

  const [invoice, setInvoice] = useState<InvoiceInfo | null>(null);
  const [items, setItems] = useState<InvoiceItem[]>([]);
  const [source, setSource] = useState<'xml' | 'persisted' | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [registering, setRegistering] = useState(false);

  // Drafts: Map<itemIndex, BatchDraft[]> — all batch rows per item
  const [drafts, setDrafts] = useState<Map<number, BatchDraft[]>>(new Map());
  // Originals: Map<batchId, BatchOriginal> — for change detection
  const [originals, setOriginals] = useState<Map<number, BatchOriginal>>(new Map());
  // Deleted batch row IDs
  const [deletedIds, setDeletedIds] = useState<Set<number>>(new Set());

  const nextTempId = useRef(-1);

  // Refs for keyboard navigation
  const inputRefs = useRef<Map<string, HTMLInputElement>>(new Map());
  const setInputRef = useCallback((key: string, el: HTMLInputElement | null) => {
    if (el) inputRefs.current.set(key, el);
    else inputRefs.current.delete(key);
  }, []);

  const abortRef = useRef<AbortController | null>(null);

  const loadItems = useCallback(async () => {
    if (!invoiceId) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    try {
      const res = await fetch(`/api/estoque/entrada-nfe/${invoiceId}`, { signal: controller.signal });
      if (res.ok) {
        const data = await res.json();
        setInvoice(data.invoice || null);
        const loadedItems: InvoiceItem[] = data.items || [];
        setItems(loadedItems);
        setSource(data.source || null);
        setDeletedIds(new Set());
        nextTempId.current = -1;

        // Build drafts and originals from batches
        const newDrafts = new Map<number, BatchDraft[]>();
        const newOriginals = new Map<number, BatchOriginal>();

        for (const item of loadedItems) {
          const itemDrafts: BatchDraft[] = [];
          if (item.batches && item.batches.length > 0) {
            for (const batch of item.batches) {
              const bid = batch.id ?? item.id ?? nextTempId.current--;
              const qty = item.quantity === 1 ? '1'
                : batch.quantity != null ? String(batch.quantity) : '';
              itemDrafts.push({
                batchId: bid,
                lot: batch.lot || '',
                expiry: batch.expiry || '',
                quantity: qty,
              });
              newOriginals.set(bid, {
                lot: batch.lot || '',
                expiry: batch.expiry || '',
                quantity: qty,
              });
            }
          } else {
            // Item with no batches — single empty draft row
            const bid = item.batchIds?.[0] ?? item.id ?? nextTempId.current--;
            itemDrafts.push({
              batchId: bid,
              lot: '',
              expiry: '',
              quantity: item.quantity === 1 ? '1' : '',
            });
            newOriginals.set(bid, { lot: '', expiry: '', quantity: item.quantity === 1 ? '1' : '' });
          }
          newDrafts.set(item.index, itemDrafts);
        }
        setDrafts(newDrafts);
        setOriginals(newOriginals);
      } else {
        toast.error('Erro ao carregar itens da nota');
      }
    } catch {
      toast.error('Erro ao carregar itens da nota');
    } finally {
      setLoading(false);
    }
  }, [invoiceId]);

  useEffect(() => {
    if (isOpen && invoiceId) loadItems();
    if (!isOpen) {
      abortRef.current?.abort();
      setInvoice(null);
      setItems([]);
      setSource(null);
      setDrafts(new Map());
      setOriginals(new Map());
      setDeletedIds(new Set());
    }
    return () => { abortRef.current?.abort(); };
  }, [isOpen, invoiceId, loadItems]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape' && !saving && !registering) onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, saving, registering, onClose]);

  const updateBatchDraft = (itemIndex: number, batchId: number, field: keyof BatchDraft, value: string) => {
    setDrafts(prev => {
      const next = new Map(prev);
      const arr = [...(next.get(itemIndex) || [])];
      const idx = arr.findIndex(d => d.batchId === batchId);
      if (idx >= 0) {
        arr[idx] = { ...arr[idx], [field]: value };
        next.set(itemIndex, arr);
      }
      return next;
    });
  };

  const addBatchRow = (item: InvoiceItem) => {
    const sourceId = item.batchIds?.[0] ?? item.id;
    if (!sourceId) return;
    const tempId = nextTempId.current--;
    setDrafts(prev => {
      const next = new Map(prev);
      const arr = [...(next.get(item.index) || [])];
      arr.push({
        batchId: tempId,
        lot: '',
        expiry: '',
        quantity: '',
        isNew: true,
        sourceItemId: sourceId,
      });
      next.set(item.index, arr);
      return next;
    });
    // Focus new row after render
    setTimeout(() => {
      const ref = inputRefs.current.get(`${tempId}-lot`);
      ref?.focus();
    }, 50);
  };

  const removeBatchRow = (itemIndex: number, batchId: number, isNew?: boolean) => {
    setDrafts(prev => {
      const next = new Map(prev);
      const arr = (next.get(itemIndex) || []).filter(d => d.batchId !== batchId);
      next.set(itemIndex, arr);
      return next;
    });
    if (!isNew && batchId > 0) {
      setDeletedIds(prev => new Set(prev).add(batchId));
    }
  };

  // Compute changes
  const getChanges = () => {
    const patches: { batchId: number; lot: string; expiry: string; quantity: string }[] = [];
    const creates: { sourceItemId: number; lot: string; expiry: string; quantity: string }[] = [];

    drafts.forEach((batchDrafts) => {
      for (const d of batchDrafts) {
        if (!d.lot.trim()) continue;
        if (d.isNew && d.sourceItemId) {
          creates.push({ sourceItemId: d.sourceItemId, lot: d.lot, expiry: d.expiry, quantity: d.quantity });
        } else {
          const orig = originals.get(d.batchId);
          if (orig && (d.lot !== orig.lot || d.expiry !== orig.expiry || d.quantity !== orig.quantity)) {
            patches.push({ batchId: d.batchId, lot: d.lot, expiry: d.expiry, quantity: d.quantity });
          }
        }
      }
    });
    return { patches, creates, deletes: Array.from(deletedIds) };
  };

  const changes = getChanges();
  const totalChanges = changes.patches.length + changes.creates.length + changes.deletes.length;

  // Validation: for each item with at least one lot filled, sum of lot qtys must equal item qty
  const { qtyErrors, hasQtyErrors } = useMemo(() => {
    const errors: Map<number, { allocated: number; total: number }> = new Map();
    items.forEach(item => {
      const ds = drafts.get(item.index) || [];
      const hasAnyLot = ds.some(d => d.lot.trim());
      if (!hasAnyLot) return;
      const allocated = ds.reduce((sum, d) => sum + Math.max(0, d.quantity ? Number(d.quantity) || 0 : 0), 0);
      if (allocated !== item.quantity) {
        errors.set(item.index, { allocated, total: item.quantity });
      }
    });
    return { qtyErrors: errors, hasQtyErrors: errors.size > 0 };
  }, [items, drafts]);

  const handleSaveAll = async () => {
    if (!invoiceId) return;
    if (hasQtyErrors) {
      toast.error('A soma das quantidades de lote deve ser igual à quantidade total do item');
      return;
    }

    const { patches, creates, deletes } = getChanges();
    if (patches.length === 0 && creates.length === 0 && deletes.length === 0) {
      toast.info('Nenhuma alteração para salvar');
      return;
    }

    setSaving(true);
    let saved = 0;
    let errors = 0;

    // 1. Delete removed batch rows
    for (const batchRowId of deletes) {
      try {
        const res = await fetch(`/api/estoque/entrada-nfe/${invoiceId}?batchRowId=${batchRowId}`, { method: 'DELETE' });
        if (res.ok) saved++;
        else errors++;
      } catch { errors++; }
    }

    // 2. PATCH modified existing rows
    for (const p of patches) {
      try {
        const res = await fetch(`/api/estoque/entrada-nfe/${invoiceId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            itemId: p.batchId,
            lot: p.lot.trim(),
            lotExpiry: p.expiry.trim() || null,
            lotQuantity: p.quantity ? Number(p.quantity) : null,
          }),
        });
        if (res.ok) saved++;
        else { errors++; const err = await res.json().catch(() => ({})); console.error('Patch error:', err.error); } // console.error intentional — client-side
      } catch { errors++; }
    }

    // 3. POST new batch rows
    for (const c of creates) {
      try {
        const res = await fetch(`/api/estoque/entrada-nfe/${invoiceId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sourceItemId: c.sourceItemId,
            lot: c.lot.trim(),
            lotExpiry: c.expiry.trim() || null,
            lotQuantity: c.quantity ? Number(c.quantity) : null,
          }),
        });
        if (res.ok) saved++;
        else { errors++; const err = await res.json().catch(() => ({})); console.error('Create error:', err.error); } // console.error intentional — client-side
      } catch { errors++; }
    }

    setSaving(false);

    if (saved > 0) {
      toast.success(`${saved} operaç${saved > 1 ? 'ões' : 'ão'} salva${saved > 1 ? 's' : ''} com sucesso`);
      await loadItems();
      onSaved?.();
    }
    if (errors > 0) {
      toast.error(`${errors} erro${errors > 1 ? 's' : ''} ao salvar`);
    }
  };

  const handleRegister = async () => {
    if (!invoiceId) return;
    if (hasQtyErrors) {
      toast.error('A soma das quantidades de lote deve ser igual à quantidade total do item');
      return;
    }
    setRegistering(true);
    try {
      // Build lot overrides from drafts to pass to registration
      const lotOverrides: Record<number, { lot: string; expiry: string | null; quantity: number | null }[]> = {};
      items.forEach(item => {
        const ds = drafts.get(item.index) || [];
        const filledLots = ds.filter(d => d.lot.trim());
        if (filledLots.length > 0) {
          lotOverrides[item.index] = filledLots.map(d => ({
            lot: d.lot.trim(),
            expiry: d.expiry.trim() || null,
            quantity: d.quantity ? Number(d.quantity) : null,
          }));
        }
      });

      const res = await fetch('/api/estoque/entrada-nfe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoiceId,
          lotOverrides: Object.keys(lotOverrides).length > 0 ? lotOverrides : undefined,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        toast.success(`Entrada registrada: ${data.matchedItems}/${data.totalItems} itens correspondidos`);
        await loadItems();
        onSaved?.();
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || 'Erro ao registrar entrada');
      }
    } catch {
      toast.error('Erro de rede ao registrar entrada');
    } finally {
      setRegistering(false);
    }
  };

  // Keyboard: Enter → next batch row lot field, or next item's first batch lot
  const handleFieldKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, itemIndex: number, batchId: number) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const itemDrafts = drafts.get(itemIndex) || [];
    const batchIdx = itemDrafts.findIndex(d => d.batchId === batchId);

    // Try next batch in same item
    if (batchIdx >= 0 && batchIdx < itemDrafts.length - 1) {
      const next = itemDrafts[batchIdx + 1];
      const ref = inputRefs.current.get(`${next.batchId}-lot`);
      ref?.focus(); ref?.select();
      return;
    }
    // Try first batch of next item
    const itemIdx = items.findIndex(i => i.index === itemIndex);
    if (itemIdx >= 0 && itemIdx < items.length - 1) {
      const nextItem = items[itemIdx + 1];
      const nextDrafts = drafts.get(nextItem.index);
      if (nextDrafts && nextDrafts.length > 0) {
        const ref = inputRefs.current.get(`${nextDrafts[0].batchId}-lot`);
        ref?.focus(); ref?.select();
      }
    }
  };

  // Summary: count items that have at least one batch with lot filled
  const itemsWithLot = items.filter(item => {
    const ds = drafts.get(item.index);
    return ds && ds.some(d => d.lot.trim());
  }).length;

  if (!isOpen) return null;

  const isPersisted = source === 'persisted';

  // Helper: allocated qty for an item
  const getAllocated = (itemIndex: number): number => {
    const ds = drafts.get(itemIndex) || [];
    return ds.reduce((sum, d) => sum + (d.quantity ? Number(d.quantity) || 0 : 0), 0);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => { if (!saving && !registering) onClose(); }}>
      <div
        className="bg-white dark:bg-slate-900 w-full h-full sm:h-auto sm:max-h-[90vh] sm:max-w-5xl sm:mx-4 sm:rounded-2xl shadow-xl border-0 sm:border border-slate-200 dark:border-slate-800 flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex-shrink-0 px-4 sm:px-6 py-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white truncate">
                Lotes — NF-e {invoice?.number || '...'}
              </h3>
              {invoice && (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1 text-xs text-slate-500">
                  <span className="font-medium text-slate-700 dark:text-slate-300 truncate max-w-[200px]">{invoice.supplierName}</span>
                  {invoice.supplierCnpj && <span className="font-mono">{formatCnpj(invoice.supplierCnpj)}</span>}
                  {invoice.issueDate && <span>{formatDate(invoice.issueDate)}</span>}
                  {invoice.totalValue != null && <span className="font-mono font-bold">R$ {formatAmount(invoice.totalValue)}</span>}
                </div>
              )}
              {!loading && items.length > 0 && (
                <div className="flex items-center gap-3 mt-1.5">
                  <span className="text-xs text-slate-500">
                    <span className="font-bold text-slate-700 dark:text-slate-300">{itemsWithLot}</span> de <span className="font-bold">{items.length}</span> itens com lote
                  </span>
                  {!isPersisted && (
                    <span className="px-2 py-0.5 text-[10px] font-medium rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300">
                      Pendente de registro
                    </span>
                  )}
                </div>
              )}
            </div>
            <button onClick={() => { if (!saving && !registering) onClose(); }} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 flex-shrink-0">
              <span className="material-symbols-outlined text-[24px]">close</span>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto min-h-0">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <span className="material-symbols-outlined text-[32px] text-primary animate-spin">progress_activity</span>
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400">
              <span className="material-symbols-outlined text-[48px] opacity-30">inventory_2</span>
              <p className="mt-2 text-sm">Nenhum item encontrado</p>
            </div>
          ) : (
            <>
              {/* Desktop Table */}
              <div className="hidden sm:block">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-800/80 backdrop-blur-sm">
                    <tr className="border-b border-slate-200 dark:border-slate-700">
                      <th className="px-2 py-2 text-[10px] font-semibold text-slate-400 uppercase w-8">#</th>
                      <th className="px-2 py-2 text-[10px] font-semibold text-slate-400 uppercase">Cód. NF-e</th>
                      <th className="px-2 py-2 text-[10px] font-semibold text-slate-400 uppercase">Descrição (XML)</th>
                      <th className="px-2 py-2 text-[10px] font-semibold text-slate-400 uppercase text-right w-14">Qtd</th>
                      <th className="px-2 py-2 text-[10px] font-semibold text-slate-400 uppercase w-[140px]">Lote</th>
                      <th className="px-2 py-2 text-[10px] font-semibold text-slate-400 uppercase w-[110px]">Validade</th>
                      <th className="px-2 py-2 text-[10px] font-semibold text-slate-400 uppercase text-right w-[70px]">Qtd Lote</th>
                      <th className="px-2 py-2 text-[10px] font-semibold text-slate-400 uppercase w-[100px]">Cód. Int.</th>
                      <th className="px-1 py-2 w-6"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map(item => {
                      const batchDrafts = drafts.get(item.index) || [];
                      const rowBg = item.matchStatus === 'matched'
                        ? 'bg-emerald-50/30 dark:bg-emerald-900/5'
                        : 'bg-red-50/30 dark:bg-red-900/5';
                      const allocated = getAllocated(item.index);
                      const remaining = item.quantity - allocated;
                      const hasError = qtyErrors.has(item.index);

                      return (
                        <React.Fragment key={item.index}>
                          {/* First batch row — includes item info */}
                          {batchDrafts.map((bd, bi) => {
                            const isFirst = bi === 0;
                            const noLot = !bd.lot.trim() && isPersisted && !bd.isNew;
                            const cellHighlight = noLot ? 'bg-amber-50/80 dark:bg-amber-900/20' : '';
                            const canDelete = batchDrafts.length > 1;

                            return (
                              <tr
                                key={bd.batchId}
                                className={`${rowBg} ${isFirst ? 'border-t border-slate-200 dark:border-slate-700' : ''}`}
                              >
                                {/* Item cols — only on first row, rowSpan */}
                                {isFirst && (
                                  <>
                                    <td className="px-2 py-1.5 text-slate-400 font-mono align-top" rowSpan={batchDrafts.length + 1}>{item.index}</td>
                                    <td className="px-2 py-1.5 font-mono text-slate-600 dark:text-slate-400 text-[10px] align-top" rowSpan={batchDrafts.length + 1}>{item.code || '-'}</td>
                                    <td className="px-2 py-1.5 text-slate-800 dark:text-slate-200 max-w-[250px] truncate align-top" rowSpan={batchDrafts.length + 1} title={item.description}>{item.description}</td>
                                    <td className={`px-2 py-1.5 text-right font-mono align-top ${hasError ? 'text-red-600 dark:text-red-400' : 'text-slate-700 dark:text-slate-300'}`} rowSpan={batchDrafts.length + 1}>
                                      <div>{item.quantity}</div>
                                      {item.quantity > 1 && batchDrafts.length > 0 && allocated > 0 && (
                                        <div className={`text-[9px] mt-0.5 font-semibold ${remaining > 0 ? 'text-amber-500' : remaining === 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                                          {remaining > 0 ? `falta ${remaining}` : remaining === 0 ? 'OK' : `excede ${-remaining}`}
                                        </div>
                                      )}
                                    </td>
                                  </>
                                )}

                                {/* Lot */}
                                <td className={`px-1.5 py-1 ${cellHighlight}`}>
                                  {canWrite ? (
                                    <input
                                      ref={el => setInputRef(`${bd.batchId}-lot`, el)}
                                      type="text"
                                      value={bd.lot}
                                      onChange={e => updateBatchDraft(item.index, bd.batchId, 'lot', e.target.value)}
                                      onKeyDown={e => handleFieldKeyDown(e, item.index, bd.batchId)}
                                      placeholder="Lote"
                                      className="w-full px-1.5 py-1 text-[11px] border rounded bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600 focus:ring-1 focus:ring-primary focus:border-primary outline-none"
                                    />
                                  ) : (
                                    <span className="text-[10px] font-mono text-slate-600 dark:text-slate-400">{bd.lot || '--'}</span>
                                  )}
                                </td>

                                {/* Expiry */}
                                <td className={`px-1.5 py-1 ${cellHighlight}`}>
                                  {canWrite ? (
                                    <input
                                      ref={el => setInputRef(`${bd.batchId}-expiry`, el)}
                                      type="text"
                                      value={bd.expiry}
                                      onChange={e => updateBatchDraft(item.index, bd.batchId, 'expiry', e.target.value)}
                                      onKeyDown={e => handleFieldKeyDown(e, item.index, bd.batchId)}
                                      placeholder="YYYY-MM-DD"
                                      className="w-full px-1.5 py-1 text-[11px] border rounded bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600 focus:ring-1 focus:ring-primary focus:border-primary outline-none"
                                    />
                                  ) : (
                                    <span className="text-[10px] text-slate-600 dark:text-slate-400">{formatBatchDate(bd.expiry) || '--'}</span>
                                  )}
                                </td>

                                {/* Lot Qty */}
                                <td className={`px-1.5 py-1 text-right ${cellHighlight}`}>
                                  {item.quantity === 1 ? (
                                    <span className="text-[11px] text-slate-500 font-mono">1</span>
                                  ) : canWrite ? (
                                    <input
                                      ref={el => setInputRef(`${bd.batchId}-quantity`, el)}
                                      type="number"
                                      value={bd.quantity}
                                      onChange={e => updateBatchDraft(item.index, bd.batchId, 'quantity', e.target.value)}
                                      onKeyDown={e => handleFieldKeyDown(e, item.index, bd.batchId)}
                                      placeholder="Qtd"
                                      min={1}
                                      className="w-full px-1.5 py-1 text-[11px] text-right border rounded bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600 focus:ring-1 focus:ring-primary focus:border-primary outline-none"
                                    />
                                  ) : (
                                    <span className="text-[10px] font-mono text-slate-600 dark:text-slate-400">{bd.quantity || '--'}</span>
                                  )}
                                </td>

                                {/* Cód. Int — only first row */}
                                {isFirst && (
                                  <td className="px-2 py-1.5 align-top" rowSpan={batchDrafts.length + 1}>
                                    {item.matchStatus === 'matched' ? (
                                      <span
                                        className="inline-flex items-center px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/40 text-[10px] font-mono font-bold text-emerald-700 dark:text-emerald-300 cursor-default"
                                        title={item.registryDescription || ''}
                                      >
                                        {item.codigoInterno}
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-900/30 text-[10px] font-bold text-red-600 dark:text-red-400">
                                        sem cód.
                                      </span>
                                    )}
                                  </td>
                                )}

                                {/* Delete batch row button */}
                                <td className="px-1 py-1">
                                  {canWrite && canDelete && (
                                    <button
                                      onClick={() => removeBatchRow(item.index, bd.batchId, bd.isNew)}
                                      className="p-0.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-slate-300 hover:text-red-500 transition-colors"
                                      title="Remover lote"
                                    >
                                      <span className="material-symbols-outlined text-[14px]">close</span>
                                    </button>
                                  )}
                                </td>
                              </tr>
                            );
                          })}

                          {/* "+ Lote" row */}
                          <tr className={rowBg}>
                            {/* Lot/Expiry/Qty columns: add button */}
                            <td colSpan={3} className="px-1.5 py-0.5">
                              {canWrite && item.quantity > 1 && (
                                <button
                                  onClick={() => addBatchRow(item)}
                                  className="inline-flex items-center gap-0.5 text-[10px] text-primary hover:text-primary/80 font-medium transition-colors"
                                >
                                  <span className="material-symbols-outlined text-[14px]">add</span>
                                  Lote
                                </button>
                              )}
                            </td>
                            {/* Delete col */}
                            <td className="px-1 py-0.5"></td>
                          </tr>
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile Cards */}
              <div className="sm:hidden p-3 space-y-2">
                {items.map(item => {
                  const batchDrafts = drafts.get(item.index) || [];
                  const anyLot = batchDrafts.some(d => d.lot.trim());
                  const borderColor = item.matchStatus === 'matched'
                    ? 'border-emerald-200 dark:border-emerald-800'
                    : 'border-red-200 dark:border-red-800';
                  const bgColor = !anyLot && isPersisted
                    ? 'bg-amber-50/50 dark:bg-amber-900/10'
                    : item.matchStatus === 'matched'
                      ? 'bg-emerald-50/30 dark:bg-emerald-900/5'
                      : 'bg-red-50/30 dark:bg-red-900/5';
                  const allocated = getAllocated(item.index);
                  const remaining = item.quantity - allocated;
                  const hasError = qtyErrors.has(item.index);

                  return (
                    <div key={item.index} className={`border rounded-xl p-3 ${borderColor} ${bgColor}`}>
                      {/* Card header */}
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="text-[10px] text-slate-400 font-mono">#{item.index}</span>
                            {item.code && <span className="text-[10px] font-mono text-slate-500">{item.code}</span>}
                            <span className={`text-[10px] ${hasError ? 'text-red-500 font-semibold' : 'text-slate-400'}`}>
                              {item.quantity} {item.unit}
                              {item.quantity > 1 && allocated > 0 && (
                                <span className={`ml-1 font-semibold ${remaining > 0 ? 'text-amber-500' : remaining === 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                                  ({remaining > 0 ? `falta ${remaining}` : remaining === 0 ? 'OK' : `excede ${-remaining}`})
                                </span>
                              )}
                            </span>
                          </div>
                          <p className="text-xs font-medium text-slate-800 dark:text-slate-200 line-clamp-2">{item.description}</p>
                        </div>
                        {item.matchStatus === 'matched' ? (
                          <span
                            className="flex-shrink-0 px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/40 text-[10px] font-mono font-bold text-emerald-700 dark:text-emerald-300"
                            title={item.registryDescription || ''}
                          >
                            {item.codigoInterno}
                          </span>
                        ) : (
                          <span className="flex-shrink-0 px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-900/30 text-[10px] font-bold text-red-600 dark:text-red-400">
                            sem cód.
                          </span>
                        )}
                      </div>

                      {/* Batch rows */}
                      <div className="space-y-2">
                        {batchDrafts.map((bd, bi) => (
                          <div key={bd.batchId} className="relative">
                            {bi > 0 && <div className="border-t border-slate-200 dark:border-slate-700 mb-2" />}
                            {canWrite ? (
                              <div className="grid grid-cols-3 gap-2">
                                <div>
                                  <label className="block text-[9px] font-semibold text-slate-400 uppercase mb-0.5">Lote</label>
                                  <input
                                    type="text"
                                    value={bd.lot}
                                    onChange={e => updateBatchDraft(item.index, bd.batchId, 'lot', e.target.value)}
                                    placeholder="Lote"
                                    className="w-full px-2 py-1.5 text-xs border rounded-lg bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600 focus:ring-1 focus:ring-primary outline-none"
                                  />
                                </div>
                                <div>
                                  <label className="block text-[9px] font-semibold text-slate-400 uppercase mb-0.5">Validade</label>
                                  <input
                                    type="text"
                                    value={bd.expiry}
                                    onChange={e => updateBatchDraft(item.index, bd.batchId, 'expiry', e.target.value)}
                                    placeholder="YYYY-MM-DD"
                                    className="w-full px-2 py-1.5 text-xs border rounded-lg bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600 focus:ring-1 focus:ring-primary outline-none"
                                  />
                                </div>
                                <div className="flex items-end gap-1">
                                  <div className="flex-1">
                                    <label className="block text-[9px] font-semibold text-slate-400 uppercase mb-0.5">Qtd</label>
                                    {item.quantity === 1 ? (
                                      <div className="px-2 py-1.5 text-xs text-slate-500 font-mono">1</div>
                                    ) : (
                                      <input
                                        type="number"
                                        value={bd.quantity}
                                        onChange={e => updateBatchDraft(item.index, bd.batchId, 'quantity', e.target.value)}
                                        placeholder="Qtd"
                                        min={1}
                                        className="w-full px-2 py-1.5 text-xs border rounded-lg bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600 focus:ring-1 focus:ring-primary outline-none"
                                      />
                                    )}
                                  </div>
                                  {batchDrafts.length > 1 && (
                                    <button
                                      onClick={() => removeBatchRow(item.index, bd.batchId, bd.isNew)}
                                      className="p-1 mb-0.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-slate-300 hover:text-red-500 transition-colors"
                                    >
                                      <span className="material-symbols-outlined text-[16px]">close</span>
                                    </button>
                                  )}
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-center gap-3 text-[10px] text-slate-600 dark:text-slate-400">
                                {bd.lot.trim() ? (
                                  <>
                                    <span>Lote: <span className="font-mono font-bold">{bd.lot}</span></span>
                                    {bd.expiry && <span>Val: {formatBatchDate(bd.expiry)}</span>}
                                    {bd.quantity && <span>Qtd: {bd.quantity}</span>}
                                  </>
                                ) : isPersisted ? (
                                  <span className="text-amber-500 font-medium">Sem lote</span>
                                ) : null}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>

                      {/* Add batch button */}
                      {canWrite && item.quantity > 1 && (
                        <button
                          onClick={() => addBatchRow(item)}
                          className="inline-flex items-center gap-0.5 mt-2 text-[10px] text-primary hover:text-primary/80 font-medium transition-colors"
                        >
                          <span className="material-symbols-outlined text-[14px]">add</span>
                          Adicionar lote
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        {!loading && items.length > 0 && (
          <div className="flex-shrink-0 px-4 sm:px-6 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
            <div className="flex items-center justify-between gap-3">
              <div className="text-xs text-slate-500 space-y-0.5">
                {totalChanges > 0 && (
                  <div className="font-medium text-amber-600 dark:text-amber-400">
                    {totalChanges} alteraç{totalChanges === 1 ? 'ão pendente' : 'ões pendentes'}
                  </div>
                )}
                {hasQtyErrors && (
                  <div className="font-medium text-red-600 dark:text-red-400 flex items-center gap-1">
                    <span className="material-symbols-outlined text-[14px]">error</span>
                    {qtyErrors.size === 1 ? '1 item' : `${qtyErrors.size} itens`} com qtd de lotes diferente da qtd total
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { if (!saving && !registering) onClose(); }}
                  className="px-4 py-2 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
                >
                  Fechar
                </button>
                {canWrite && !isPersisted && (
                  <button
                    onClick={handleRegister}
                    disabled={registering || saving || hasQtyErrors}
                    className="px-4 py-2 text-xs font-medium rounded-lg bg-primary text-white hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                  >
                    {registering ? (
                      <span className="material-symbols-outlined text-[14px] animate-spin">progress_activity</span>
                    ) : (
                      <span className="material-symbols-outlined text-[14px]">check_circle</span>
                    )}
                    {registering ? 'Registrando...' : 'Registrar Entrada'}
                  </button>
                )}
                {canWrite && isPersisted && (
                  <button
                    onClick={handleSaveAll}
                    disabled={saving || registering || totalChanges === 0 || hasQtyErrors}
                    className="px-4 py-2 text-xs font-medium rounded-lg bg-primary text-white hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                  >
                    {saving ? (
                      <span className="material-symbols-outlined text-[14px] animate-spin">progress_activity</span>
                    ) : (
                      <span className="material-symbols-outlined text-[14px]">save</span>
                    )}
                    {saving ? 'Salvando...' : 'Salvar Alterações'}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
