import { createHash } from 'node:crypto';
import type { SpicaRelRowInput } from '@/lib/spica/parse';
import { streamXlsxRows } from '@/lib/xlsx-limits';

/** Cabeçalhos canônicos do Rel_Produtos (research SPEC-043). */
const HEADER_ALIASES: Record<keyof SpicaRelRowInput | 'ipiSaida' | 'obsFiscal' | 'fornecedor', string[]> = {
  codigo: ['codigo', 'código', 'cod. int.', 'cod int', 'cód. int.', 'cód int'],
  referencia: ['referencia', 'referência', 'ref'],
  nome: ['nome do produto', 'nome', 'produto'],
  tipo: ['tipo'],
  subtipo: ['subtipo', 'sub tipo', 'sub-tipo'],
  fabricante: ['fabricante'],
  fornecedor: ['fornecedor'],
  instrumental: ['instrumental'],
  rvs: ['rvs', 'anvisa'],
  ncm: ['ncm'],
  sitTributaria: ['situacao tributaria', 'situação tributária', 'sit tributaria', 'sit. tributaria'],
  nomeTributacao: ['nome da tributacao', 'nome da tributação', 'nome tributacao'],
  icms: ['%icms', 'icms'],
  pis: ['%pis', 'pis'],
  cofins: ['%cofins', 'cofins'],
  ipiEntrada: ['%ipi entr.', '%ipi entr', '%ipi entrada', 'ipi entr.', 'ipi entrada'],
  ipiSaida: ['%ipi saida', '%ipi saída', 'ipi saida', 'ipi saída'],
  obsFiscal: ['obs. fiscal', 'obs fiscal', 'observacao fiscal', 'observação fiscal'],
};

function normalizeHeader(raw: string): string {
  return String(raw ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

export type SpicaHeaderMap = Partial<Record<keyof SpicaRelRowInput, number>>;

export function mapSpicaHeader(cells: string[]): SpicaHeaderMap | null {
  const map: SpicaHeaderMap = {};
  const normalized = cells.map(normalizeHeader);

  for (const [field, aliases] of Object.entries(HEADER_ALIASES) as Array<[keyof SpicaRelRowInput, string[]]>) {
    const aliasSet = new Set(aliases.map(normalizeHeader));
    const idx = normalized.findIndex((h) => aliasSet.has(h));
    if (idx >= 0) map[field] = idx;
  }

  if (map.codigo == null || map.referencia == null || map.nome == null) return null;
  return map;
}

function cellAt(cells: string[], idx: number | undefined): string {
  if (idx == null) return '';
  return String(cells[idx] ?? '').trim();
}

export function rowFromMappedCells(cells: string[], map: SpicaHeaderMap): SpicaRelRowInput | null {
  const codigo = cellAt(cells, map.codigo);
  if (!codigo) return null;
  return {
    codigo,
    referencia: cellAt(cells, map.referencia),
    nome: cellAt(cells, map.nome),
    tipo: cellAt(cells, map.tipo),
    subtipo: cellAt(cells, map.subtipo),
    fabricante: cellAt(cells, map.fabricante),
    fornecedor: cellAt(cells, map.fornecedor),
    instrumental: cellAt(cells, map.instrumental),
    rvs: cellAt(cells, map.rvs),
    ncm: cellAt(cells, map.ncm),
    sitTributaria: cellAt(cells, map.sitTributaria),
    nomeTributacao: cellAt(cells, map.nomeTributacao),
    icms: cellAt(cells, map.icms),
    pis: cellAt(cells, map.pis),
    cofins: cellAt(cells, map.cofins),
    ipiEntrada: cellAt(cells, map.ipiEntrada),
    ipiSaida: cellAt(cells, map.ipiSaida),
    obsFiscal: cellAt(cells, map.obsFiscal),
  };
}

/** CSV seguro com aspas; detecta separador `,` ou `;` pela linha de cabeçalho. */
export function parseCsvLine(line: string, separator: ',' | ';'): string[] {
  const columns: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === separator && !inQuotes) {
      columns.push(current);
      current = '';
      continue;
    }

    current += char;
  }
  columns.push(current);
  return columns;
}

