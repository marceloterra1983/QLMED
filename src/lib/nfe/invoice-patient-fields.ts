import {
  extractConvenioNameFromXml,
  extractDoctorNameFromXml,
  extractPatientNameFromXml,
} from '@/lib/nfe/extract-patient-name';

/** Campos clínicos do infCpl a mesclar no create/update de Invoice (SPEC-052/054). */
export function invoicePatientWriteFields(args: {
  xmlContent: string | null | undefined;
  type: string;
  direction: string;
}): {
  patientName: string | null;
  convenioName: string | null;
  doctorName: string | null;
} {
  if (args.type !== 'NFE' || args.direction !== 'issued') {
    return { patientName: null, convenioName: null, doctorName: null };
  }
  return {
    patientName: extractPatientNameFromXml(args.xmlContent),
    convenioName: extractConvenioNameFromXml(args.xmlContent),
    doctorName: extractDoctorNameFromXml(args.xmlContent),
  };
}
