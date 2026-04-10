export const PDF_CSS = `
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: Arial, Helvetica, sans-serif; color: #000; background: #e9e9e9; }
.page { width: 210mm; margin: 10mm auto; background: #fff; padding: 5mm; }
@media print {
  body { background: #fff; }
  .page { width: 100%; margin: 0; padding: 5mm; box-shadow: none; }
  @page { size: A4 portrait; margin: 5mm; }
}

table.danfe { width: 100%; border-collapse: collapse; margin-top: -1px; }
table.danfe td, table.danfe th { border: 1px solid #000; padding: 1px 3px; vertical-align: top; font-size: 8px; }
table.danfe .lbl { display: block; font-size: 6px; font-weight: bold; text-transform: uppercase; color: #333; line-height: 1.2; margin-bottom: 0px; }
table.danfe .val { display: block; font-size: 9px; font-weight: 600; line-height: 1.3; }
table.danfe .val-lg { display: block; font-size: 11px; font-weight: 700; line-height: 1.3; }
table.danfe .val-mono { display: block; font-size: 8px; font-family: 'Courier New', monospace; line-height: 1.4; }
table.danfe .center { text-align: center; }
table.danfe .right { text-align: right; }
table.danfe .no-border-t { border-top: none; }
table.danfe .no-border-b { border-bottom: none; }
table.danfe .no-border-l { border-left: none; }
table.danfe .no-border-r { border-right: none; }
table.danfe .section-title { background: #f5f5f5; font-size: 7px; font-weight: bold; text-transform: uppercase; padding: 2px 4px; }

.canhoto-wrapper { margin-bottom: 2mm; }
.canhoto-line { border-bottom: 1px dashed #000; margin: 2mm 0; }

.danfe-box { text-align: center; padding: 2px 4px; }
.danfe-box .danfe-title { font-size: 12px; font-weight: bold; letter-spacing: 1px; }
.danfe-box .danfe-sub { font-size: 7px; line-height: 1.3; }
.danfe-box .entry-exit { display: flex; justify-content: center; align-items: center; gap: 4px; margin: 3px 0; font-size: 7px; }
.danfe-box .entry-exit .box { width: 14px; height: 14px; border: 1px solid #000; display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: bold; }
.danfe-box .nf-num { font-size: 11px; font-weight: bold; margin: 2px 0; }
.danfe-box .nf-serie { font-size: 8px; }
.danfe-box .nf-page { font-size: 8px; }

.key-area { font-size: 7px; }
.key-area .key-value { font-family: 'Courier New', monospace; font-size: 9px; font-weight: bold; letter-spacing: 0.5px; word-break: break-all; margin-top: 2px; }
.key-area .consulta { font-size: 6.5px; color: #333; margin-top: 4px; line-height: 1.3; }

.nfe-badge { font-size: 14px; font-weight: bold; text-align: center; }

table.prods { width: 100%; border-collapse: collapse; margin-top: -1px; }
table.prods td, table.prods th { border: 1px solid #000; padding: 1px 2px; font-size: 7px; vertical-align: top; }
table.prods th { font-size: 6px; font-weight: bold; text-transform: uppercase; text-align: center; background: #f5f5f5; padding: 2px; }
table.prods td.right { text-align: right; }
table.prods td.center { text-align: center; }
table.prods .prod-desc { font-size: 7px; font-weight: 600; }
table.prods .prod-info { font-size: 6.5px; color: #444; }

.footer-line { font-size: 7px; display: flex; justify-content: space-between; padding: 3px 0; margin-top: 2mm; color: #555; }

.parcelas-grid { display: flex; flex-wrap: wrap; gap: 0; }
.parcela-item { border: 1px solid #000; border-left: none; padding: 1px 4px; font-size: 7px; min-width: 100px; }
.parcela-item:first-child { border-left: 1px solid #000; }
.parcela-item .lbl { font-size: 5.5px; font-weight: bold; text-transform: uppercase; }
.parcela-item .val { font-size: 7.5px; font-weight: 600; }
`;
