function sanitizeFilename(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '_').trim() || 'download';
}

function parseFilenameFromDisposition(contentDisposition: string | null): string | null {
  if (!contentDisposition) return null;

  const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    try {
      return sanitizeFilename(decodeURIComponent(utf8Match[1]));
    } catch {
      return sanitizeFilename(utf8Match[1]);
    }
  }

  const basicMatch = contentDisposition.match(/filename="?([^";]+)"?/i);
  if (basicMatch?.[1]) {
    return sanitizeFilename(basicMatch[1]);
  }

  return null;
}

function triggerBlobDownload(blob: Blob, filename: string): void {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = filename;
  link.rel = 'noopener';
  link.style.display = 'none';

  document.body.appendChild(link);
  link.click();
  link.remove();

  window.setTimeout(() => {
    URL.revokeObjectURL(objectUrl);
  }, 30_000);
}

export async function downloadFileFromRequest(
  url: string,
  init: RequestInit = {},
  fallbackFilename?: string,
): Promise<void> {
  const response = await fetch(url, {
    ...init,
    credentials: 'same-origin',
  });
  if (!response.ok) {
    throw new Error(`Falha no download (${response.status})`);
  }

  const blob = await response.blob();
  const contentDisposition = response.headers.get('Content-Disposition');
  const filename = parseFilenameFromDisposition(contentDisposition) || sanitizeFilename(fallbackFilename || 'download');
  triggerBlobDownload(blob, filename);
}

export async function downloadFileFromUrl(url: string, fallbackFilename?: string): Promise<void> {
  await downloadFileFromRequest(url, { method: 'GET' }, fallbackFilename);
}

export async function downloadManyFilesSequentially(urls: string[], pauseMs = 120): Promise<void> {
  for (const url of urls) {
    await downloadFileFromUrl(url);
    if (pauseMs > 0) {
      await new Promise((resolve) => window.setTimeout(resolve, pauseMs));
    }
  }
}
