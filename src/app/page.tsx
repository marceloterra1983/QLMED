import Link from 'next/link';

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-purple-50 dark:from-background-dark dark:via-background-dark dark:to-purple-950/20">
      {/* Navbar */}
      <nav className="sticky top-0 z-50 backdrop-blur-md bg-white/80 dark:bg-background-dark/80 border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-9 h-9 bg-primary/20 rounded-xl text-primary">
              <span className="material-symbols-outlined text-[22px]">receipt_long</span>
            </div>
            <span className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">QLMED</span>
          </div>
          <div className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-600">
            <a href="#features" className="hover:text-primary transition-colors">Funcionalidades</a>
            <a href="#benefits" className="hover:text-primary transition-colors">Benefícios</a>
            <a href="#pricing" className="hover:text-primary transition-colors">Preços</a>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/login" className="text-sm font-medium text-slate-600 hover:text-primary transition-colors px-3 py-2">
              Entrar
            </Link>
            <Link
              href="/register"
              className="flex items-center gap-2 bg-gradient-to-r from-primary to-primary-dark text-white px-5 py-2.5 rounded-lg text-sm font-bold shadow-md shadow-primary/30 hover:shadow-lg hover:shadow-primary/40 transition-all"
            >
              Começar Grátis
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative py-24 lg:py-32 overflow-hidden">
        <div className="absolute inset-0">
          <div className="absolute top-20 left-1/4 w-72 h-72 bg-primary/10 rounded-full blur-3xl"></div>
          <div className="absolute bottom-20 right-1/4 w-96 h-96 bg-accent/10 rounded-full blur-3xl"></div>
        </div>
        <div className="max-w-7xl mx-auto px-6 text-center relative z-10">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary/10 rounded-full text-primary text-sm font-bold mb-8">
            <span className="material-symbols-outlined text-[16px]">rocket_launch</span>
            Plataforma de Gestão Fiscal
          </div>
          <h1 className="text-5xl lg:text-7xl font-extrabold text-slate-900 dark:text-white tracking-tight leading-tight max-w-4xl mx-auto">
            Gerencie suas
            <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent"> Notas Fiscais </span>
            com simplicidade
          </h1>
          <p className="mt-6 text-lg text-slate-500 dark:text-slate-400 max-w-2xl mx-auto leading-relaxed">
            Plataforma completa para receber, consultar, manifestar e gerenciar XMLs de NF-e, CT-e e NFS-e. 
            Tudo em um único lugar, de forma rápida e segura.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/register"
              className="flex items-center gap-2 bg-gradient-to-r from-primary to-primary-dark text-white px-8 py-4 rounded-xl text-lg font-bold shadow-lg shadow-primary/30 hover:shadow-xl hover:shadow-primary/40 transition-all"
            >
              <span className="material-symbols-outlined text-[22px]">rocket_launch</span>
              Criar Conta Grátis
            </Link>
            <a
              href="#features"
              className="flex items-center gap-2 px-8 py-4 bg-white dark:bg-card-dark border border-slate-200 dark:border-slate-700 rounded-xl text-lg font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 transition-colors shadow-sm"
            >
              <span className="material-symbols-outlined text-[22px]">play_circle</span>
              Saiba Mais
            </a>
          </div>

          {/* Stats */}
          <div className="mt-16 grid grid-cols-3 gap-8 max-w-lg mx-auto">
            <div>
              <h3 className="text-3xl font-bold text-slate-900 dark:text-white">10k+</h3>
              <p className="text-sm text-slate-400 mt-1">XMLs processados</p>
            </div>
            <div>
              <h3 className="text-3xl font-bold text-slate-900 dark:text-white">99.9%</h3>
              <p className="text-sm text-slate-400 mt-1">Uptime</p>
            </div>
            <div>
              <h3 className="text-3xl font-bold text-slate-900 dark:text-white">&lt;1s</h3>
              <p className="text-sm text-slate-400 mt-1">Tempo de busca</p>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-24 bg-white dark:bg-card-dark border-y border-slate-200 dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-extrabold text-slate-900 dark:text-white tracking-tight">Tudo que você precisa</h2>
            <p className="mt-4 text-lg text-slate-500 max-w-2xl mx-auto">Funcionalidades completas para gestão fiscal da sua empresa.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              { icon: 'cloud_upload', title: 'Upload de XML', desc: 'Importe arquivos XML de NF-e, CT-e e NFS-e com validação automática.', color: 'primary' },
              { icon: 'search', title: 'Busca Avançada', desc: 'Encontre notas por chave de acesso, CNPJ, emitente ou data.', color: 'accent' },
              { icon: 'dashboard', title: 'Dashboard', desc: 'Visão geral com estatísticas, valores e documentos pendentes.', color: 'purple-600' },
              { icon: 'fact_check', title: 'Manifestação', desc: 'Manifeste notas fiscais de forma rápida e organizada.', color: 'amber-600' },
              { icon: 'business', title: 'Multi-Empresa', desc: 'Gerencie múltiplos CNPJs em uma única conta.', color: 'blue-600' },
              { icon: 'download', title: 'Download XML', desc: 'Baixe XMLs a qualquer momento, de forma individual ou em lote.', color: 'red-600' },
            ].map((feature) => (
              <div
                key={feature.title}
                className="bg-slate-50 dark:bg-slate-800/50 p-6 rounded-xl border border-slate-200 dark:border-slate-700 hover:shadow-lg hover:border-primary/30 transition-all group"
              >
                <div className={`w-12 h-12 rounded-xl bg-${feature.color}/10 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                  <span className={`material-symbols-outlined text-[24px] text-${feature.color}`}>{feature.icon}</span>
                </div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">{feature.title}</h3>
                <p className="text-sm text-slate-500">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <div className="bg-gradient-to-br from-primary to-primary-dark rounded-2xl p-12 text-white shadow-2xl shadow-primary/30 relative overflow-hidden">
            <div className="absolute inset-0 opacity-10">
              <div className="absolute top-0 right-0 w-64 h-64 bg-white rounded-full blur-3xl"></div>
              <div className="absolute bottom-0 left-0 w-48 h-48 bg-accent rounded-full blur-3xl"></div>
            </div>
            <div className="relative z-10">
              <h2 className="text-4xl font-extrabold tracking-tight mb-4">Pronto para começar?</h2>
              <p className="text-lg text-white/80 mb-8 max-w-lg mx-auto">
                Crie sua conta gratuitamente e comece a gerenciar suas notas fiscais agora mesmo.
              </p>
              <Link
                href="/register"
                className="inline-flex items-center gap-2 bg-white text-primary px-8 py-4 rounded-xl text-lg font-bold hover:bg-slate-50 transition-colors shadow-lg"
              >
                <span className="material-symbols-outlined text-[22px]">rocket_launch</span>
                Começar Agora
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 border-t border-slate-200 dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-[20px]">receipt_long</span>
              <span className="font-bold text-slate-600">QLMED</span>
            </div>
            <p className="text-sm text-slate-400">© 2024 QLMED. Todos os direitos reservados.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
