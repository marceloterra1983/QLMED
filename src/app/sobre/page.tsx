import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Sobre - QL MED Produtos Hospitalares',
  description: 'QL MED Produtos Hospitalares LTDA - Sistema de gestão fiscal e controle de notas fiscais eletrônicas. Empresa sediada em Campo Grande, MS.',
};

export default function SobrePage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50 p-4">
      <div className="max-w-2xl mx-auto py-12">
        <div className="text-center mb-10">
          <div className="relative w-[240px] h-[73px] mx-auto mb-6">
            <Image
              src="/logo.png"
              alt="QL MED Logo"
              fill
              sizes="240px"
              className="object-contain"
              priority
            />
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-xl shadow-slate-200/50 space-y-6">
          <section>
            <h1 className="text-2xl font-bold text-slate-900 mb-3">QL MED Produtos Hospitalares</h1>
            <p className="text-slate-600 leading-relaxed">
              A QL MED Produtos Hospitalares LTDA atua no segmento de distribui&ccedil;&atilde;o de
              produtos m&eacute;dico-hospitalares, fornecendo equipamentos e materiais para
              institui&ccedil;&otilde;es de sa&uacute;de em Mato Grosso do Sul e regi&atilde;o.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-slate-900 mb-2">Sobre este sistema</h2>
            <p className="text-slate-600 leading-relaxed">
              Este &eacute; o sistema interno de gest&atilde;o fiscal da QL MED, utilizado para
              controle de notas fiscais eletr&ocirc;nicas (NF-e, CT-e, NFS-e), cadastro de
              produtos, fornecedores e clientes. O acesso &eacute; restrito a colaboradores
              autorizados da empresa.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-slate-900 mb-2">Dados da empresa</h2>
            <ul className="text-slate-600 space-y-1">
              <li><strong>Raz&atilde;o Social:</strong> QL MED Produtos Hospitalares LTDA</li>
              <li><strong>CNPJ:</strong> 07.382.369/0001-30</li>
              <li><strong>Localiza&ccedil;&atilde;o:</strong> Campo Grande, MS &mdash; Brasil</li>
              <li><strong>Segmento:</strong> Distribui&ccedil;&atilde;o de produtos m&eacute;dico-hospitalares</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-slate-900 mb-2">Contato</h2>
            <p className="text-slate-600">
              Para informa&ccedil;&otilde;es sobre a empresa ou suporte t&eacute;cnico do sistema,
              entre em contato pelo e-mail{' '}
              <a href="mailto:contato@qlmed.com.br" className="text-primary hover:underline">
                contato@qlmed.com.br
              </a>
            </p>
          </section>
        </div>

        <div className="mt-6 text-center">
          <Link href="/login" className="text-sm text-primary hover:text-primary-dark font-medium">
            Ir para o login
          </Link>
        </div>

        <div className="mt-8 text-center text-xs text-slate-400 space-y-1">
          <p>&copy; {new Date().getFullYear()} QL MED Produtos Hospitalares LTDA. Todos os direitos reservados.</p>
        </div>
      </div>
    </div>
  );
}
