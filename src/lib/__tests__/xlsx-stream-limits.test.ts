/**
 * O teto do upload de planilha subiu de 5 para 10 MiB, e só se sustenta porque
 * a leitura deixou de montar o livro inteiro em memória. Medido em 2026-09-02
 * com o heap de produção (`--max-old-space-size=512`): pelo caminho antigo um
 * E509 de 5 MiB (21 mil linhas) estoura o heap e mata o processo; pelo leitor
 * em streaming o mesmo ficheiro custa 95 MiB de pico, e um de 10 MiB também.
 *
 * O teste guarda as duas metades: o endereçamento das células continua o
 * mesmo, e a memória não cresce com o tamanho do ficheiro.
 */
import { describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getHeapStatistics } from 'node:v8';
import ExcelJS from 'exceljs';
import { MAX_XLSX_BYTES, MAX_XLSX_INMEMORY_BYTES, streamXlsxRows } from '@/lib/xlsx-limits';

const COLS = 84;

/** Escreve a planilha linha a linha para não pagar em memória o que o teste mede. */
async function makeWorkbook(rows: number): Promise<Blob> {
  const dir = await mkdtemp(join(tmpdir(), 'xlsx-stream-'));
  const path = join(dir, 'e509.xlsx');
  const wb = new ExcelJS.stream.xlsx.WorkbookWriter({ filename: path, useStyles: false });
  const ws = wb.addWorksheet('E509');
  ws.getRow(3).values = Array.from({ length: COLS }, (_, c) => (c === 0 ? 'NF' : c === 82 ? 'Lote' : `Coluna ${c}`));
  ws.getRow(3).commit();
  for (let i = 0; i < rows; i++) {
    const v = new Array<string | number>(COLS);
    v[0] = String(100000 + i).padStart(9, '0');
    v[8] = '35' + String(i).padStart(42, '0');
    v[33] = `MEDICAMENTO GENERICO ${i % 900} 500MG CX30`;
    v[82] = `L${String(i % 3000).padStart(6, '0')}`;
    v[83] = (i % 40) + 1;
    for (let c = 0; c < COLS; c++) if (v[c] === undefined) v[c] = c % 2 === 0 ? (i % 97) * 1.37 : `TXT${i % 700}`;
    ws.getRow(5 + i).values = v;
    ws.getRow(5 + i).commit();
  }
  await wb.commit();
  const buf = await readFile(path);
  await rm(dir, { recursive: true, force: true });
  return new Blob([new Uint8Array(buf)]);
}

describe('leitura de XLSX em streaming', () => {
  it('endereça as células como o caminho antigo, 0-based', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('E509');
    ws.getRow(3).values = ['NF', ...Array(81).fill(''), 'Lote', 'Qtde'];
    ws.getRow(5).values = ['  000123  ', ...Array(81).fill(''), 'LOTE-A', 7];
    const blob = new Blob([new Uint8Array(Buffer.from(await wb.xlsx.writeBuffer()))]);

    const seen: Array<{ i: number; nf: string; lote: string; qtde: number | null }> = [];
    const total = await streamXlsxRows(blob, (row) => {
      seen.push({ i: row.index0, nf: row.str(0), lote: row.str(82), qtde: row.num(83) });
    });

    expect(total).toBe(5);
    const header = seen.find((r) => r.i === 2);
    const data = seen.find((r) => r.i === 4);
    expect(header?.nf).toBe('NF');
    expect(header?.lote).toBe('Lote');
    expect(data?.nf).toBe('000123'); // aparado, como o `String(cell.value).trim()`
    expect(data?.lote).toBe('LOTE-A');
    expect(data?.qtde).toBe(7);
  });

  it('célula ausente dá string vazia e número nulo', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('E509');
    ws.getRow(1).values = ['só a primeira'];
    const blob = new Blob([new Uint8Array(Buffer.from(await wb.xlsx.writeBuffer()))]);
    let str: string | undefined;
    let num: number | null | undefined;
    await streamXlsxRows(blob, (row) => { str = row.str(82); num = row.num(83); });
    expect(str).toBe('');
    expect(num).toBeNull();
  });

  it('planilha vazia devolve zero linhas', async () => {
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet('E509');
    const blob = new Blob([new Uint8Array(Buffer.from(await wb.xlsx.writeBuffer()))]);
    let chamadas = 0;
    expect(await streamXlsxRows(blob, () => { chamadas++; })).toBe(0);
    expect(chamadas).toBe(0);
  });

  it('a memória não acompanha o tamanho do ficheiro', async () => {
    const LINHAS = 8000;
    const blob = await makeWorkbook(LINHAS);
    expect(blob.size).toBeGreaterThan(1024 * 1024); // ficheiro de verdade, não um vazio

    const antes = getHeapStatistics().used_heap_size;
    let pico = antes;
    let lidas = 0;
    let ultimoLote = '';
    await streamXlsxRows(blob, (row) => {
      lidas++;
      ultimoLote = row.str(82); // exercita a leitura, sem acumular as linhas
      if (lidas % 1000 === 0) pico = Math.max(pico, getHeapStatistics().used_heap_size);
    });

    // O escritor em streaming não emite as linhas vazias antes do cabeçalho, por
    // isso o total é o cabeçalho mais os dados, não o número da última linha.
    expect(lidas).toBeGreaterThanOrEqual(LINHAS);
    expect(lidas).toBeLessThanOrEqual(LINHAS + 4);
    expect(ultimoLote).not.toBe('');
    // O caminho em memória gasta ~281 MiB para estas 8 mil linhas (medido).
    expect((pico - antes) / 1048576).toBeLessThan(150);
  }, 60_000);

  it('os tetos declaram o que cada caminho aguenta', () => {
    expect(MAX_XLSX_BYTES).toBe(10 * 1024 * 1024);
    expect(MAX_XLSX_INMEMORY_BYTES).toBe(2 * 1024 * 1024);
    expect(MAX_XLSX_INMEMORY_BYTES).toBeLessThan(MAX_XLSX_BYTES);
  });
});
