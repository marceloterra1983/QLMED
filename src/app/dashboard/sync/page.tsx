'use client';

import { useState, useEffect, useRef } from 'react';
import { toast } from 'sonner';

interface Company {
  id: string;
  cnpj: string;
  razaoSocial: string;
}

interface SyncLog {
  id: string;
  companyId: string;
  syncMethod: string;
  status: string;
  newDocs: number;
  updatedDocs: number;
  errorMessage: string | null;
  startedAt: string;
  completedAt: string | null;
}

type SyncState = 'idle' | 'syncing' | 'polling' | 'completed' | 'error';

interface SyncMethodState {
  state: SyncState;
  message: string;
  result: { newDocs: number; updatedDocs: number; total: number } | null;
}

const initialMethodState: SyncMethodState = {
  state: 'idle',
  message: '',
  result: null,
};

export default function SyncPage() {
  const [company, setCompany] = useState<Company | null>(null);
  const [hasNsdocsConfig, setHasNsdocsConfig] = useState<boolean | null>(null);
  const [hasCertificate, setHasCertificate] = useState<boolean | null>(null);
  const [logs, setLogs] = useState<SyncLog[]>([]);

  // States separados por método
  const [sefazState, setSefazState] = useState<SyncMethodState>({ ...initialMethodState });
  const [nsdocsState, setNsdocsState] = useState<SyncMethodState>({ ...initialMethodState });
  const sefazPollingRef = useRef<NodeJS.Timeout | null>(null);
  const nsdocsPollingRef = useRef<NodeJS.Timeout | null>(null);

  // States para importação de histórico
  const [importStartDate, setImportStartDate] = useState('2021-01-01');
  const [importEndDate, setImportEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [importStatus, setImportStatus] = useState<'idle' | 'running' | 'completed' | 'error'>('idle');
  const [importProgress, setImportProgress] = useState(0);
  const [currentImportPeriod, setCurrentImportPeriod] = useState('');
  const [importLogs, setImportLogs] = useState<string[]>([]);

  // Carregar empresa fixa
  useEffect(() => {
    fetch('/api/companies')
      .then(res => res.json())
      .then(data => {
        setCompany(data.companies?.[0] || null);
      })
      .catch(() => toast.error('Erro ao carregar empresa'));
  }, []);

  // Carregar logs e verificar configs
  useEffect(() => {
    Promise.all([
      fetch('/api/nsdocs/config').then(r => r.json()),
      fetch('/api/certificate/info').then(r => r.json()),
    ]).then(([nsdocsData, certData]) => {
      setHasNsdocsConfig(!!nsdocsData.config);
      setHasCertificate(!!certData.hasCertificate);
    }).catch(() => {
      setHasNsdocsConfig(false);
      setHasCertificate(false);
      toast.error('Erro ao verificar configurações');
    });

    loadLogs();
  }, []);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (sefazPollingRef.current) clearInterval(sefazPollingRef.current);
      if (nsdocsPollingRef.current) clearInterval(nsdocsPollingRef.current);
    };
  }, []);

  const loadLogs = () => {
    fetch('/api/nsdocs/sync')
      .then(res => res.json())
      .then(data => setLogs(data.logs || []))
      .catch(() => toast.error('Erro ao carregar histórico'));
  };

  const handleSync = async (method: 'sefaz' | 'nsdocs') => {
    const setState = method === 'sefaz' ? setSefazState : setNsdocsState;
    const pollingRef = method === 'sefaz' ? sefazPollingRef : nsdocsPollingRef;

    setState({ state: 'syncing', message: 'Iniciando sincronização...', result: null });

    try {
      const res = await fetch('/api/nsdocs/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method }),
      });
      const data = await res.json();

      if (data.error) {
        setState({ state: 'error', message: data.error, result: null });
        return;
      }

      const { idConsulta, syncLogId } = data;
      setState({
        state: 'polling',
        message: method === 'sefaz' ? 'Consultando SEFAZ diretamente...' : 'Consultando via NSDocs...',
        result: null,
      });

      let attempts = 0;
      const maxAttempts = 30;

      pollingRef.current = setInterval(async () => {
        attempts++;

        try {
          const url = `/api/nsdocs/sync?syncLogId=${syncLogId}${idConsulta ? `&idConsulta=${idConsulta}` : ''}`;
          const pollRes = await fetch(url);
          const pollData = await pollRes.json();

          if (pollData.status === 'completed') {
            if (pollingRef.current) clearInterval(pollingRef.current);
            setState({
              state: 'completed',
              message: 'Sincronização concluída!',
              result: {
                newDocs: pollData.newDocs,
                updatedDocs: pollData.updatedDocs,
                total: pollData.totalDocumentos || 0,
              },
            });
            toast.success(`Sincronização ${method.toUpperCase()} concluída!`);
            loadLogs();
          } else if (pollData.status === 'error') {
            if (pollingRef.current) clearInterval(pollingRef.current);
            setState({ state: 'error', message: pollData.error || 'Erro desconhecido', result: null });
            toast.error(pollData.error || 'Erro na sincronização');
            loadLogs();
          } else if (attempts >= maxAttempts) {
            if (pollingRef.current) clearInterval(pollingRef.current);
            setState({ state: 'error', message: 'Timeout: a consulta demorou demais.', result: null });
          }
        } catch {
          if (pollingRef.current) clearInterval(pollingRef.current);
          setState({ state: 'error', message: 'Erro de conexão durante polling', result: null });
        }
      }, 3000);
    } catch {
      setState({ state: 'error', message: 'Erro ao iniciar a consulta', result: null });
    }
  };

  // Helpers para importação de histórico
  const addLog = (msg: string) => setImportLogs(prev => [msg, ...prev]);

  const formatDateStr = (year: number, month: number, day: number): string => {
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  };

  const lastDayOfMonth = (year: number, month: number): number => {
    return new Date(year, month, 0).getDate();
  };

  const handleImportHistory = async () => {
    if (!importStartDate || !importEndDate) return;

    setImportStatus('running');
    setImportProgress(0);
    setImportLogs([]);
    addLog('Iniciando importação de histórico...');

    const [startYear, startMonth, startDay] = importStartDate.split('-').map(Number);
    const [endYear, endMonth, endDay] = importEndDate.split('-').map(Number);

    const periods: { start: string; end: string }[] = [];
    let curYear = startYear;
    let curMonth = startMonth;

    while (curYear < endYear || (curYear === endYear && curMonth <= endMonth)) {
      const pStartDay = (curYear === startYear && curMonth === startMonth) ? startDay : 1;
      const pEndDay = (curYear === endYear && curMonth === endMonth) ? endDay : lastDayOfMonth(curYear, curMonth);

      periods.push({
        start: formatDateStr(curYear, curMonth, pStartDay),
        end: formatDateStr(curYear, curMonth, pEndDay),
      });

      curMonth++;
      if (curMonth > 12) {
        curMonth = 1;
        curYear++;
      }
    }

    const totalMonths = periods.length;
    let processedMonths = 0;

    for (const period of periods) {
      setCurrentImportPeriod(`${period.start} a ${period.end}`);
      addLog(`Processando ${period.start} até ${period.end}...`);

      try {
        const res = await fetch('/api/nsdocs/import-period', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            startDate: period.start,
            endDate: period.end,
          }),
        });

        const data = await res.json();

        if (res.ok) {
          addLog(`\u2705 Sucesso: ${data.imported} importados, ${data.skipped} pulados.`);
          if (data.errors > 0) addLog(`\u26a0\ufe0f ${data.errors} erros neste período.`);
        } else {
          addLog(`\u274c Erro: ${data.error}`);
        }
      } catch (err: any) {
        addLog(`\u274c Falha de conexão: ${err.message}`);
      }

      processedMonths++;
      setImportProgress(Math.min((processedMonths / totalMonths) * 100, 100));

      await new Promise(r => setTimeout(r, 500));
    }

    setImportStatus('completed');
    setImportProgress(100);
    addLog('Importação de histórico concluída.');
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      running: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
      completed: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
      error: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    };
    const icons: Record<string, string> = {
      running: 'sync',
      completed: 'check_circle',
      error: 'error',
    };
    return (
      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold ${styles[status] || styles.error}`}>
        <span className={`material-symbols-outlined text-[14px] ${status === 'running' ? 'animate-spin' : ''}`}>
          {icons[status] || 'help'}
        </span>
        {status === 'running' ? 'Em andamento' : status === 'completed' ? 'Concluído' : 'Erro'}
      </span>
    );
  };

  const getMethodBadge = (method: string) => {
    if (method === 'sefaz') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
          <span className="material-symbols-outlined text-[12px]">verified_user</span>
          SEFAZ
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400">
        <span className="material-symbols-outlined text-[12px]">hub</span>
        NSDocs
      </span>
    );
  };

  const renderSyncCard = (method: 'sefaz' | 'nsdocs', methodState: SyncMethodState) => {
    const isSefaz = method === 'sefaz';
    const disabled = isSefaz ? !hasCertificate : !hasNsdocsConfig;
    const isBusy = methodState.state === 'syncing' || methodState.state === 'polling';

    return (
      <div className="bg-white dark:bg-card-dark rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                isSefaz
                  ? 'bg-emerald-100 dark:bg-emerald-900/30'
                  : 'bg-sky-100 dark:bg-sky-900/30'
              }`}>
                <span className={`material-symbols-outlined text-[22px] ${
                  isSefaz
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-sky-600 dark:text-sky-400'
                }`}>
                  {isSefaz ? 'verified_user' : 'hub'}
                </span>
              </div>
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white">
                  Sincronização {isSefaz ? 'SEFAZ' : 'NSDocs'}
                </h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                  {isSefaz
                    ? 'Consulta direta via certificado digital A1'
                    : 'Consulta via API NSDocs'}
                </p>
              </div>
            </div>
            <button
              onClick={() => handleSync(method)}
              disabled={disabled || isBusy}
              className={`px-5 py-2.5 rounded-xl font-bold text-sm transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 ${
                isSefaz
                  ? 'bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-600 text-white shadow-emerald-600/30 hover:shadow-lg hover:shadow-emerald-600/40'
                  : 'bg-gradient-to-r from-sky-600 to-sky-700 hover:from-sky-700 hover:to-sky-600 text-white shadow-sky-600/30 hover:shadow-lg hover:shadow-sky-600/40'
              }`}
            >
              <span className={`material-symbols-outlined text-[18px] ${isBusy ? 'animate-spin' : ''}`}>
                {isBusy ? 'sync' : 'cloud_download'}
              </span>
              {isBusy ? 'Consultando...' : `Sincronizar ${isSefaz ? 'SEFAZ' : 'NSDocs'}`}
            </button>
          </div>

          {disabled && (
            <div className="mt-4 flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
              <span className="material-symbols-outlined text-[16px]">info</span>
              {isSefaz
                ? <>Configure o <a href="/dashboard/certificado" className="underline font-semibold">Certificado Digital</a> para usar esta opção</>
                : <>Configure a <a href="/dashboard/configuracoes" className="underline font-semibold">Integração NSDocs</a> para usar esta opção</>}
            </div>
          )}

          {/* Progress */}
          {methodState.state !== 'idle' && (
            <div className="mt-4">
              {isBusy && (
                <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2 mb-3 overflow-hidden">
                  <div className={`h-2 rounded-full animate-pulse ${
                    isSefaz ? 'bg-gradient-to-r from-emerald-500 to-emerald-400' : 'bg-gradient-to-r from-sky-500 to-sky-400'
                  }`} style={{ width: methodState.state === 'syncing' ? '30%' : '70%' }} />
                </div>
              )}

              <div className={`flex items-center gap-2 text-sm font-medium ${
                methodState.state === 'completed' ? 'text-green-600 dark:text-green-400' :
                methodState.state === 'error' ? 'text-red-600 dark:text-red-400' :
                'text-primary dark:text-blue-400'
              }`}>
                <span className="material-symbols-outlined text-[18px]">
                  {methodState.state === 'completed' ? 'check_circle' : methodState.state === 'error' ? 'error' : 'hourglass_top'}
                </span>
                {methodState.message}
              </div>

              {methodState.result && (
                <div className="grid grid-cols-3 gap-3 mt-4">
                  <div className="bg-green-50 dark:bg-green-900/20 rounded-xl p-3 text-center border border-green-100 dark:border-green-800">
                    <p className="text-xl font-bold text-green-700 dark:text-green-400">{methodState.result.newDocs}</p>
                    <p className="text-xs text-green-600 dark:text-green-500 font-medium mt-0.5">Novas notas</p>
                  </div>
                  <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-3 text-center border border-blue-100 dark:border-blue-800">
                    <p className="text-xl font-bold text-blue-700 dark:text-blue-400">{methodState.result.updatedDocs}</p>
                    <p className="text-xs text-blue-600 dark:text-blue-500 font-medium mt-0.5">Atualizados</p>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3 text-center border border-slate-200 dark:border-slate-700">
                    <p className="text-xl font-bold text-slate-700 dark:text-slate-300">{methodState.result.total}</p>
                    <p className="text-xs text-slate-500 font-medium mt-0.5">Total consultados</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
          <span className="material-symbols-outlined text-primary text-[28px]">cloud_sync</span>
          Sincronizar
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Sincronize documentos fiscais via SEFAZ ou NSDocs
        </p>
      </div>

      {/* Empresa fixa + Badges */}
      <div className="bg-white dark:bg-card-dark rounded-xl border border-slate-200 dark:border-slate-800 p-6">
        <div className="flex-1">
          <p className="block text-sm font-semibold text-slate-700 dark:text-slate-300">Empresa fixa</p>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {company ? `${company.razaoSocial} — ${company.cnpj}` : 'QL MED'}
          </p>
        </div>

        {/* Badges */}
        <div className="flex items-center gap-3 mt-4">
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold border ${
            hasCertificate
              ? 'bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800'
              : 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700'
          }`}>
            <span className="material-symbols-outlined text-[16px]">verified_user</span>
            SEFAZ: {hasCertificate ? 'Ativa' : 'Inativa'}
          </div>

          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold border ${
            hasNsdocsConfig
              ? 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800'
              : 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700'
          }`}>
            <span className="material-symbols-outlined text-[16px]">hub</span>
            NSDocs: {hasNsdocsConfig ? 'Ativa' : 'Inativa'}
          </div>
        </div>
      </div>

      {/* No Config Warning */}
      {hasCertificate === false && hasNsdocsConfig === false && (
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-xl p-6">
          <div className="flex items-start gap-3">
            <span className="material-symbols-outlined text-yellow-600 dark:text-yellow-400 text-[24px] mt-0.5">warning</span>
            <div>
              <h3 className="font-bold text-yellow-900 dark:text-yellow-300 text-sm">Nenhuma integração configurada</h3>
              <p className="text-sm text-yellow-800 dark:text-yellow-400 mt-1">
                Para sincronizar notas, configure o <a href="/dashboard/certificado" className="underline font-semibold hover:text-yellow-600">Certificado Digital</a> (Recomendado) ou a <a href="/dashboard/configuracoes" className="underline font-semibold hover:text-yellow-600">Integração NSDocs</a>.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* CARD 1: SEFAZ Sync */}
      {renderSyncCard('sefaz', sefazState)}

      {/* CARD 2: NSDocs Sync */}
      {renderSyncCard('nsdocs', nsdocsState)}

      {/* CARD 3: Importar Histórico (NSDocs) */}
      <div className={`bg-white dark:bg-card-dark rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden ${!hasNsdocsConfig ? 'opacity-60' : ''}`}>
        <div className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-violet-100 dark:bg-violet-900/30">
              <span className="material-symbols-outlined text-[22px] text-violet-600 dark:text-violet-400">history</span>
            </div>
            <div>
              <h3 className="font-bold text-slate-900 dark:text-white">Importar Histórico (NSDocs)</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                Baixe notas fiscais antigas via NSDocs, mês a mês
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Data Inicial
              </label>
              <input
                type="date"
                value={importStartDate}
                onChange={(e) => setImportStartDate(e.target.value)}
                disabled={!hasNsdocsConfig}
                className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all disabled:opacity-50"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Data Final
              </label>
              <input
                type="date"
                value={importEndDate}
                onChange={(e) => setImportEndDate(e.target.value)}
                disabled={!hasNsdocsConfig}
                className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all disabled:opacity-50"
              />
            </div>
          </div>

          {(importStatus === 'idle' || importStatus === 'completed' || importStatus === 'error') && (
            <button
              onClick={() => { setImportStatus('idle'); handleImportHistory(); }}
              disabled={!hasNsdocsConfig || !importStartDate || !importEndDate}
              className="w-full py-2.5 bg-gradient-to-r from-violet-600 to-violet-700 hover:from-violet-700 hover:to-violet-600 text-white rounded-xl font-bold text-sm transition-all shadow-md shadow-violet-600/30 hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              <span className="material-symbols-outlined text-[18px]">download</span>
              {importStatus === 'completed' ? 'Reimportar' : importStatus === 'error' ? 'Tentar Novamente' : 'Iniciar Importação'}
            </button>
          )}

          {importStatus === 'running' && (
            <div className="space-y-3">
              <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2.5">
                <div
                  className="bg-violet-600 h-2.5 rounded-full transition-all duration-300"
                  style={{ width: `${importProgress}%` }}
                />
              </div>
              <p className="text-sm text-center text-slate-600 dark:text-slate-400 font-medium">
                Processando período: <strong>{currentImportPeriod}</strong> ({Math.round(importProgress)}%)
              </p>
            </div>
          )}

          {importLogs.length > 0 && (
            <div className="mt-4 bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-slate-800 p-4 max-h-60 overflow-y-auto">
              {importLogs.map((log, index) => {
                const isSuccess = log.startsWith('\u2705');
                const isError = log.startsWith('\u274c');
                const isWarning = log.startsWith('\u26a0\ufe0f');
                const icon = isSuccess ? 'check_circle' : isError ? 'error' : isWarning ? 'warning' : 'info';
                const colorClass = isSuccess
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : isError
                  ? 'text-red-600 dark:text-red-400'
                  : isWarning
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-slate-500 dark:text-slate-400';
                return (
                  <div key={index} className={`flex items-start gap-2 py-1.5 ${index > 0 ? 'border-t border-slate-100 dark:border-slate-800' : ''}`}>
                    <span className={`material-symbols-outlined text-[16px] mt-0.5 shrink-0 ${colorClass}`}>{icon}</span>
                    <span className={`text-xs ${colorClass} leading-relaxed`}>{log.replace(/^[\u2705\u274c\u26a0\ufe0f]\s*/, '')}</span>
                  </div>
                );
              })}
            </div>
          )}

          {!hasNsdocsConfig && (
            <div className="mt-4 flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
              <span className="material-symbols-outlined text-[16px]">info</span>
              Configure a <a href="/dashboard/configuracoes" className="underline font-semibold">Integração NSDocs</a> para usar esta opção
            </div>
          )}
        </div>
      </div>

      {/* CARD 4: Histórico de Sincronizações */}
      <div className="bg-white dark:bg-card-dark rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <span className="material-symbols-outlined text-slate-400 text-[20px]">history</span>
            Histórico de Sincronizações
          </h3>
          <button
            onClick={loadLogs}
            className="text-sm text-primary hover:text-primary-dark font-medium flex items-center gap-1"
          >
            <span className="material-symbols-outlined text-[16px]">refresh</span>
            Atualizar
          </button>
        </div>

        {logs.length === 0 ? (
          <div className="p-12 text-center">
            <span className="material-symbols-outlined text-slate-300 dark:text-slate-600 text-[48px]">cloud_off</span>
            <p className="text-slate-500 dark:text-slate-400 mt-3 font-medium">Nenhuma sincronização realizada</p>
            <p className="text-sm text-slate-400 mt-1">
              Use os botões acima para sincronizar documentos fiscais
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {logs.map(log => (
              <div key={log.id} className="px-5 py-4 hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {getMethodBadge(log.syncMethod)}
                    {getStatusBadge(log.status)}
                    <span className="text-sm text-slate-600 dark:text-slate-300">
                      {formatDate(log.startedAt)}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-sm">
                    {log.status === 'completed' && (
                      <>
                        <span className="text-green-600 dark:text-green-400 font-semibold">
                          +{log.newDocs} novas
                        </span>
                        <span className="text-primary dark:text-blue-400 font-semibold">
                          {log.updatedDocs} atualizadas
                        </span>
                      </>
                    )}
                    {log.errorMessage && (
                      <span className="text-red-500 dark:text-red-400 text-xs max-w-xs truncate" title={log.errorMessage}>
                        {log.errorMessage}
                      </span>
                    )}
                    {log.completedAt && (
                      <span className="text-slate-400 text-xs">
                        {Math.round((new Date(log.completedAt).getTime() - new Date(log.startedAt).getTime()) / 1000)}s
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
