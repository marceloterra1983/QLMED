# Gates: L5 — uploads e parsers (auditoria b177b07)

Scope: A raiz comum dos achados é **o limite ser aplicado depois de
bufferizar**. Cada gate abaixo prova que a recusa acontece *antes* de o
processo consumir a memória/CPU que o atacante quer gastar.

Base medida antes de qualquer edição (`npm test` em b177b07 + branch limpa):
`Test Files 94 passed | 3 skipped (97)` / `Tests 725 passed | 4 skipped (729)`.
Depois: `Test Files 99 passed | 3 skipped (102)` / `Tests 785 passed | 4 skipped (789)`.

Nota: `specs/leaf-briefs/L5-uploads.md` e `PLAN.md` **não existem** neste
worktree; os gates saem do enunciado da folha, não do brief.

---

## FILE-001 — upload de XML: cap depois do buffer — FECHADO

- [x] G1: corpo maior que o cap é recusado **em stream**, sem bufferizar tudo
  CHECK: `npx vitest run src/lib/__tests__/upload-body-limit.test.ts`
  EXPECT: corpo interminável → `PayloadTooLargeError`; bytes lidos ≤ cap + 1 chunk
  EVIDENCE: `Tests 5 passed (5)`. O stream hostil erra sozinho acima de 50 MiB
  entregues; o guard cortou em ≤ 72 KiB (cap 64 KiB + 1 chunk de 8 KiB).

- [x] G2: ausência de `Content-Length` (chunked) não desliga o limite
  CHECK: mesmo teste, `expect(req.headers.get('content-length')).toBeNull()`
  EXPECT: recusa igual à do caso com header
  EVIDENCE: teste "recusa corpo maior que o cap SEM Content-Length (chunked)"
  passou; `counter.cancelled === true` (o stream foi fechado, não drenado).

- [x] G3: cliente que MENTE no `Content-Length` também é cortado
  EVIDENCE: teste "recusa mesmo quando o cliente MENTE no Content-Length" passou
  com header `content-length: 10` e corpo interminável.

- [x] G4: a rota devolve 413 ponta-a-ponta (não 500, não OOM)
  CHECK: `npx vitest run src/lib/__tests__/upload-route-limits.test.ts`
  EVIDENCE: `Tests 6 passed (6)`; `POST /api/invoices/upload` → status 413.

- [x] G5: controlo positivo — revertendo para "bufferiza e depois checa"
  EVIDENCE: 2 testes VERMELHOS. Erro exato:
  `AssertionError: expected Error: guard nunca cortou o stream to be an instance of PayloadTooLargeError`
  (o corpo passou de 50 MiB antes de qualquer recusa). Restaurado → 5 passed.

## FILE-002 — XLSX sem cap de zip nem de linhas (zip-bomb) — FECHADO

- [x] G6: zip que declara descompressão muito acima do ficheiro é recusado antes do exceljs
  CHECK: `npx vitest run src/lib/__tests__/xlsx-zip-bomb.test.ts`
  EXPECT: ~51 KiB comprimidos declarando 50 MiB → recusa
  EVIDENCE: `Tests 8 passed (8)`. Fixture medida: 51.084 bytes comprimidos,
  52.428.800 declarados (razão ≈ 1028:1).

- [x] G7: a recusa acontece sem inflar — o heap não sobe
  EXPECT: crescimento de heap < 20 MiB ao rejeitar um bomb de 50 MiB
  EVIDENCE: teste "recusa antes de qualquer inflate" passou.

- [x] G8: zip com cabeçalho de tamanho adulterado (mentindo) também é recusado
  EXPECT: entrada sem tamanho declarado positivo → recusa
  EVIDENCE: fixture zera todo uint32 igual ao tamanho real; `JSZip` passa a
  reportar `uncompressedSize: undefined` e o guard recusa por isso.

- [x] G9: cap de linhas existe e é aplicado nas duas rotas
  EVIDENCE: `assertRowCount(MAX_XLSX_ROWS + 1)` lança `XlsxTooLargeError`;
  chamado em `import-types` e em `import-e509`.

- [x] G10: planilha legítima continua passando
  EVIDENCE: `excel-import-routes.test.ts` → `Tests 3 passed (3)` sem alteração.

