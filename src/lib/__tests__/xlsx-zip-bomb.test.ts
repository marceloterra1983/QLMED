import JSZip from 'jszip';
import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import {
  assertSafeXlsx,
  assertRowCount,
  XlsxTooLargeError,
  MAX_XLSX_ROWS,
  MAX_XLSX_BYTES,
} from '@/lib/xlsx-limits';

/**
 * Fixtures hostis geradas aqui — nenhuma planilha real do cliente.
 */

/** Zip-bomb honesto: ~50 KiB no disco, 50 MiB ao descomprimir. */
async function zipBomb(uncompressedBytes: number): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file('bomb.bin', Buffer.alloc(uncompressedBytes, 0));
  const buf = await zip.generateAsync({
    type: 'uint8array',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 },
  });
  return buf;
}

/** Zip-bomb mentiroso: os campos de tamanho são zerados no cabeçalho. */
async function lyingZipBomb(uncompressedBytes: number): Promise<Uint8Array> {
  const buf = Buffer.from(await zipBomb(uncompressedBytes));
  for (let i = 0; i + 4 <= buf.length; i++) {
    if (buf.readUInt32LE(i) === uncompressedBytes) buf.writeUInt32LE(0, i);
  }
  return new Uint8Array(buf);
}

async function realWorkbook(): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Tipos');
  sheet.addRow(['Código', 'Descrição']);
  sheet.addRow(['PROD-001', 'Produto teste']);
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}

describe('assertSafeXlsx (FILE-002 zip-bomb)', () => {
  it('recusa zip que descomprime muito acima do tamanho do arquivo', async () => {
    const bomb = await zipBomb(50 * 1024 * 1024);

    // A fixture é o cenário do achado: arquivo minúsculo, expansão enorme.
    expect(bomb.byteLength).toBeLessThan(1024 * 1024);

    await expect(assertSafeXlsx(bomb)).rejects.toBeInstanceOf(XlsxTooLargeError);
  });

  it('recusa antes de qualquer inflate: o guard nunca materializa os 50 MiB', async () => {
    const bomb = await zipBomb(50 * 1024 * 1024);
    const before = process.memoryUsage().heapUsed;

    await expect(assertSafeXlsx(bomb)).rejects.toBeInstanceOf(XlsxTooLargeError);

    const grew = process.memoryUsage().heapUsed - before;
    // Se tivesse descomprimido, o heap subiria dezenas de MiB.
    expect(grew).toBeLessThan(20 * 1024 * 1024);
  });

  it('recusa zip que esconde o tamanho declarado (cabeçalho adulterado)', async () => {
    const bomb = await lyingZipBomb(20 * 1024 * 1024);

    await expect(assertSafeXlsx(bomb)).rejects.toBeInstanceOf(XlsxTooLargeError);
  });

  it('recusa arquivo comprimido acima do cap de bytes', async () => {
    const oversized = new Uint8Array(MAX_XLSX_BYTES + 1);

    await expect(assertSafeXlsx(oversized)).rejects.toBeInstanceOf(XlsxTooLargeError);
  });

  it('recusa arquivo que não é zip', async () => {
    await expect(assertSafeXlsx(new Uint8Array([1, 2, 3, 4]))).rejects.toBeInstanceOf(XlsxTooLargeError);
  });

  it('recusa por magic PK ausente antes de olhar o resto', async () => {
    // %PDF disfarçado de .xlsx
    const notZip = new TextEncoder().encode('%PDF-1.4 nao sou planilha');
    await expect(assertSafeXlsx(notZip)).rejects.toThrow(/assinatura ZIP/);
  });

  it('rejeita o zip-bomb em menos de 2s', async () => {
    const bomb = await zipBomb(50 * 1024 * 1024);
    const started = Date.now();

    await expect(assertSafeXlsx(bomb)).rejects.toBeInstanceOf(XlsxTooLargeError);

    expect(Date.now() - started).toBeLessThan(2000);
  });

  it('aceita uma planilha real gerada pelo próprio exceljs', async () => {
    await expect(assertSafeXlsx(await realWorkbook())).resolves.toBeUndefined();
  });
});

describe('assertRowCount (FILE-002 cap de linhas)', () => {
  it('recusa planilha acima do cap de linhas', () => {
    expect(() => assertRowCount(MAX_XLSX_ROWS + 1)).toThrow(XlsxTooLargeError);
  });

  it('aceita planilha dentro do cap', () => {
    expect(() => assertRowCount(MAX_XLSX_ROWS)).not.toThrow();
  });
});

/**
 * REAUD-B-03. O portão anterior confiava no `uncompressedSize` DECLARADO. A
 * re-auditoria forjou um `.xlsx` de 306 KB cuja folha de 300 MB declarava 1024:
 * passava, e o exceljs alocava +461 MB antes de detetar a divergência.
 */
describe('REAUD-B-03 — o custo é medido, não declarado', () => {
  async function declaresSmall(realBytes: number, lie: number): Promise<Uint8Array> {
    const buf = Buffer.from(await zipBomb(realBytes));
    for (let i = 0; i + 4 <= buf.length; i += 1) {
      if (buf.readUInt32LE(i) === realBytes) buf.writeUInt32LE(lie, i);
    }
    return new Uint8Array(buf);
  }

  it('entrada que declara 1024 e infla 20MB é recusada antes do exceljs', async () => {
    const forjado = await declaresSmall(20 * 1024 * 1024, 1024);

    await expect(assertSafeXlsx(forjado)).rejects.toBeInstanceOf(XlsxTooLargeError);
  });

  it('a planilha real continua a passar — o portão não recusa tudo', async () => {
    await expect(assertSafeXlsx(await realWorkbook())).resolves.toBeUndefined();
  });
});
