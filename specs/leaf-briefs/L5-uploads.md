# Findings de L5-uploads

## QLMED-FILE-001 — Uploads bufferizam antes do limite (CL ausente/chunked)
- severidade: high | status: confirmed | confiança: high
- local: src/app/api/invoices/upload/route.ts:45 (Content-Length); src/app/api/certificate/upload/route.ts:24 (formData)
- invariante: Rejeitar corpo acima do cap antes de materializar.
- cenário: Só invoices/upload checa CL se presente. Cert/xlsx/json/webhook formData/text/json primeiro. NODE_OPTIONS 512MB.
- esperado: Recusar CL ausente; contar bytes no stream.
- observado: upload/route.ts:45-53; certificate/upload 24-49; import-e509 58-66.
- causa raiz: Limite no objeto File, não no stream.
- correção mínima: Cap no proxy/Next + recusar CL missing + abort no stream.
- teste de regressão: chunked body > cap não aumenta RSS além do cap+epsilon.
- risco residual: Proxy nginx não auditado aqui.

## QLMED-FILE-002 — XLSX E509/tipos sem limites de ZIP/linhas/células
- severidade: high | status: confirmed | confiança: high
- local: src/app/api/estoque/import-e509/route.ts:64 (xlsx.load)
- invariante: OOXML hostil não pode expandir sem teto.
- cenário: ExcelJS load sem cap de bytes/entradas/ratio/rows.
- esperado: Cap 2–5MiB, magic PK, cap rows.
- observado: import-e509/route.ts:58-101; import-types 20-36.
- causa raiz: Parser de planilha sem containment.
- correção mínima: Size+magic+row cap.
- teste de regressão: xlsx zip-bomb rejeitado <2s.
- risco residual: ExcelJS internamente ainda pode alocar.

## QLMED-FILE-003 — PDF/OCR IMPCG/CASSEMS sem cap de tamanho/páginas
- severidade: high | status: confirmed | confiança: high
- local: src/lib/impcg/extract-pdf-text.ts:24 (extractPdfText)
- invariante: Anexo clínico tem teto de bytes e páginas.
- cenário: Buffer Graph unbounded; pdftoppm sem -l; tesseract 300dpi; sem magic %PDF.
- esperado: Cap ~10MiB, magic, máx N páginas, deadline.
- observado: graph-mail-client.ts:229-234; extract-pdf-text.ts:23-60.
- causa raiz: Pipeline OCR assume ofício pequeno.
- correção mínima: Caps + magic + pdftotext-only acima de N páginas.
- teste de regressão: PDF 9999 páginas aborta sem tesseract.
- risco residual: pdftotext ainda lê o arquivo.

## QLMED-FILE-004 — OneDrive/local sync faz path.join do nome remoto (zip-slip) e download unbounded
- severidade: high | status: confirmed | confiança: high
- local: src/lib/local-xml-sync/sync-scheduler.ts:176 (copyOneDriveXmlFileIfNeeded)
- invariante: Escrita só sob copyTargetDir; download com teto.
- cenário: path.join(dir, month, oneDriveFile.name) sem basename/confine; arrayBuffer full.
- esperado: basename + resolve+startsWith(root); cap bytes.
- observado: sync-scheduler.ts:176-203,257-259; onedrive-graph.ts:65-78.
- causa raiz: Confiar no nome remoto.
- correção mínima: basename; jail; cap Content-Length.
- teste de regressão: name ../../tmp/pwn.xml não sai do jail.
- risco residual: Volume Docker compartilhado.

## QLMED-FILE-005 — HTML-to-PDF: Chromium --no-sandbox, JS e rede ativos, sem timeout
- severidade: high | status: confirmed | confiança: high
- local: src/lib/pdf/render.ts:29 (renderHtmlToPdf)
- invariante: HTML-to-PDF não executa JS nem faz request externo.
- cenário: launch --no-sandbox; setContent waitUntil load; sem setJavaScriptEnabled(false) nem intercept.
- esperado: JS off; abort requests; timeout; sandbox/seccomp.
- observado: pdf/render.ts:29-37; Dockerfile chromium uid 1001.
- causa raiz: Alpine + puppeteer-core sem política de página.
- correção mínima: setJavaScriptEnabled(false); intercept deny; timeout.
- teste de regressão: HTML com img src=http://127.0.0.1 não gera request.
- risco residual: --no-sandbox pode ser inevitável no container; precisa compensar.

## QLMED-FILE-006 — parseXmlSafe rejeita DOCTYPE por regex após buffer; sem depth cap
- severidade: medium | status: confirmed | confiança: high
- local: src/lib/safe-xml-parser.ts:3 (parseXmlSafe)
- invariante: XML hostil limitado em bytes e profundidade antes do parse.
- cenário: length 10MiB depois buffer; DOCTYPE regex; xml2js sem max depth. XXE clássico improvável (sax).
- esperado: Cap no stream; max depth.
- observado: safe-xml-parser.ts:3-29.
- causa raiz: Parser after buffer.
- correção mínima: Byte cap + depth; testes DOCTYPE.
- teste de regressão: DOCTYPE file:// não vaza conteúdo.
- risco residual: ISO-8859-1 fiscal.

## QLMED-FILE-008 — XML/PDF em plaintext em path sem companyId
- severidade: medium | status: confirmed | confiança: high
- local: src/lib/xml-file-store.ts:7 (XML_BACKUP_DIR)
- invariante: Arquivo fiscal isolado por empresa e permissão mínima.
- cenário: {month}/{accessKey}-nfe.xml; Invoice.xmlContent TEXT; sem 0600.
- esperado: companyId no path; 0600; tmp+rename.
- observado: xml-file-store.ts:7-80; Dockerfile dirs.
- causa raiz: Backup local global.
- correção mínima: Prefixo companyId; perms.
- teste de regressão: path contém companyId.
- risco residual: Volume já populado.
