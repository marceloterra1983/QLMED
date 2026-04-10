'use client';

import React, { useState } from 'react';
import { toast } from 'sonner';
import { formatAmount } from '@/lib/utils';
import type { ProductRow, ProductsResponse } from '../types';
import { formatQuantity, formatDate, formatOptional } from './product-utils';

interface ExportCSVButtonProps {
  filteredCount: number;
}

export default function ExportCSVButton({ filteredCount }: ExportCSVButtonProps) {
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
    if (isExporting) return;
    setIsExporting(true);
    const toastId = toast.loading('Exportando produtos...');
    try {
      const res = await fetch('/api/products?exportAll=1&sort=lastIssue&order=desc');
      if (!res.ok) throw new Error();
      const data = (await res.json()) as ProductsResponse;
      const all = data.products || [];
      if (all.length === 0) { toast.dismiss(toastId); toast.info('Nenhum produto para exportar'); return; }
      const esc = (v: string | null | undefined) => {
        const s = v || '';
        return s.includes(';') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
      };
      const fmtNum = (v: number | null | undefined) => v != null ? String(v).replace('.', ',') : '';
      const headers = [
        'Codigo', 'Referencia', 'Produto', 'Nome Abreviado', 'Unidade', 'EAN',
        'Linha', 'Grupo', 'Subgrupo', 'Fora de Linha',
        'NCM', 'CEST', 'Origem', 'CST ICMS', 'Nome Tributacao',
        'ICMS %', 'PIS %', 'COFINS %', 'IPI %', 'FCP %', 'Obs Fiscal',
        'ANVISA', 'Status ANVISA', 'Vencimento ANVISA', 'Classe Risco', 'Processo ANVISA',
        'Produto Registrado', 'Detentor Registro', 'Fabricante', 'Pais Fabricante',
        'Ultimo Preco Compra', 'Ultimo Preco Venda', 'Qtde Total', 'Notas',
        'Data Ultima Compra', 'Data Ultima Venda', 'Ultimo Fornecedor',
      ];
      const rows = all.map((p: ProductRow) => [
        esc(p.codigo), esc(p.code), esc(p.description), esc(p.shortName), esc(p.unit), esc(p.ean),
        esc(p.productType), esc(p.productSubtype), esc(p.productSubgroup), p.outOfLine ? 'Sim' : 'Nao',
        esc(p.ncm), esc(p.fiscalCest), esc(p.fiscalOrigem), esc(p.fiscalSitTributaria), esc(p.fiscalNomeTributacao),
        fmtNum(p.fiscalIcms), fmtNum(p.fiscalPis), fmtNum(p.fiscalCofins), fmtNum(p.fiscalIpi), fmtNum(p.fiscalFcp), esc(p.fiscalObs),
        esc(p.anvisa), esc(p.anvisaStatus), formatDate(p.anvisaExpiration ?? null), esc(p.anvisaRiskClass), esc(p.anvisaProcess),
        esc(p.anvisaMatchedProductName), esc(p.anvisaHolder), esc(p.anvisaManufacturer), esc(p.anvisaManufacturerCountry),
        formatAmount(p.lastPrice), formatOptional(p.lastSalePrice), formatQuantity(p.totalQuantity), String(p.invoiceCount),
        formatDate(p.lastIssueDate), formatDate(p.lastSaleDate), esc(p.lastSupplierName),
      ]);
      const csv = '\uFEFF' + [headers.join(';'), ...rows.map((r: string[]) => r.join(';'))].join('\n');
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
      const a = document.createElement('a');
      a.href = url; a.download = `produtos-${new Date().toISOString().split('T')[0]}.csv`; a.click();
      URL.revokeObjectURL(url);
      toast.success(`${all.length.toLocaleString('pt-BR')} produtos exportados`, { id: toastId });
    } catch {
      toast.error('Erro ao exportar', { id: toastId });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <button
      onClick={handleExport}
      disabled={filteredCount === 0}
      className="hidden sm:flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-card-dark border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 transition-colors shadow-sm disabled:opacity-40"
    >
      <span className="material-symbols-outlined text-[20px]">download</span>
      Exportar
    </button>
  );
}
