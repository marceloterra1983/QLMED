/**
 * Tetos do pipeline PDF→OCR (auditoria FILE-003).
 *
 * Os dois extratores (impcg e cassems) escreviam qualquer PDF em disco,
 * rasterizavam todas as páginas e rodavam um `tesseract` por página. O
 * `timeout: 60_000` do `spawnSync` é **por processo**: um PDF de 500 páginas
 * custava até 500×60s de CPU, com o disco enchendo antes disso. O anexo vem de
 * e-mail — a origem é hostil por definição.
 */

/** PDF maior que isto nem chega a ser escrito em disco. */
export const MAX_PDF_BYTES = 10 * 1024 * 1024;
/** Páginas rasterizadas e OCRadas por documento. */
export const MAX_OCR_PAGES = 40;
/** Orçamento de parede para o pipeline inteiro, não por spawn. */
export const OCR_TOTAL_BUDGET_MS = 120_000;
/** Teto por spawn, ainda menor que o orçamento total. */
export const OCR_SPAWN_TIMEOUT_MS = 60_000;

export type OcrDeadline = {
  /** ms restantes para o próximo spawn; 0 quando o orçamento acabou. */
  remainingMs(): number;
  expired(): boolean;
};

/**
 * `%PDF` no início do arquivo. Sem isto o poppler recebe qualquer coisa que o
 * remetente chamou de .pdf.
 */
export function looksLikePdf(buf: Buffer): boolean {
  return buf.length >= 5 && buf.subarray(0, 5).toString('latin1') === '%PDF-';
}

/**
 * Conta páginas com `pdfinfo` sem rasterizar nada. Devolve `null` quando não dá
 * para saber (binário ausente, saída inesperada) — quem chama decide.
 */
export function parsePdfInfoPages(stdout: string): number | null {
  const match = stdout.match(/^Pages:\s+(\d+)/m);
  if (!match) return null;
  const pages = Number(match[1]);
  return Number.isFinite(pages) && pages >= 0 ? pages : null;
}

export function createOcrDeadline(budgetMs = OCR_TOTAL_BUDGET_MS): OcrDeadline {
  const endsAt = Date.now() + budgetMs;
  return {
    remainingMs: () => Math.max(0, Math.min(OCR_SPAWN_TIMEOUT_MS, endsAt - Date.now())),
    expired: () => Date.now() >= endsAt,
  };
}
