import { extractPatientNameFromXml } from '@/lib/nfe/extract-patient-name';

/** Campos de paciente a mesclar no create/update de Invoice (SPEC-052). */
export function invoicePatientWriteFields(args: {
  xmlContent: string | null | undefined;
  type: string;
  direction: string;
}): { patientName: string | null } {
  if (args.type !== 'NFE' || args.direction !== 'issued') {
    return { patientName: null };
  }
  return { patientName: extractPatientNameFromXml(args.xmlContent) };
}
