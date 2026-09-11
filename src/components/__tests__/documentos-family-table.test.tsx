// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import DocumentosFamilyTable from '@/app/(painel)/cadastro/documentos/components/DocumentosFamilyTable';
import type { DocumentosRow } from '@/lib/documentos/list';

const noop = () => {};

function cartaRow(overrides: Partial<DocumentosRow> = {}): DocumentosRow {
  return {
    id: 'c1',
    kind: 'carta_comercializacao',
    category: 'carta',
    label: 'CARDIOVENT',
    fileName: 'carta.pdf',
    manufacturer: 'CARDIOVENT',
    validUntil: '2026-08-26',
    emitidoEm: '2026-02-26',
    daysRemaining: 10,
    status: { key: 'ok', label: 'ok' },
    validUntilSource: 'pdf',
    expira: true,
    emissaoUrl: null,
    emissaoAria: null,
    webUrl: null,
    automacao: null,
    ...overrides,
  };
}

const tableHandlers = {
  onView: noop,
  onOpenDetail: noop,
  onUpdate: noop,
  onShare: noop,
  onWhatsApp: noop,
};

describe('DocumentosFamilyTable — cartas', () => {
  it('mostra coluna Assinatura com emitidoEm', () => {
    render(
      <DocumentosFamilyTable
        caption="Cartas"
        columnLabel="Fabricante"
        rows={[cartaRow()]}
        canWrite={false}
        {...tableHandlers}
        collapseExpired
        showSignatureColumn
      />,
    );
    expect(screen.getByRole('columnheader', { name: 'Assinatura' })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: 'Válida até' })).toBeTruthy();
    expect(screen.getByText('CARDIOVENT')).toBeTruthy();
    // formatDocumentDate → dd.MM.yy
    expect(screen.getByText(/26\.02\.26|26\/02\/2026|26\.02\.2026/)).toBeTruthy();
  });

  it('tabela não tem lápis de edição (edita no popup)', () => {
    render(
      <DocumentosFamilyTable
        caption="Cartas"
        columnLabel="Fabricante"
        rows={[cartaRow()]}
        canWrite
        {...tableHandlers}
        collapseExpired
        showSignatureColumn
      />,
    );
    expect(screen.queryByRole('button', { name: 'Editar validade' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Editar assinatura' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Editar fabricante' })).toBeNull();
  });
});
