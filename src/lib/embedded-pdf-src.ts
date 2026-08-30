/** Viewer pdf.js já vendorado — sem o painel de miniaturas do Chrome. */
export function embeddedPdfViewerSrc(filePath: string): string {
  return `/pdfjs/web/viewer.html?file=${encodeURIComponent(filePath)}#pagemode=none&zoom=page-width`;
}

type PdfJsWindow = Window & {
  PDFViewerApplicationOptions?: { set: (name: string, value: unknown) => void };
  PDFViewerApplication?: {
    initializedPromise?: Promise<unknown>;
    eventBus?: { on: (name: string, listener: () => void) => void };
    pdfSidebar?: { close: () => void };
  };
};

/** Mesma origem: força o painel fechado mesmo se o PDF pedir PageMode /UseThumbs. */
export function closeEmbeddedPdfSidebar(frame: HTMLIFrameElement): void {
  const win = frame.contentWindow as PdfJsWindow | null;
  if (!win) return;
  win.PDFViewerApplicationOptions?.set('sidebarViewOnLoad', 0);
  const app = win.PDFViewerApplication;
  void app?.initializedPromise?.then(() => {
    app.pdfSidebar?.close();
    app.eventBus?.on('documentloaded', () => {
      app.pdfSidebar?.close();
    });
  });
}
