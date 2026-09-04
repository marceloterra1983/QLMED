import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import InvoiceDetailsModal from '../InvoiceDetailsModal';

vi.mock('@/hooks/useModalBackButton', () => ({
  useModalBackButton: () => {},
}));

describe('InvoiceDetailsModal: render layout e altura', () => {
  it('renderiza o modal com bodyClassName flexível de altura total', () => {
    const out = renderToStaticMarkup(
      <InvoiceDetailsModal isOpen onClose={() => {}} invoiceId="inv-123" />
    );
    expect(out).toContain('role="dialog"');
    expect(out).toContain('sm:max-w-5xl');
    expect(out).toContain('sm:h-[92vh]');
    // O container do corpo recebe as classes flex de altura total
    expect(out).toContain('flex flex-col flex-1 h-full min-h-0 overflow-hidden');
  });

  it('empilha título e controles no mobile (irmão do fix produtos)', () => {
    const out = renderToStaticMarkup(
      <InvoiceDetailsModal isOpen onClose={() => {}} invoiceId="inv-123" />
    );
    expect(out).toContain('flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3');
    expect(out).not.toContain('flex items-center gap-2 sm:gap-3 min-w-0 shrink-0');
  });

  it('renderiza o iframe com h-full e w-full dentro de um container flex-1 min-h-0', () => {
    const out = renderToStaticMarkup(
      <InvoiceDetailsModal isOpen onClose={() => {}} invoiceId="inv-123" />
    );
    expect(out).toContain('<iframe');
    expect(out).toMatch(/<iframe[^>]*class="[^"]*\bw-full\b[^"]*\bh-full\b[^"]*"/);
    expect(out).toMatch(/class="[^"]*\bflex-1\b[^"]*\bmin-h-0\b[^"]*\bbg-slate-200\b/);
  });
});