function detectCsvSeparator(headerLine: string): ',' | ';' {
  let commas = 0;
  let semis = 0;
  let inQuotes = false;
  for (let i = 0; i < headerLine.length; i += 1) {
    const c = headerLine[i];
    if (c === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (inQuotes) continue;
    if (c === ',') commas += 1;
    if (c === ';') semis += 1;
  }
  return semis > commas ? ';' : ',';
}

export function parseSpicaRelCsv(content: string): SpicaRelRowInput[] {
  const lines = content.replace(/^\uFEFF/, '').split(/\r?\n/);
  if (lines.length <= 1) return [];

  const headerLine = lines[0] ?? '';
  const separator = detectCsvSeparator(headerLine);
  const headerCells = parseCsvLine(headerLine, separator).map((c) => c.trim());
  const map = mapSpicaHeader(headerCells);

  // Fallback posição fixa do export Spica (CLI histórico) se cabeçalho não mapear.
  const usePositional = map == null;
  const rows: SpicaRelRowInput[] = [];

  for (let i = 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line || !line.trim()) continue;
    const cells = parseCsvLine(line, separator).map((c) => c.trim());
    if (usePositional) {
      if (cells.length < 10) continue;
      rows.push({
        codigo: cells[0] ?? '',
        referencia: cells[1] ?? '',
        nome: cells[2] ?? '',
        tipo: cells[3] ?? '',
        subtipo: cells[4] ?? '',
        fabricante: cells[5] ?? '',
        fornecedor: cells[6] ?? '',
        instrumental: cells[7] ?? '',
        rvs: cells[8] ?? '',
        ncm: cells[9] ?? '',
        sitTributaria: cells[10] ?? '',
        nomeTributacao: cells[11] ?? '',
        icms: cells[12] ?? '',
        pis: cells[13] ?? '',
        cofins: cells[14] ?? '',
        ipiEntrada: cells[15] ?? '',
        ipiSaida: cells[16] ?? '',
        obsFiscal: cells[17] ?? '',
      });
      continue;
    }

    const row = rowFromMappedCells(cells, map);
    if (row) rows.push(row);
  }

  return rows;
}

export async function parseSpicaRelXlsx(file: Blob): Promise<SpicaRelRowInput[]> {
  let map: SpicaHeaderMap | null = null;
  const rows: SpicaRelRowInput[] = [];

  await streamXlsxRows(file, (row) => {
    const cells = Array.from({ length: 24 }, (_, i) => row.str(i));
    if (row.index0 === 0 || map == null) {
      const candidate = mapSpicaHeader(cells);
      if (candidate) {
        map = candidate;
        return;
      }
      if (row.index0 < 5) return;
    }
    if (!map) return;
    const parsed = rowFromMappedCells(cells, map);
    if (parsed) rows.push(parsed);
  });

  return rows;
}

export function isSpicaCsvName(name: string): boolean {
  return /\.csv$/i.test(name);
}

export function isSpicaXlsxName(name: string): boolean {
  return /\.xlsx$/i.test(name);
}

export async function parseSpicaRelFile(file: File): Promise<SpicaRelRowInput[]> {
  const name = file.name || 'upload';
  if (isSpicaCsvName(name) || (file.type || '').includes('csv') || (file.type || '').includes('text/plain')) {
    const text = await file.text();
    return parseSpicaRelCsv(text);
  }
  if (isSpicaXlsxName(name) || (file.type || '').includes('spreadsheet') || (file.type || '').includes('excel')) {
    return parseSpicaRelXlsx(file);
  }
  // Tentativa: CSV se o nome não ajudar
  const head = Buffer.from(await file.slice(0, 8).arrayBuffer());
  // ZIP/XLSX magic PK
  if (head[0] === 0x50 && head[1] === 0x4b) {
    return parseSpicaRelXlsx(file);
  }
  return parseSpicaRelCsv(await file.text());
}

export function checksumFileBytes(bytes: Buffer | Uint8Array | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}
