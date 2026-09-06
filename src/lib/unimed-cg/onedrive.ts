import { resolveAccountOneDrive } from '@/lib/onedrive-connections';
import { UNIMED_CG_ONEDRIVE_ACCOUNT } from './constants';

export async function resolveUnimedCgOneDrive(companyId: string): Promise<{
  accessToken: string;
  driveId: string;
}> {
  return resolveAccountOneDrive(companyId, UNIMED_CG_ONEDRIVE_ACCOUNT, {
    errorMessage: 'conta de arquivo nao conectada',
  });
}
