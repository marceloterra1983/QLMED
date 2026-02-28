'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import type { ProductRow } from './types';

/* ─── Settings Modal (Ajustes) ─── */

type SettingsSection = 'lines' | 'manufacturers' | 'fiscal';
type FiscalTab = 'ncm' | 'fiscalSitTributaria' | 'fiscalNomeTributacao' | 'cest' | 'origem' | 'cfopEntrada' | 'cfopSaida';
type SettingsCountItem = { value: string; count: number; description?: string };
type SettingsSubgroupItem = { name: string; count: number };
type SettingsGroupItem = { name: string; count: number; subgroups: SettingsSubgroupItem[] };
type SettingsLineItem = { name: string; count: number; groups: SettingsGroupItem[] };
type SettingsManufacturerItem = { name: string; count: number; shortName: string | null };
type ProductSettingsResponse = {
  lines: SettingsLineItem[];
  manufacturers: SettingsManufacturerItem[];
  fiscal: {
    ncm: SettingsCountItem[];
    fiscalSitTributaria: SettingsCountItem[];
    fiscalNomeTributacao: SettingsCountItem[];
    cest: SettingsCountItem[];
    origem: SettingsCountItem[];
    cfopEntrada: SettingsCountItem[];
    cfopSaida: SettingsCountItem[];
  };
};
type PendingDeleteState = {
  title: string;
  message: string;
  onConfirm: () => Promise<void>;
} | null;

const SETTINGS_SECTIONS: { key: SettingsSection; label: string; icon: string; color: string }[] = [
  { key: 'lines', label: 'Linhas e Grupos', icon: 'account_tree', color: 'text-indigo-500' },
  { key: 'manufacturers', label: 'Fabricantes', icon: 'factory', color: 'text-teal-500' },
  { key: 'fiscal', label: 'Dados Fiscais', icon: 'receipt_long', color: 'text-amber-500' },
];

const FISCAL_TABS: { key: FiscalTab; label: string; icon: string; field: keyof ProductRow }[] = [
  { key: 'ncm', label: 'NCM', icon: 'tag', field: 'ncm' },
  { key: 'fiscalSitTributaria', label: 'Sit. Tributária', icon: 'gavel', field: 'fiscalSitTributaria' },
  { key: 'fiscalNomeTributacao', label: 'Tributação', icon: 'description', field: 'fiscalNomeTributacao' },
  { key: 'cest', label: 'CEST', icon: 'verified', field: 'fiscalCest' },
  { key: 'origem', label: 'Origem', icon: 'public', field: 'fiscalOrigem' },
  { key: 'cfopEntrada', label: 'CFOP Entrada', icon: 'login', field: 'fiscalCfopEntrada' as keyof ProductRow },
  { key: 'cfopSaida', label: 'CFOP Saída', icon: 'logout', field: 'fiscalCfopSaida' as keyof ProductRow },
];

function buildSubtypeCountKey(type: string, subtype: string) {
  return `${type}:::${subtype}`;
}

function buildSubgroupCountKey(type: string, subtype: string, subgroup: string) {
  return `${type}:::${subtype}:::${subgroup}`;
}

