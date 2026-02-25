'use client';

export default function AutomacoesPage() {
  const n8nUrl = process.env.NEXT_PUBLIC_N8N_URL || 'http://localhost:5678';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Automações</h1>
        <p className="text-gray-500 mt-1">
          Gerencie workflows de automação no painel do n8n.
        </p>
      </div>

      <div className="bg-white rounded-lg shadow p-6 space-y-4">
        <h2 className="text-lg font-semibold">Painel n8n</h2>
        <p className="text-sm text-gray-600">
          O n8n é usado para orquestrar sincronizações automáticas de NF-e/CT-e,
          alertas financeiros, captura de emails com XML e notificações.
        </p>
        <a
          href={n8nUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors"
        >
          Abrir n8n
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </a>
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold mb-4">Workflows disponíveis</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {[
            { title: 'Sync NF-e/CT-e', desc: 'Sincronização periódica via NSDocs (cron a cada 6h)' },
            { title: 'Alertas Financeiros', desc: 'Notificação de contas a pagar vencendo nos próximos 7 dias' },
            { title: 'Captura de Email', desc: 'Leitura de emails com anexos XML para importação automática' },
            { title: 'Notificações', desc: 'Envio de email/WhatsApp disparado pelo QLMED' },
          ].map((w) => (
            <div key={w.title} className="border rounded-lg p-4">
              <h3 className="font-medium">{w.title}</h3>
              <p className="text-sm text-gray-500 mt-1">{w.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
