'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useRole } from '@/hooks/useRole';
import { useModalBackButton } from '@/hooks/useModalBackButton';
import { formatCurrency, formatAmount } from '@/lib/utils';
import type { ProductRow } from '../types';
import { DetailSectionCard, DetailField } from './DetailSectionCard';
import { DETAIL_INPUT_CLS, formatQuantity, formatDate } from './product-utils';
import type { HierOptions } from './product-utils';

interface ProductDetailModalProps {
  product: ProductRow | null;
  onClose: () => void;
  onUpdated: () => void;
  onOpenHistory: (product: ProductRow) => void;
  hierOptions: HierOptions;
  settingsOptions: {
    nomeTributacaoOptions: string[];
    obsIcmsOptions: string[];
    obsPisCofinsOptions: string[];
    manufacturerOptions: string[];
    ncmOptions: string[];
    cestOptions: string[];
    aliqIcmsOptions: string[];
    aliqPisOptions: string[];
    aliqCofinsOptions: string[];
    aliqIpiOptions: string[];
    aliqFcpOptions: string[];
  };
  initialSections?: string[];
}

export default function ProductDetailModal({ product: initialProduct, onClose, onUpdated, onOpenHistory, hierOptions, settingsOptions, initialSections }: ProductDetailModalProps) {
  const { canWrite } = useRole();

  const [detailProduct, setDetailProduct] = useState<ProductRow | null>(initialProduct);
  const [detailAnvisa, setDetailAnvisa] = useState('');
  const [detailNcm, setDetailNcm] = useState('');
  const [detailNcmInfo, setDetailNcmInfo] = useState<{ hierarchy: Array<{ codigo: string; descricao: string }>; fullDescription: string } | null>(null);
  const [detailNcmExpanded, setDetailNcmExpanded] = useState(false);
  const [ncmSuggestions, setNcmSuggestions] = useState<Array<{ codigo: string; descricao: string; fullDescription: string }>>([]);
  const ncmInputRef = useRef<HTMLInputElement>(null);
  const [detailType, setDetailType] = useState('');
  const [detailSubtype, setDetailSubtype] = useState('');
  const [detailSubgroup, setDetailSubgroup] = useState('');
  const [detailNewMode, setDetailNewMode] = useState({ type: false, subtype: false, subgroup: false });
  const [detailRefs, setDetailRefs] = useState<string[]>([]);
  const [detailDescription, setDetailDescription] = useState('');
  const [detailManufacturer, setDetailManufacturer] = useState('');
  const [detailDefaultSupplier, setDetailDefaultSupplier] = useState('');
  const [detailShortName, setDetailShortName] = useState('');
  const [detailSitTributaria, setDetailSitTributaria] = useState('');
  const [detailNomeTributacao, setDetailNomeTributacao] = useState('');
  const [detailIcms, setDetailIcms] = useState('');
  const [detailPis, setDetailPis] = useState('');
  const [detailCofins, setDetailCofins] = useState('');
  const [detailFiscalObs, setDetailFiscalObs] = useState('');
  const [detailCest, setDetailCest] = useState('');
  const [detailOrigem, setDetailOrigem] = useState('');
  const [detailIpi, setDetailIpi] = useState('');
  const [detailFcp, setDetailFcp] = useState('');
  const [detailCstIpi, setDetailCstIpi] = useState('');
  const [detailCstPis, setDetailCstPis] = useState('');
  const [detailCstCofins, setDetailCstCofins] = useState('');
  const [detailObsIcms, setDetailObsIcms] = useState('');
  const [detailObsPisCofins, setDetailObsPisCofins] = useState('');
  const [detailOpenSections, setDetailOpenSections] = useState<Set<string>>(new Set());
  const [detailScrollTo, setDetailScrollTo] = useState<string | null>(null);
  const toggleDetailSection = (s: string) => setDetailOpenSections((prev) => { const n = new Set(prev); n.has(s) ? n.delete(s) : n.add(s); return n; });

  const [savingDetail, setSavingDetail] = useState(false);
  const [syncingRegistry, setSyncingRegistry] = useState(false);
  const [anvisaValidation, setAnvisaValidation] = useState<{
    status: string | null;
    productName: string | null;
    company: string | null;
    expiration: string | null;
    riskClass: string | null;
    notFound?: boolean;
    loading?: boolean;
  } | null>(null);

  // Initialize state when product changes
  useEffect(() => {
    if (!initialProduct) return;
    const product = initialProduct;
    setDetailProduct(product);
    setDetailAnvisa(product.anvisa || '');
    setDetailNcm(product.ncm || '');
    setDetailType(product.productType || '');
    setDetailSubtype(product.productSubtype || '');
    setDetailSubgroup(product.productSubgroup || '');
    setDetailNewMode({ type: false, subtype: false, subgroup: false });
    setDetailRefs(product.productRefs || []);
    setDetailDescription(product.description || '');
    setDetailManufacturer(product.manufacturerShortName || '');
    setDetailDefaultSupplier(product.defaultSupplier || '');
    setDetailShortName(product.shortName || '');
    setDetailSitTributaria(product.fiscalSitTributaria || '');
    setDetailNomeTributacao(product.fiscalNomeTributacao || '');
    setDetailIcms(product.fiscalIcms != null ? String(product.fiscalIcms) : '');
    setDetailPis(product.fiscalPis != null ? String(product.fiscalPis) : '');
    setDetailCofins(product.fiscalCofins != null ? String(product.fiscalCofins) : '');
    setDetailFiscalObs(product.fiscalObs || '');
    setDetailCest(product.fiscalCest || '');
    setDetailOrigem(product.fiscalOrigem || '');
    setDetailIpi(product.fiscalIpi != null ? String(product.fiscalIpi) : '');
    setDetailFcp(product.fiscalFcp != null ? String(product.fiscalFcp) : '');
    setDetailCstIpi(product.fiscalCstIpi || '');
    setDetailCstPis(product.fiscalCstPis || '');
    setDetailCstCofins(product.fiscalCstCofins || '');
    setDetailObsIcms(product.fiscalObsIcms || '');
    setDetailObsPisCofins(product.fiscalObsPisCofins || '');
    const nextOpenSections = new Set(initialSections || []);
    nextOpenSections.add('geral');
    setDetailOpenSections(nextOpenSections);
    setDetailScrollTo(initialSections?.length ? initialSections[0] : null);

    // Load full details in background
    fetch(`/api/products/details?key=${encodeURIComponent(product.key)}`)
      .then(r => r.ok ? r.json() : null)
      .then((full: ProductRow | null) => {
        if (!full) return;
        setDetailProduct(full);
        setDetailAnvisa(full.anvisa || '');
        setDetailNcm(full.ncm || '');
        setDetailType(full.productType || '');
        setDetailSubtype(full.productSubtype || '');
        setDetailSubgroup(full.productSubgroup || '');
        setDetailRefs(full.productRefs || []);
        setDetailDescription(full.description || '');
        setDetailManufacturer(full.manufacturerShortName || '');
        setDetailDefaultSupplier(full.defaultSupplier || '');
        setDetailShortName(full.shortName || '');
        setDetailSitTributaria(full.fiscalSitTributaria || '');
        setDetailNomeTributacao(full.fiscalNomeTributacao || '');
        setDetailIcms(full.fiscalIcms != null ? String(full.fiscalIcms) : '');
        setDetailPis(full.fiscalPis != null ? String(full.fiscalPis) : '');
        setDetailCofins(full.fiscalCofins != null ? String(full.fiscalCofins) : '');
        setDetailFiscalObs(full.fiscalObs || '');
        setDetailCest(full.fiscalCest || '');
        setDetailOrigem(full.fiscalOrigem || '');
        setDetailIpi(full.fiscalIpi != null ? String(full.fiscalIpi) : '');
        setDetailFcp(full.fiscalFcp != null ? String(full.fiscalFcp) : '');
        setDetailCstIpi(full.fiscalCstIpi || '');
        setDetailCstPis(full.fiscalCstPis || '');
        setDetailCstCofins(full.fiscalCstCofins || '');
        setDetailObsIcms(full.fiscalObsIcms || '');
        setDetailObsPisCofins(full.fiscalObsPisCofins || '');
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialProduct?.key]);

  // Scroll to section
  useEffect(() => {
    if (!detailScrollTo) return;
    const timer = setTimeout(() => {
      const el = document.querySelector(`[data-section-id="${detailScrollTo}"]`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setDetailScrollTo(null);
    }, 100);
    return () => clearTimeout(timer);
  }, [detailScrollTo]);

  // ANVISA real-time validation with debounce
  useEffect(() => {
    const digits = detailAnvisa.replace(/\D/g, '');
    if (digits.length < 7) { setAnvisaValidation(null); return; }
    setAnvisaValidation({ status: null, productName: null, company: null, expiration: null, riskClass: null, loading: true });
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/anvisa/validate?code=${digits}`);
        if (res.ok) {
          const data = await res.json();
          setAnvisaValidation({
            status: data.status,
            productName: data.productName,
            company: data.company,
            expiration: data.expiration,
            riskClass: data.riskClass,
            notFound: data.notFound || false,
          });
        } else {
          setAnvisaValidation(null);
        }
      } catch {
        setAnvisaValidation(null);
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [detailAnvisa]);

  // NCM description lookup with debounce
  useEffect(() => {
    const digits = detailNcm.replace(/\D/g, '');
    if (digits.length < 4) { setDetailNcmInfo(null); setNcmSuggestions([]); setDetailNcmExpanded(false); return; }
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/ncm/${digits}`);
        if (res.ok) {
          const data = await res.json();
          setDetailNcmInfo({ hierarchy: data.hierarchy || [], fullDescription: data.fullDescription || data.descricao || '' });
        } else {
          setDetailNcmInfo(null);
        }
        if (digits.length < 8) {
          const sRes = await fetch(`/api/ncm/search?q=${digits}&limit=8`);
          if (sRes.ok) {
            setNcmSuggestions(await sRes.json());
          }
        } else {
          setNcmSuggestions([]);
        }
      } catch {
        setDetailNcmInfo(null);
        setNcmSuggestions([]);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [detailNcm]);

  // Mobile back button
  const handleClose = useCallback(() => onClose(), [onClose]);
  useModalBackButton(!!initialProduct, handleClose);

  if (!detailProduct) return null;

  const detailDirty =
    JSON.stringify(detailRefs) !== JSON.stringify(detailProduct.productRefs || []) ||
    detailDescription !== (detailProduct.description || '') ||
    detailManufacturer !== (detailProduct.manufacturerShortName || '') ||
    detailDefaultSupplier !== (detailProduct.defaultSupplier || '') ||
    detailAnvisa !== (detailProduct.anvisa || '') ||
    detailNcm !== (detailProduct.ncm || '') ||
    detailType !== (detailProduct.productType || '') ||
    detailSubtype !== (detailProduct.productSubtype || '') ||
    detailSubgroup !== (detailProduct.productSubgroup || '') ||
    detailShortName !== (detailProduct.shortName || '') ||
    detailSitTributaria !== (detailProduct.fiscalSitTributaria || '') ||
    detailNomeTributacao !== (detailProduct.fiscalNomeTributacao || '') ||
    detailIcms !== (detailProduct.fiscalIcms != null ? String(detailProduct.fiscalIcms) : '') ||
    detailPis !== (detailProduct.fiscalPis != null ? String(detailProduct.fiscalPis) : '') ||
    detailCofins !== (detailProduct.fiscalCofins != null ? String(detailProduct.fiscalCofins) : '') ||
    detailFiscalObs !== (detailProduct.fiscalObs || '') ||
    detailCest !== (detailProduct.fiscalCest || '') ||
    detailOrigem !== (detailProduct.fiscalOrigem || '') ||
    detailIpi !== (detailProduct.fiscalIpi != null ? String(detailProduct.fiscalIpi) : '') ||
    detailFcp !== (detailProduct.fiscalFcp != null ? String(detailProduct.fiscalFcp) : '') ||
    detailCstIpi !== (detailProduct.fiscalCstIpi || '') ||
    detailCstPis !== (detailProduct.fiscalCstPis || '') ||
    detailCstCofins !== (detailProduct.fiscalCstCofins || '') ||
    detailObsIcms !== (detailProduct.fiscalObsIcms || '') ||
    detailObsPisCofins !== (detailProduct.fiscalObsPisCofins || '');

  const handleToggleOutOfLine = async () => {
    const newVal = !detailProduct.outOfLine;
    try {
      const res = await fetch('/api/products/bulk-update', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          products: [{ productKey: detailProduct.key, code: detailProduct.code, description: detailProduct.description, ncm: detailProduct.ncm, unit: detailProduct.unit, ean: detailProduct.ean }],
          fields: { outOfLine: newVal },
        }),
      });
      if (!res.ok) throw new Error();
      setDetailProduct((prev) => prev ? { ...prev, outOfLine: newVal } : prev);
      toast.success(newVal ? 'Produto marcado como fora de linha' : 'Produto restaurado para em linha');
    } catch {
      toast.error('Erro ao atualizar produto');
    }
  };

  const handleToggleInstrumental = async () => {
    const newVal = !detailProduct.instrumental;
    try {
      const res = await fetch('/api/products/bulk-update', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          products: [{ productKey: detailProduct.key, code: detailProduct.code, description: detailProduct.description, ncm: detailProduct.ncm, unit: detailProduct.unit, ean: detailProduct.ean }],
          fields: { instrumental: newVal },
        }),
      });
      if (!res.ok) throw new Error();
      setDetailProduct((prev) => prev ? { ...prev, instrumental: newVal } : prev);
      toast.success(newVal ? 'Produto marcado como instrumental' : 'Produto desmarcado como instrumental');
    } catch {
      toast.error('Erro ao atualizar produto');
    }
  };

  const handleSaveDetail = async () => {
    if (!detailProduct) return;
    setSavingDetail(true);
    const fields: Record<string, string | number | string[] | null> = {};

    const anvisaDigits = detailAnvisa.replace(/\D/g, '');
    if (detailAnvisa !== (detailProduct.anvisa || '')) {
      if (anvisaDigits && anvisaDigits.length !== 11) {
        toast.error('Codigo ANVISA invalido. Informe exatamente 11 digitos.');
        setSavingDetail(false);
        return;
      }
      fields.anvisa = anvisaDigits || null;
    }
    if (detailNcm !== (detailProduct.ncm || '')) fields.ncm = detailNcm.trim() || null;
    if (detailType !== (detailProduct.productType || '')) fields.productType = detailType.trim() || null;
    if (detailSubtype !== (detailProduct.productSubtype || '')) fields.productSubtype = detailSubtype.trim() || null;
    if (detailSubgroup !== (detailProduct.productSubgroup || '')) fields.productSubgroup = detailSubgroup.trim() || null;
    if (JSON.stringify(detailRefs) !== JSON.stringify(detailProduct.productRefs || [])) fields.productRefs = detailRefs.map(r => r.trim()).filter(Boolean);
    if (detailDescription !== (detailProduct.description || '') && detailDescription.trim()) fields.description = detailDescription.trim();
    if (detailManufacturer !== (detailProduct.manufacturerShortName || '')) fields.manufacturerShortName = detailManufacturer.trim() || null;
    if (detailDefaultSupplier !== (detailProduct.defaultSupplier || '')) fields.defaultSupplier = detailDefaultSupplier.trim() || null;
    if (detailShortName !== (detailProduct.shortName || '')) fields.shortName = detailShortName.trim() || null;
    if (detailSitTributaria !== (detailProduct.fiscalSitTributaria || '')) fields.fiscalSitTributaria = detailSitTributaria.trim() || null;
    if (detailNomeTributacao !== (detailProduct.fiscalNomeTributacao || '')) fields.fiscalNomeTributacao = detailNomeTributacao.trim() || null;
    if (detailIcms !== (detailProduct.fiscalIcms != null ? String(detailProduct.fiscalIcms) : '')) fields.fiscalIcms = detailIcms.trim() ? Number(detailIcms) : null;
    if (detailPis !== (detailProduct.fiscalPis != null ? String(detailProduct.fiscalPis) : '')) fields.fiscalPis = detailPis.trim() ? Number(detailPis) : null;
    if (detailCofins !== (detailProduct.fiscalCofins != null ? String(detailProduct.fiscalCofins) : '')) fields.fiscalCofins = detailCofins.trim() ? Number(detailCofins) : null;
    if (detailFiscalObs !== (detailProduct.fiscalObs || '')) fields.fiscalObs = detailFiscalObs.trim() || null;
    if (detailCest !== (detailProduct.fiscalCest || '')) fields.fiscalCest = detailCest.trim() || null;
    if (detailOrigem !== (detailProduct.fiscalOrigem || '')) fields.fiscalOrigem = detailOrigem.trim() || null;
    if (detailIpi !== (detailProduct.fiscalIpi != null ? String(detailProduct.fiscalIpi) : '')) fields.fiscalIpi = detailIpi.trim() ? Number(detailIpi) : null;
    if (detailFcp !== (detailProduct.fiscalFcp != null ? String(detailProduct.fiscalFcp) : '')) fields.fiscalFcp = detailFcp.trim() ? Number(detailFcp) : null;
    if (detailCstIpi !== (detailProduct.fiscalCstIpi || '')) fields.fiscalCstIpi = detailCstIpi.trim() || null;
    if (detailCstPis !== (detailProduct.fiscalCstPis || '')) fields.fiscalCstPis = detailCstPis.trim() || null;
    if (detailCstCofins !== (detailProduct.fiscalCstCofins || '')) fields.fiscalCstCofins = detailCstCofins.trim() || null;
    if (detailObsIcms !== (detailProduct.fiscalObsIcms || '')) fields.fiscalObsIcms = detailObsIcms.trim() || null;
    if (detailObsPisCofins !== (detailProduct.fiscalObsPisCofins || '')) fields.fiscalObsPisCofins = detailObsPisCofins.trim() || null;

    if (Object.keys(fields).length === 0) { setSavingDetail(false); return; }

    try {
      if (detailNewMode.type && fields.productType) {
        await fetch('/api/products/rename-type', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'addLine', name: fields.productType }) });
      }
      if (detailNewMode.subtype && fields.productSubtype) {
        await fetch('/api/products/rename-type', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'addGroup', parentType: fields.productType || detailType, subtypeName: fields.productSubtype }) });
      }
      if (detailNewMode.subgroup && fields.productSubgroup) {
        await fetch('/api/products/rename-type', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'addSubgroup', parentType: fields.productType || detailType, parentSubtype: fields.productSubtype || detailSubtype, subgroupName: fields.productSubgroup }) });
      }

      const res = await fetch('/api/products/bulk-update', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          products: [{ productKey: detailProduct.key, code: detailProduct.code, description: detailProduct.description, ncm: detailProduct.ncm, unit: detailProduct.unit, ean: detailProduct.ean }],
          fields,
        }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e?.error || 'Falha'); }
      toast.success('Produto atualizado');
      onClose();
      onUpdated();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao salvar');
    } finally {
      setSavingDetail(false);
    }
  };

  const handleSyncRegistry = async () => {
    if (syncingRegistry || !detailProduct.anvisa) return;
    setSyncingRegistry(true);
    const toastId = toast.loading('Consultando ANVISA...');
    try {
      const res = await fetch('/api/products/anvisa/sync-registry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'selected', productKeys: [detailProduct.key] }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      if (data.notFound > 0) {
        toast.warning('Registro nao encontrado na base da ANVISA.', { id: toastId });
      } else {
        toast.success('Dados do registro ANVISA atualizados!', { id: toastId });
      }
      onUpdated();
    } catch {
      toast.error('Erro ao consultar a ANVISA', { id: toastId });
    } finally {
      setSyncingRegistry(false);
    }
  };

  const { nomeTributacaoOptions, obsIcmsOptions, obsPisCofinsOptions, manufacturerOptions, ncmOptions, cestOptions, aliqIcmsOptions, aliqPisOptions, aliqCofinsOptions, aliqIpiOptions, aliqFcpOptions } = settingsOptions;

  const anvisaStatusColor = detailProduct.anvisaStatus?.toLowerCase().includes('valid')
    ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800'
    : detailProduct.anvisaStatus?.toLowerCase().includes('vencid') || detailProduct.anvisaStatus?.toLowerCase().includes('cancel')
    ? 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
    : 'text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700';

  return (
    <div className="fixed inset-0 z-50 !mt-0 sm:flex sm:items-center sm:justify-center sm:p-4 sm:bg-black/60 sm:backdrop-blur-sm" onClick={onClose}>
      <div className="absolute inset-0 sm:relative sm:inset-auto bg-slate-50 dark:bg-[#1a1e2e] sm:rounded-2xl w-full sm:max-w-6xl sm:h-auto sm:max-h-[90vh] flex flex-col overflow-hidden sm:shadow-2xl sm:ring-1 ring-black/5 dark:ring-white/5" onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="px-4 sm:px-6 py-4 bg-white dark:bg-card-dark border-b border-slate-200 dark:border-slate-700 shrink-0 shadow-[0_2px_8px_rgba(0,0,0,0.08)] sm:shadow-none">
          {detailProduct.outOfLine && (
            <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-red-400 via-red-500 to-red-400" />
          )}
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 dark:from-primary/30 dark:to-primary/10 flex items-center justify-center ring-1 ring-primary/20 dark:ring-primary/30">
              <span className="material-symbols-outlined text-[22px] text-primary">inventory_2</span>
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-[15px] font-bold text-slate-900 dark:text-white leading-snug">
                {detailProduct.codigo && <><span className="font-mono text-emerald-600 dark:text-emerald-400">{detailProduct.codigo}</span><span className="text-slate-300 dark:text-slate-600 mx-1.5">/</span></>}
                {detailProduct.code && <><span className="font-mono text-blue-600 dark:text-blue-400">{detailProduct.code}</span><span className="text-slate-300 dark:text-slate-600 mx-1.5">/</span></>}
                {detailProduct.description}
              </h3>
              {detailProduct.shortName && (
                <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-0.5">{detailProduct.shortName}</p>
              )}
              <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                {detailProduct.outOfLine && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-[10px] font-bold text-red-600 dark:text-red-400">
                    <span className="material-symbols-outlined text-[11px]">block</span>Fora de Linha
                  </span>
                )}
                {detailProduct.productType && (
                  <span className="px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200/60 dark:border-indigo-800/40 text-[10px] font-bold text-indigo-600 dark:text-indigo-400">{detailProduct.productType}</span>
                )}
                {detailProduct.productSubtype && (
                  <span className="px-2 py-0.5 rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-200/60 dark:border-amber-800/40 text-[10px] font-bold text-amber-600 dark:text-amber-400">{detailProduct.productSubtype}</span>
                )}
                {detailProduct.productSubgroup && (
                  <span className="px-2 py-0.5 rounded-md bg-teal-50 dark:bg-teal-900/20 border border-teal-200/60 dark:border-teal-800/40 text-[10px] font-bold text-teal-600 dark:text-teal-400">{detailProduct.productSubgroup}</span>
                )}
                {detailProduct.ean && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-700/60 text-[10px] font-mono font-medium text-slate-500 dark:text-slate-400">
                    EAN {detailProduct.ean}
                  </span>
                )}
                {detailProduct.anvisa && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-teal-50 dark:bg-teal-900/20 border border-teal-200/60 dark:border-teal-800/40 text-[10px] font-mono font-bold text-teal-600 dark:text-teal-400">
                    <span className="material-symbols-outlined text-[11px]">verified</span>{detailProduct.anvisa}
                  </span>
                )}
              </div>
            </div>
            <button onClick={onClose} className="hidden sm:flex flex-shrink-0 p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
              <span className="material-symbols-outlined text-[20px]">close</span>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 p-4 sm:p-5 space-y-3">
          {/* Card: Dados Gerais */}
          <DetailSectionCard id="geral" icon="analytics" iconColor="text-emerald-500" title="Dados Gerais" isOpen={detailOpenSections.has('geral')} onToggle={toggleDetailSection}>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mt-2">
              {[
                { label: 'Ultimo Preco', value: formatAmount(detailProduct.lastPrice), icon: 'trending_up', color: 'text-emerald-500 bg-emerald-500/10 ring-emerald-500/20' },
                { label: 'Qtde Total', value: formatQuantity(detailProduct.totalQuantity), icon: 'inventory_2', color: 'text-blue-500 bg-blue-500/10 ring-blue-500/20' },
                { label: 'Notas', value: String(detailProduct.invoiceCount), icon: 'receipt_long', color: 'text-amber-500 bg-amber-500/10 ring-amber-500/20' },
                { label: 'Ultima Compra', value: formatDate(detailProduct.lastIssueDate), icon: 'calendar_month', color: 'text-violet-500 bg-violet-500/10 ring-violet-500/20' },
              ].map(s => (
                <div key={s.label} className="flex items-center gap-2 px-2.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800/40 ring-1 ring-slate-200/50 dark:ring-slate-700/50">
                  <div className={`w-6 h-6 rounded-md flex items-center justify-center ring-1 shrink-0 ${s.color}`}>
                    <span className="material-symbols-outlined text-[13px]">{s.icon}</span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">{s.label}</p>
                    <p className="text-[12px] font-bold text-slate-800 dark:text-white truncate">{s.value}</p>
                  </div>
                </div>
              ))}
            </div>
          </DetailSectionCard>

          {/* Card: Dados do Cadastro */}
          <DetailSectionCard id="cadastro" icon="edit_note" iconColor="text-primary" title="Dados do Cadastro" isOpen={detailOpenSections.has('cadastro')} onToggle={toggleDetailSection}>
            <div className="space-y-2 mt-1">
              {/* Referencias */}
              <div>
                <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Referencia</p>
                <div className="flex flex-wrap items-center gap-1.5">
                  <div className="flex items-center gap-1 px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40">
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wide shrink-0">Ref 1</span>
                    <input type="text" value={detailProduct.code || '\u2014'} readOnly disabled size={Math.max(4, (detailProduct.code || '\u2014').length)} className="font-mono text-[13px] text-slate-600 dark:text-slate-300 bg-transparent border-0 outline-none p-0 min-w-0" />
                  </div>
                  {detailRefs.map((ref, idx) => (
                    <div key={idx} className="flex items-center gap-1 px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/50 focus-within:ring-2 focus-within:ring-primary/40 focus-within:border-primary transition-shadow">
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wide shrink-0">Ref {idx + 2}</span>
                      <input type="text" value={ref} onChange={(e) => { const next = [...detailRefs]; next[idx] = e.target.value; setDetailRefs(next); }} size={Math.max(6, ref.length + 1)} maxLength={100} placeholder="\u2014" disabled={!canWrite} className="font-mono text-[13px] text-slate-800 dark:text-slate-200 bg-transparent border-0 outline-none p-0 min-w-0 disabled:cursor-not-allowed" />
                      {canWrite && (
                        <button type="button" onClick={() => setDetailRefs(detailRefs.filter((_, i) => i !== idx))} className="shrink-0 ml-0.5 text-slate-300 hover:text-red-500 transition-colors" title="Remover">
                          <span className="material-symbols-outlined text-[13px]">close</span>
                        </button>
                      )}
                    </div>
                  ))}
                  {canWrite && (
                    <button type="button" onClick={() => setDetailRefs([...detailRefs, ''])} className="flex items-center gap-1 px-2 py-1.5 rounded-lg border border-dashed border-primary/40 text-primary hover:bg-primary/5 transition-colors text-[11px] font-medium">
                      <span className="material-symbols-outlined text-[13px]">add</span>
                      Adicionar
                    </button>
                  )}
                </div>
              </div>

              <div className="flex gap-2 items-start">
                <div className="shrink-0">
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1.5">Codigo Interno</label>
                  <input type="text" value={detailProduct.codigo || '\u2014'} readOnly disabled className={`${DETAIL_INPUT_CLS} font-mono w-28`} />
                </div>
                <div className="flex-1">
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1.5">Nome Abreviado</label>
                  <input type="text" value={detailShortName} onChange={(e) => setDetailShortName(e.target.value)} maxLength={100} placeholder="Nome curto para identificacao rapida" disabled={!canWrite} className={DETAIL_INPUT_CLS} />
                </div>
              </div>

              <DetailField label="Nome do Produto" colSpan2>
                <input type="text" value={detailDescription} onChange={(e) => setDetailDescription(e.target.value)} maxLength={500} placeholder="Nome completo do produto" disabled={!canWrite} className={DETAIL_INPUT_CLS} />
              </DetailField>

              <div className="grid grid-cols-2 gap-2">
                <DetailField label="Fabricante">
                  <select value={detailManufacturer} onChange={(e) => setDetailManufacturer(e.target.value)} disabled={!canWrite} className={DETAIL_INPUT_CLS}>
                    <option value="">{'\u2014 Nenhum \u2014'}</option>
                    {manufacturerOptions.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                    {detailManufacturer && !manufacturerOptions.includes(detailManufacturer) && (
                      <option value={detailManufacturer}>{detailManufacturer}</option>
                    )}
                  </select>
                </DetailField>
                <DetailField label="Fornecedor Padrao">
                  <input type="text" value={detailDefaultSupplier} onChange={(e) => setDetailDefaultSupplier(e.target.value)} maxLength={200} placeholder="Nome do fornecedor" disabled={!canWrite} className={DETAIL_INPUT_CLS} />
                </DetailField>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <DetailField label="Linha">
                  {detailNewMode.type ? (
                    <div className="flex gap-1">
                      <input autoFocus type="text" value={detailType} onChange={(e) => setDetailType(e.target.value)} placeholder="Nova linha" disabled={!canWrite} className={DETAIL_INPUT_CLS} />
                      <button type="button" onClick={() => { setDetailNewMode((m) => ({ ...m, type: false })); setDetailType(''); }} className="px-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0"><span className="material-symbols-outlined text-[16px]">close</span></button>
                    </div>
                  ) : (
                    <select value={detailType} onChange={(e) => { if (e.target.value === '__new__') { setDetailNewMode((m) => ({ ...m, type: true })); setDetailType(''); } else { setDetailType(e.target.value); } }} disabled={!canWrite} className={DETAIL_INPUT_CLS}>
                      <option value="">{'\u2014 Nenhuma \u2014'}</option>
                      {hierOptions.lines.map((t) => <option key={t} value={t}>{t}</option>)}
                      <option value="__new__">+ Criar nova...</option>
                    </select>
                  )}
                </DetailField>
                <DetailField label="Grupo">
                  {detailNewMode.subtype ? (
                    <div className="flex gap-1">
                      <input autoFocus type="text" value={detailSubtype} onChange={(e) => setDetailSubtype(e.target.value)} placeholder="Novo grupo" disabled={!canWrite} className={DETAIL_INPUT_CLS} />
                      <button type="button" onClick={() => { setDetailNewMode((m) => ({ ...m, subtype: false })); setDetailSubtype(''); }} className="px-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0"><span className="material-symbols-outlined text-[16px]">close</span></button>
                    </div>
                  ) : (
                    <select value={detailSubtype} onChange={(e) => { if (e.target.value === '__new__') { setDetailNewMode((m) => ({ ...m, subtype: true })); setDetailSubtype(''); } else { setDetailSubtype(e.target.value); } }} disabled={!canWrite} className={DETAIL_INPUT_CLS}>
                      <option value="">{'\u2014 Nenhum \u2014'}</option>
                      {detailType ? (
                        hierOptions.groupsFor(detailType).map((s) => <option key={s} value={s}>{s}</option>)
                      ) : (
                        <>
                          {hierOptions.groupsByLine.map((entry) => (
                            <optgroup key={entry.line} label={entry.line}>
                              {entry.groups.map((g) => <option key={g} value={g}>{g}</option>)}
                            </optgroup>
                          ))}
                          {hierOptions.orphanGroups.length > 0 && (
                            <optgroup label="Outros">
                              {hierOptions.orphanGroups.map((g) => <option key={g} value={g}>{g}</option>)}
                            </optgroup>
                          )}
                        </>
                      )}
                      <option value="__new__">+ Criar novo...</option>
                    </select>
                  )}
                </DetailField>
                <DetailField label="Subgrupo">
                  {detailNewMode.subgroup ? (
                    <div className="flex gap-1">
                      <input autoFocus type="text" value={detailSubgroup} onChange={(e) => setDetailSubgroup(e.target.value)} placeholder="Novo subgrupo" disabled={!canWrite} className={DETAIL_INPUT_CLS} />
                      <button type="button" onClick={() => { setDetailNewMode((m) => ({ ...m, subgroup: false })); setDetailSubgroup(''); }} className="px-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0"><span className="material-symbols-outlined text-[16px]">close</span></button>
                    </div>
                  ) : (
                    <select value={detailSubgroup} onChange={(e) => { if (e.target.value === '__new__') { setDetailNewMode((m) => ({ ...m, subgroup: true })); setDetailSubgroup(''); } else { setDetailSubgroup(e.target.value); } }} disabled={!canWrite} className={DETAIL_INPUT_CLS}>
                      <option value="">{'\u2014 Nenhum \u2014'}</option>
                      {detailType && detailSubtype ? (
                        hierOptions.subgroupsFor(detailType, detailSubtype).map((s) => <option key={s} value={s}>{s}</option>)
                      ) : detailSubtype ? (
                        hierOptions.subgroupsForGroup(detailSubtype).map((s) => <option key={s} value={s}>{s}</option>)
                      ) : (
                        <>
                          {hierOptions.subgroupsByGroup.map((entry) => (
                            <optgroup key={entry.group} label={entry.group}>
                              {entry.subgroups.map((s) => <option key={s} value={s}>{s}</option>)}
                            </optgroup>
                          ))}
                          {hierOptions.orphanSubgroups.length > 0 && (
                            <optgroup label="Outros">
                              {hierOptions.orphanSubgroups.map((s) => <option key={s} value={s}>{s}</option>)}
                            </optgroup>
                          )}
                        </>
                      )}
                      <option value="__new__">+ Criar novo...</option>
                    </select>
                  )}
                </DetailField>
              </div>

              {detailProduct.lastSupplierName && (
                <div className="flex items-center gap-1.5 text-[12px] text-slate-400">
                  <span className="material-symbols-outlined text-[14px] text-orange-500">local_shipping</span>
                  <span>Fabricante:</span>
                  <span className="font-medium text-slate-700 dark:text-slate-300">{detailProduct.lastSupplierName}</span>
                </div>
              )}

              <div className="flex gap-2">
                <label className={`flex-1 flex items-center gap-2.5 cursor-pointer px-2.5 py-2 rounded-xl border transition-colors ${detailProduct.outOfLine ? 'border-red-200 dark:border-red-800/50 bg-red-50/50 dark:bg-red-900/10' : 'border-dashed border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/30'}`}>
                  <div className="relative">
                    <input type="checkbox" checked={!!detailProduct.outOfLine} disabled={!canWrite} onChange={handleToggleOutOfLine} className="sr-only peer" />
                    <div className="w-9 h-5 bg-slate-300 dark:bg-slate-600 rounded-full peer-checked:bg-red-500 peer-disabled:opacity-50 transition-colors"></div>
                    <div className="absolute left-0.5 top-0.5 w-4 h-4 bg-white rounded-full shadow-sm peer-checked:translate-x-4 transition-transform"></div>
                  </div>
                  <span className={`text-[12px] font-semibold ${detailProduct.outOfLine ? 'text-red-600 dark:text-red-400' : 'text-slate-500 dark:text-slate-400'}`}>Fora de Linha</span>
                </label>
                <label className={`flex-1 flex items-center gap-2.5 cursor-pointer px-2.5 py-2 rounded-xl border transition-colors ${detailProduct.instrumental ? 'border-violet-200 dark:border-violet-800/50 bg-violet-50/50 dark:bg-violet-900/10' : 'border-dashed border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/30'}`}>
                  <div className="relative">
                    <input type="checkbox" checked={!!detailProduct.instrumental} disabled={!canWrite} onChange={handleToggleInstrumental} className="sr-only peer" />
                    <div className="w-9 h-5 bg-slate-300 dark:bg-slate-600 rounded-full peer-checked:bg-violet-500 peer-disabled:opacity-50 transition-colors"></div>
                    <div className="absolute left-0.5 top-0.5 w-4 h-4 bg-white rounded-full shadow-sm peer-checked:translate-x-4 transition-transform"></div>
                  </div>
                  <span className={`text-[12px] font-semibold ${detailProduct.instrumental ? 'text-violet-600 dark:text-violet-400' : 'text-slate-500 dark:text-slate-400'}`}>Instrumental</span>
                </label>
              </div>
            </div>
          </DetailSectionCard>

          {/* Card: Dados Fiscais */}
          <DetailSectionCard id="fiscal" icon="receipt_long" iconColor="text-amber-500" title="Dados Fiscais" isOpen={detailOpenSections.has('fiscal')} onToggle={toggleDetailSection}>
            <div className="space-y-2 mt-1">
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <DetailField label="NCM">
                    <select value={detailNcm} onChange={(e) => setDetailNcm(e.target.value)} disabled={!canWrite} className={`${DETAIL_INPUT_CLS} font-mono`}>
                      <option value="">{'\u2014'}</option>
                      {detailNcm && !ncmOptions.includes(detailNcm) && <option value={detailNcm}>{detailNcm}</option>}
                      {ncmOptions.map((v) => <option key={v} value={v}>{v}</option>)}
                    </select>
                    {detailNcmInfo && detailNcmInfo.hierarchy.length > 0 && (() => {
                      const levels = detailNcmInfo.hierarchy;
                      const last = levels[levels.length - 1];
                      const hasMore = levels.length > 1;
                      return (
                        <div className="mt-1">
                          {!detailNcmExpanded && (
                            <div className="flex items-center gap-1.5">
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] leading-tight bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 font-semibold">
                                <span className="font-mono opacity-70">{last.codigo}</span>
                                <span>{last.descricao}</span>
                              </span>
                              {hasMore && (
                                <button type="button" onClick={() => setDetailNcmExpanded(true)} className="text-[10px] text-amber-500 dark:text-amber-400 hover:underline whitespace-nowrap">ver hierarquia</button>
                              )}
                            </div>
                          )}
                          {detailNcmExpanded && (
                            <div className="flex flex-wrap items-center gap-1">
                              {levels.map((level, i) => (
                                <React.Fragment key={level.codigo}>
                                  {i > 0 && <span className="material-symbols-outlined text-[12px] text-slate-300 dark:text-slate-600">chevron_right</span>}
                                  <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] leading-tight ${i === levels.length - 1 ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 font-semibold' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'}`}>
                                    <span className="font-mono opacity-70">{level.codigo}</span>
                                    <span>{level.descricao}</span>
                                  </span>
                                </React.Fragment>
                              ))}
                              <button type="button" onClick={() => setDetailNcmExpanded(false)} className="text-[10px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:underline whitespace-nowrap ml-1">recolher</button>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </DetailField>
                </div>
                <DetailField label="CEST">
                  <select value={detailCest} onChange={(e) => setDetailCest(e.target.value)} disabled={!canWrite} className={`${DETAIL_INPUT_CLS} font-mono`}>
                    <option value="">{'\u2014'}</option>
                    {detailCest && !cestOptions.includes(detailCest) && <option value={detailCest}>{detailCest}</option>}
                    {cestOptions.map((v) => <option key={v} value={v}>{v}</option>)}
                  </select>
                </DetailField>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <DetailField label="Origem">
                  <select value={detailOrigem} onChange={(e) => setDetailOrigem(e.target.value)} disabled={!canWrite} className={DETAIL_INPUT_CLS}>
                    <option value="">{'\u2014'}</option>
                    <option value="0">0 {'\u2013'} Nacional</option>
                    <option value="1">1 {'\u2013'} Estrangeira (import.)</option>
                    <option value="2">2 {'\u2013'} Estrangeira (merc. int.)</option>
                    <option value="3">3 {'\u2013'} Nacional &gt;40% import.</option>
                    <option value="5">5 {'\u2013'} Nacional {'\u2264'}40% import.</option>
                    <option value="8">8 {'\u2013'} Nacional &gt;70% import.</option>
                  </select>
                </DetailField>
                <DetailField label="Nome Tributacao">
                  <select value={detailNomeTributacao} onChange={(e) => setDetailNomeTributacao(e.target.value)} disabled={!canWrite} className={DETAIL_INPUT_CLS}>
                    <option value="">{'\u2014 Nenhuma \u2014'}</option>
                    {nomeTributacaoOptions.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                  </select>
                </DetailField>
              </div>

              {/* CST */}
              <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/30 p-3 space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[13px]">receipt_long</span>
                  Situacao Tributaria (CST)
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <DetailField label="CST ICMS">
                    <select value={detailSitTributaria} onChange={(e) => setDetailSitTributaria(e.target.value)} disabled={!canWrite} className={`${DETAIL_INPUT_CLS} font-mono`}>
                      <option value="">{'\u2014'}</option>
                      <option value="00">00 {'\u2013'} Trib. integral</option>
                      <option value="10">10 {'\u2013'} ICMS por ST</option>
                      <option value="20">20 {'\u2013'} Reducao BC</option>
                      <option value="30">30 {'\u2013'} Isenta c/ ST</option>
                      <option value="40">40 {'\u2013'} Isenta</option>
                      <option value="41">41 {'\u2013'} Nao tributada</option>
                      <option value="50">50 {'\u2013'} Suspensao</option>
                      <option value="51">51 {'\u2013'} Diferimento</option>
                      <option value="60">60 {'\u2013'} ST anterior</option>
                      <option value="70">70 {'\u2013'} Red. BC + ST</option>
                      <option value="90">90 {'\u2013'} Outras</option>
                    </select>
                  </DetailField>
                  <DetailField label="CST IPI">
                    <select value={detailCstIpi} onChange={(e) => setDetailCstIpi(e.target.value)} disabled={!canWrite} className={`${DETAIL_INPUT_CLS} font-mono`}>
                      <option value="">{'\u2014'}</option>
                      <option value="00">00 {'\u2013'} Entrada/Saida trib.</option>
                      <option value="01">01 {'\u2013'} Trib. aliq. zero</option>
                      <option value="02">02 {'\u2013'} Outras entradas/saidas</option>
                      <option value="49">49 {'\u2013'} Outras entradas</option>
                      <option value="50">50 {'\u2013'} Saida tributada</option>
                      <option value="99">99 {'\u2013'} Outras saidas</option>
                    </select>
                  </DetailField>
                  <DetailField label="CST PIS">
                    <select value={detailCstPis} onChange={(e) => setDetailCstPis(e.target.value)} disabled={!canWrite} className={`${DETAIL_INPUT_CLS} font-mono`}>
                      <option value="">{'\u2014'}</option>
                      <option value="01">01 {'\u2013'} Op. trib. (BC = valor op.)</option>
                      <option value="04">04 {'\u2013'} Op. trib. (monoFasica)</option>
                      <option value="06">06 {'\u2013'} Op. trib. (aliq. zero)</option>
                      <option value="07">07 {'\u2013'} Op. isenta</option>
                      <option value="08">08 {'\u2013'} Op. sem incidencia</option>
                      <option value="09">09 {'\u2013'} Op. com suspensao</option>
                      <option value="49">49 {'\u2013'} Outras saidas</option>
                      <option value="99">99 {'\u2013'} Outras operacoes</option>
                    </select>
                  </DetailField>
                  <DetailField label="CST COFINS">
                    <select value={detailCstCofins} onChange={(e) => setDetailCstCofins(e.target.value)} disabled={!canWrite} className={`${DETAIL_INPUT_CLS} font-mono`}>
                      <option value="">{'\u2014'}</option>
                      <option value="01">01 {'\u2013'} Op. trib. (BC = valor op.)</option>
                      <option value="04">04 {'\u2013'} Op. trib. (monoFasica)</option>
                      <option value="06">06 {'\u2013'} Op. trib. (aliq. zero)</option>
                      <option value="07">07 {'\u2013'} Op. isenta</option>
                      <option value="08">08 {'\u2013'} Op. sem incidencia</option>
                      <option value="09">09 {'\u2013'} Op. com suspensao</option>
                      <option value="49">49 {'\u2013'} Outras saidas</option>
                      <option value="99">99 {'\u2013'} Outras operacoes</option>
                    </select>
                  </DetailField>
                </div>
              </div>

              {/* Aliquotas */}
              <div className="grid grid-cols-5 gap-2">
                <DetailField label="ICMS %">
                  <select value={detailIcms} onChange={(e) => setDetailIcms(e.target.value)} disabled={!canWrite} className={`${DETAIL_INPUT_CLS} font-mono`}>
                    <option value="">{'\u2014'}</option>
                    {detailIcms && !aliqIcmsOptions.includes(detailIcms) && <option value={detailIcms}>{detailIcms}</option>}
                    {aliqIcmsOptions.map((v) => <option key={v} value={v}>{v}%</option>)}
                  </select>
                </DetailField>
                <DetailField label="PIS %">
                  <select value={detailPis} onChange={(e) => setDetailPis(e.target.value)} disabled={!canWrite} className={`${DETAIL_INPUT_CLS} font-mono`}>
                    <option value="">{'\u2014'}</option>
                    {detailPis && !aliqPisOptions.includes(detailPis) && <option value={detailPis}>{detailPis}</option>}
                    {aliqPisOptions.map((v) => <option key={v} value={v}>{v}%</option>)}
                  </select>
                </DetailField>
                <DetailField label="COFINS %">
                  <select value={detailCofins} onChange={(e) => setDetailCofins(e.target.value)} disabled={!canWrite} className={`${DETAIL_INPUT_CLS} font-mono`}>
                    <option value="">{'\u2014'}</option>
                    {detailCofins && !aliqCofinsOptions.includes(detailCofins) && <option value={detailCofins}>{detailCofins}</option>}
                    {aliqCofinsOptions.map((v) => <option key={v} value={v}>{v}%</option>)}
                  </select>
                </DetailField>
                <DetailField label="IPI %">
                  <select value={detailIpi} onChange={(e) => setDetailIpi(e.target.value)} disabled={!canWrite} className={`${DETAIL_INPUT_CLS} font-mono`}>
                    <option value="">{'\u2014'}</option>
                    {detailIpi && !aliqIpiOptions.includes(detailIpi) && <option value={detailIpi}>{detailIpi}</option>}
                    {aliqIpiOptions.map((v) => <option key={v} value={v}>{v}%</option>)}
                  </select>
                </DetailField>
                <DetailField label="FCP %">
                  <select value={detailFcp} onChange={(e) => setDetailFcp(e.target.value)} disabled={!canWrite} className={`${DETAIL_INPUT_CLS} font-mono`}>
                    <option value="">{'\u2014'}</option>
                    {detailFcp && !aliqFcpOptions.includes(detailFcp) && <option value={detailFcp}>{detailFcp}</option>}
                    {aliqFcpOptions.map((v) => <option key={v} value={v}>{v}%</option>)}
                  </select>
                </DetailField>
              </div>

              {/* Observacoes */}
              <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/30 p-3 space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[13px]">comment</span>
                  Observacoes
                </p>
                <DetailField label="Obs. Geral">
                  <textarea value={detailFiscalObs} onChange={(e) => setDetailFiscalObs(e.target.value)} maxLength={500} rows={2} placeholder="Observacoes fiscais gerais do produto" disabled={!canWrite} className={`${DETAIL_INPUT_CLS} resize-none`} />
                </DetailField>
                <DetailField label="Obs. ICMS">
                  <select value={detailObsIcms} onChange={(e) => setDetailObsIcms(e.target.value)} disabled={!canWrite} className={DETAIL_INPUT_CLS}>
                    <option value="">{'\u2014 Nenhuma \u2014'}</option>
                    {obsIcmsOptions.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                  </select>
                </DetailField>
                <DetailField label="Obs. PIS/COFINS">
                  <select value={detailObsPisCofins} onChange={(e) => setDetailObsPisCofins(e.target.value)} disabled={!canWrite} className={DETAIL_INPUT_CLS}>
                    <option value="">{'\u2014 Nenhuma \u2014'}</option>
                    {obsPisCofinsOptions.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                  </select>
                </DetailField>
              </div>
            </div>
          </DetailSectionCard>

          {/* Card: Dados da ANVISA */}
          <DetailSectionCard id="anvisa" icon="verified_user" iconColor="text-teal-500" title="Dados da ANVISA" isOpen={detailOpenSections.has('anvisa')} onToggle={toggleDetailSection}
            badge={detailProduct.anvisaStatus ? (
              <span className={`px-2.5 py-0.5 rounded-lg text-[10px] font-bold border ${anvisaStatusColor}`}>{detailProduct.anvisaStatus}</span>
            ) : undefined}
          >
            <div className="grid grid-cols-2 gap-3 mt-2">
              <DetailField label="Codigo ANVISA" colSpan2>
                <div className="flex gap-2">
                  <input type="text" value={detailAnvisa} onChange={(e) => setDetailAnvisa(e.target.value)} maxLength={13} placeholder="11 digitos numericos" disabled={!canWrite} className={`flex-1 ${DETAIL_INPUT_CLS} font-mono`} />
                  {canWrite && detailAnvisa && (
                    <button onClick={() => setDetailAnvisa('')} className="px-3 border border-red-200 dark:border-red-800/60 text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl text-sm transition-colors" title="Limpar codigo ANVISA">
                      <span className="material-symbols-outlined text-[16px]">delete</span>
                    </button>
                  )}
                  {canWrite && detailProduct.anvisa && (
                    <button onClick={handleSyncRegistry} disabled={syncingRegistry} className="flex items-center gap-1.5 px-3.5 py-2.5 border border-teal-200 dark:border-teal-800/60 text-teal-700 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-900/20 rounded-xl text-[12px] font-semibold transition-colors disabled:opacity-60 whitespace-nowrap" title="Consultar dados do registro na ANVISA">
                      <span className={`material-symbols-outlined text-[15px] ${syncingRegistry ? 'animate-spin' : ''}`}>{syncingRegistry ? 'progress_activity' : 'verified'}</span>
                      {syncingRegistry ? 'Consultando...' : 'Buscar'}
                    </button>
                  )}
                </div>
              </DetailField>

              {anvisaValidation && (
                <div className="col-span-2">
                  {anvisaValidation.loading ? (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800/30 ring-1 ring-slate-200/50 dark:ring-slate-700/50">
                      <span className="material-symbols-outlined text-[14px] text-slate-400 animate-spin">progress_activity</span>
                      <span className="text-[11px] text-slate-400">Validando na ANVISA...</span>
                    </div>
                  ) : anvisaValidation.notFound ? (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800/30 ring-1 ring-slate-200/50 dark:ring-slate-700/50">
                      <span className="material-symbols-outlined text-[14px] text-slate-400">help_outline</span>
                      <span className="text-[11px] font-medium text-slate-400">Nao encontrado na ANVISA</span>
                    </div>
                  ) : (
                    <div className="rounded-xl bg-teal-50/40 dark:bg-teal-900/10 border border-teal-200/40 dark:border-teal-800/30 px-3 py-2.5 space-y-1.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        {anvisaValidation.status && (
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            anvisaValidation.status.toLowerCase().includes('valid') || anvisaValidation.status.toLowerCase().includes('ativ')
                              ? 'bg-emerald-50 text-emerald-600 ring-1 ring-emerald-500/20 dark:bg-emerald-900/30 dark:text-emerald-400'
                              : anvisaValidation.status.toLowerCase().includes('cancel') || anvisaValidation.status.toLowerCase().includes('caduc')
                                ? 'bg-red-50 text-red-600 ring-1 ring-red-500/20 dark:bg-red-900/30 dark:text-red-400'
                                : 'bg-amber-50 text-amber-600 ring-1 ring-amber-500/20 dark:bg-amber-900/30 dark:text-amber-400'
                          }`}>
                            {anvisaValidation.status}
                          </span>
                        )}
                        {anvisaValidation.riskClass && <span className="text-[10px] font-medium text-slate-400 dark:text-slate-500">Classe {anvisaValidation.riskClass}</span>}
                        {anvisaValidation.expiration && <span className="text-[10px] text-slate-400 dark:text-slate-500">Val. {anvisaValidation.expiration}</span>}
                      </div>
                      {anvisaValidation.productName && <p className="text-[12px] font-medium text-slate-700 dark:text-slate-300 leading-snug">{anvisaValidation.productName}</p>}
                      {anvisaValidation.company && <p className="text-[10px] text-slate-400 dark:text-slate-500">{anvisaValidation.company}</p>}
                    </div>
                  )}
                </div>
              )}

              {detailProduct.anvisaMatchedProductName && (
                <div className="col-span-2 bg-teal-50/60 dark:bg-teal-900/10 border border-teal-200/50 dark:border-teal-800/40 rounded-xl px-4 py-3">
                  <p className="text-[10px] uppercase tracking-wider font-bold text-teal-500 dark:text-teal-400 mb-1">Produto Registrado</p>
                  <p className="text-[13px] font-medium text-slate-700 dark:text-slate-300 leading-snug">{detailProduct.anvisaMatchedProductName}</p>
                </div>
              )}

              {(detailProduct.anvisaHolder || detailProduct.anvisaManufacturer) && (
                <div className="col-span-2 grid grid-cols-1 md:grid-cols-2 gap-3">
                  {detailProduct.anvisaHolder && (
                    <div className="rounded-xl px-4 py-3 bg-slate-50 dark:bg-slate-800/40 ring-1 ring-slate-200/50 dark:ring-slate-700/50">
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="material-symbols-outlined text-[12px] text-slate-400">business</span>
                        <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400 dark:text-slate-500">Detentor do Registro</p>
                      </div>
                      <p className="text-[13px] font-medium text-slate-700 dark:text-slate-300">{detailProduct.anvisaHolder}</p>
                    </div>
                  )}
                  {detailProduct.anvisaManufacturer && (
                    <div className="rounded-xl px-4 py-3 bg-slate-50 dark:bg-slate-800/40 ring-1 ring-slate-200/50 dark:ring-slate-700/50">
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="material-symbols-outlined text-[12px] text-slate-400">factory</span>
                        <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400 dark:text-slate-500">
                          Fabricante Legal{detailProduct.anvisaManufacturerCountry ? ` \u00B7 ${detailProduct.anvisaManufacturerCountry}` : ''}
                        </p>
                      </div>
                      <p className="text-[13px] font-medium text-slate-700 dark:text-slate-300">
                        {detailProduct.manufacturerShortName ? (
                          <><span className="font-semibold">{detailProduct.manufacturerShortName}</span> <span className="text-slate-400 text-[11px]">({detailProduct.anvisaManufacturer})</span></>
                        ) : detailProduct.anvisaManufacturer}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {(detailProduct.anvisaStatus || detailProduct.anvisaExpiration || detailProduct.anvisaProcess || detailProduct.anvisaRiskClass) && (
                <div className="col-span-2 grid grid-cols-2 md:grid-cols-4 gap-2">
                  {detailProduct.anvisaStatus && (
                    <div className={`rounded-xl px-3.5 py-2.5 border ${anvisaStatusColor}`}>
                      <p className="text-[9px] uppercase tracking-wider font-bold opacity-60 mb-0.5">Situacao</p>
                      <p className="text-[12px] font-bold">{detailProduct.anvisaStatus}</p>
                    </div>
                  )}
                  <div className="rounded-xl px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
                    <p className="text-[9px] uppercase tracking-wider font-bold text-slate-400 dark:text-slate-500 mb-0.5">Vencimento</p>
                    <p className="text-[12px] font-semibold text-slate-700 dark:text-slate-300">
                      {detailProduct.anvisaExpiration ? formatDate(detailProduct.anvisaExpiration) : 'Vigente'}
                    </p>
                  </div>
                  {detailProduct.anvisaProcess && (
                    <div className="rounded-xl px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
                      <p className="text-[9px] uppercase tracking-wider font-bold text-slate-400 dark:text-slate-500 mb-0.5">Processo</p>
                      <p className="text-[11px] font-mono font-medium text-slate-600 dark:text-slate-400">{detailProduct.anvisaProcess}</p>
                    </div>
                  )}
                  {detailProduct.anvisaRiskClass && (
                    <div className="rounded-xl px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
                      <p className="text-[9px] uppercase tracking-wider font-bold text-slate-400 dark:text-slate-500 mb-0.5">Classe de Risco</p>
                      <p className="text-[12px] font-semibold text-slate-600 dark:text-slate-300">{detailProduct.anvisaRiskClass}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </DetailSectionCard>
        </div>

        {/* Footer */}
        <div className="px-4 sm:px-6 py-3.5 border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-card-dark shrink-0 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] sm:shadow-none">
          <div className="sm:hidden space-y-2">
            <div className="flex gap-2">
              <button onClick={() => onOpenHistory(detailProduct)} className="flex-1 flex items-center justify-center gap-1.5 py-3.5 rounded-xl text-[13px] font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 active:bg-slate-50 dark:active:bg-slate-700 transition-colors">
                <span className="material-symbols-outlined text-[18px] text-blue-500">history</span>
                Historico
              </button>
              {canWrite && (
                <button onClick={handleSaveDetail} disabled={savingDetail || !detailDirty} className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl bg-emerald-600 text-white font-bold text-base active:bg-emerald-700 transition-colors shadow-sm disabled:opacity-60 disabled:cursor-not-allowed">
                  <span className="material-symbols-outlined text-[20px]">{savingDetail ? 'progress_activity' : 'save'}</span>
                  {savingDetail ? 'Salvando...' : 'Salvar'}
                </button>
              )}
            </div>
            <button onClick={onClose} className="flex items-center justify-center gap-2 w-full py-3.5 rounded-xl bg-primary text-white font-bold text-base active:bg-primary-dark transition-colors shadow-sm">
              <span className="material-symbols-outlined text-[20px]">arrow_back</span>
              Voltar
            </button>
          </div>
          <div className="hidden sm:flex items-center justify-between">
            <button onClick={onClose} className="px-4 py-2.5 text-sm font-medium text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
              Fechar
            </button>
            <div className="flex items-center gap-2">
              <button onClick={() => onOpenHistory(detailProduct)} className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-[13px] font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 hover:border-slate-300 dark:hover:border-slate-600 transition-all" title="Ver historico de compras e vendas">
                <span className="material-symbols-outlined text-[16px] text-blue-500">history</span>
                Historico
              </button>
              {canWrite && (
                <button onClick={handleSaveDetail} disabled={savingDetail || !detailDirty} className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-primary to-primary-dark hover:from-primary-dark hover:to-primary text-white rounded-xl text-sm font-bold transition-all shadow-sm shadow-primary/25 disabled:opacity-40 disabled:shadow-none">
                  {savingDetail ? (
                    <><span className="material-symbols-outlined text-[16px] animate-spin">progress_activity</span>Salvando...</>
                  ) : (
                    <><span className="material-symbols-outlined text-[16px]">save</span>Salvar</>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
