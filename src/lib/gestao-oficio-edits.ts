export const OFICIO_EDITABLE_FIELDS = [
  'issuedAt',
  'patientName',
  'patientRegistry',
  'doctorName',
  'doctorCrm',
  'procedureName',
  'hospitalName',
] as const;

export type OficioEditableField = (typeof OFICIO_EDITABLE_FIELDS)[number];

export function mergeEditedFields(current: string[], added: OficioEditableField[]): string[] {
  return [...new Set([...current, ...added])];
}

export function isOficioFieldEdited(fields: string[] | undefined, field: OficioEditableField): boolean {
  return Boolean(fields?.includes(field));
}
