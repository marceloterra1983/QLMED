/**
 * Validade do lote a partir do XML da mesma NF-e (rastro / texto rotulado).
 * Não inventa data: só devolve quando há exatamente uma data candidata.
 */

function isoDate(raw: string | null | undefined): string {
  const s = String(raw || '').trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  m = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return '';
}

function normLot(s: string): string {
  return String(s || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
}

function alnumLot(s: string): string {
  return normLot(s).replace(/[^A-Z0-9]/g, '');
}

function escRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Resolve validade única para o lote no XML. Preferência: `<rastro>` com
 * `nLote`+`dVal`; fallback: janela de texto com `Validade:`/`Val.`/`<dVal>` junto do lote.
 */
export function resolveUniqueLotExpiryFromXml(xml: string, lot: string): string | null {
  const target = String(lot || '').trim();
  if (!xml || !target) return null;

  const dates = new Set<string>();
  const want = normLot(target);
  const wantA = alnumLot(target);

  const rRe = /<rastro>([\s\S]*?)<\/rastro>/gi;
  let r: RegExpExecArray | null;
  while ((r = rRe.exec(xml))) {
    const nLote = ((r[1].match(/<nLote>([^<]*)<\/nLote>/i) || [])[1] || '').trim();
    if (normLot(nLote) === want || (wantA && alnumLot(nLote) === wantA)) {
      const d = isoDate((r[1].match(/<dVal>([^<]*)<\/dVal>/i) || [])[1] || '');
      if (d) dates.add(d);
    }
  }

  if (dates.size === 0) {
    const win = new RegExp(`.{0,120}${escRe(target)}.{0,120}`, 'gi');
    let m: RegExpExecArray | null;
    while ((m = win.exec(xml))) {
      const labeled = m[0].match(
        /(?:Validade|Val\.?|Venc(?:imento)?|<dVal>)\s*[:.]?\s*(\d{2}\/\d{2}\/\d{4}|\d{4}-\d{2}-\d{2})/i,
      );
      if (labeled) {
        const d = isoDate(labeled[1]);
        if (d) dates.add(d);
      }
    }
  }

  if (dates.size !== 1) return null;
  return [...dates][0];
}
