/**
 * Limites de upload aplicados **no stream**, não depois de bufferizar.
 *
 * O defeito original (auditoria FILE-001) era conferir o tamanho só depois de
 * `req.formData()` ter materializado o corpo inteiro na memória, e só quando o
 * cliente tivesse mandado `Content-Length` — que é opcional em
 * `Transfer-Encoding: chunked`. Um POST chunked de 2 GB passava pelos dois
 * portões e derrubava o processo antes de qualquer validação rodar.
 */

export class PayloadTooLargeError extends Error {
  constructor(readonly limitBytes: number) {
    super(`Payload excede o limite de ${limitBytes} bytes`);
    this.name = 'PayloadTooLargeError';
  }
}

/**
 * Lê o corpo da request contando bytes e aborta assim que passa de
 * `maxBytes`. O pico de memória fica em `maxBytes` + um chunk, mesmo sem
 * `Content-Length` e mesmo que o cliente minta no header.
 */
// `Uint8Array<ArrayBufferLike>` não serve como BodyInit (SharedArrayBuffer não
// vale); `Uint8Array<ArrayBuffer>` serve — daí a alocação explícita no fim.
export async function readBodyWithLimit(req: Request, maxBytes: number): Promise<Uint8Array<ArrayBuffer>> {
  const declared = Number(req.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new PayloadTooLargeError(maxBytes);
  }

  const body = req.body;
  if (!body) return new Uint8Array(new ArrayBuffer(0));

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;

    total += value.byteLength;
    if (total > maxBytes) {
      // Fecha o stream: sem isto o remetente continua a empurrar bytes.
      await reader.cancel().catch(() => {});
      throw new PayloadTooLargeError(maxBytes);
    }
    chunks.push(value);
  }

  const out = new Uint8Array(new ArrayBuffer(total));
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

/**
 * `req.formData()` com o corpo já limitado. Substitui a chamada direta em toda
 * rota que aceita upload.
 */
export async function formDataWithLimit(req: Request, maxBytes: number): Promise<FormData> {
  const bytes = await readBodyWithLimit(req, maxBytes);
  return new Response(bytes, {
    headers: { 'content-type': req.headers.get('content-type') || '' },
  }).formData();
}
