'use client';

import PageHeader from '@/components/PageHeader';
import Card from '@/components/ui/Card';
import EmptyState from '@/components/ui/EmptyState';

/**
 * Cadastro › Documentos — SPEC-042.
 *
 * Folha L1 registra a rota na navegação e na ACL; a tabela de certidões
 * (L6) substitui este placeholder. Sem ele, o item de menu levaria a um 404.
 */
export default function DocumentosPageClient() {
  return (
    <>
      <PageHeader icon="verified" title="Documentos" subtitle="Certidões de regularidade da empresa" />
      <Card>
        <EmptyState
          icon="verified"
          title="Nenhuma certidão carregada ainda"
          hint="A seção Certidões chega na próxima etapa desta feature."
        />
      </Card>
    </>
  );
}
