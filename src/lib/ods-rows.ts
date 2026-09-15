import JSZip from 'jszip';

export class OdsFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OdsFormatError';
  }
}

export type OdsRow = {
  index0: number;
  cells: string[];
  str: (col: number) => string;
  num: (col: number) => number | null;
};

function parseNum(raw: string): number | null {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  const normalized = s.replace(/\./g, '').replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(normalized)) return null;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

function cellText(cellXml: string): string {
  const dateAttr = cellXml.match(/\b(?:office:)?date-value="([^"]+)"/i);
  if (dateAttr) return dateAttr[1].slice(0, 10);

  const parts: string[] = [];
  const pRe = /<(?:text:)?p\b[^>]*>([\s\S]*?)<\/(?:text:)?p>/gi;
  let m: RegExpExecArray | null;
  while ((m = pRe.exec(cellXml))) {
    parts.push(m[1].replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim());
  }
  return parts.filter(Boolean).join(' ').trim();
}

/**
 * Lê a primeira tabela de um .ods e chama `onRow` por linha (0-based).
 * Células repetidas (`number-columns-repeated`) são expandidas até o teto.
 */
export async function streamOdsRows(
  input: Blob | Buffer | ArrayBuffer,
  onRow: (row: OdsRow) => void | Promise<void>,
  opts: { maxColumns?: number } = {},
): Promise<number> {
  const maxColumns = opts.maxColumns ?? 200;
  const buf = Buffer.isBuffer(input)
    ? input
    : Buffer.from(input instanceof ArrayBuffer ? input : await input.arrayBuffer());

  if (buf.length < 4 || buf[0] !== 0x50 || buf[1] !== 0x4b) {
    throw new OdsFormatError('Arquivo não é um .ods (ZIP ausente)');
  }

  const zip = await JSZip.loadAsync(buf);
  const entry = zip.file('content.xml');
  if (!entry) throw new OdsFormatError('ODS sem content.xml');
  const xml = await entry.async('string');

  const tableMatch = xml.match(/<table:table\b[^>]*>([\s\S]*?)<\/table:table>/i);
  if (!tableMatch) throw new OdsFormatError('ODS sem tabela');

  const tableBody = tableMatch[1];
  const rowRe = /<table:table-row\b([^>]*)>([\s\S]*?)<\/table:table-row>/gi;
  let rowMatch: RegExpExecArray | null;
  let index0 = 0;
  let emitted = 0;

  while ((rowMatch = rowRe.exec(tableBody))) {
    const rowAttrs = rowMatch[1] || '';
    const rowBody = rowMatch[2] || '';
    const rowRepeat = Number((rowAttrs.match(/number-rows-repeated="(\d+)"/) || [])[1] || '1');
    const cells: string[] = [];

    const cellRe =
      /<table:table-cell\b([^/>]*)\/>|<table:table-cell\b([^>]*)>([\s\S]*?)<\/table:table-cell>/gi;
    let cellMatch: RegExpExecArray | null;
    while ((cellMatch = cellRe.exec(rowBody))) {
      const attrs = cellMatch[1] ?? cellMatch[2] ?? '';
      const inner = cellMatch[3] ?? '';
      const rep = Math.min(
        Number((attrs.match(/number-columns-repeated="(\d+)"/) || [])[1] || '1'),
        maxColumns,
      );
      const full = `<table:table-cell ${attrs}>${inner}</table:table-cell>`;
      const val = cellText(full);
      for (let k = 0; k < rep && cells.length < maxColumns; k++) cells.push(val);
    }

    const times = Math.min(rowRepeat, 50);
    for (let t = 0; t < times; t++) {
      const rowIndex = index0;
      const rowCells = cells.slice();
      await onRow({
        index0: rowIndex,
        cells: rowCells,
        str: (col) => String(rowCells[col] ?? '').trim(),
        num: (col) => parseNum(String(rowCells[col] ?? '')),
      });
      emitted += 1;
      index0 += 1;
    }
  }

  return emitted;
}

/** Detecta ODS pelo nome ou mimetype interno (amostra pequena). */
export async function isOdsFile(file: File | Blob, fileName?: string): Promise<boolean> {
  const name = (fileName || (file instanceof File ? file.name : '') || '').toLowerCase();
  if (name.endsWith('.ods')) return true;
  const head = Buffer.from(await file.slice(0, 4).arrayBuffer());
  if (head.length < 4 || head[0] !== 0x50 || head[1] !== 0x4b) return false;
  // Sem nome: só ZIP magic — o caller deve preferir extensão. Evita ler o arquivo inteiro.
  return false;
}
