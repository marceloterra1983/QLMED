import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import {
  abbreviateCity,
  buildCteWhatsappCaption,
  buildNfeWhatsappCaption,
  decorateClaimInvoice,
  extractCteRouteCities,
  shortCarrierName,
} from '@/lib/cte-whatsapp-caption';

const QL_CNPJ = '07832309000197';
const QL_NAME = 'QL MED MATERIAIS HOSPITALARES LTDA';

function cteXml(parties: {
  remName?: string;
  remCnpj?: string;
  destName?: string;
  destCnpj?: string;
} = {}): string {
  const rem = parties.remName
    ? `<rem><CNPJ>${parties.remCnpj || '11111111000191'}</CNPJ><xNome>${parties.remName}</xNome></rem>`
    : '';
  const dest = parties.destName
    ? `<dest><CNPJ>${parties.destCnpj || '22222222000182'}</CNPJ><xNome>${parties.destName}</xNome></dest>`
    : '';
  return `<?xml version="1.0" encoding="UTF-8"?>
<cteProc xmlns="http://www.portalfiscal.inf.br/cte" versao="4.00">
  <CTe>
    <infCte>
      <ide>
        <xMunIni>Campo Grande</xMunIni>
        <xMunFim>SAO PAULO</xMunFim>
      </ide>
      ${rem}
      ${dest}
    </infCte>
  </CTe>
</cteProc>`;
}

const AZUL_XML = cteXml();

const ACCESS_KEY = '50260809296295001727570030001334971511477148';

describe('shortCarrierName', () => {
  it('reduz Azul e Pantanal a uma palavra', () => {
    expect(shortCarrierName('AZUL LINHAS AEREAS BRASILEIRAS SA')).toBe('AZUL');
    expect(shortCarrierName('PANTANAL LOGISTICA E TRANSPORTES LTDA')).toBe('PANTANAL');
  });

  it('pula sufixo jurídico e palavra genérica', () => {
    expect(shortCarrierName('TRANSPORTADORA XYZ LTDA')).toBe('XYZ');
    expect(shortCarrierName('')).toBe('-');
  });
});

describe('abbreviateCity', () => {
  it('abrevia só Campo Grande para C.G.', () => {
    expect(abbreviateCity('Campo Grande')).toBe('C.G.');
    expect(abbreviateCity('CAMPO GRANDE')).toBe('C.G.');
    expect(abbreviateCity('SAO PAULO')).toBe('São Paulo');
  });
});

describe('extractCteRouteCities', () => {
  it('lê início e fim da prestação', () => {
    expect(extractCteRouteCities(AZUL_XML)).toEqual({
      originCity: 'Campo Grande',
      destCity: 'SAO PAULO',
    });
  });

  it('não inventa cidade sem tags', () => {
    expect(extractCteRouteCities('<cteProc/>')).toEqual({
      originCity: null,
      destCity: null,
    });
  });
});

describe('buildCteWhatsappCaption', () => {
  it('monta caption curto sem chave (AC-001, AC-002)', () => {
    const caption = buildCteWhatsappCaption({
      number: '133497',
      senderName: 'AZUL LINHAS AEREAS BRASILEIRAS SA',
      originCity: 'Campo Grande',
      destCity: 'SAO PAULO',
      totalValue: 325.63,
    });

    expect(caption).toBe(
      [
        'CT-e Recebido',
        '',
        'AZUL',
        'C.G. ➡️ São Paulo',
        'R$ 325,63',
      ].join('\n'),
    );
    expect(caption).not.toContain('Nº');
    expect(caption).not.toContain('133497');
    expect(caption).not.toContain('🚚');
    expect(caption).not.toContain('🚛');
    expect(caption).not.toContain('Chave');
    expect(caption).not.toContain(ACCESS_KEY);
  });

  it('omite a rota quando não há municípios (AC-006)', () => {
    const caption = buildCteWhatsappCaption({
      number: '10',
      senderName: 'PANTANAL TRANSPORTES',
      originCity: null,
      destCity: null,
      totalValue: 1,
    });

    expect(caption).toContain('PANTANAL');
    expect(caption).not.toContain('Nº');
    expect(caption).not.toContain('10');
    expect(caption).not.toContain('➡️');
    expect(caption).not.toContain('C.G.');
  });

  it('coloca destinatário que não é QL ao lado da cidade de destino (AC-007)', () => {
    const caption = buildCteWhatsappCaption({
      number: '133497',
      senderName: 'AZUL LINHAS AEREAS BRASILEIRAS SA',
      originCity: 'Campo Grande',
      destCity: 'SAO PAULO',
      totalValue: 325.63,
      originPartyName: QL_NAME,
      originPartyCnpj: QL_CNPJ,
      destPartyName: 'HOSPITAL SIRIO LIBANES LTDA',
      destPartyCnpj: '60950025000107',
    });

    expect(caption).toContain('C.G. ➡️ São Paulo (Hospital Sirio Libanes)');
    expect(caption).not.toContain('C.G. (');
    expect(caption).not.toMatch(/\bQL\b/);
  });

  it('coloca remetente que não é QL ao lado da cidade de origem (AC-008)', () => {
    const caption = buildCteWhatsappCaption({
      number: '10',
      senderName: 'PANTANAL TRANSPORTES',
      originCity: 'Campo Grande',
      destCity: 'SAO PAULO',
      totalValue: 1,
      originPartyName: 'SANTA CASA DE MISERICORDIA',
      originPartyCnpj: '33333333000173',
      destPartyName: QL_NAME,
      destPartyCnpj: QL_CNPJ,
    });

    expect(caption).toContain('C.G. (Santa Casa de Misericordia) ➡️ São Paulo');
    expect(caption).not.toContain('São Paulo (');
    expect(caption).not.toMatch(/\bQL\b/);
  });

  it('omite QL e nome ausente — sem parênteses (AC-009)', () => {
    const bothQl = buildCteWhatsappCaption({
      number: '1',
      senderName: 'AZUL',
      originCity: 'Campo Grande',
      destCity: 'SAO PAULO',
      totalValue: 1,
      originPartyName: QL_NAME,
      originPartyCnpj: QL_CNPJ,
      destPartyName: 'QLMED',
      destPartyCnpj: QL_CNPJ,
    });
    expect(bothQl).toContain('C.G. ➡️ São Paulo');
    expect(bothQl).not.toContain('(');

    const missing = buildCteWhatsappCaption({
      number: '1',
      senderName: 'AZUL',
      originCity: 'Campo Grande',
      destCity: 'SAO PAULO',
      totalValue: 1,
    });
    expect(missing).toContain('C.G. ➡️ São Paulo');
    expect(missing).not.toContain('(');
  });
});

