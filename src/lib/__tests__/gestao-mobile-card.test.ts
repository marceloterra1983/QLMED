import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function mobileCardBlock(source: string): string {
  const start = source.indexOf('sm:hidden');
  const end = source.indexOf('hidden sm:block', start);
  if (start < 0 || end < 0) {
    throw new Error('bloco compacto sm:hidden não encontrado');
  }
  return source.slice(start, end);
}

function desktopTableBlock(source: string): string {
  const start = source.indexOf('hidden sm:block');
  const end = source.indexOf('<Modal', start);
  if (start < 0 || end < 0) {
    throw new Error('tabela desktop não encontrada');
  }
  return source.slice(start, end);
}

describe('card compacto da lista de ofícios', () => {
  it.each([
    'src/app/(painel)/gestao/impcg/page-client.tsx',
    'src/app/(painel)/gestao/cassems/page-client.tsx',
  ])('mostra paciente, local e médico sem valor em %s', (relative) => {
    const source = readFileSync(resolve(process.cwd(), relative), 'utf8');
    const card = mobileCardBlock(source);
    expect(card).toContain('item.patientName');
    expect(card).toContain('item.hospitalName');
    expect(card).toContain('item.doctorName');
    expect(card).not.toContain('formatBrl');
    expect(card).not.toContain('totalAmount');
  });
});

describe('tabela desktop da lista de ofícios', () => {
  it.each([
    'src/app/(painel)/gestao/impcg/page-client.tsx',
    'src/app/(painel)/gestao/cassems/page-client.tsx',
  ])('empilha hospital sob o paciente em %s', (relative) => {
    const source = readFileSync(resolve(process.cwd(), relative), 'utf8');
    const table = desktopTableBlock(source);
    expect(table).toContain('GestaoPatientHospital');
    expect(table).not.toContain('>Hospital<');
  });
});
