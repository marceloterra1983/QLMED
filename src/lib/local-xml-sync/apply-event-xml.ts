import { applyNfeCancellation } from '@/lib/nfe-cancellation';
import { extractAccessKeyFromFilePath } from './sync-utils';

export async function applyLocalXmlCancellation(
  companyId: string,
  xmlContent: string,
  filePath: string,
): Promise<boolean> {
  return applyNfeCancellation({
    companyId,
    xml: xmlContent,
    accessKey: extractAccessKeyFromFilePath(filePath),
    documentType: 'NFE',
  });
}
