export const PDF_CSS = `
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: Arial, Helvetica, sans-serif; color: #000; background: #e9e9e9; }
.page { width: 210mm; margin: 6mm auto; background: #fff; padding: 3mm; }
.page + .page { break-before: page; page-break-before: always; }
@media print {
  body { background: #fff; }
  .page { width: 100%; margin: 0; padding: 3mm; box-shadow: none; }
  @page { size: A4 portrait; margin: 4mm; }
  .folha-counter::after { content: counter(page) " de " attr(data-total); }
}

table.danfe-sheet { width: 100%; border-collapse: collapse; }
table.danfe-sheet > thead { display: table-header-group; }
table.danfe-sheet > tfoot { display: table-footer-group; }
table.danfe-sheet > tbody { display: table-row-group; }
table.danfe-sheet > * > tr > td.sheet-cell { border: 0; padding: 0; }

table.danfe { width: 100%; border-collapse: collapse; margin-top: -1px; }
table.danfe td, table.danfe th { border: 1px solid #000; padding: 1px 3px; vertical-align: top; font-size: 8px; }
table.danfe .lbl { display: block; font-size: 5.5px; font-weight: bold; text-transform: uppercase; color: #222; line-height: 1.15; }
table.danfe .val { display: block; font-size: 9px; font-weight: 600; line-height: 1.25; }
table.danfe .val-lg { display: block; font-size: 11px; font-weight: 700; line-height: 1.25; }
table.danfe .center { text-align: center; }
table.danfe .right { text-align: right; }
table.danfe .section-title { font-size: 6.5px; font-weight: bold; text-transform: uppercase; padding: 1px 4px; }

.canhoto-wrapper { margin-bottom: 1mm; }
.canhoto-spacer { height: 1mm; }
.canhoto-line { border-bottom: 1px dashed #000; margin: 1.5mm 0 1mm; }

.emit-block { display: flex; align-items: center; gap: 5px; min-height: 28mm; }
.emit-logo-wrap { flex: 0 0 28.5mm; width: 28.5mm; max-width: 28.5mm; display: flex; align-items: center; justify-content: center; }
.emit-logo-wrap .emit-logo { width: 100%; height: auto; max-height: 27mm; display: block; }
.emit-text {
  flex: 1;
  font-family: "Arial Narrow", Arial, Helvetica, sans-serif;
  font-size: 8px;
  line-height: 1.15;
  font-weight: 800;
  font-stretch: condensed;
  letter-spacing: -0.01em;
}
.emit-name {
  font-size: 10px;
  font-weight: 800;
  text-transform: uppercase;
  line-height: 1.1;
  letter-spacing: -0.02em;
  margin-bottom: 1.5px;
}
.emit-line {
  font-size: 8px;
  font-weight: 800;
  line-height: 1.15;
}

.danfe-box { text-align: center; padding: 2px 3px; }
.danfe-box .danfe-title { font-size: 14px; font-weight: bold; letter-spacing: 0.5px; }
.danfe-box .danfe-sub { font-size: 6.5px; line-height: 1.2; }
.danfe-box .entry-exit { display: flex; justify-content: center; align-items: center; gap: 6px; margin: 3px 0; font-size: 7px; }
.danfe-box .entry-exit .box { width: 16px; height: 14px; border: 1px solid #000; display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: bold; }
.danfe-box .entry-exit-spica { display: flex; justify-content: center; align-items: center; gap: 5px; margin: 2px 0; }
.danfe-box .entry-exit-spica .ee-text { font-size: 6.5px; font-weight: bold; line-height: 1.15; text-align: left; }
.danfe-box .entry-exit-spica .ee-box { width: 16px; height: 16px; border: 1.5px solid #000; display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: bold; }
.danfe-box .nf-num { font-size: 10.5px; font-weight: bold; margin: 1px 0; }
.danfe-box .nf-serie, .danfe-box .nf-page { font-size: 8px; font-weight: bold; }
/* Fallback 1 de N só na tela. Unscoped ganhava do @media print (mesma especificidade). */
@media screen {
  .folha-counter::after { content: "1 de " attr(data-total); }
}
@media print {
  .folha-counter::after { content: counter(page) " de " attr(data-total); }
}

.key-area { font-size: 7px; }
.key-area .barcode-wrap { text-align: center; margin: 0 0 1px; }
.key-area .barcode { max-width: 100%; height: 24px; }
.key-area .key-sub-box { border-top: 1px solid #000; border-bottom: 1px solid #000; padding: 1px 2px; margin: 1px 0 2px; }
.key-area .key-value { font-family: Arial, Helvetica, sans-serif; font-size: 7.8px; font-weight: bold; letter-spacing: 0.2px; text-align: center; white-space: nowrap; margin-top: 1px; }
.key-area .consulta { font-size: 5.5px; color: #222; text-align: center; line-height: 1.2; margin-top: 1px; }

.nfe-badge { font-size: 13px; font-weight: bold; text-align: center; }

table.prods { width: 100%; border-collapse: collapse; margin-top: -1px; min-height: 115mm; }
table.prods thead { display: table-header-group; }
table.prods td, table.prods th { border: 1px solid #000; padding: 1px 2px; font-size: 6.5px; vertical-align: top; }
table.prods th { font-size: 5.5px; font-weight: bold; text-transform: uppercase; text-align: center; padding: 2px 1px; }
table.prods td.right { text-align: right; }
table.prods td.center { text-align: center; }
table.prods .prod-desc { font-size: 6.5px; font-weight: 600; }
table.prods .prod-info { font-size: 6px; color: #333; }
table.prods tr.prods-filler td { height: 95mm; border-top: 0; }

table.dados-adicionais { min-height: 28mm; }
table.dados-adicionais tr:last-child td { height: 28mm; vertical-align: top; }

.inf-cpl { font-size: 7px; line-height: 1.35; margin-top: 2px; white-space: pre-wrap; word-break: break-word; }
.footer-line { font-size: 7px; display: flex; justify-content: space-between; padding: 3px 0; margin-top: 2mm; color: #555; }
`;
