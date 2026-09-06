import { requireFeatureAccess, canWriteRole, type FeatureAccess } from '@/lib/feature-access';
import { DOCUMENTOS_PAGE_PATH } from './constants';

export function canWriteDocumentos(role: string): boolean {
  return canWriteRole(role);
}

export type DocumentosAccess = FeatureAccess;

export async function requireDocumentosPage(): Promise<DocumentosAccess> {
  return requireFeatureAccess({
    pagePath: DOCUMENTOS_PAGE_PATH,
    useGetOrCreateCompany: false,
  });
}
