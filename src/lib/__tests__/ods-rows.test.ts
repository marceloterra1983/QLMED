import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { streamOdsRows } from '@/lib/ods-rows';

async function tinyOds(): Promise<Buffer> {
  const content = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
 xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0"
 xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0">
 <office:body><office:spreadsheet>
  <table:table table:name="Relatório">
   <table:table-row><table:table-cell><text:p>titulo</text:p></table:table-cell></table:table-row>
   <table:table-row><table:table-cell/><table:table-cell/></table:table-row>
   <table:table-row>
    <table:table-cell><text:p>No. NF</text:p></table:table-cell>
    <table:table-cell table:number-columns-repeated="81"/>
    <table:table-cell><text:p>Lote</text:p></table:table-cell>
   </table:table-row>
   <table:table-row><table:table-cell/></table:table-row>
   <table:table-row>
    <table:table-cell><text:p>000001</text:p></table:table-cell>
    <table:table-cell table:number-columns-repeated="81"/>
    <table:table-cell><text:p>LOTE-A</text:p></table:table-cell>
   </table:table-row>
  </table:table>
 </office:spreadsheet></office:body>
</office:document-content>`;
  const zip = new JSZip();
  zip.file('mimetype', 'application/vnd.oasis.opendocument.spreadsheet', { compression: 'STORE' });
  zip.file('content.xml', content);
  return zip.generateAsync({ type: 'nodebuffer' });
}

describe('streamOdsRows', () => {
  it('expande colunas repetidas e lê Lote na coluna 82', async () => {
    const buf = await tinyOds();
    const rows: Array<{ index0: number; nf: string; lote: string }> = [];
    await streamOdsRows(buf, (row) => {
      rows.push({ index0: row.index0, nf: row.str(0), lote: row.str(82) });
    });
    expect(rows[2]).toEqual({ index0: 2, nf: 'No. NF', lote: 'Lote' });
    expect(rows[4]).toEqual({ index0: 4, nf: '000001', lote: 'LOTE-A' });
  });
});