function SettingsModal({ onClose, onUpdated }: {
  onClose: () => void;
  onUpdated: () => Promise<void>;
}) {
  const [activeSection, setActiveSection] = useState<SettingsSection>('lines');
  const [pendingDelete, setPendingDelete] = useState<PendingDeleteState>(null);
  const [settingsData, setSettingsData] = useState<ProductSettingsResponse | null>(null);
  const [loadingSettings, setLoadingSettings] = useState(true);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !pendingDelete) onClose();
    };

    window.addEventListener('keydown', handleEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleEscape);
    };
  }, [onClose, pendingDelete]);

  const loadSettings = async () => {
    setLoadingSettings(true);
    try {
      const res = await fetch('/api/products/settings');
      if (!res.ok) throw new Error('Falha ao carregar ajustes');
      const data = (await res.json()) as ProductSettingsResponse;
      setSettingsData(data);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao carregar ajustes');
    } finally {
      setLoadingSettings(false);
    }
  };

  const refreshAfterMutation = async () => {
    await Promise.all([onUpdated(), loadSettings()]);
  };

  useEffect(() => {
    void loadSettings();
  }, []);

  // --- shared ---
  const [saving, setSaving] = useState(false);

  // --- lines ---
  const [linesSearch, setLinesSearch] = useState('');
  const [expandedType, setExpandedType] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<{ field: 'productType' | 'productSubtype' | 'productSubgroup'; oldValue: string; parentType?: string; parentSubtype?: string } | null>(null);
  const [editValue, setEditValue] = useState('');
  const [newTypeName, setNewTypeName] = useState('');
  const [newSubtypeFor, setNewSubtypeFor] = useState<string | null>(null);
  const [newSubtypeName, setNewSubtypeName] = useState('');
  const [expandedSubtype, setExpandedSubtype] = useState<string | null>(null);
  const [newSubgroupFor, setNewSubgroupFor] = useState<string | null>(null);
  const [newSubgroupName, setNewSubgroupName] = useState('');

  // reset child form states when parent changes
  useEffect(() => {
    setNewSubtypeFor(null); setNewSubtypeName('');
    setNewSubgroupFor(null); setNewSubgroupName('');
    setEditingItem(null); setEditValue('');
  }, [expandedType]);

  useEffect(() => {
    setNewSubgroupFor(null); setNewSubgroupName('');
  }, [expandedSubtype]);

  // --- shared UI ---
  const inlineInputCls = "flex-1 px-3 py-1.5 text-sm border border-primary/50 rounded-xl bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/40 transition-shadow";
  const actionBtnCls = "p-1.5 rounded-lg transition-colors";

  const InlineForm = ({ value, onChange, onSubmit, onCancel, placeholder, disabled }: { value: string; onChange: (v: string) => void; onSubmit: () => void; onCancel: () => void; placeholder?: string; disabled?: boolean }) => (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(); }} className="flex items-center gap-1.5 flex-1">
      <input autoFocus value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={inlineInputCls} disabled={disabled} />
      <button type="submit" disabled={disabled} className={`${actionBtnCls} text-primary hover:bg-primary/10`}><span className="material-symbols-outlined text-[18px]">check</span></button>
      <button type="button" onClick={onCancel} className={`${actionBtnCls} text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800`}><span className="material-symbols-outlined text-[18px]">close</span></button>
    </form>
  );

  // --- manufacturers ---
  const [editingMfr, setEditingMfr] = useState<string | null>(null);
  const [mfrEditValue, setMfrEditValue] = useState('');
  const [editingShort, setEditingShort] = useState<string | null>(null);
  const [shortValue, setShortValue] = useState('');
  const [mfrSearch, setMfrSearch] = useState('');
  const [newMfrName, setNewMfrName] = useState('');
  const [newMfrShort, setNewMfrShort] = useState('');
  const [addingNew, setAddingNew] = useState(false);

  // --- fiscal ---
  const [fiscalSearch, setFiscalSearch] = useState('');
  const [fiscalTab, setFiscalTab] = useState<FiscalTab>('ncm');
  const [ncmDescCache, setNcmDescCache] = useState<Record<string, { descricao: string; fullDescription: string; hierarchy?: Array<{ codigo: string; descricao: string }> }>>({});
  const [ncmExpandedItems, setNcmExpandedItems] = useState<Set<string>>(new Set());
  const [cfopDescCache, setCfopDescCache] = useState<Record<string, string>>({});
  const [fiscalEditItem, setFiscalEditItem] = useState<{ field: FiscalTab; oldValue: string } | null>(null);
  const [fiscalEditValue, setFiscalEditValue] = useState('');
  const [newFiscalName, setNewFiscalName] = useState('');
  const [syncingNcmBulk, setSyncingNcmBulk] = useState(false);

  // ==== data: lines ====
  const typeMap = useMemo(() => {
    const map = new Map<string, Map<string, Map<string, number>>>();
    for (const line of settingsData?.lines || []) {
      const groups = new Map<string, Map<string, number>>();
      for (const group of line.groups || []) {
        const subgroups = new Map<string, number>();
        for (const subgroup of group.subgroups || []) {
          subgroups.set(subgroup.name, subgroup.count || 0);
        }
        groups.set(group.name, subgroups);
      }
      map.set(line.name, groups);
    }
    return map;
  }, [settingsData]);

  const typeCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const line of settingsData?.lines || []) {
      counts.set(line.name, line.count || 0);
    }
    return counts;
  }, [settingsData]);
  const sortedTypes = useMemo(() => Array.from(typeCounts.keys()).sort((a, b) => a.localeCompare(b, 'pt-BR')), [typeCounts]);
  const filteredTypes = useMemo(() => {
    if (!linesSearch) return sortedTypes;
    const q = linesSearch.toLowerCase();
    return sortedTypes.filter((type) => {
      if (type.toLowerCase().includes(q)) return true;
      const groups = typeMap.get(type);
      if (!groups) return false;
      for (const [groupName, subgroups] of Array.from(groups.entries())) {
        if (groupName.toLowerCase().includes(q)) return true;
        for (const [sgName] of Array.from(subgroups.entries())) {
          if (sgName.toLowerCase().includes(q)) return true;
        }
      }
      return false;
    });
  }, [sortedTypes, linesSearch, typeMap]);

  const taxonomyCounts = useMemo(() => {
    const subtypeByType = new Map<string, number>();
    const subtypeTotal = new Map<string, number>();
    const subgroupByParent = new Map<string, number>();
    const subgroupTotal = new Map<string, number>();

    for (const line of settingsData?.lines || []) {
      for (const group of line.groups || []) {
        const subtypeByTypeKey = buildSubtypeCountKey(line.name, group.name);
        const groupCount = group.count || 0;
        subtypeByType.set(subtypeByTypeKey, groupCount);
        subtypeTotal.set(group.name, (subtypeTotal.get(group.name) || 0) + groupCount);

        for (const subgroup of group.subgroups || []) {
          const subgroupCount = subgroup.count || 0;
          const subgroupByParentKey = buildSubgroupCountKey(line.name, group.name, subgroup.name);
          subgroupByParent.set(subgroupByParentKey, subgroupCount);
          subgroupTotal.set(subgroup.name, (subgroupTotal.get(subgroup.name) || 0) + subgroupCount);
        }
      }
    }

    return {
      subtypeByType,
      subtypeTotal,
      subgroupByParent,
      subgroupTotal,
    };
  }, [settingsData]);

  // ==== data: manufacturers ====
  const manufacturers = useMemo(() => {
    return (settingsData?.manufacturers || [])
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }, [settingsData]);
  const filteredMfrs = useMemo(() => {
    if (!mfrSearch) return manufacturers;
    const q = mfrSearch.toLowerCase();
    return manufacturers.filter((m) => m.name.toLowerCase().includes(q) || (m.shortName && m.shortName.toLowerCase().includes(q)));
  }, [manufacturers, mfrSearch]);

  // ==== data: fiscal ====
  const fiscalItemsMap = useMemo(() => {
    const result: Record<FiscalTab, Map<string, number>> = {
      ncm: new Map(), fiscalSitTributaria: new Map(), fiscalNomeTributacao: new Map(),
      cest: new Map(), origem: new Map(), cfopEntrada: new Map(), cfopSaida: new Map(),
    };
    for (const item of settingsData?.fiscal.ncm || []) result.ncm.set(item.value, item.count || 0);
    for (const item of settingsData?.fiscal.fiscalSitTributaria || []) result.fiscalSitTributaria.set(item.value, item.count || 0);
    for (const item of settingsData?.fiscal.fiscalNomeTributacao || []) result.fiscalNomeTributacao.set(item.value, item.count || 0);
    for (const item of settingsData?.fiscal.cest || []) result.cest.set(item.value, item.count || 0);
    for (const item of settingsData?.fiscal.origem || []) result.origem.set(item.value, item.count || 0);
    const descMap: Record<string, string> = {};
    for (const item of settingsData?.fiscal.cfopEntrada || []) {
      result.cfopEntrada.set(item.value, item.count || 0);
      if (item.description) descMap[item.value] = item.description;
    }
    for (const item of settingsData?.fiscal.cfopSaida || []) {
      result.cfopSaida.set(item.value, item.count || 0);
      if (item.description) descMap[item.value] = item.description;
    }
    if (Object.keys(descMap).length > 0) setCfopDescCache(prev => ({ ...prev, ...descMap }));
    return result;
  }, [settingsData]);

  const sectionCounts = useMemo(() => {
    const linesCount = settingsData?.lines?.length || 0;
    const mfrCount = settingsData?.manufacturers?.length || 0;
    let fiscalCount = 0;
    for (const tab of Object.values(fiscalItemsMap)) fiscalCount += tab.size;
    return { lines: linesCount, manufacturers: mfrCount, fiscal: fiscalCount } as Record<SettingsSection, number>;
  }, [settingsData, fiscalItemsMap]);

  const currentFiscalItems = useMemo(() => {
    const sortByCount = fiscalTab === 'ncm' || fiscalTab === 'cfopEntrada' || fiscalTab === 'cfopSaida';
    const items = Array.from(fiscalItemsMap[fiscalTab].entries()).sort(sortByCount
      ? ([a, ca], [b, cb]) => cb - ca || a.localeCompare(b, 'pt-BR')
      : ([a], [b]) => a.localeCompare(b, 'pt-BR'));
    if (!fiscalSearch) return items;
    const q = fiscalSearch.toLowerCase();
    return items.filter(([value]) => {
      if (value.toLowerCase().includes(q)) return true;
      const desc = cfopDescCache[value];
      return desc ? desc.toLowerCase().includes(q) : false;
    });
  }, [fiscalItemsMap, fiscalTab, fiscalSearch, cfopDescCache]);

  // Fetch NCM descriptions for visible items in settings NCM tab
  useEffect(() => {
    if (fiscalTab !== 'ncm' || currentFiscalItems.length === 0) return;
    let cancelled = false;
    const toFetch = currentFiscalItems.map(([v]) => v.replace(/\D/g, '')).filter((d) => d.length >= 4 && !ncmDescCache[d]);
    if (toFetch.length === 0) return;
    (async () => {
      const batch: Record<string, { descricao: string; fullDescription: string; hierarchy?: Array<{ codigo: string; descricao: string }> }> = {};
      for (const code of toFetch.slice(0, 30)) {
        try {
          const res = await fetch(`/api/ncm/${code}`);
          if (!res.ok) continue;
          const data = await res.json();
          batch[code] = { descricao: data.descricao || '', fullDescription: data.fullDescription || data.descricao || '', hierarchy: data.hierarchy || [] };
        } catch { /* skip */ }
      }
      if (!cancelled && Object.keys(batch).length > 0) {
        setNcmDescCache((prev) => ({ ...prev, ...batch }));
      }
    })();
    return () => { cancelled = true; };
  }, [fiscalTab, currentFiscalItems, ncmDescCache]);

  // ==== API helpers ====
  const callTypeApi = async (field: 'productType' | 'productSubtype' | 'productSubgroup', oldValue: string, newValue: string | null, parentType?: string, parentSubtype?: string) => {
    setSaving(true);
    try {
      const res = await fetch('/api/products/rename-type', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ field, oldValue, newValue, parentType, parentSubtype }) });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e?.error || 'Falha'); }
      const result = await res.json();
      const count = result.updated;
      toast.success(count > 0 ? `${count} produto(s) atualizado(s)` : result.created ? 'Item adicionado ao catálogo' : 'Item removido do catálogo');
      await refreshAfterMutation();
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Erro'); } finally { setSaving(false); }
  };
  const callMfrApi = async (body: Record<string, unknown>) => {
    setSaving(true);
    try {
      const res = await fetch('/api/products/rename-manufacturer', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e?.error || 'Falha'); }
      const result = await res.json();
      const count = result.updated;
      toast.success(count > 0 ? `${count} produto(s) atualizado(s)` : result.created ? 'Item adicionado ao catálogo' : 'Item removido do catálogo');
      await refreshAfterMutation();
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Erro'); } finally { setSaving(false); }
  };
  const callFiscalApi = async (field: FiscalTab, oldValue: string, newValue: string | null) => {
    setSaving(true);
    try {
      const res = await fetch('/api/products/rename-fiscal', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ field, oldValue, newValue }) });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e?.error || 'Falha'); }
      const result = await res.json();
      const count = result.updated;
      toast.success(count > 0 ? `${count} produto(s) atualizado(s)` : result.created ? 'Item adicionado ao catálogo' : 'Item removido do catálogo');
      await refreshAfterMutation();
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Erro'); } finally { setSaving(false); }
  };

  // ==== handlers ====
  const openDeleteDialog = (
    title: string,
    count: number,
    onConfirm: () => Promise<void>,
  ) => {
    const message = count > 0
      ? `Este valor está associado a ${count.toLocaleString('pt-BR')} ${count === 1 ? 'produto' : 'produtos'}. A associação será removida.`
      : 'Este item existe apenas no catálogo e será removido da lista.';

    setPendingDelete({ title, message, onConfirm });
  };

  const handleTypeRename = async () => { if (!editingItem || !editValue.trim()) return; await callTypeApi(editingItem.field, editingItem.oldValue, editValue.trim(), editingItem.parentType, editingItem.parentSubtype); setEditingItem(null); setEditValue(''); };
  const handleTypeDelete = (field: 'productType' | 'productSubtype' | 'productSubgroup', oldValue: string, parentType?: string, parentSubtype?: string) => {
    const affected = field === 'productType'
      ? (typeCounts.get(oldValue) || 0)
      : field === 'productSubtype'
        ? (parentType
          ? (taxonomyCounts.subtypeByType.get(buildSubtypeCountKey(parentType, oldValue)) || 0)
          : (taxonomyCounts.subtypeTotal.get(oldValue) || 0))
        : (parentType && parentSubtype
          ? (taxonomyCounts.subgroupByParent.get(buildSubgroupCountKey(parentType, parentSubtype, oldValue)) || 0)
          : (taxonomyCounts.subgroupTotal.get(oldValue) || 0));

    openDeleteDialog(
      `Remover "${oldValue}"?`,
      affected,
      async () => {
        await callTypeApi(field, oldValue, null, parentType, parentSubtype);
      },
    );
  };
  const startTypeEdit = (field: 'productType' | 'productSubtype' | 'productSubgroup', oldValue: string, parentType?: string, parentSubtype?: string) => { setEditingItem({ field, oldValue, parentType, parentSubtype }); setEditValue(oldValue); };

  const handleMfrRename = async (oldVal: string) => { if (!mfrEditValue.trim() || mfrEditValue.trim() === oldVal) { setEditingMfr(null); return; } await callMfrApi({ action: 'rename', oldValue: oldVal, newValue: mfrEditValue.trim() }); setEditingMfr(null); };
  const handleMfrDelete = (name: string) => {
    const affected = manufacturers.find((mfr) => mfr.name === name)?.count || 0;
    openDeleteDialog(
      `Remover fabricante "${name}"?`,
      affected,
      async () => {
        await callMfrApi({ action: 'delete', oldValue: name });
      },
    );
  };
  const handleMfrShortName = async (manufacturer: string) => { await callMfrApi({ action: 'shortName', manufacturer, shortName: shortValue.trim() || null }); setEditingShort(null); };
  const handleMfrAdd = async () => {
    if (!newMfrName.trim()) return;
    setAddingNew(true);
    try {
      const res = await fetch('/api/products/rename-manufacturer', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'add', name: newMfrName.trim(), shortName: newMfrShort.trim() || null }) });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e?.error || 'Falha'); }
      toast.success(`Fabricante "${newMfrName.trim()}" adicionado`);
      setNewMfrName('');
      setNewMfrShort('');
      await refreshAfterMutation();
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Erro'); } finally { setAddingNew(false); }
  };

  const handleFiscalRename = async () => { if (!fiscalEditItem || !fiscalEditValue.trim()) return; await callFiscalApi(fiscalEditItem.field, fiscalEditItem.oldValue, fiscalEditValue.trim()); setFiscalEditItem(null); setFiscalEditValue(''); };
  const handleFiscalDelete = (field: FiscalTab, oldValue: string) => {
    const affected = fiscalItemsMap[field].get(oldValue) || 0;
    openDeleteDialog(
      `Remover "${oldValue}"?`,
      affected,
      async () => {
        await callFiscalApi(field, oldValue, null);
      },
    );
  };
  const handleFiscalAdd = async () => {
    if (!newFiscalName.trim()) return;
    setSaving(true);
    try {
      const res = await fetch('/api/products/rename-fiscal', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'add', field: fiscalTab, name: newFiscalName.trim() }) });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e?.error || 'Falha'); }
      toast.success(`"${newFiscalName.trim()}" cadastrado`);
      await refreshAfterMutation();
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Erro'); } finally { setSaving(false); setNewFiscalName(''); }
  };

  const MfrInlineForm = ({ value, onChange, onSubmit, onCancel, placeholder, disabled }: { value: string; onChange: (v: string) => void; onSubmit: () => void; onCancel: () => void; placeholder?: string; disabled?: boolean }) => (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(); }} className="flex items-center gap-1.5 flex-1">
      <input autoFocus value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={inlineInputCls} disabled={disabled} />
      <button type="submit" disabled={disabled} className={`${actionBtnCls} text-primary hover:bg-primary/10`}><span className="material-symbols-outlined text-[18px]">check</span></button>
      <button type="button" onClick={onCancel} className={`${actionBtnCls} text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800`}><span className="material-symbols-outlined text-[18px]">close</span></button>
    </form>
  );

  const activeTabMeta = FISCAL_TABS.find((t) => t.key === fiscalTab)!;

  // ======================== RENDER ========================
  return (
    <>
      <div className="fixed inset-0 z-50 sm:flex sm:items-center sm:justify-center sm:p-4 sm:bg-black/60 sm:backdrop-blur-sm" onClick={onClose}>
        <div
          className="absolute inset-0 sm:relative sm:inset-auto bg-slate-50 dark:bg-[#1a1e2e] sm:rounded-2xl w-full sm:max-w-5xl sm:h-auto sm:max-h-[88vh] flex flex-col sm:flex-row overflow-hidden sm:shadow-2xl sm:ring-1 ring-black/5 dark:ring-white/5"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="settings-modal-section-title"
        >

          {/* ── Sidebar ── */}
          <div className="shrink-0 sm:w-56 bg-white dark:bg-card-dark border-b sm:border-b-0 sm:border-r border-slate-200 dark:border-slate-700 flex sm:flex-col">
            {/* Title */}
            <div className="hidden sm:flex items-center gap-3 px-5 py-5 border-b border-slate-100 dark:border-slate-800/60">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500/20 to-violet-500/5 dark:from-violet-500/30 dark:to-violet-500/10 flex items-center justify-center ring-1 ring-violet-500/20 dark:ring-violet-500/30">
                <span className="material-symbols-outlined text-[18px] text-violet-500">settings</span>
              </div>
              <h2 className="text-[15px] font-bold text-slate-900 dark:text-white">Ajustes</h2>
            </div>

            {/* Nav items */}
            <nav className="flex sm:flex-col flex-1 sm:py-2 overflow-x-auto sm:overflow-x-visible">
              {SETTINGS_SECTIONS.map((sec) => {
                const isActive = activeSection === sec.key;
                return (
                  <button key={sec.key} onClick={() => setActiveSection(sec.key)} className={`flex items-center gap-2.5 px-5 py-3 text-left transition-colors whitespace-nowrap ${isActive ? 'bg-slate-50 dark:bg-slate-800/40 border-b-2 sm:border-b-0 sm:border-r-2 border-violet-500' : 'hover:bg-slate-50 dark:hover:bg-slate-800/30 border-b-2 sm:border-b-0 sm:border-r-2 border-transparent'}`}>
                    <span className={`material-symbols-outlined text-[18px] ${isActive ? sec.color : 'text-slate-400'}`}>{sec.icon}</span>
                    <span className={`text-[13px] font-semibold ${isActive ? 'text-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-400'}`}>{sec.label}</span>
                    {!loadingSettings && <span className={`ml-auto px-1.5 py-0.5 rounded-full text-[10px] font-bold min-w-[22px] text-center tabular-nums ${isActive ? 'bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400' : 'bg-slate-100 dark:bg-slate-700 text-slate-400 dark:text-slate-500'}`}>{sectionCounts[sec.key]}</span>}
                  </button>
                );
              })}
            </nav>
          </div>

          {/* ── Content ── */}
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

            {/* Close button (top-right) */}
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-card-dark shrink-0">
              <h3 id="settings-modal-section-title" className="text-[14px] font-bold text-slate-900 dark:text-white">{SETTINGS_SECTIONS.find((s) => s.key === activeSection)!.label}</h3>
              <button onClick={onClose} className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto">
              {loadingSettings ? (
                <div className="flex flex-col items-center justify-center py-16 px-5">
                  <span className="material-symbols-outlined text-[28px] text-slate-300 dark:text-slate-600 animate-spin">progress_activity</span>
                  <p className="mt-2 text-[13px] text-slate-400 dark:text-slate-500">Carregando ajustes...</p>
                </div>
              ) : (
                <>
            {/* ════════════ LINHAS E GRUPOS ════════════ */}
            {activeSection === 'lines' && (
              <div className="px-5 py-4 space-y-2">
                <div className="relative">
                  <span className="material-symbols-outlined text-[18px] text-slate-400 absolute left-3 top-1/2 -translate-y-1/2">search</span>
                  <input type="text" placeholder="Buscar linha, grupo ou subgrupo..." value={linesSearch} onChange={(e) => setLinesSearch(e.target.value)} className="w-full pl-10 pr-3 py-2.5 text-sm border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-900/50 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-shadow" />
                </div>
                {filteredTypes.length === 0 && (
                  <div className="flex flex-col items-center py-8">
                    <span className="material-symbols-outlined text-[36px] text-slate-300 dark:text-slate-600 mb-2">inbox</span>
                    <p className="text-[13px] text-slate-400 dark:text-slate-500">{linesSearch ? 'Nenhum resultado encontrado.' : 'Nenhuma linha cadastrada.'}</p>
                  </div>
                )}

                {filteredTypes.map((type) => {
                  const count = typeCounts.get(type) || 0;
                  const subs = typeMap.get(type);
                  const isExpanded = expandedType === type;
                  const isEditing = editingItem?.field === 'productType' && editingItem.oldValue === type;
                  return (
                    <div key={type} className={`rounded-xl border overflow-hidden transition-colors ${isExpanded ? 'border-indigo-200/60 dark:border-indigo-800/30 shadow-sm' : 'border-slate-200 dark:border-slate-700'}`}>
                      <div className={`flex items-center gap-2.5 px-4 py-2.5 transition-colors ${isExpanded ? 'bg-gradient-to-r from-indigo-50/80 to-transparent dark:from-indigo-950/30 dark:to-transparent' : 'bg-white dark:bg-slate-900/30 hover:bg-slate-50 dark:hover:bg-slate-800/40'}`}>
                        <button onClick={() => setExpandedType(isExpanded ? null : type)} className="text-indigo-400 dark:text-indigo-500">
                          <span className="material-symbols-outlined text-[18px] transition-transform duration-200" style={{ transform: isExpanded ? 'rotate(0deg)' : 'rotate(-90deg)' }}>expand_more</span>
                        </button>
                        {isEditing ? (
                          <InlineForm value={editValue} onChange={setEditValue} onSubmit={handleTypeRename} onCancel={() => setEditingItem(null)} disabled={saving} />
                        ) : (
                          <>
                            <div className="w-1 h-4 rounded-full bg-indigo-400 dark:bg-indigo-500" />
                            <span className="flex-1 text-[13px] font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wide cursor-pointer" onClick={() => setExpandedType(isExpanded ? null : type)}>{type}</span>
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 ring-1 ring-indigo-200/50 dark:ring-indigo-800/30 min-w-[28px] text-center">{count}</span>
                            <button onClick={() => startTypeEdit('productType', type)} className={`${actionBtnCls} text-slate-400 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/20`} title="Renomear"><span className="material-symbols-outlined text-[16px]">edit</span></button>
                            <button onClick={() => handleTypeDelete('productType', type)} className={`${actionBtnCls} text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20`} title="Excluir" disabled={saving}><span className="material-symbols-outlined text-[16px]">delete</span></button>
                          </>
                        )}
                      </div>
                      {isExpanded && (
                        <div className="border-t border-slate-100 dark:border-slate-800/50 bg-slate-50/50 dark:bg-slate-900/20 px-4 py-2 space-y-0.5">
                          {subs && subs.size > 0 ? (
                            Array.from(subs.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([sub, subgroupsMap]) => {
                              const subCount = taxonomyCounts.subtypeByType.get(buildSubtypeCountKey(type, sub)) || 0;
                              const isSubEditing = editingItem?.field === 'productSubtype' && editingItem.oldValue === sub && editingItem.parentType === type;
                              const isSubExpanded = expandedSubtype === `${type}|${sub}`;
                              return (
                                <div key={sub}>
                                  <div className="flex items-center gap-2 py-1.5 pl-7 group/sub rounded-lg hover:bg-white/60 dark:hover:bg-slate-800/30 transition-colors">
                                    {isSubEditing ? (
                                      <InlineForm value={editValue} onChange={setEditValue} onSubmit={handleTypeRename} onCancel={() => setEditingItem(null)} disabled={saving} />
                                    ) : (
                                      <>
                                        <button onClick={() => setExpandedSubtype(isSubExpanded ? null : `${type}|${sub}`)} className="text-amber-400 dark:text-amber-500">
                                          <span className="material-symbols-outlined text-[16px] transition-transform duration-200" style={{ transform: isSubExpanded ? 'rotate(0deg)' : 'rotate(-90deg)' }}>expand_more</span>
                                        </button>
                                        <div className="w-0.5 h-3 rounded-full bg-amber-400 dark:bg-amber-600" />
                                        <span className="flex-1 text-[13px] text-slate-600 dark:text-slate-300 cursor-pointer" onClick={() => setExpandedSubtype(isSubExpanded ? null : `${type}|${sub}`)}>{sub}</span>
                                        <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-amber-100 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 min-w-[24px] text-center">{subCount}</span>
                                        <button onClick={() => startTypeEdit('productSubtype', sub, type)} className={`${actionBtnCls} text-slate-400 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20 opacity-100 sm:opacity-0 sm:group-hover/sub:opacity-100 transition-opacity`} title="Renomear"><span className="material-symbols-outlined text-[15px]">edit</span></button>
                                        <button onClick={() => handleTypeDelete('productSubtype', sub, type)} className={`${actionBtnCls} text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 opacity-100 sm:opacity-0 sm:group-hover/sub:opacity-100 transition-opacity`} title="Excluir" disabled={saving}><span className="material-symbols-outlined text-[15px]">delete</span></button>
                                      </>
                                    )}
                                  </div>
                                  {isSubExpanded && (
                                    <div className="pl-14 py-1 space-y-0.5">
                                      {subgroupsMap.size > 0 ? (
                                        Array.from(subgroupsMap.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([sg, sgCount]) => {
                                          const isSgEditing = editingItem?.field === 'productSubgroup' && editingItem.oldValue === sg && editingItem.parentType === type && editingItem.parentSubtype === sub;
                                          return (
                                            <div key={sg} className="flex items-center gap-2 py-1 group/sg rounded-lg hover:bg-white/60 dark:hover:bg-slate-800/30 transition-colors">
                                              {isSgEditing ? (
                                                <InlineForm value={editValue} onChange={setEditValue} onSubmit={handleTypeRename} onCancel={() => setEditingItem(null)} disabled={saving} />
                                              ) : (
                                                <>
                                                  <div className="w-0.5 h-2.5 rounded-full bg-teal-400 dark:bg-teal-600" />
                                                  <span className="flex-1 text-[12px] text-slate-500 dark:text-slate-400">{sg}</span>
                                                  <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-teal-100 dark:bg-teal-900/20 text-teal-600 dark:text-teal-400 min-w-[20px] text-center">{sgCount}</span>
                                                  <button onClick={() => startTypeEdit('productSubgroup', sg, type, sub)} className={`${actionBtnCls} text-slate-400 hover:text-teal-500 hover:bg-teal-50 dark:hover:bg-teal-900/20 opacity-100 sm:opacity-0 sm:group-hover/sg:opacity-100 transition-opacity`} title="Renomear"><span className="material-symbols-outlined text-[14px]">edit</span></button>
                                                  <button onClick={() => handleTypeDelete('productSubgroup', sg, type, sub)} className={`${actionBtnCls} text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 opacity-100 sm:opacity-0 sm:group-hover/sg:opacity-100 transition-opacity`} title="Excluir" disabled={saving}><span className="material-symbols-outlined text-[14px]">delete</span></button>
                                                </>
                                              )}
                                            </div>
                                          );
                                        })
                                      ) : (
                                        <p className="text-[11px] text-slate-400 dark:text-slate-500 py-0.5">Nenhum subgrupo</p>
                                      )}
                                      {newSubgroupFor === `${type}|${sub}` ? (
                                        <div className="py-1">
                                          <InlineForm
                                            value={newSubgroupName} onChange={setNewSubgroupName}
                                            onSubmit={async () => {
                                              if (!newSubgroupName.trim() || saving) return;
                                              setSaving(true);
                                              try {
                                                const res = await fetch('/api/products/rename-type', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'addSubgroup', parentType: type, parentSubtype: sub, subgroupName: newSubgroupName.trim() }) });
                                                if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e?.error || 'Falha'); }
                                                toast.success(`Subgrupo "${newSubgroupName.trim()}" criado`);
                                                await refreshAfterMutation();
                                              } catch (e) { toast.error(e instanceof Error ? e.message : 'Erro'); } finally { setSaving(false); }
                                              setNewSubgroupName(''); setNewSubgroupFor(null);
                                            }}
                                            onCancel={() => setNewSubgroupFor(null)} placeholder="Novo subgrupo..."
                                          />
                                        </div>
                                      ) : (
                                        <button onClick={() => { setNewSubgroupFor(`${type}|${sub}`); setNewSubgroupName(''); }} className="flex items-center gap-1.5 py-1 text-[11px] font-medium text-slate-400 hover:text-teal-500 transition-colors">
                                          <span className="material-symbols-outlined text-[14px]">add_circle</span>Adicionar subgrupo
                                        </button>
                                      )}
                                    </div>
                                  )}
                                </div>
                              );
                            })
                          ) : (
                            <p className="text-[12px] text-slate-400 dark:text-slate-500 pl-7 py-1">Nenhum grupo</p>
                          )}
                          {newSubtypeFor === type ? (
                            <div className="pl-7 py-1">
                              <InlineForm
                                value={newSubtypeName} onChange={setNewSubtypeName}
                                onSubmit={async () => {
                                  if (!newSubtypeName.trim() || saving) return;
                                  setSaving(true);
                                  try {
                                    const res = await fetch('/api/products/rename-type', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'addGroup', parentType: type, subtypeName: newSubtypeName.trim() }) });
                                    if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e?.error || 'Falha'); }
                                    toast.success(`Grupo "${newSubtypeName.trim()}" criado`);
                                    await refreshAfterMutation();
                                  } catch (e) { toast.error(e instanceof Error ? e.message : 'Erro'); } finally { setSaving(false); }
                                  setNewSubtypeName(''); setNewSubtypeFor(null);
                                }}
                                onCancel={() => setNewSubtypeFor(null)} placeholder="Novo grupo..."
                              />
                            </div>
                          ) : (
                            <button onClick={() => { setNewSubtypeFor(type); setNewSubtypeName(''); }} className="flex items-center gap-1.5 pl-7 py-1.5 text-[12px] font-medium text-slate-400 hover:text-amber-500 transition-colors">
                              <span className="material-symbols-outlined text-[15px]">add_circle</span>Adicionar grupo
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}

                <div className="pt-2">
                  <form onSubmit={async (e) => {
                    e.preventDefault();
                    if (!newTypeName.trim() || saving) return;
                    setSaving(true);
                    try {
                      const res = await fetch('/api/products/rename-type', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'addLine', name: newTypeName.trim() }) });
                      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e?.error || 'Falha'); }
                      toast.success(`Linha "${newTypeName.trim()}" criada`);
                      await refreshAfterMutation();
                    } catch (e) { toast.error(e instanceof Error ? e.message : 'Erro'); } finally { setSaving(false); }
                    setNewTypeName('');
                  }} className="flex items-center gap-2">
                    <input placeholder="Nova linha..." value={newTypeName} onChange={(e) => setNewTypeName(e.target.value)} className="flex-1 px-3 py-2.5 text-sm border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-900/50 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-shadow" />
                    <button type="submit" className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold text-primary border border-primary/30 rounded-xl hover:bg-primary/5 dark:hover:bg-primary/10 transition-colors"><span className="material-symbols-outlined text-[18px]">add</span>Adicionar</button>
                  </form>
                </div>
              </div>
            )}

            {/* ════════════ FABRICANTES ════════════ */}
            {activeSection === 'manufacturers' && (
              <div className="flex flex-col h-full">
                <div className="px-5 pt-4 pb-3 space-y-3 border-b border-slate-100 dark:border-slate-800/50">
                  <div className="relative">
                    <span className="material-symbols-outlined text-[18px] text-slate-400 absolute left-3 top-1/2 -translate-y-1/2">search</span>
                    <input type="text" placeholder="Buscar fabricante..." value={mfrSearch} onChange={(e) => setMfrSearch(e.target.value)} className="w-full pl-10 pr-3 py-2.5 text-sm border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-900/50 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-shadow" />
                  </div>
                  <div className="rounded-xl border border-dashed border-teal-300 dark:border-teal-800/50 bg-teal-50/30 dark:bg-teal-900/10 px-4 py-3">
                    <p className="text-[10px] font-bold text-teal-600 dark:text-teal-400 uppercase tracking-wider mb-2">Adicionar fabricante</p>
                    <div className="flex gap-2">
                      <input placeholder="Nome completo" value={newMfrName} onChange={(e) => setNewMfrName(e.target.value)} className="flex-1 px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-900/50 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/40 transition-shadow" />
                      <input placeholder="Abreviado" value={newMfrShort} onChange={(e) => setNewMfrShort(e.target.value)} className="w-36 px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-900/50 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/40 transition-shadow" />
                      <button onClick={handleMfrAdd} disabled={addingNew || !newMfrName.trim()} className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-teal-700 dark:text-teal-400 border border-teal-300 dark:border-teal-700 rounded-xl hover:bg-teal-50 dark:hover:bg-teal-900/20 transition-colors disabled:opacity-50"><span className="material-symbols-outlined text-[18px]">add</span>Adicionar</button>
                    </div>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto px-5 py-3 space-y-2">
                  {filteredMfrs.length === 0 && (
                    <div className="flex flex-col items-center py-8">
                      <span className="material-symbols-outlined text-[36px] text-slate-300 dark:text-slate-600 mb-2">inbox</span>
                      <p className="text-[13px] text-slate-400 dark:text-slate-500">Nenhum fabricante encontrado.</p>
                    </div>
                  )}
                  {filteredMfrs.map((mfr) => {
                    const isEditingName = editingMfr === mfr.name;
                    const isEditingShortName = editingShort === mfr.name;
                    return (
                      <div key={mfr.name} className="group/mfr rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/30 hover:border-slate-300 dark:hover:border-slate-600 transition-colors overflow-hidden">
                        <div className="flex items-center gap-2.5 px-4 py-2.5">
                          {isEditingName ? (
                            <MfrInlineForm value={mfrEditValue} onChange={setMfrEditValue} onSubmit={() => handleMfrRename(mfr.name)} onCancel={() => setEditingMfr(null)} disabled={saving} />
                          ) : (
                            <>
                              <div className="w-8 h-8 rounded-lg bg-teal-50 dark:bg-teal-900/20 flex items-center justify-center shrink-0"><span className="material-symbols-outlined text-[16px] text-teal-500">factory</span></div>
                              <div className="flex-1 min-w-0">
                                <span className="text-[13px] font-semibold text-slate-800 dark:text-slate-200 truncate block" title={mfr.name}>{mfr.name}</span>
                                {mfr.shortName && <span className="text-[11px] text-slate-500 dark:text-slate-400">{mfr.shortName}</span>}
                              </div>
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-teal-100 dark:bg-teal-900/20 text-teal-600 dark:text-teal-400 ring-1 ring-teal-200/50 dark:ring-teal-800/30 min-w-[28px] text-center shrink-0">{mfr.count}</span>
                              <button onClick={() => { setEditingMfr(mfr.name); setMfrEditValue(mfr.name); }} className={`${actionBtnCls} text-slate-400 hover:text-teal-500 hover:bg-teal-50 dark:hover:bg-teal-900/20 opacity-100 sm:opacity-0 sm:group-hover/mfr:opacity-100 transition-opacity shrink-0`} title="Renomear"><span className="material-symbols-outlined text-[16px]">edit</span></button>
                              <button onClick={() => handleMfrDelete(mfr.name)} className={`${actionBtnCls} text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 opacity-100 sm:opacity-0 sm:group-hover/mfr:opacity-100 transition-opacity shrink-0`} title="Excluir" disabled={saving}><span className="material-symbols-outlined text-[16px]">delete</span></button>
                            </>
                          )}
                        </div>
                        {!isEditingName && (
                          <div className="flex items-center gap-2 px-4 py-2 border-t border-slate-100 dark:border-slate-800/50 bg-slate-50/50 dark:bg-slate-900/20">
                            <span className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wider font-bold w-24 shrink-0">Abreviado</span>
                            {isEditingShortName ? (
                              <MfrInlineForm value={shortValue} onChange={setShortValue} onSubmit={() => handleMfrShortName(mfr.name)} onCancel={() => setEditingShort(null)} placeholder="Ex: Medtronic" disabled={saving} />
                            ) : (
                              <>
                                <span className={`flex-1 text-[13px] ${mfr.shortName ? 'text-slate-700 dark:text-slate-300 font-medium' : 'text-slate-400 dark:text-slate-500 italic'}`}>{mfr.shortName || 'não definido'}</span>
                                <button onClick={() => { setEditingShort(mfr.name); setShortValue(mfr.shortName || ''); }} className={`${actionBtnCls} text-slate-400 hover:text-teal-500 hover:bg-teal-50 dark:hover:bg-teal-900/20 opacity-100 sm:opacity-0 sm:group-hover/mfr:opacity-100 transition-opacity shrink-0`} title="Definir nome abreviado"><span className="material-symbols-outlined text-[15px]">edit</span></button>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ════════════ DADOS FISCAIS ════════════ */}
            {activeSection === 'fiscal' && (
              <div className="flex flex-col sm:flex-row h-full min-h-0">
                {/* Fiscal vertical sidebar (sm+) / horizontal scroll (mobile) */}
                <div className="shrink-0 sm:w-44 border-b sm:border-b-0 sm:border-r border-slate-100 dark:border-slate-800/50 bg-white/50 dark:bg-slate-900/20">
                  <div className="flex sm:flex-col overflow-x-auto sm:overflow-x-visible sm:py-2 scrollbar-none">
                    {FISCAL_TABS.map((tab) => {
                      const isActive = fiscalTab === tab.key;
                      const itemCount = fiscalItemsMap[tab.key].size;
                      return (
                        <button key={tab.key} onClick={() => { setFiscalTab(tab.key); setFiscalEditItem(null); setNewFiscalName(''); setFiscalSearch(''); }}
                          className={`shrink-0 flex items-center gap-2 px-4 py-2.5 sm:py-2 text-left transition-colors whitespace-nowrap ${isActive ? 'bg-amber-50/80 dark:bg-amber-900/15 border-b-2 sm:border-b-0 sm:border-r-2 border-amber-500' : 'hover:bg-slate-50 dark:hover:bg-slate-800/30 border-b-2 sm:border-b-0 sm:border-r-2 border-transparent'}`}>
                          <span className={`material-symbols-outlined text-[16px] ${isActive ? 'text-amber-500 dark:text-amber-400' : 'text-slate-400'}`}>{tab.icon}</span>
                          <span className={`text-[12px] font-semibold ${isActive ? 'text-amber-700 dark:text-amber-300' : 'text-slate-500 dark:text-slate-400'}`}>{tab.label}</span>
                          <span className={`ml-auto px-1.5 py-0.5 rounded-full text-[9px] font-bold min-w-[18px] text-center ${isActive ? 'bg-amber-200/60 dark:bg-amber-800/40 text-amber-700 dark:text-amber-300' : 'bg-slate-100 dark:bg-slate-700 text-slate-400 dark:text-slate-500'}`}>{itemCount}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Fiscal content area */}
                <div className="flex-1 min-w-0 overflow-y-auto px-4 py-4 space-y-1.5">
                  {/* Search + count header */}
                  <div className="flex items-center gap-3">
                    <div className="relative flex-1">
                      <span className="material-symbols-outlined text-[18px] text-slate-400 absolute left-3 top-1/2 -translate-y-1/2">search</span>
                      <input type="text" placeholder={`Buscar ${activeTabMeta.label}...`} value={fiscalSearch} onChange={(e) => setFiscalSearch(e.target.value)} className="w-full pl-10 pr-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-900/50 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-400/40 focus:border-amber-400 transition-shadow" />
                    </div>
                    <span className="text-[11px] font-medium text-slate-400 dark:text-slate-500 whitespace-nowrap tabular-nums">{currentFiscalItems.length} {currentFiscalItems.length === 1 ? 'item' : 'itens'}</span>
                  </div>

                  {currentFiscalItems.length === 0 && (
                    <div className="flex flex-col items-center py-8">
                      <span className="material-symbols-outlined text-[36px] text-slate-300 dark:text-slate-600 mb-2">inbox</span>
                      <p className="text-[13px] text-slate-400 dark:text-slate-500">{fiscalSearch ? 'Nenhum resultado encontrado.' : 'Nenhum item cadastrado.'}</p>
                    </div>
                  )}

                  {currentFiscalItems.map(([value, count]) => {
                    const isEditing = fiscalEditItem?.field === fiscalTab && fiscalEditItem.oldValue === value;
                    const useMonospace = fiscalTab === 'ncm' || fiscalTab === 'cest' || fiscalTab === 'cfopEntrada' || fiscalTab === 'cfopSaida';
                    return (
                      <div key={value} className="flex items-center gap-2.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/30 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors group/item">
                        {isEditing ? (
                          <form onSubmit={(e) => { e.preventDefault(); handleFiscalRename(); }} className="flex items-center gap-1.5 flex-1">
                            <input autoFocus value={fiscalEditValue} onChange={(e) => setFiscalEditValue(e.target.value)} className="flex-1 px-3 py-1.5 text-sm border border-amber-400/50 rounded-xl bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-400/40 transition-shadow" disabled={saving} />
                            <button type="submit" disabled={saving} className={`${actionBtnCls} text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20`}><span className="material-symbols-outlined text-[18px]">check</span></button>
                            <button type="button" onClick={() => setFiscalEditItem(null)} className={`${actionBtnCls} text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800`}><span className="material-symbols-outlined text-[18px]">close</span></button>
                          </form>
                        ) : (
                          <>
                            <div className="w-1 h-4 rounded-full bg-amber-400 dark:bg-amber-500 shrink-0" />
                            {(() => {
                              const dashIdx = value.indexOf(' – ');
                              const isCfop = fiscalTab === 'cfopEntrada' || fiscalTab === 'cfopSaida';
                              // CFOP with description from cache (raw code like "1918")
                              if (isCfop && dashIdx < 0 && cfopDescCache[value]) {
                                return (
                                  <span className="flex-1 text-[13px] min-w-0 break-words">
                                    <span className="font-mono font-bold text-slate-900 dark:text-white bg-amber-100/60 dark:bg-amber-900/20 px-1.5 py-0.5 rounded-md ring-1 ring-amber-200/40 dark:ring-amber-800/30">{value}</span>
                                    <span className="ml-1.5 text-slate-500 dark:text-slate-400">{cfopDescCache[value]}</span>
                                  </span>
                                );
                              }
                              if (dashIdx > 0) {
                                const code = value.slice(0, dashIdx);
                                const desc = value.slice(dashIdx + 3);
                                return (
                                  <span className="flex-1 text-[13px] min-w-0 break-words">
                                    <span className="font-mono font-bold text-slate-900 dark:text-white bg-amber-100/60 dark:bg-amber-900/20 px-1.5 py-0.5 rounded-md ring-1 ring-amber-200/40 dark:ring-amber-800/30">{code}</span>
                                    <span className="ml-1.5 text-slate-500 dark:text-slate-400">{desc}</span>
                                  </span>
                                );
                              }
                              const ncmDigits = fiscalTab === 'ncm' ? value.replace(/\D/g, '') : '';
                              const ncmInfo = ncmDigits.length >= 4 ? ncmDescCache[ncmDigits] : null;
                              if (fiscalTab === 'ncm') {
                                const formatted = ncmDigits.length === 8 ? `${ncmDigits.slice(0,4)}.${ncmDigits.slice(4,6)}.${ncmDigits.slice(6,8)}` : value;
                                const hierarchy = ncmInfo?.hierarchy || [];
                                const isExpanded = ncmExpandedItems.has(value);
                                const toggleExpand = () => setNcmExpandedItems((prev) => { const n = new Set(prev); n.has(value) ? n.delete(value) : n.add(value); return n; });
                                return (
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-1.5">
                                      <span className="font-mono font-bold text-slate-900 dark:text-white bg-amber-100/60 dark:bg-amber-900/20 px-1.5 py-0.5 rounded-md ring-1 ring-amber-200/40 dark:ring-amber-800/30 text-[13px] shrink-0">{formatted}</span>
                                      {ncmInfo && <span className="text-[12px] text-slate-600 dark:text-slate-300 truncate">{ncmInfo.descricao}</span>}
                                      {hierarchy.length > 1 && (
                                        <button onClick={toggleExpand} className="shrink-0 ml-auto text-slate-400 hover:text-amber-500 transition-colors" title={isExpanded ? 'Recolher hierarquia' : 'Ver hierarquia'}>
                                          <span className={`material-symbols-outlined text-[16px] transition-transform ${isExpanded ? 'rotate-180' : ''}`}>expand_more</span>
                                        </button>
                                      )}
                                    </div>
                                    {isExpanded && hierarchy.length > 0 && (
                                      <div className="mt-1 ml-1 border-l-2 border-amber-200/60 dark:border-amber-800/40 pl-2.5 space-y-0.5">
                                        {hierarchy.map((h, i) => {
                                          const hCode = h.codigo.replace(/\D/g, '');
                                          const hFormatted = hCode.length === 8 ? `${hCode.slice(0,4)}.${hCode.slice(4,6)}.${hCode.slice(6,8)}`
                                            : hCode.length === 6 ? `${hCode.slice(0,4)}.${hCode.slice(4,6)}`
                                            : hCode.length === 4 ? hCode : h.codigo;
                                          const isLeaf = i === hierarchy.length - 1;
                                          return (
                                            <div key={i} className="flex items-baseline gap-1.5 text-[11px]" style={{ paddingLeft: `${i * 10}px` }}>
                                              <span className={`font-mono shrink-0 ${isLeaf ? 'font-bold text-amber-600 dark:text-amber-400' : 'text-slate-400 dark:text-slate-500'}`}>{hFormatted}</span>
                                              <span className={isLeaf ? 'text-slate-700 dark:text-slate-300' : 'text-slate-400 dark:text-slate-500'}>{h.descricao}</span>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    )}
                                  </div>
                                );
                              }
                              return <span className={`flex-1 text-[13px] font-medium text-slate-800 dark:text-slate-200 min-w-0 break-words ${useMonospace ? 'font-mono' : ''}`}>{value}</span>;
                            })()}
                            <span className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold min-w-[28px] text-center tabular-nums ${count > 0 ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 ring-1 ring-amber-200/50 dark:ring-amber-800/30' : 'bg-transparent text-slate-300 dark:text-slate-600 border border-dashed border-slate-200 dark:border-slate-700'}`}>{count}</span>
                            {fiscalTab !== 'ncm' && (<>
                            <button onClick={() => { setFiscalEditItem({ field: fiscalTab, oldValue: value }); setFiscalEditValue(value); }} className={`${actionBtnCls} shrink-0 text-slate-400 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20 opacity-100 sm:opacity-0 sm:group-hover/item:opacity-100 transition-opacity`} title="Renomear"><span className="material-symbols-outlined text-[16px]">edit</span></button>
                            <button onClick={() => handleFiscalDelete(fiscalTab, value)} className={`${actionBtnCls} shrink-0 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 opacity-100 sm:opacity-0 sm:group-hover/item:opacity-100 transition-opacity`} title="Excluir" disabled={saving}><span className="material-symbols-outlined text-[16px]">delete</span></button>
                            </>)}
                          </>
                        )}
                      </div>
                    );
                  })}

                  {fiscalTab === 'ncm' && (
                  <div className="pt-2">
                    <button
                      onClick={async () => {
                        setSyncingNcmBulk(true);
                        try {
                          const res = await fetch('/api/ncm/bulk-sync', { method: 'POST' });
                          const data = await res.json();
                          if (data.ok) {
                            toast.success(`Tabela SISCOMEX sincronizada: ${data.total?.toLocaleString('pt-BR') || 0} NCMs`);
                            await refreshAfterMutation();
                          } else {
                            toast.error(data.error || 'Erro ao sincronizar SISCOMEX');
                          }
                        } catch {
                          toast.error('Erro de rede ao sincronizar SISCOMEX');
                        } finally {
                          setSyncingNcmBulk(false);
                        }
                      }}
                      disabled={syncingNcmBulk}
                      className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold text-amber-600 dark:text-amber-400 border border-amber-300/50 dark:border-amber-700/50 rounded-xl hover:bg-amber-50 dark:hover:bg-amber-900/10 transition-colors disabled:opacity-50"
                    >
                      <span className={`material-symbols-outlined text-[18px] ${syncingNcmBulk ? 'animate-spin' : ''}`}>{syncingNcmBulk ? 'progress_activity' : 'cloud_download'}</span>
                      {syncingNcmBulk ? 'Sincronizando SISCOMEX...' : 'Sincronizar tabela SISCOMEX'}
                    </button>
                  </div>
                  )}
                  {fiscalTab !== 'ncm' && (
                  <div className="pt-2">
                    <form onSubmit={(e) => { e.preventDefault(); handleFiscalAdd(); }} className="flex items-center gap-2">
                      <input placeholder={`Novo ${activeTabMeta.label}...`} value={newFiscalName} onChange={(e) => setNewFiscalName(e.target.value)} className="flex-1 px-3 py-2.5 text-sm border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-900/50 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-400/40 focus:border-amber-400 transition-shadow" />
                      <button type="submit" disabled={saving} className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold text-amber-600 dark:text-amber-400 border border-amber-300/50 dark:border-amber-700/50 rounded-xl hover:bg-amber-50 dark:hover:bg-amber-900/10 transition-colors disabled:opacity-50"><span className="material-symbols-outlined text-[18px]">add</span>Adicionar</button>
                    </form>
                  </div>
                  )}
                </div>
              </div>
            )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
      <ConfirmDialog
        isOpen={!!pendingDelete}
        onClose={() => setPendingDelete(null)}
        onConfirm={async () => {
          if (!pendingDelete) return;
          await pendingDelete.onConfirm();
          setPendingDelete(null);
        }}
        title={pendingDelete?.title || 'Confirmar exclusão'}
        message={pendingDelete?.message || ''}
        confirmLabel="Remover"
        cancelLabel="Cancelar"
        confirmVariant="danger"
        loading={saving}
      />
    </>
  );
}

export default SettingsModal;
