import JSZip from 'jszip';

/**
 * Guarda contra zip-bomb em XLSX (auditoria FILE-002).
 *
 * `workbook.xlsx.load(buf)` descomprime tudo antes de qualquer validação: um
 * .xlsx de 50 KiB pode declarar 5 GiB e derrubar o processo. `JSZip.loadAsync`
 * lê os cabeçalhos **sem inflar** os dados, então dá para medir o custo antes
 * de pagá-lo.
 */

/** Bytes do .xlsx comprimido aceitos no corpo do upload. */
export const MAX_XLSX_BYTES = 15 * 1024 * 1024;
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
 * Recusa o arquivo antes do exceljs se ele for grande demais, declarar
 * descompressão absurda, ou esconder o tamanho de alguma entrada.
 *
 * Um zip adulterado pode mentir no cabeçalho; nesse caso o tamanho declarado
 * some (vem `undefined`/0) e a entrada é recusada justamente por isso — não
 * confiamos em nenhuma entrada que se recuse a dizer quanto ocupa.
 */
export async function assertSafeXlsx(buf: ArrayBuffer | Uint8Array): Promise<void> {
  const compressedTotal = buf.byteLength;
  if (compressedTotal > MAX_XLSX_BYTES) {
    throw new XlsxTooLargeError(
      `Planilha excede ${Math.floor(MAX_XLSX_BYTES / 1024 / 1024)}MB`,
    );
  }

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buf);
  } catch {
    throw new XlsxTooLargeError('Planilha inválida ou corrompida');
  }

  let uncompressedTotal = 0;
  for (const [name, entry] of Object.entries(zip.files)) {
    if (entry.dir) continue;
    const data = (entry as unknown as JsZipInternalEntry)._data;
    const declared = data?.uncompressedSize;
    if (typeof declared !== 'number' || !Number.isFinite(declared) || declared <= 0) {
      // Entrada sem tamanho declarado: só um zip forjado faz isso.
      throw new XlsxTooLargeError(`Planilha com entrada de tamanho desconhecido: ${name}`);
    }
    uncompressedTotal += declared;
    if (uncompressedTotal > MAX_XLSX_UNCOMPRESSED_BYTES) {
      throw new XlsxTooLargeError(
        `Planilha descomprime acima de ${Math.floor(MAX_XLSX_UNCOMPRESSED_BYTES / 1024 / 1024)}MB`,
      );
    }
  }

  if (compressedTotal > 0 && uncompressedTotal / compressedTotal > MAX_XLSX_COMPRESSION_RATIO) {
    throw new XlsxTooLargeError('Planilha com taxa de compressão suspeita (zip-bomb)');
  }
}

/** Cap de linhas: o custo depois do unzip também precisa de teto. */
export function assertRowCount(rowCount: number): void {
  if (rowCount > MAX_XLSX_ROWS) {
    throw new XlsxTooLargeError(`Planilha excede ${MAX_XLSX_ROWS} linhas`);
  }
}
