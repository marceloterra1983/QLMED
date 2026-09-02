import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import Badge, { type BadgeTone } from '../Badge';

const html = (el: React.ReactElement) => renderToStaticMarkup(el);
// Só a tag de abertura do <span> externo — o ponto interno também é <span>.
const tagExterna = (el: React.ReactElement) => html(el).match(/^<[^>]+>/)?.[0] ?? '';
const classe = (tag: string) => tag.match(/class="([^"]*)"/)?.[1] ?? '';

// Fundo e texto escuros de cada tom. Sem o par, o pill some sobre card-dark.
const TONS: Record<BadgeTone, { claro: string; escuro: string; textoEscuro: string }> = {
  success: { claro: 'bg-green-100', escuro: 'dark:bg-green-900/30', textoEscuro: 'dark:text-green-400' },
  warning: { claro: 'bg-amber-100', escuro: 'dark:bg-amber-900/30', textoEscuro: 'dark:text-amber-400' },
  danger: { claro: 'bg-red-100', escuro: 'dark:bg-red-900/30', textoEscuro: 'dark:text-red-400' },
  info: { claro: 'bg-blue-100', escuro: 'dark:bg-blue-900/30', textoEscuro: 'dark:text-blue-400' },
  neutral: { claro: 'bg-slate-100', escuro: 'dark:bg-slate-800', textoEscuro: 'dark:text-slate-300' },
};

describe('Badge', () => {
  it('é um <span> pill, pequeno e em negrito', () => {
    const tag = tagExterna(<Badge>Ativa</Badge>);
    expect(tag).toMatch(/^<span/);
    const cls = classe(tag).split(/\s+/);
    expect(cls).toContain('rounded-full');
    expect(cls).toContain('text-xs');
    expect(cls).toContain('font-bold');
    expect(html(<Badge>Ativa</Badge>)).toContain('Ativa');
  });

  it('cada tom tem fundo claro, fundo escuro e texto escuro — e só o seu', () => {
    for (const [tone, esperado] of Object.entries(TONS) as [BadgeTone, (typeof TONS)[BadgeTone]][]) {
      const cls = classe(tagExterna(<Badge tone={tone}>x</Badge>)).split(/\s+/);
      expect(cls, tone).toContain(esperado.claro);
      expect(cls, tone).toContain(esperado.escuro);
      expect(cls, tone).toContain(esperado.textoEscuro);
      for (const [outro, o] of Object.entries(TONS)) {
        if (outro !== tone) expect(cls, `${tone} não leva ${outro}`).not.toContain(o.claro);
      }
    }
  });

  it('o ponto é decorativo por defeito e some com dot={false}', () => {
    const com = html(<Badge tone="success">x</Badge>);
    expect(com).toMatch(/<span aria-hidden="true" class="[^"]*\bw-1\.5\b[^"]*\bh-1\.5\b[^"]*\brounded-full\b/);
    expect(com).toContain('bg-green-500');
    const sem = html(<Badge tone="success" dot={false}>x</Badge>);
    expect(sem).not.toContain('aria-hidden');
    expect(sem).not.toContain('w-1.5');
  });

  it('className extra é anexada ao pill', () => {
    expect(classe(tagExterna(<Badge className="ml-2">x</Badge>)).split(/\s+/)).toContain('ml-2');
  });

  it('nenhum tom usa text-primary sem par escuro nem text-slate-400 em posição clara', () => {
    for (const tone of Object.keys(TONS) as BadgeTone[]) {
      const cls = classe(tagExterna(<Badge tone={tone}>x</Badge>));
      if (/(?<![-\w:])text-primary(?!-)/.test(cls)) expect(cls, tone).toContain('dark:text-blue-400');
      expect(cls, tone).not.toMatch(/(?<![-\w:])text-slate-400\b/);
    }
  });

  it('title passa para o span e não vira texto', () => {
    const out = html(<Badge title="3 mudanças em 30 dias">3 CNPJ</Badge>);
    expect(out).toContain('title="3 mudanças em 30 dias"');
    expect(out).toContain('3 CNPJ');
  });
});