- [x] G11: controlo positivo — desligando `assertSafeXlsx`
  EVIDENCE: 5 testes VERMELHOS (`Tests 5 failed | 3 passed (8)`). Restaurado → 8 passed.

## FILE-003 — PDF/OCR sem cap de páginas nem de bytes; timeout parcial — FECHADO

- [x] G12: PDF acima do cap de bytes não chega a ser escrito em disco nem ao poppler
  CHECK: `npx vitest run src/lib/__tests__/pdf-ocr-limits.test.ts`
  EXPECT: buffer > 25 MiB → `''`, `spawnSync`/`mkdtempSync`/`writeFileSync` não chamados
  EVIDENCE: `Tests 15 passed (15)`; vale para impcg e cassems (`describe.each`).

- [x] G13: contagem de páginas é limitada na origem (`pdftoppm -l N`) e na iteração
  EXPECT: 500 PNGs no diretório → no máximo `MAX_OCR_PAGES + 1` spawns de tesseract
  EVIDENCE: teste passou com 500 páginas; `pdftoppm` recebe `-f 1 -l 40`.

- [x] G14: existe orçamento de tempo **total**, não só por spawn
  EXPECT: todo spawn recebe `timeout > 0` derivado do orçamento; orçamento
  esgotado não autoriza mais nenhum spawn
  EVIDENCE: `createOcrDeadline(0).remainingMs() === 0` e `.expired() === true`;
  `createOcrDeadline(10*60_000).remainingMs() <= 60_000`.

- [x] G15: `tesseract` recebe `-l por` explícito nos dois pipelines
  CHECK: `grep -c "'-l', 'por'" src/lib/{impcg,cassems}/extract-pdf-text.ts`
  EVIDENCE: cassems 1, impcg 2. **Já era assim em b177b07** —
  `git show b177b07:src/lib/cassems/extract-pdf-text.ts` linha 47 já tinha
  `'-l', 'por'`. Esta sub-alegação do achado não procedia; os testes agora
  travam a regressão.

- [x] G16: controlo positivo — removendo cap de bytes e cap de páginas do impcg
  EVIDENCE: 3 testes VERMELHOS. Erro exato: `AssertionError: expected 501 to be
  less than or equal to 41` (501 spawns de tesseract) e
  `expected [ '-png', '-r', '300', …(2) ] to include '-l'`. Restaurado → 15 passed.

## FILE-004 — zip-slip no nome vindo do OneDrive — FECHADO

- [x] G17: nome com `../` não escapa do diretório de destino
  CHECK: `npx vitest run src/lib/__tests__/onedrive-path-traversal.test.ts`
  EVIDENCE: `Tests 21 passed (21)`; 9 nomes hostis × nome e pasta.

- [x] G18: a fixture ataca algo real — o `path.join` cru de b177b07 escapava
  EVIDENCE: `path.join('/srv/qlmed/xml_backup','2026_09','../../etc/cron.d/pwn')`
  === `/srv/qlmed/etc/cron.d/pwn` (asserido no próprio teste).

- [x] G19: `safeJoinUnderDir` está aplicado nos dois call sites reais
  CHECK: `grep -n safeJoinUnderDir src/lib/local-xml-sync/sync-scheduler.ts`
  EVIDENCE: linhas do laço de XML e do laço de PDF; nome recusado → `continue` + warn.

- [x] G20: controlo positivo — voltando ao `path.join` cru
  EVIDENCE: 9 testes VERMELHOS (`Tests 9 failed | 12 passed (21)`). Erro exato:
  `AssertionError: expected '/srv/qlmed/evil.xml' to be '/srv/qlmed/xml_backup/2026_09/evil.xml'`.
  Restaurado → 21 passed.

## FILE-005 — Chromium com `--no-sandbox`, JS e rede ligados, sem timeout — PARCIAL

- [x] G21: JavaScript desligado na página que renderiza o PDF
  CHECK: `npx vitest run src/lib/__tests__/pdf-render.test.ts`
  EVIDENCE: `Tests 8 passed (8)`; `setJavaScriptEnabled(false)` asserido.

- [x] G22: qualquer request de rede é abortado (sem SSRF nem exfiltração)
  EVIDENCE: `http://169.254.169.254/latest/meta-data/`, `https://evil.example/?leak=nota`
  e `file:///etc/passwd` → `request.abort()`; `data:` → `request.continue()`.

