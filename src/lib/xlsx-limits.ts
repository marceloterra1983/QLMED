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
export const MAX_XLSX_BYTES = 5 * 1024 * 1024;
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
