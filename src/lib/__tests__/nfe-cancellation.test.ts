import { describe, expect, it } from 'vitest';
import { detectNfeCancellation } from '../nfe-cancellation';
import { issuedCancelTagLabel } from '../nfe-cancellation-label';

const CHAVE = '35241012345678000199550010000012341123456789';

function procEvento(tpEvento: string, cStat: string, dhReg = '2026-08-20T14:30:00-03:00'): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<procEventoNFe versao="1.00">
  <evento versao="1.00">
    <infEvento>
      <chNFe>${CHAVE}</chNFe>
      <dhEvento>2026-08-20T14:00:00-03:00</dhEvento>
      <tpEvento>${tpEvento}</tpEvento>
      <nSeqEvento>1</nSeqEvento>
      <detEvento>
        <descEvento>Cancelamento</descEvento>
      </detEvento>
    </infEvento>
  </evento>
  <retEvento versao="1.00">
    <infEvento>
      <tpEvento>${tpEvento}</tpEvento>
      <chNFe>${CHAVE}</chNFe>
      <cStat>${cStat}</cStat>
      <dhRegEvento>${dhReg}</dhRegEvento>
    </infEvento>
  </retEvento>
</procEventoNFe>`;
}

const RES_EVENTO_CANCEL = `<?xml version="1.0" encoding="UTF-8"?>
<resEvento>
  <chNFe>${CHAVE}</chNFe>
  <tpEvento>110111</tpEvento>
  <dhEvento>2026-08-21T09:15:00-03:00</dhEvento>
</resEvento>`;

const NFE_AUTORIZADA = `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">
  <NFe>
    <infNFe Id="NFe${CHAVE}" versao="4.00">
      <ide><nNF>1234</nNF><serie>1</serie><dhEmi>2024-10-15T10:30:00-03:00</dhEmi></ide>
      <emit><CNPJ>12345678000199</CNPJ><xNome>Emitente</xNome></emit>
      <dest><CNPJ>98765432000188</CNPJ><xNome>Dest</xNome></dest>
      <total><ICMSTot><vNF>10.00</vNF></ICMSTot></total>
    </infNFe>
  </NFe>
  <protNFe><infProt><chNFe>${CHAVE}</chNFe><cStat>100</cStat></infProt></protNFe>
</nfeProc>`;

describe('detectNfeCancellation', () => {
  it('marca cancelada no evento 110111 aceito (cStat 135)', async () => {
    const hit = await detectNfeCancellation({ xml: procEvento('110111', '135') });
    expect(hit.cancelled).toBe(true);
    expect(hit.accessKey).toBe(CHAVE);
    expect(hit.cancelledAt?.toISOString()).toBe(new Date('2026-08-20T14:30:00-03:00').toISOString());
  });

  it('marca cancelada no evento 110111 fora do prazo (cStat 155)', async () => {
    const hit = await detectNfeCancellation({ xml: procEvento('110111', '155') });
    expect(hit.cancelled).toBe(true);
  });

  it('marca cancelada no resumo resEvento 110111', async () => {
    const hit = await detectNfeCancellation({ xml: RES_EVENTO_CANCEL });
    expect(hit.cancelled).toBe(true);
    expect(hit.accessKey).toBe(CHAVE);
    expect(hit.cancelledAt?.toISOString()).toBe(new Date('2026-08-21T09:15:00-03:00').toISOString());
  });

  it('marca cancelada pela situacao NSDocs Cancelada', async () => {
    const hit = await detectNfeCancellation({
      documentType: 'NFE',
      providerStatus: 'Cancelada',
      accessKey: CHAVE,
    });
    expect(hit.cancelled).toBe(true);
    expect(hit.accessKey).toBe(CHAVE);
    expect(hit.cancelledAt).toBeInstanceOf(Date);
  });

  it('nao cancela carta de correcao 110110', async () => {
    const hit = await detectNfeCancellation({ xml: procEvento('110110', '135') });
    expect(hit.cancelled).toBe(false);
    expect(hit.cancelledAt).toBeNull();
  });

  it('nao cancela evento 110111 rejeitado (cStat 215)', async () => {
    const hit = await detectNfeCancellation({ xml: procEvento('110111', '215') });
    expect(hit.cancelled).toBe(false);
  });

  it('nao cancela XML autorizado sem evento', async () => {
    const hit = await detectNfeCancellation({ xml: NFE_AUTORIZADA });
    expect(hit.cancelled).toBe(false);
  });

  it('nao cancela so por manifestacao confirmada', async () => {
    const hit = await detectNfeCancellation({
      documentType: 'NFE',
      providerStatus: 'Confirmacao da Operacao',
      xml: NFE_AUTORIZADA,
    });
    expect(hit.cancelled).toBe(false);
  });

  it('nao trata desacordo de CT-e como cancelamento de NF-e', async () => {
    const hit = await detectNfeCancellation({
      documentType: 'NFE',
      providerStatus: 'Desacordo cancelado',
    });
    expect(hit.cancelled).toBe(false);
  });
});

describe('issuedCancelTagLabel', () => {
  it('devolve Cancelado quando ha cancelledAt', () => {
    expect(issuedCancelTagLabel('2026-08-20T17:30:00.000Z')).toBe('Cancelado');
  });

  it('nao devolve tag quando vigente', () => {
    expect(issuedCancelTagLabel(null)).toBeNull();
    expect(issuedCancelTagLabel(undefined)).toBeNull();
  });
});
