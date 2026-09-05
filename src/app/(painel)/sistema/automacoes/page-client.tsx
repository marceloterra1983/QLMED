'use client';

import Link from 'next/link';
import PageHeader from '@/components/PageHeader';
import EmptyState from '@/components/ui/EmptyState';
import Button from '@/components/ui/Button';

/**
 * SPEC-045: Automações (status n8n) aposentada. A rota permanece para
 * bookmarks; o catálogo operacional vive em Rotinas.
 */
export default function AutomacoesPageClient() {
  return (
    <div className="space-y-6">
      <PageHeader
        icon="account_tree"
        title="Automações"
        subtitle="Integração n8n aposentada. O resumo diário e as demais rotinas estão no catálogo Rotinas."
      />
      <EmptyState
        icon="account_tree"
        title="n8n QLMED aposentado"
        hint="Os workflows do n8n foram migrados ou desligados (SPEC-045). Consulte Rotinas para o Resumo Diário NF-e e demais jobs do portal."
        action={
          <Link href="/sistema/rotinas">
            <Button type="button">Abrir Rotinas</Button>
          </Link>
        }
      />
    </div>
  );
}