describe('decorateClaimInvoice', () => {
  it('lê remetente e destinatário do XML e omite QL na rota', () => {
    const decorated = decorateClaimInvoice({
      id: 'inv-party',
      accessKey: ACCESS_KEY,
      type: 'CTE',
      number: '133497',
      senderName: 'AZUL LINHAS AEREAS BRASILEIRAS SA',
      totalValue: 325.63,
      xmlContent: cteXml({
        remName: QL_NAME,
        remCnpj: QL_CNPJ,
        destName: 'HOSPITAL SIRIO LIBANES LTDA',
        destCnpj: '60950025000107',
      }),
    });

    expect(decorated.whatsappCaption).toContain('C.G. ➡️ São Paulo (Hospital Sirio Libanes)');
    expect(decorated.whatsappCaption).not.toMatch(/\bQL\b/);
    expect(JSON.stringify(decorated)).not.toContain('<cteProc');
  });

  it('omits xmlContent and adds WhatsApp caption for CT-e', () => {
    const decorated = decorateClaimInvoice({
      id: 'inv-1',
      accessKey: ACCESS_KEY,
      type: 'CTE',
      number: '133497',
      senderName: 'AZUL LINHAS AEREAS BRASILEIRAS SA',
      totalValue: 325.63,
      xmlContent: AZUL_XML,
    });

    expect(decorated).not.toHaveProperty('xmlContent');
    expect(decorated.whatsappCaption).toContain('AZUL');
    expect(decorated.whatsappCaption).toContain('C.G. ➡️ São Paulo');
    expect(decorated.whatsappCaption).not.toContain('Nº');
    expect(decorated.whatsappCaption).not.toContain('133497');
    expect(decorated.whatsappCaption).not.toContain(ACCESS_KEY);
    expect(JSON.stringify(decorated)).not.toContain('xmlContent');
    expect(JSON.stringify(decorated)).not.toContain('<cteProc');
  });

  it('keeps the Python worker caption rules green', () => {
    const result = spawnSync(
      'python3',
      ['-m', 'unittest', '-v', 'scripts/test_notification_outbox_worker.py'],
      { encoding: 'utf8' },
    );
    expect(result.status, result.stderr || result.stdout).toBe(0);
  });

  it('adds short NF-e WhatsApp caption without key or labels', () => {
    const decorated = decorateClaimInvoice({
      id: 'inv-2',
      accessKey: ACCESS_KEY,
      type: 'NFE',
      number: '39400',
      senderName: 'Politec Importacao e Comercio Ltda',
      totalValue: 60895.8,
      xmlContent: '<nfeProc />',
    });

    expect(decorated).not.toHaveProperty('xmlContent');
    expect(decorated.whatsappCaption).toBe(
      'NF-e Recebida\n\nNúmero: 39400\nPolitec Importacao e Comercio Ltda\nR$ 60.895,80',
    );
    expect(decorated.whatsappCaption).not.toContain('Chave');
    expect(decorated.whatsappCaption).not.toContain(ACCESS_KEY);
    expect(decorated.whatsappCaption).not.toContain('Emitente/Transportadora');
    expect(decorated.whatsappCaption).not.toContain('Valor:');
    expect(JSON.stringify(decorated)).not.toContain('<nfeProc');
  });

  it('prefers shortName over razão social on NF-e caption', () => {
    const decorated = decorateClaimInvoice({
      id: 'inv-3',
      accessKey: ACCESS_KEY,
      type: 'NFE',
      number: '39400',
      senderName: 'Politec Importacao e Comercio Ltda',
      senderShortName: 'Politec',
      totalValue: 60895.8,
    });

    expect(decorated.whatsappCaption).toContain('\nPolitec\n');
    expect(decorated.whatsappCaption).not.toContain('Politec Importacao');
    expect(decorated).not.toHaveProperty('senderShortName');
  });
});

describe('buildNfeWhatsappCaption', () => {
  it('uses shortName when present', () => {
    const text = buildNfeWhatsappCaption({
      number: '10',
      senderName: 'Razao Social Longa LTDA',
      senderShortName: 'Apelido',
      totalValue: 1,
    });
    expect(text).toContain('\nApelido\n');
    expect(text).not.toContain('Razao Social');
  });
});
