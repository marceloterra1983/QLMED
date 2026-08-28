import { applyNfeCancellation } from '@/lib/nfe-cancellation';
import { extractAccessKeyFromFilePath } from './sync-utils';

export async function applyLocalXmlCancellation(
  xmlContent: string,
  filePath: string,
): Promise<boolean> {
  return applyNfeCancellation({
    xml: xmlContent,
    accessKey: extractAccessKeyFromFilePath(filePath),
    documentType: 'NFE',
  });
}