- [x] G23: `setContent` e `pdf()` têm timeout explícito, e a opção do chamador vence
  EVIDENCE: asserido `timeout: expect.any(Number)` nos dois; `{ timeout: 1234 }`
  do chamador sobrescreve o default.

- [ ] G24: `--no-sandbox` removido — **NÃO FECHADO, deliberado**
  MOTIVO: o container é `node:22-alpine` correndo como utilizador `nextjs`
  (uid 1001, sem SUID `chrome-sandbox` e sem user namespaces garantidos). Não
  tenho Chromium nem Docker neste worktree para **medir** se o sandbox sobe;
  removê-lo às cegas quebraria a emissão de DANFE em produção. Mitigação
  aplicada e medida: sem JS e sem rede, que é o que tornava a flag perigosa.
  EVIDENCE: `Dockerfile` linhas do `adduser --system --uid 1001 nextjs` e
  `PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser`.

- [x] G25: controlo positivo — revertendo o endurecimento
  EVIDENCE: 4 testes VERMELHOS (`Tests 4 failed | 4 passed (8)`). Erro exato:
  `AssertionError: expected "vi.fn()" to be called with arguments: [ false ]`.
  Restaurado → 8 passed.

## FILE-006 — (mapeamento NÃO VERIFICADO: brief ausente)

- [x] G26: sem o brief, tratei os defeitos da mesma raiz encontrados no
  varrimento das rotas que aceitam corpo do cliente
  EVIDENCE: dois fechados —
  (a) `POST /api/certificate/upload`: o `.pfx` era bufferizado por
  `request.formData()` e só depois comparado ao cap de 1 MiB; agora o corpo
  tem teto de 1 MiB + 64 KiB aplicado no stream.
  (b) `POST /api/webhooks/n8n`: `await req.text()` sem teto **antes** da
  validação de assinatura; agora 1 MiB no stream → 413.
  O mapeamento destes para o identificador FILE-006 é **suposição minha**.

## FILE-008 — caminho de XML/PDF sem separação por empresa — NÃO FECHADO

- [x] G27: estado real medido
  CHECK: `grep -n "path.join(XML_BACKUP_DIR\|path.join(PDF_BACKUP_DIR" src/lib/xml-file-store.ts`
  EVIDENCE: 4 ocorrências (linhas 53, 79, 114, 154), todas
  `<BACKUP_DIR>/<AAAA_MM>/<ficheiro>`. **Nenhum segmento por empresa.**
  Confirmado.

- [ ] G28: separação por empresa implementada — **NÃO FECHADO**
  MOTIVO: exige (1) mudar a assinatura de `saveXmlToFile`,
  `saveIssuedPdfToFile`, `readIssuedPdfFromFile` e `resolveInvoiceXmlContent`
  em 8 call sites que hoje não têm `companyId` à mão; (2) mudar o layout em
  disco, no qual a cópia do OneDrive escreve direto
  (`copyTargetDir/<mês>/<ficheiro>`) e a reconciliação varre; (3) migrar os
  ficheiros já existentes no volume de produção. É migração de dados, não
  correção de folha, e não consigo medi-la aqui.
  Exposição hoje: o produto é mono-empresa (`getOrCreateSingleCompany`,
  `SINGLE_COMPANY_CNPJ`) e `accessKey` é `@unique` global no schema
  (`prisma/schema.prisma:293`), então não há colisão entre empresas hoje. O
  risco é latente, para quando existir a segunda empresa.

## Portões finais

- [x] G29: `npm run typecheck` verde
  EVIDENCE: `> tsc --noEmit` sem saída.

- [x] G30: `npm run lint` verde
  EVIDENCE: `> eslint .` sem saída.

- [x] G31: `npm test` verde, contagem acima da base
  EVIDENCE: `Test Files 99 passed | 3 skipped (102)` /
  `Tests 785 passed | 4 skipped (789)` — base era 94/725.

- [x] G32: `npm run docs:validate` verde
  EVIDENCE: `Documentation validation passed (152 Markdown files, 46 IDs).`

- [ ] G33: branch `fix/audit-l5-uploads` empurrada para `origin`
  EVIDENCE: pending
