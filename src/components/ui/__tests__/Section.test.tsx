import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import Section from '../Section';
import Badge from '../Badge';

const html = (el: React.ReactElement) => renderToStaticMarkup(el);
const tag = (out: string, re: RegExp) => out.match(re)?.[0] ?? '';

describe('Section', () => {
  it('fixo: cabeçalho é um <h3>, sem botão, corpo sempre presente', () => {
    const out = html(<Section icon="receipt_long" title="Dados"><p>corpo</p></Section>);
    expect(out).toContain('<h3');
    expect(out).not.toContain('<button');
    expect(out).toContain('corpo');
  });

  it('recolhível nunca aberto: botão dentro de <h3>, aria-expanded=false, corpo não montado', () => {
    const out = html(<Section icon="x" title="T" open={false} onToggle={() => {}}><p>corpo</p></Section>);
    const btn = tag(out, /<button[^>]*>/);
    expect(btn).toContain('aria-expanded="false"');
    expect(btn).toMatch(/aria-controls="[^"]+"/);
    expect(out).toMatch(/<h3[^>]*>\s*<button/);
    expect(out).not.toContain('corpo');
  });

  it('recolhível aberto: aria-expanded=true e aria-controls aponta para o corpo', () => {
    const out = html(<Section icon="x" title="T" open onToggle={() => {}}><p>corpo</p></Section>);
    const ctl = tag(out, /<button[^>]*>/).match(/aria-controls="([^"]+)"/)?.[1];
    expect(ctl).toBeTruthy();
    expect(out).toContain(`id="${ctl}"`);
    expect(out).toContain('aria-expanded="true"');
    expect(out).toContain('corpo');
  });

  it('recolhível não controlado respeita defaultOpen', () => {
    expect(html(<Section icon="x" title="T" defaultOpen><p>corpo</p></Section>)).toContain('corpo');
    expect(html(<Section icon="x" title="T" defaultOpen={false}><p>corpo</p></Section>)).not.toContain('corpo');
  });

  it('tone pinta o chip; primary vem com par escuro', () => {
    expect(html(<Section icon="x" title="T" tone="amber">c</Section>)).toContain('bg-amber-500/10');
    const p = html(<Section icon="x" title="T">c</Section>);
    expect(p).toContain('text-primary dark:text-blue-400');
    expect(p).not.toMatch(/class="[^"]*\btext-primary\b(?![^"]*dark:text-blue-400)/);
  });

  it('variant="danger" pinta título e borda de vermelho', () => {
    const out = html(<Section icon="warning" title="Zona de perigo" variant="danger">c</Section>);
    expect(out).toContain('text-red-600');
    expect(out).toContain('border-red-200');
  });

  it('badge, subtítulo e id chegam ao DOM', () => {
    const out = html(<Section icon="x" title="T" subtitle="sub" id="cadastro" badge={<Badge tone="success">3</Badge>}>c</Section>);
    expect(out).toContain('data-section-id="cadastro"');
    expect(out).toContain('sub');
    expect(out).toContain('>3<');
  });

  it('ícones são decorativos e não há focus:ring', () => {
    const out = html(<Section icon="x" title="T" defaultOpen>c</Section>);
    expect(out).toContain('aria-hidden="true"');
    expect(out).not.toContain('focus:ring');
  });
});
