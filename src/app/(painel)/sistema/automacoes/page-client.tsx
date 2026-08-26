'use client';

/**
 * Correções de apresentação da decisão D6 da SPEC-011, que o plano manda ir
 * antes da feature e em commit próprio: dark mode (esta era a única tela do
 * painel sem nenhuma variante `dark:`) e Material Symbols no lugar do <svg>
 * inline.
 *
 * A lista abaixo continua estática. Substituí-la por status vindo do n8n é
 * FR-001 da SPEC-011 e depende de credencial que não existe ainda. O que MUDA
 * aqui é a moldura: antes ela se chamava "Workflows disponíveis" e não dizia
 * nada sobre estado, então era lida como painel de monitoramento. Agora está
 * rotulada pelo que é — descrição do que roda no n8n — com aviso explícito de
 * que estado e última execução não são exibidos. Deixar de enganar não depende
 * de credencial nenhuma.
 */

const WORKFLOWS = [
  { title: 'Sync NF-e/CT-e', desc: 'Sincronização periódica via NSDocs (cron a cada 6h)' },
  { title: 'Alertas Financeiros', desc: 'Notificação de contas a pagar vencendo nos próximos 7 dias' },
  { title: 'Captura de Email', desc: 'Leitura de emails com anexos XML para importação automática' },
  { title: 'Notificações', desc: 'Envio de email/WhatsApp disparado pelo QLMED' },
];

export default function AutomacoesPage() {
  const currentOrigin = typeof window !== 'undefined' ? window.location.origin : '';
  const inferredN8nUrl = currentOrigin
    ? `${window.location.protocol}//${window.location.host.replace(/^app\./, 'n8n.')}`
    : 'https://n8n.qlmed.com.br';
  const n8nUrl = process.env.NEXT_PUBLIC_N8N_URL || inferredN8nUrl;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <span className="material-symbols-outlined text-[28px] text-primary flex-shrink-0">account_tree</span>
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Automações</h1>
          <p className="text-slate-500 dark:text-slate-400 text-xs font-medium">
            Gerencie workflows de automação no painel do n8n.
          </p>
        </div>
      </div>

      <div className="bg-white dark:bg-card-dark rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm p-6 space-y-4">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Painel n8n</h2>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          O n8n é usado para orquestrar sincronizações automáticas de NF-e/CT-e,
          alertas financeiros, captura de emails com XML e notificações.
        </p>
        <a
          href={n8nUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-sm font-medium transition-colors"
        >
          Abrir n8n
          <span className="material-symbols-outlined text-[18px]">open_in_new</span>
        </a>
      </div>

      <div className="bg-white dark:bg-card-dark rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm p-6">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">O que roda no n8n</h2>
        <div className="flex items-start gap-2 mt-2 mb-4 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/10 px-3 py-2">
          <span className="material-symbols-outlined text-[18px] text-amber-600 dark:text-amber-400 flex-shrink-0">info</span>
          <p className="text-xs text-amber-700 dark:text-amber-400">
            Descrição do que está configurado, não status ao vivo. Estado, última
            execução e falhas ainda não são exibidos aqui — consulte o painel do n8n.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {WORKFLOWS.map((w) => (
            <div
              key={w.title}
              className="border border-slate-200 dark:border-slate-700 rounded-lg p-4"
            >
              <h3 className="font-medium text-slate-900 dark:text-white">{w.title}</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{w.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
