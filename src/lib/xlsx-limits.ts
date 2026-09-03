import JSZip from 'jszip';

/**
 * Guarda contra zip-bomb em XLSX (auditoria FILE-002).
 *
 * `workbook.xlsx.load(buf)` descomprime tudo antes de qualquer validação: um
 * .xlsx de 50 KiB pode declarar 5 GiB e derrubar o processo. `JSZip.loadAsync`
 * lê os cabeçalhos **sem inflar** os dados, então dá para medir o custo antes
 * de pagá-lo.
 */

/**
 * Bytes do .xlsx comprimido aceitos no corpo do upload, no caminho que lê a
 * planilha **em streaming** (`streamXlsxRows`). Medido em 2026-09-02: um E509
 * de 10 MiB (42 mil linhas, 84 colunas) custa 95 MiB de pico de heap por esse
 * caminho, contra os ~690 MiB que o livro inteiro em memória exige já aos
 * 5 MiB — acima do `--max-old-space-size=512` com que o app corre.
 */
export const MAX_XLSX_BYTES = 10 * 1024 * 1024;
/**
 * Teto para rotas que ainda fazem `workbook.xlsx.load()` do ficheiro todo. O
 * custo é ~130 MiB de heap por MiB de .xlsx, então 2 MiB (~8,4 mil linhas,
 * 281 MiB de pico) é o que cabe com folga no heap de produção. Recusar com 413
 * é melhor do que aceitar e matar o processo.
 */
export const MAX_XLSX_INMEMORY_BYTES = 2 * 1024 * 1024;
/** Soma máxima do conteúdo descomprimido declarado no zip. */
export const MAX_XLSX_UNCOMPRESSED_BYTES = 120 * 1024 * 1024;
/** Razão máxima descomprimido/comprimido do arquivo inteiro. */
export const MAX_XLSX_COMPRESSION_RATIO = 200;
/** Linhas processadas por planilha. */
export const MAX_XLSX_ROWS = 200_000;

export class XlsxTooLargeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'XlsxTooLargeError';
  }
}

type JsZipInternalEntry = {
  _data?: { uncompressedSize?: number; compressedSize?: number };
};

/**
 * Recusa o arquivo antes do exceljs se ele for grande demais ou descomprimir
 * acima do orçamento.
 *
 * O tamanho declarado no cabeçalho do zip é do ATACANTE, e a versão anterior
 * confiava nele: a re-auditoria forjou um `.xlsx` de 306 KB com uma folha de
 * 300 MB cujos campos de tamanho diziam 1024, passou por este portão, e o
 * exceljs alocou +461 MB antes de detetar a divergência. O comentário antigo
 * afirmava que um zip adulterado faz o tamanho "sumir" — não faz; o central
 * directory pode declarar o que quiser.
 *
 * Agora o custo é MEDIDO: cada entrada é inflada por um stream com contador, e
 * o orçamento aborta antes de o excedente ser materializado. O declarado ainda
 * é lido, mas só como atalho para recusar cedo o que já se assume grande.
 */
export async function assertSafeXlsx(buf: ArrayBuffer | Uint8Array): Promise<void> {
  const compressedTotal = buf.byteLength;
  if (compressedTotal > MAX_XLSX_BYTES) {
    throw new XlsxTooLargeError(
      `Planilha excede ${Math.floor(MAX_XLSX_BYTES / 1024 / 1024)}MB`,
    );
  }

  // Magic "PK\x03\x04": recusa antes de o JSZip sequer olhar o resto.
  // (`new Uint8Array(buf)` sobre o Uint8Array preserva o byteOffset; usar
  // `buf.buffer` perderia o offset de uma subarray.)
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  if (bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b || bytes[2] !== 0x03 || bytes[3] !== 0x04) {
    throw new XlsxTooLargeError('Arquivo não é um .xlsx (assinatura ZIP ausente)');
  }

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buf);
  } catch {
    throw new XlsxTooLargeError('Planilha inválida ou corrompida');
  }

  let declaredTotal = 0;
  for (const entry of Object.values(zip.files)) {
    if (entry.dir) continue;
    const declared = (entry as unknown as JsZipInternalEntry)._data?.uncompressedSize;
    if (typeof declared !== 'number' || !Number.isFinite(declared) || declared <= 0) {
      // Entrada que se recusa a dizer quanto ocupa: só zip forjado faz isso, e
      // com o tamanho zerado o JSZip deixa de verificar a divergência no fim.
      throw new XlsxTooLargeError('Planilha com entrada de tamanho desconhecido');
    }
    declaredTotal += declared;
    // Atalho: quem já se declara grande demais é recusado sem inflar nada.
    if (declaredTotal > MAX_XLSX_UNCOMPRESSED_BYTES) {
      throw new XlsxTooLargeError(
        `Planilha descomprime acima de ${Math.floor(MAX_XLSX_UNCOMPRESSED_BYTES / 1024 / 1024)}MB`,
      );
    }
  }

  // A medição real. O declarado acima é conveniência; isto é o portão.
  let actualTotal = 0;
  for (const [name, entry] of Object.entries(zip.files)) {
    if (entry.dir) continue;
    actualTotal += await inflatedSize(
      entry,
      name,
      MAX_XLSX_UNCOMPRESSED_BYTES - actualTotal,
    );
  }

  if (compressedTotal > 0 && actualTotal / compressedTotal > MAX_XLSX_COMPRESSION_RATIO) {
    throw new XlsxTooLargeError('Planilha com taxa de compressão suspeita (zip-bomb)');
  }
}

