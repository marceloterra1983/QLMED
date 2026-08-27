import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import {
  abbreviateCity,
  buildCteWhatsappCaption,
  decorateClaimInvoice,
  extractCteRouteCities,
  shortCarrierName,
} from '@/lib/cte-whatsapp-caption';

const AZUL_XML = `<?xml version="1.0" encoding="UTF-8"?>
<cteProc xmlns="http://www.portalfiscal.inf.br/cte" versao="4.00">
  <CTe>
    <infCte>
      <ide>
        <xMunIni>Campo Grande</xMunIni>
        <xMunFim>SAO PAULO</xMunFim>
      </ide>
    </infCte>
  </CTe>
</cteProc>`;

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
        'Nº 133497 · AZUL',
        'C.G. 🚚 São Paulo',
        'R$ 325,63',
      ].join('\n'),
    );
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

    expect(caption).toContain('Nº 10 · PANTANAL');
    expect(caption).not.toContain('🚚');
    expect(caption).not.toContain('C.G.');
  });
});

describe('decorateClaimInvoice', () => {
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
    expect(decorated.whatsappCaption).toContain('C.G. 🚚 São Paulo');
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

  it('does not add CT-e caption on NF-e', () => {
    const decorated = decorateClaimInvoice({
      id: 'inv-2',
      accessKey: ACCESS_KEY,
      type: 'NFE',
      number: '1',
      senderName: 'Fornecedor',
      totalValue: 10,
      xmlContent: '<nfeProc />',
    });

    expect(decorated).not.toHaveProperty('xmlContent');
    expect(decorated).not.toHaveProperty('whatsappCaption');
  });
});
