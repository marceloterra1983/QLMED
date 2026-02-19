import Link from 'next/link';
import Image from 'next/image';

const features = [
  {
    icon: 'bolt',
    title: 'Sincronização SEFAZ',
    description: 'Consulta automática de NF-e, CT-e e NFS-e diretamente na SEFAZ com certificado digital.',
  },
  {
    icon: 'shield_lock',
    title: 'Manifestação do Destinatário',
    description: 'Confirme, desconheça ou registre operações não realizadas em poucos cliques.',
  },
  {
    icon: 'cloud_upload',
    title: 'Upload em Lote',
    description: 'Importe centenas de XMLs simultaneamente com validação automática e deduplicação.',
  },
  {
    icon: 'monitoring',
    title: 'Painel em Tempo Real',
    description: 'Acompanhe documentos recebidos, valores totais e pendências num só lugar.',
  },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-[#06090f] text-white overflow-hidden relative">
      {/* --- Atmospheric background --- */}
      <div className="pointer-events-none absolute inset-0">
        {/* Top-right blue glow */}
        <div className="absolute -top-40 -right-40 w-[700px] h-[700px] rounded-full bg-primary/[0.07] blur-[120px]" />
        {/* Bottom-left emerald glow */}
        <div className="absolute -bottom-60 -left-40 w-[600px] h-[600px] rounded-full bg-accent/[0.05] blur-[100px]" />
        {/* Center cross-glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full bg-primary/[0.03] blur-[160px]" />
        {/* Subtle dot grid */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.8) 1px, transparent 1px)',
            backgroundSize: '32px 32px',
          }}
        />
      </div>

      {/* --- Navigation --- */}
      <nav className="relative z-10 flex items-center justify-between px-6 md:px-12 lg:px-20 py-6">
        <div className="relative w-[180px] h-[55px]">
          <Image
            src="/logo.png"
            alt="QL MED"
            fill
            className="object-contain brightness-0 invert"
            priority
          />
        </div>
        <Link
          href="/login"
          className="px-5 py-2.5 text-sm font-bold rounded-lg border border-white/10 text-white/70 hover:text-white hover:border-white/25 hover:bg-white/5 transition-all"
        >
          Entrar
        </Link>
      </nav>

      {/* --- Hero --- */}
      <section className="relative z-10 flex flex-col items-center text-center px-6 pt-16 pb-24 md:pt-24 md:pb-32">
        {/* Badge */}
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-accent/20 bg-accent/[0.08] mb-10">
          <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
          <span className="text-accent text-xs font-bold uppercase tracking-widest">
            Gestão Fiscal Inteligente
          </span>
        </div>

        {/* Headline */}
        <h1 className="max-w-4xl text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-extrabold leading-[1.05] tracking-tight">
          <span className="text-white">Seus documentos</span>
          <br />
          <span className="text-white">fiscais sob </span>
          <span className="bg-gradient-to-r from-primary via-blue-400 to-accent bg-clip-text text-transparent">
            controle total
          </span>
        </h1>

        {/* Subtitle */}
        <p className="mt-6 max-w-xl text-base md:text-lg text-slate-400 leading-relaxed font-medium">
          Receba, consulte e gerencie NF-e, CT-e e NFS-e em uma plataforma
          unificada. Sincronize com a SEFAZ e mantenha sua empresa em dia.
        </p>

        {/* CTA */}
        <div className="mt-10 flex flex-col sm:flex-row items-center gap-4">
          <Link
            href="/login"
            className="group relative inline-flex items-center gap-2.5 px-8 py-4 bg-primary hover:bg-primary-dark text-white text-sm font-bold rounded-xl transition-all shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 hover:-translate-y-0.5"
          >
            <span className="material-symbols-outlined text-[20px]">login</span>
            Acessar o Sistema
          </Link>
          <span className="text-xs text-slate-500 font-medium">
            Acesso restrito a usuários cadastrados
          </span>
        </div>

        {/* Stats row */}
        <div className="mt-20 flex flex-wrap items-center justify-center gap-8 md:gap-16">
          {[
            { value: 'NF-e', label: 'Notas Fiscais' },
            { value: 'CT-e', label: 'Conhecimento de Transporte' },
            { value: 'NFS-e', label: 'Notas de Serviço' },
          ].map((stat) => (
            <div key={stat.label} className="flex flex-col items-center gap-1">
              <span className="text-2xl md:text-3xl font-extrabold tracking-tight bg-gradient-to-b from-white to-slate-400 bg-clip-text text-transparent">
                {stat.value}
              </span>
              <span className="text-[11px] text-slate-500 font-bold uppercase tracking-widest">
                {stat.label}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* --- Divider line --- */}
      <div className="relative z-10 max-w-5xl mx-auto px-6">
        <div className="h-px bg-gradient-to-r from-transparent via-slate-700/50 to-transparent" />
      </div>

      {/* --- Features --- */}
      <section className="relative z-10 px-6 md:px-12 lg:px-20 py-24 md:py-32">
        <div className="max-w-6xl mx-auto">
          {/* Section header */}
          <div className="text-center mb-16">
            <span className="text-xs font-bold uppercase tracking-widest text-primary">
              Funcionalidades
            </span>
            <h2 className="mt-3 text-3xl md:text-4xl font-extrabold tracking-tight text-white">
              Tudo que você precisa
            </h2>
            <p className="mt-3 text-slate-400 max-w-lg mx-auto font-medium">
              Ferramentas projetadas para simplificar sua rotina fiscal.
            </p>
          </div>

          {/* Cards grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="group relative rounded-2xl border border-white/[0.06] bg-white/[0.02] p-7 hover:bg-white/[0.04] hover:border-white/[0.1] transition-all duration-300"
              >
                {/* Icon */}
                <div className="flex items-center justify-center w-11 h-11 rounded-xl bg-primary/10 border border-primary/10 mb-5">
                  <span className="material-symbols-outlined text-primary text-[22px]">
                    {feature.icon}
                  </span>
                </div>
                {/* Title */}
                <h3 className="text-[15px] font-bold text-white mb-2 tracking-tight">
                  {feature.title}
                </h3>
                {/* Description */}
                <p className="text-sm text-slate-400 leading-relaxed font-medium">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* --- Bottom CTA --- */}
      <section className="relative z-10 px-6 pb-24">
        <div className="max-w-3xl mx-auto text-center">
          <div className="relative rounded-2xl border border-white/[0.06] bg-white/[0.02] px-8 py-14 md:px-16 md:py-20 overflow-hidden">
            {/* Glow */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[200px] bg-primary/[0.08] rounded-full blur-[80px] pointer-events-none" />

            <span className="material-symbols-outlined text-primary/40 text-[48px] mb-4 block">
              rocket_launch
            </span>
            <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight text-white">
              Pronto para começar?
            </h2>
            <p className="mt-3 text-slate-400 max-w-md mx-auto font-medium">
              Acesse agora e tenha controle total sobre seus documentos fiscais.
            </p>
            <Link
              href="/login"
              className="inline-flex items-center gap-2 mt-8 px-8 py-3.5 bg-gradient-to-r from-primary to-primary-dark text-white text-sm font-bold rounded-xl shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 hover:-translate-y-0.5 transition-all"
            >
              <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
              Entrar no Sistema
            </Link>
          </div>
        </div>
      </section>

      {/* --- Footer --- */}
      <footer className="relative z-10 px-6 md:px-12 lg:px-20 py-8 border-t border-white/[0.04]">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="relative w-[120px] h-[37px]">
            <Image
              src="/logo.png"
              alt="QL MED"
              fill
              className="object-contain brightness-0 invert opacity-40"
            />
          </div>
          <p className="text-xs text-slate-600 font-medium">
            &copy; {new Date().getFullYear()} QLMED &mdash; Gestão Fiscal Inteligente
          </p>
        </div>
      </footer>
    </div>
  );
}
