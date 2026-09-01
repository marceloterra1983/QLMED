import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import Field, { FIELD_CONTROL_CLS } from '../Field';

const html = (el: React.ReactElement) => renderToStaticMarkup(el);

/** O controle está DENTRO do <label>? É isso que amarra rótulo e campo. */
function controleDentroDoLabel(out: string) {
  const m = out.match(/<label\b[^>]*>([\s\S]*)<\/label>/);
  return m ? /<(input|select|textarea)\b/.test(m[1]) : false;
}

describe('Field', () => {
  it('amarra o rótulo ao controle — clicar no rótulo foca o campo', () => {
    const out = html(
      <Field label="Série">
        <input className={FIELD_CONTROL_CLS} />
      </Field>,
    );
    expect(controleDentroDoLabel(out)).toBe(true);
  });

  it('amarra também quando o controle vem embrulhado', () => {
    // Caso real: input com ícone de busca dentro de um <div className="relative">.
    // Com htmlFor o id cairia no <div>, que não é rotulável, e a amarração morreria.
    const out = html(
      <Field label="Buscar">
        <div className="relative">
          <span className="material-symbols-outlined">search</span>
          <input />
        </div>
      </Field>,
    );
    expect(controleDentroDoLabel(out)).toBe(true);
  });

  it('não emite htmlFor órfão', () => {
    const out = html(
      <Field label="Série">
        <input />
      </Field>,
    );
    expect(out).not.toContain('for=');
  });

  it('a dica é anunciada por aria-describedby no controle', () => {
    const out = html(
      <Field label="CNPJ" hint="Aceita com ou sem pontuação.">
        <input />
      </Field>,
    );
    const desc = out.match(/<input[^>]*aria-describedby="([^"]+)"/)?.[1];
    expect(desc).toBeTruthy();
    expect(out).toContain(`id="${desc}"`);
    expect(out).toContain('Aceita com ou sem pontuação.');
  });

  it('a dica alcança o controle mesmo embrulhado', () => {
    const out = html(
      <Field label="Buscar" hint="Código, descrição ou NCM.">
        <div className="relative">
          <input />
        </div>
      </Field>,
    );
    expect(out).toMatch(/<input[^>]*aria-describedby=/);
  });

  it('o erro marca aria-invalid e substitui a dica', () => {
    const out = html(
      <Field label="Série" hint="Entre 1 e 999." error="A série precisa ser maior que zero.">
        <input />
      </Field>,
    );
    expect(out).toMatch(/<input[^>]*aria-invalid="true"/);
    expect(out).toContain('A série precisa ser maior que zero.');
    expect(out).not.toContain('Entre 1 e 999.');
  });

  it('required marca o controle e mostra o asterisco', () => {
    const out = html(
      <Field label="Destinatário" required>
        <input />
      </Field>,
    );
    expect(out).toMatch(/<input[^>]*aria-required="true"/);
    expect(out).toContain('*');
  });

  it('marca só o primeiro controle quando há mais de um', () => {
    const out = html(
      <Field label="Intervalo" hint="Início e fim.">
        <div>
          <input name="de" />
          <input name="ate" />
        </div>
      </Field>,
    );
    expect([...out.matchAll(/aria-describedby=/g)]).toHaveLength(1);
  });

  it('o rótulo respeita o piso de 12px e o par de tema', () => {
    const out = html(
      <Field label="Tipo de NF-e">
        <select />
      </Field>,
    );
    expect(out).toMatch(/class="[^"]*text-xs[^"]*"/);
    expect(out).toContain('text-slate-500');
    expect(out).toContain('dark:text-slate-400');
  });

  it('sem dica nem erro não sobra aria-describedby vazio', () => {
    const out = html(
      <Field label="Série">
        <input />
      </Field>,
    );
    expect(out).not.toContain('aria-describedby');
  });

  it('aceita rótulo dinâmico', () => {
    const nome = 'Grupo';
    expect(html(<Field label={nome}><select /></Field>)).toContain('Grupo');
  });
});
