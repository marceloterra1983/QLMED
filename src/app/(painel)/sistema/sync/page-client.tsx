'use client';

import { useState, useEffect, useRef, type ReactNode } from 'react';
import { toast } from 'sonner';
import { useRole } from '@/hooks/useRole';

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

type SyncMethod = 'sefaz' | 'nsdocs' | 'receita_nfse';
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
  const { canWrite } = useRole();
  const [mounted, setMounted] = useState(false);
  const [company, setCompany] = useState<Company | null>(null);
  const [hasNsdocsConfig, setHasNsdocsConfig] = useState<boolean | null>(null);
  const [hasReceitaConfig, setHasReceitaConfig] = useState<boolean | null>(null);
  const [hasCertificate, setHasCertificate] = useState<boolean | null>(null);
  const [logs, setLogs] = useState<SyncLog[]>([]);

  // States separados por método
  const [sefazState, setSefazState] = useState<SyncMethodState>({ ...initialMethodState });
  const [nsdocsState, setNsdocsState] = useState<SyncMethodState>({ ...initialMethodState });
  const [receitaState, setReceitaState] = useState<SyncMethodState>({ ...initialMethodState });
  const sefazPollingRef = useRef<NodeJS.Timeout | null>(null);
  const nsdocsPollingRef = useRef<NodeJS.Timeout | null>(null);
  const receitaPollingRef = useRef<NodeJS.Timeout | null>(null);

  // States para importação de histórico
  const [importStartDate, setImportStartDate] = useState('2021-01-01');
  const [importEndDate, setImportEndDate] = useState('');
  const [importStatus, setImportStatus] = useState<'idle' | 'running' | 'completed' | 'error'>('idle');
  const [importProgress, setImportProgress] = useState(0);
  const [currentImportPeriod, setCurrentImportPeriod] = useState('');
  const [importLogs, setImportLogs] = useState<string[]>([]);

  useEffect(() => {
    setMounted(true);
    setImportEndDate(new Date().toISOString().split('T')[0]);
  }, []);

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
      fetch('/api/receita/nfse/config').then(r => r.json()),
      fetch('/api/certificate/info').then(r => r.json()),
    ]).then(([nsdocsData, receitaData, certData]) => {
      setHasNsdocsConfig(!!nsdocsData.config);
      setHasReceitaConfig(!!receitaData.config);
      setHasCertificate(!!certData.hasCertificate);
    }).catch(() => {
      setHasNsdocsConfig(false);
      setHasReceitaConfig(false);
      setHasCertificate(false);
      toast.error('Erro ao verificar configurações');
    });

    loadLogs();
  }, []);

  // Cleanup polling on unmount
  useEffect(() => {
    const sefaz = sefazPollingRef.current;
    const nsdocs = nsdocsPollingRef.current;
    const receita = receitaPollingRef.current;
    return () => {
      if (sefaz) clearInterval(sefaz);
      if (nsdocs) clearInterval(nsdocs);
      if (receita) clearInterval(receita);
    };
  }, []);

  const loadLogs = () => {
    fetch('/api/nsdocs/sync')
      .then(res => res.json())
      .then(data => setLogs(data.logs || []))
      .catch(() => toast.error('Erro ao carregar histórico'));
  };

  const handleSync = async (method: SyncMethod) => {
    const setStateMap = {
      sefaz: setSefazState,
      nsdocs: setNsdocsState,
      receita_nfse: setReceitaState,
    } as const;
    const pollingRefMap = {
      sefaz: sefazPollingRef,
      nsdocs: nsdocsPollingRef,
      receita_nfse: receitaPollingRef,
    } as const;
    const syncMessageMap: Record<SyncMethod, string> = {
      sefaz: 'Consultando SEFAZ diretamente...',
      nsdocs: 'Importando documentos via NSDocs...',
      receita_nfse: 'Importando NFS-e recebidas via Receita (ADN)...',
    };
    const successLabelMap: Record<SyncMethod, string> = {
      sefaz: 'SEFAZ',
      nsdocs: 'NSDOCS',
      receita_nfse: 'RECEITA NFS-E',
    };

    const setState = setStateMap[method];
    const pollingRef = pollingRefMap[method];

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

      const { syncLogId } = data;
      setState({
        state: 'polling',
        message: syncMessageMap[method],
        result: null,
      });

      let attempts = 0;
      const maxAttempts = 60;

      pollingRef.current = setInterval(async () => {
        attempts++;

        try {
          const pollRes = await fetch(`/api/nsdocs/sync?syncLogId=${syncLogId}`);
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
            toast.success(`Sincronização ${successLabelMap[method]} concluída!`);
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
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold ${styles[status] || styles.error}`}>
        <span className={`material-symbols-outlined text-[13px] ${status === 'running' ? 'animate-spin' : ''}`}>
          {icons[status] || 'help'}
        </span>
        {status === 'running' ? 'Em andamento' : status === 'completed' ? 'Concluído' : 'Erro'}
      </span>
    );
  };

  const formatFailedCell = (status: string) => {
    const failed = status === 'error';
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold ${
        failed
          ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
          : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
      }`}>
        {failed ? 'Sim' : 'Não'}
      </span>
    );
  };

  const nsdocsLogs = logs.filter((log) => log.syncMethod === 'nsdocs');
  const sefazLogs = logs.filter((log) => log.syncMethod === 'sefaz');
  const receitaLogs = logs.filter((log) => log.syncMethod === 'receita_nfse');

  const renderHistoryCard = (
    method: SyncMethod,
    title: string,
    icon: string,
    methodLogs: SyncLog[],
  ) => {
    const isSefaz = method === 'sefaz';
    const isReceita = method === 'receita_nfse';

    return (
      <div className="bg-white dark:bg-card-dark rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2.5">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
            isSefaz
              ? 'bg-emerald-100 dark:bg-emerald-900/30'
              : isReceita
                ? 'bg-orange-100 dark:bg-orange-900/30'
                : 'bg-sky-100 dark:bg-sky-900/30'
          }`}>
            <span className={`material-symbols-outlined text-[16px] ${
              isSefaz
                ? 'text-emerald-700 dark:text-emerald-400'
                : isReceita
                  ? 'text-orange-700 dark:text-orange-400'
                  : 'text-sky-700 dark:text-sky-400'
            }`}>{icon}</span>
          </div>
          <div className="flex items-center justify-between w-full gap-3">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">{title}</h3>
            <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
              {methodLogs.length} registro(s)
            </span>
          </div>
        </div>

        {methodLogs.length === 0 ? (
          <div className="p-4 text-center text-slate-500 dark:text-slate-400 text-xs">
            Sem sincronizações registradas para este método.
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800 text-[11px] uppercase text-slate-500 dark:text-slate-400 font-bold tracking-wider">
                    <th className="px-3 py-2">Horário</th>
                    <th className="px-3 py-2">Resultado</th>
                    <th className="px-3 py-2 text-right">Novos</th>
                    <th className="px-3 py-2 text-right">Atualizados</th>
                    <th className="px-3 py-2 text-center">Falhou</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {methodLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30 transition-colors">
                      <td className="px-3 py-2 text-xs text-slate-700 dark:text-slate-300 whitespace-nowrap">
                        {formatDate(log.startedAt)}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-col gap-1">
                          <div>{getStatusBadge(log.status)}</div>
                          {log.errorMessage && (
                            <span className="text-[11px] text-red-500 dark:text-red-400 max-w-[14rem] truncate" title={log.errorMessage}>
                              {log.errorMessage}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                        {log.newDocs}
                      </td>
                      <td className="px-3 py-2 text-right text-xs font-semibold text-blue-700 dark:text-blue-400">
                        {log.updatedDocs}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {formatFailedCell(log.status)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile card view */}
            <div className="lg:hidden divide-y divide-slate-100 dark:divide-slate-800">
              {methodLogs.map((log) => (
                <div key={log.id} className="p-3">
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <p className="text-[10px] font-bold text-slate-900 dark:text-white">
                      {formatDate(log.startedAt)}
                    </p>
                    {formatFailedCell(log.status)}
                  </div>
                  <div className="mb-1.5">
                    {getStatusBadge(log.status)}
                    {log.errorMessage && (
                      <p className="text-[11px] text-red-500 dark:text-red-400 mt-1 break-words">
                        {log.errorMessage}
                      </p>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-lg p-2 border border-emerald-100 dark:border-emerald-800">
                      <p className="text-base font-bold text-emerald-700 dark:text-emerald-400">{log.newDocs}</p>
                      <p className="text-[11px] text-emerald-600 dark:text-emerald-500 font-medium">Novas notas</p>
                    </div>
                    <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-2 border border-blue-100 dark:border-blue-800">
                      <p className="text-base font-bold text-blue-700 dark:text-blue-400">{log.updatedDocs}</p>
                      <p className="text-[11px] text-blue-600 dark:text-blue-500 font-medium">Atualizados</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    );
  };

  const renderSyncCard = (method: SyncMethod, methodState: SyncMethodState) => {
    const metaMap: Record<SyncMethod, {
      title: string;
      description: string;
      icon: string;
      iconBg: string;
      iconColor: string;
      buttonClass: string;
      pulseClass: string;
      disabledReason: ReactNode;
      enabled: boolean;
    }> = {
      sefaz: {
        title: 'Sincronização SEFAZ',
        description: 'Consulta direta via certificado digital A1',
        icon: 'verified_user',
        iconBg: 'bg-emerald-100 dark:bg-emerald-900/30',
        iconColor: 'text-emerald-600 dark:text-emerald-400',
        buttonClass: 'bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-600 text-white shadow-emerald-600/30 hover:shadow-lg hover:shadow-emerald-600/40',
        pulseClass: 'bg-gradient-to-r from-emerald-500 to-emerald-400',
        enabled: Boolean(hasCertificate),
        disabledReason: <>Configure o <a href="/sistema/settings" className="underline font-semibold">Certificado Digital</a> para usar esta opção</>,
      },
      nsdocs: {
        title: 'Sincronização NSDocs',
        description: 'Consulta via API NSDocs',
        icon: 'hub',
        iconBg: 'bg-sky-100 dark:bg-sky-900/30',
        iconColor: 'text-sky-600 dark:text-sky-400',
        buttonClass: 'bg-gradient-to-r from-sky-600 to-sky-700 hover:from-sky-700 hover:to-sky-600 text-white shadow-sky-600/30 hover:shadow-lg hover:shadow-sky-600/40',
        pulseClass: 'bg-gradient-to-r from-sky-500 to-sky-400',
        enabled: Boolean(hasNsdocsConfig),
        disabledReason: <>Configure a <a href="/sistema/settings" className="underline font-semibold">Integração NSDocs</a> para usar esta opção</>,
      },
      receita_nfse: {
        title: 'Sincronização Receita NFS-e',
        description: 'Consulta ADN (Receita) para NFS-e recebidas e emitidas',
        icon: 'account_balance',
        iconBg: 'bg-orange-100 dark:bg-orange-900/30',
        iconColor: 'text-orange-600 dark:text-orange-400',
        buttonClass: 'bg-gradient-to-r from-orange-600 to-orange-700 hover:from-orange-700 hover:to-orange-600 text-white shadow-orange-600/30 hover:shadow-lg hover:shadow-orange-600/40',
        pulseClass: 'bg-gradient-to-r from-orange-500 to-orange-400',
        enabled: Boolean(hasReceitaConfig) && Boolean(hasCertificate),
        disabledReason: <>Configure o <a href="/sistema/settings" className="underline font-semibold">Certificado Digital</a> e a <a href="/sistema/settings" className="underline font-semibold">Integração Receita NFS-e</a> para usar esta opção</>,
      },
    };
    const meta = metaMap[method];
    const disabled = !canWrite || !meta.enabled;
    const isBusy = methodState.state === 'syncing' || methodState.state === 'polling';

    return (
      <div className="bg-white dark:bg-card-dark rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${meta.iconBg}`}>
                <span className={`material-symbols-outlined text-[20px] ${meta.iconColor}`}>
                  {meta.icon}
                </span>
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">{meta.title}</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{meta.description}</p>
              </div>
            </div>
            <button
              onClick={() => handleSync(method)}
              disabled={disabled || isBusy}
              className={`px-4 py-2 rounded-lg font-bold text-xs transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 ${meta.buttonClass}`}
            >
              <span className={`material-symbols-outlined text-[16px] ${isBusy ? 'animate-spin' : ''}`}>
                {isBusy ? 'sync' : 'cloud_download'}
              </span>
              {isBusy ? 'Consultando...' : `Sincronizar ${meta.title.replace('Sincronização ', '')}`}
            </button>
          </div>

          {disabled && (
            <div className="mt-3 flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-2.5 py-1.5">
              <span className="material-symbols-outlined text-[16px]">info</span>
              {meta.disabledReason}
            </div>
          )}

          {/* Progress */}
          {methodState.state !== 'idle' && (
            <div className="mt-3">
              {isBusy && (
                <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-1.5 mb-2 overflow-hidden">
                  <div className={`h-1.5 rounded-full animate-pulse ${meta.pulseClass}`} style={{ width: methodState.state === 'syncing' ? '30%' : '70%' }} />
                </div>
              )}

              <div className={`flex items-center gap-2 text-xs font-medium ${
                methodState.state === 'completed' ? 'text-green-600 dark:text-green-400' :
                methodState.state === 'error' ? 'text-red-600 dark:text-red-400' :
                'text-primary dark:text-blue-400'
              }`}>
                <span className="material-symbols-outlined text-[16px]">
                  {methodState.state === 'completed' ? 'check_circle' : methodState.state === 'error' ? 'error' : 'hourglass_top'}
                </span>
                {methodState.message}
              </div>

              {methodState.result && (
                <div className="grid grid-cols-3 gap-2 mt-3">
                  <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-2.5 text-center border border-green-100 dark:border-green-800">
                    <p className="text-lg font-bold text-green-700 dark:text-green-400">{methodState.result.newDocs}</p>
                    <p className="text-xs text-green-600 dark:text-green-500 font-medium mt-0.5">Novas notas</p>
                  </div>
                  <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-2.5 text-center border border-blue-100 dark:border-blue-800">
                    <p className="text-lg font-bold text-blue-700 dark:text-blue-400">{methodState.result.updatedDocs}</p>
                    <p className="text-xs text-blue-600 dark:text-blue-500 font-medium mt-0.5">Atualizados</p>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-2.5 text-center border border-slate-200 dark:border-slate-700">
                    <p className="text-lg font-bold text-slate-700 dark:text-slate-300">{methodState.result.total}</p>
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

  if (!mounted) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center">
        <p className="text-sm text-slate-500 dark:text-slate-400">Carregando sincronização...</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {!canWrite && (
        <div className="flex items-center gap-2 p-3 bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-xl text-amber-700 dark:text-amber-400 text-sm font-medium">
          <span className="material-symbols-outlined text-[18px]">visibility</span>
          Modo somente leitura — você não tem permissão para sincronizar.
        </div>
      )}

      {/* Page Header */}
      <div>
        <div className="flex items-center gap-3 min-w-0">
          <span className="material-symbols-outlined text-[24px] text-primary flex-shrink-0">cloud_sync</span>
          <div className="min-w-0">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">Sincronizar</h2>
            <p className="text-slate-500 dark:text-slate-400 text-xs font-medium">Sincronize documentos via SEFAZ, NSDocs ou Receita NFS-e (ADN)</p>
          </div>
        </div>
      </div>

      {/* Empresa fixa + Badges */}
      <div className="bg-white dark:bg-card-dark rounded-xl border border-slate-200 dark:border-slate-800 p-4">
        <div className="flex-1">
          <p className="block text-sm font-semibold text-slate-700 dark:text-slate-300">Empresa fixa</p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {company ? `${company.razaoSocial} — ${company.cnpj}` : 'QL MED'}
          </p>
        </div>

        {/* Badges */}
        <div className="flex items-center gap-2 mt-3">
          <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border ${
            hasCertificate
              ? 'bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800'
              : 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700'
          }`}>
            <span className="material-symbols-outlined text-[14px]">verified_user</span>
            SEFAZ: {hasCertificate ? 'Ativa' : 'Inativa'}
          </div>

          <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border ${
            hasNsdocsConfig
              ? 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800'
              : 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700'
          }`}>
            <span className="material-symbols-outlined text-[14px]">hub</span>
            NSDocs: {hasNsdocsConfig ? 'Ativa' : 'Inativa'}
          </div>

          <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border ${
            hasReceitaConfig
              ? 'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-800'
              : 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700'
          }`}>
            <span className="material-symbols-outlined text-[14px]">account_balance</span>
            Receita NFS-e: {hasReceitaConfig ? 'Ativa' : 'Inativa'}
          </div>
        </div>
      </div>

      {/* No Config Warning */}
      {hasCertificate === false && hasNsdocsConfig === false && hasReceitaConfig === false && (
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <span className="material-symbols-outlined text-yellow-600 dark:text-yellow-400 text-[20px] mt-0.5">warning</span>
            <div>
              <h3 className="font-bold text-yellow-900 dark:text-yellow-300 text-sm">Nenhuma integração configurada</h3>
              <p className="text-xs text-yellow-800 dark:text-yellow-400 mt-1">
                Para sincronizar notas, configure o <a href="/sistema/settings" className="underline font-semibold hover:text-yellow-600">Certificado Digital</a>, a <a href="/sistema/settings" className="underline font-semibold hover:text-yellow-600">Integração NSDocs</a> e/ou a <a href="/sistema/settings" className="underline font-semibold hover:text-yellow-600">Integração Receita NFS-e</a>.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* CARD 1: SEFAZ Sync */}
      {renderSyncCard('sefaz', sefazState)}

      {/* CARD 2: NSDocs Sync */}
      {renderSyncCard('nsdocs', nsdocsState)}

      {/* CARD 3: Receita NFS-e Sync */}
      {renderSyncCard('receita_nfse', receitaState)}

      {/* CARD 4: Importar Histórico (NSDocs) */}
      <div className={`bg-white dark:bg-card-dark rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden ${!hasNsdocsConfig ? 'opacity-60' : ''}`}>
        <div className="p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-violet-100 dark:bg-violet-900/30">
              <span className="material-symbols-outlined text-[20px] text-violet-600 dark:text-violet-400">history</span>
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Importar Histórico (NSDocs)</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Baixe notas fiscais antigas via NSDocs, mês a mês
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Data Inicial
              </label>
              <input
                type="date"
                value={importStartDate}
                onChange={(e) => setImportStartDate(e.target.value)}
                disabled={!hasNsdocsConfig || !canWrite}
                className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all disabled:opacity-50"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Data Final
              </label>
              <input
                type="date"
                value={importEndDate}
                onChange={(e) => setImportEndDate(e.target.value)}
                disabled={!hasNsdocsConfig || !canWrite}
                className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all disabled:opacity-50"
              />
            </div>
          </div>

          {(importStatus === 'idle' || importStatus === 'completed' || importStatus === 'error') && (
            <button
              onClick={() => { setImportStatus('idle'); handleImportHistory(); }}
              disabled={!hasNsdocsConfig || !importStartDate || !importEndDate || !canWrite}
              className="w-full py-2 bg-gradient-to-r from-violet-600 to-violet-700 hover:from-violet-700 hover:to-violet-600 text-white rounded-lg font-bold text-xs transition-all shadow-md shadow-violet-600/30 hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              <span className="material-symbols-outlined text-[16px]">download</span>
              {importStatus === 'completed' ? 'Reimportar' : importStatus === 'error' ? 'Tentar Novamente' : 'Iniciar Importação'}
            </button>
          )}

          {importStatus === 'running' && (
            <div className="space-y-2">
              <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2">
                <div
                  className="bg-violet-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${importProgress}%` }}
                />
              </div>
              <p className="text-xs text-center text-slate-600 dark:text-slate-400 font-medium">
                Processando período: <strong>{currentImportPeriod}</strong> ({Math.round(importProgress)}%)
              </p>
            </div>
          )}

          {importLogs.length > 0 && (
            <div className="mt-3 bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-slate-800 p-3 max-h-44 overflow-y-auto">
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
                  <div key={index} className={`flex items-start gap-2 py-1 ${index > 0 ? 'border-t border-slate-100 dark:border-slate-800' : ''}`}>
                    <span className={`material-symbols-outlined text-[16px] mt-0.5 shrink-0 ${colorClass}`}>{icon}</span>
                    <span className={`text-xs ${colorClass} leading-relaxed`}>{log.replace(/^[\u2705\u274c\u26a0\ufe0f]\s*/, '')}</span>
                  </div>
                );
              })}
            </div>
          )}

          {!hasNsdocsConfig && (
            <div className="mt-3 flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-2.5 py-1.5">
              <span className="material-symbols-outlined text-[16px]">info</span>
              Configure a <a href="/sistema/settings" className="underline font-semibold">Integração NSDocs</a> para usar esta opção
            </div>
          )}
        </div>
      </div>

      {/* CARD 5: Histórico de Sincronizações */}
      <div className="space-y-3">
        <div className="bg-white dark:bg-card-dark rounded-xl border border-slate-200 dark:border-slate-800 p-4 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <span className="material-symbols-outlined text-slate-400 text-[18px]">history</span>
            Histórico de Sincronizações
          </h3>
          <button
            onClick={loadLogs}
            className="text-xs text-primary hover:text-primary-dark font-medium flex items-center gap-1"
          >
            <span className="material-symbols-outlined text-[14px]">refresh</span>
            Atualizar
          </button>
        </div>

        {logs.length === 0 ? (
          <div className="bg-white dark:bg-card-dark rounded-xl border border-slate-200 dark:border-slate-800 p-6 text-center">
            <span className="material-symbols-outlined text-slate-300 dark:text-slate-600 text-[36px]">cloud_off</span>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-2 font-medium">Nenhuma sincronização realizada</p>
            <p className="text-xs text-slate-400 mt-1">
              Use os botões acima para sincronizar documentos fiscais
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
            {renderHistoryCard('nsdocs', 'Histórico NSDocs', 'hub', nsdocsLogs)}
            {renderHistoryCard('receita_nfse', 'Histórico Receita NFS-e', 'account_balance', receitaLogs)}
            <div className="xl:col-span-2">
              {renderHistoryCard('sefaz', 'Histórico SEFAZ', 'verified_user', sefazLogs)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