/**
 * Bytes reais de uma entrada, abortando assim que passar de `budget`. O pico de
 * memória fica no tamanho de um chunk, não no da entrada.
 */
function inflatedSize(entry: JSZip.JSZipObject, name: string, budget: number): Promise<number> {
  return new Promise((resolve, reject) => {
    let seen = 0;
    const stream = entry.nodeStream('nodebuffer');
    const stop = (err: Error) => {
      // `pause` antes de destruir: sem isto o inflate em curso ainda entrega o
      // chunk que já estava no ar.
      stream.pause();
      stream.removeAllListeners();
      reject(err);
    };
    stream.on('data', (chunk: Buffer) => {
      seen += chunk.length;
      if (seen > budget) {
        stop(new XlsxTooLargeError(
          `Planilha descomprime acima de ${Math.floor(MAX_XLSX_UNCOMPRESSED_BYTES / 1024 / 1024)}MB`,
        ));
      }
    });
    stream.on('end', () => resolve(seen));
    stream.on('error', () => stop(new XlsxTooLargeError(`Planilha com entrada ilegível: ${name}`)));
  });
}

/** Cap de linhas: o custo depois do unzip também precisa de teto. */
export function assertRowCount(rowCount: number): void {
  if (rowCount > MAX_XLSX_ROWS) {
    throw new XlsxTooLargeError(`Planilha excede ${MAX_XLSX_ROWS} linhas`);
  }
}

/** Uma linha da planilha, com o mesmo endereçamento 0-based do caminho antigo. */
export interface XlsxStreamRow {
  index0: number;
  str(col0: number): string;
  num(col0: number): number | null;
}

/**
 * Lê a primeira planilha linha a linha, sem montar o livro em memória.
 *
 * Também substitui o `assertSafeXlsx` neste caminho: um zip-bomb não é
 * descomprimido de uma vez, e `assertRowCount` corta a leitura assim que passa
 * de `MAX_XLSX_ROWS` — o trabalho fica limitado pela linha, não pelo que o zip
 * declara. Devolve o número de linhas vistas (0 = planilha vazia).
 */
export async function streamXlsxRows(
  file: Blob,
  onRow: (row: XlsxStreamRow) => void,
): Promise<number> {
  const { Readable } = await import('node:stream');
  const ExcelJS = (await import('exceljs')).default;
  const input = Readable.fromWeb(file.stream() as Parameters<typeof Readable.fromWeb>[0]);
  const reader = new ExcelJS.stream.xlsx.WorkbookReader(input, {
    worksheets: 'emit',
    sharedStrings: 'cache',
    styles: 'ignore',
    hyperlinks: 'ignore',
    entries: 'ignore',
  });
  let seen = 0;
  for await (const worksheet of reader) {
    for await (const row of worksheet) {
      seen = row.number;
      assertRowCount(seen);
      const values = row.values as (string | number | Date | null | undefined)[];
      onRow({
        index0: row.number - 1,
        str: (c) => {
          const v = values[c + 1];
          return v != null ? String(v).trim() : '';
        },
        num: (c) => {
          const v = values[c + 1];
          if (v == null) return null;
          const n = Number(v);
          return Number.isNaN(n) ? null : n;
        },
      });
    }
    break; // só a primeira planilha, como o `worksheets[0]` do caminho antigo
  }
  return seen;
}
