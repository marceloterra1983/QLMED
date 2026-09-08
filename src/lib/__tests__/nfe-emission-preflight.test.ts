import { describe, expect, it } from 'vitest';
import { buildUnsignedNfeXml } from '@/lib/nfe-emission/xml-builder';
import { buildNfeAccessKey } from '@/lib/nfe-emission/access-key';
import {
  assertNfePreflight,
  collectNfePreflightIssues,
  NfePreflightError,
} from '@/lib/nfe-emission/preflight';
import { computeIbsItem } from '@/lib/nfe-emission/xml-ibscbs';
import type { NfeEmissionDraft } from '@/lib/nfe-emission/types';

function sampleDraft(over: Partial<NfeEmissionDraft> = {}): NfeEmissionDraft {
  const issueDate = new Date(2026, 7, 30, 10, 0, 0);
  const accessKey = buildNfeAccessKey({
    cUf: '50',
    issueDate,
    cnpj: '12345678000199',
    series: '2',
    number: '8',
    cNf: '11111111',
  });
  const ender = {
    xLgr: 'Rua A',
    nro: '10',
    xBairro: 'Centro',
    cMun: '5002704',
    xMun: 'Campo Grande',
    UF: 'MS',
    CEP: '79002000',
  };
  return {
    natureza: 'Doacao',
    cfop: '5910',
    series: '2',
    number: '8',
    issueDate,
    finNFe: '1',
    indFinal: '1',
    indPres: '9',
    tpAmb: '1',
    modFrete: '0',
    accessKey,
    emit: { cnpj: '12345678000199', xNome: 'QLMED', ie: '123456789', crt: '3', ender },
    dest: {
      cnpj: '98765432000188',
      xNome: 'Hospital Teste',
      ie: null,
      indIEDest: '9',
      ender: { ...ender },
    },
    items: [{
      cProd: '002626',
      xProd: 'Valvula',
      ncm: '90183999',
      cfop: '5910',
      uCom: 'UN',
      qCom: '4',
      vUnCom: '120',
      anvisa: '10216839008',
    }],
    pag: { tPag: '90', indPag: '0', vPag: '0.00' },
    ...over,
  };
}

describe('IBS/CBS 200030 (DNA 65248)', () => {
  it('480.00 → vIBSUF 0.19 e vCBS 1.73', () => {
    const row = computeIbsItem('480.00');
    expect(row.vIbsUf).toBe('0.19');
    expect(row.vCbs).toBe('1.73');
    expect(row.pAliqEfetUf).toBe('0.04');
    expect(row.pAliqEfetCbs).toBe('0.36');
  });
});

describe('pré-envio NF-e', () => {
  it('XML do builder com indPres 9 passa o checklist', () => {
    const xml = buildUnsignedNfeXml(sampleDraft());
    expect(collectNfePreflightIssues(xml)).toEqual([]);
    expect(() => assertNfePreflight(xml)).not.toThrow();
  });

  it('falta de indIntermed é 434 e nao chama SEFAZ', () => {
    const xml = buildUnsignedNfeXml(sampleDraft()).replace('<indIntermed>0</indIntermed>', '');
    const issues = collectNfePreflightIssues(xml);
    expect(issues.some((i) => i.cStat === '434')).toBe(true);
    expect(() => assertNfePreflight(xml)).toThrow(NfePreflightError);
    try {
      assertNfePreflight(xml);
    } catch (e) {
      expect(e).toBeInstanceOf(NfePreflightError);
      expect((e as NfePreflightError).message).toMatch(/não foi enviada à SEFAZ/);
    }
  });

  it('falta de infRespTec é 972', () => {
    const xml = buildUnsignedNfeXml(sampleDraft()).replace(/<infRespTec>[\s\S]*?<\/infRespTec>/, '');
    expect(collectNfePreflightIssues(xml).some((i) => i.cStat === '972')).toBe(true);
  });
});
