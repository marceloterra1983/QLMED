import { describe, expect, it } from 'vitest';
import { isOficioFieldEdited, mergeEditedFields } from '@/lib/gestao-oficio-edits';

describe('gestao oficio edits', () => {
  it('acumula campos editados sem repetir', () => {
    expect(mergeEditedFields(['issuedAt'], ['issuedAt', 'patientName'])).toEqual([
      'issuedAt',
      'patientName',
    ]);
  });

  it('reconhece campo marcado como editado', () => {
    expect(isOficioFieldEdited(['issuedAt'], 'issuedAt')).toBe(true);
    expect(isOficioFieldEdited(['issuedAt'], 'hospitalName')).toBe(false);
    expect(isOficioFieldEdited(undefined, 'issuedAt')).toBe(false);
  });
});
