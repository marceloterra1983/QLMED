# Gates: L5 — uploads e parsers (auditoria b177b07)

Scope: A raiz comum dos achados é **o limite ser aplicado depois de
bufferizar**. Cada gate abaixo prova que a recusa acontece *antes* de o
processo consumir a memória/CPU que o atacante quer gastar.

Base medida antes de qualquer edição (`npm test` em b177b07 + branch limpa):
`Test Files 94 passed | 3 skipped (97)` / `Tests 725 passed | 4 skipped (729)`.
Depois: `Test Files 99 passed | 3 skipped (102)` / `Tests 785 passed | 4 skipped (789)`.

Nota: o brief chegou depois da primeira passagem (o coordenador despachou sem
ele). Esta versão está revista contra os locais e linhas exatos do brief. A
correção maior foi o **FILE-006**, que eu tinha mapeado errado.

Contagem: base b177b07 `94 files / 725 tests` → final `101 files / 810 tests`.

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
  EVIDENCE: `Tests 10 passed (10)`. Fixture medida: 51.084 bytes comprimidos,
  52.428.800 declarados (razão ≈ 1028:1). Cap ajustado de 15 MiB para **5 MiB**
  conforme o brief ("cap 2–5 MiB").

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

- [x] G11a: magic `PK\x03\x04` conferido antes de tudo (pedido do brief)
  EVIDENCE: `%PDF-1.4` disfarçado de .xlsx → `/assinatura ZIP/`.

- [x] G11b: o bomb é rejeitado em menos de 2s (critério do brief)
  EVIDENCE: teste mede `Date.now()` à volta da chamada; `< 2000` ms.

- [x] G11: controlo positivo — desligando `assertSafeXlsx`
  EVIDENCE: 5 testes VERMELHOS (`Tests 5 failed | 3 passed (8)`). Restaurado → 8 passed.

## FILE-003 — PDF/OCR sem cap de páginas nem de bytes; timeout parcial — FECHADO

- [x] G12: PDF acima do cap de bytes não chega a ser escrito em disco nem ao poppler
  CHECK: `npx vitest run src/lib/__tests__/pdf-ocr-limits.test.ts`
  EXPECT: buffer > 25 MiB → `''`, `spawnSync`/`mkdtempSync`/`writeFileSync` não chamados
  EVIDENCE: `Tests 21 passed (21)`; vale para impcg e cassems (`describe.each`).
  Cap ajustado de 25 MiB para **10 MiB** conforme o brief.

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

- [x] G14a: PDF de 9999 páginas aborta SEM chamar tesseract (critério do brief)
  EXPECT: `tesseractCalls()` vazio e `pdftoppm` nunca chamado
  EVIDENCE: `pdfinfo` reporta 9999 → `pdf_too_many_pages_ocr_skipped`, retorna
  `''` e o OCR é abandonado; só o `pdftotext` fica valendo, como o brief pede.

- [x] G14b: magic `%PDF` conferido antes de escrever em disco
  EVIDENCE: `PK\x03\x04` disfarçado de .pdf → `writeFileSync` e `spawnSync`
  não são chamados.

- [x] G14c: o buffer do Graph tem teto (local `graph-mail-client.ts:229-234`)
  EXPECT: anexo acima de `MAX_PDF_BYTES` não vira Buffer
  EVIDENCE: o tamanho é estimado a partir do comprimento do base64
  (`length*3/4`), então a recusa acontece **antes** de `Buffer.from` alocar.

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

- [x] G19a: a cópia local (linhas 257-259) também é confinada
  EVIDENCE: `safeJoinUnderDir(copyTargetDir, ...relativePath.split(sep))`;
  caminho recusado → `continue` + warn.

- [x] G19b: download do OneDrive tem teto de bytes (`onedrive-graph.ts:65-78`)
  EXPECT: `Content-Length` acima do teto → recusa sem chamar `arrayBuffer()`
  EVIDENCE: `Tests 24 passed (24)`; o mock prova `arrayBuffer` não chamado, e
  o caso chunked (sem header) é recusado depois de medir.

- [x] G20: controlo positivo — voltando ao `path.join` cru
  EVIDENCE: 9 testes VERMELHOS (`Tests 9 failed | 12 passed (21)`). Erro exato:
  `AssertionError: expected '/srv/qlmed/evil.xml' to be '/srv/qlmed/xml_backup/2026_09/evil.xml'`.
  Restaurado → 21 passed.

## FILE-005 — Chromium com `--no-sandbox`, JS e rede ligados, sem timeout — PARCIAL

- [x] G21: JavaScript desligado na página que renderiza o PDF
  CHECK: `npx vitest run src/lib/__tests__/pdf-render.test.ts`
  EVIDENCE: `Tests 8 passed (8)`; `setJavaScriptEnabled(false)` asserido.

- [x] G22: qualquer request de rede é abortado (sem SSRF nem exfiltração)
  EVIDENCE: `http://127.0.0.1/` (o caso exato do brief),
  `http://169.254.169.254/latest/meta-data/`, `https://evil.example/?leak=nota`
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

## FILE-006 — parseXmlSafe: DOCTYPE por regex após buffer, sem depth cap — FECHADO

Correção de rumo: o meu primeiro mapeamento (certificate/upload + webhook n8n)
estava **errado**. Aquilo pertence ao FILE-001 e ficou lá. FILE-006 é o
`src/lib/safe-xml-parser.ts`.

- [x] G20a: o cap passa a ser em BYTES, não em caracteres
  CHECK: `npx vitest run src/lib/__tests__/xml-depth-limit.test.ts`
  EXPECT: 6 MiB de `ç` (≈12 MiB em UTF-8) recusado, mesmo com `.length` < 10 MiB
  EVIDENCE: `Tests 6 passed (6)`; o teste assere `length < 10MiB` e
  `Buffer.byteLength > 10MiB` antes de esperar a recusa.

- [x] G20b: limite de profundidade existe e corta antes do sax descer
  EXPECT: 5.000 níveis → `/profundidade/`; NF-e real (6 níveis) passa
  EVIDENCE: `getMaxXmlDepth` conta 6 numa NF-e e 30 em `nested(30)`; 5.000
  níveis são recusados nos dois parsers (`parseXmlSafe` e `NoMerge`).

- [x] G20c: DOCTYPE com `file://` não vaza conteúdo
  EVIDENCE: recusado com `/DOCTYPE/` antes de qualquer parse, nos dois parsers.

- [x] G20d: **ISO-8859-1 não quebrou** (risco residual apontado no brief)
  EXPECT: XML declarado `encoding="ISO-8859-1"` com acentos parseia igual
  EVIDENCE: `CIRÚRGICA SÃO JOSÉ LTDA` volta intacto de `parseXmlSafe`. Nada foi
  re-decodificado: as chamadas já recebem string, e mexer nisso é que partiria
  o ISO-8859-1.

- [x] G20e: o scanner de profundidade não conta tags dentro de comentário/CDATA
  EVIDENCE: **o teste apanhou um defeito meu**: a primeira versão saltava só o
  `<!--` e contava `<b><c>` de dentro do comentário (deu 3, esperado 1).
  Corrigido saltando o bloco inteiro até `-->` / `]]>` / `?>`.

- [x] G20f: controlo positivo — voltando ao cap por `.length` sem depth
  EVIDENCE: 2 testes VERMELHOS. Erro exato: `AssertionError: promise resolved
  "{ a: 'çççç…' }" instead of rejecting`. Restaurado → 6 passed.

## FILE-008 — XML/PDF em path sem companyId — FECHADO (menos a migração)

Separando o que é assinatura de função do que é migração de volume, como o
coordenador pediu.

- [x] G21: o path contém o companyId (critério de teste do brief)
  CHECK: `npx vitest run src/lib/__tests__/xml-file-store-company.test.ts`
  EXPECT: `<BACKUP_DIR>/<companyId>/<AAAA_MM>/<ficheiro>`
  EVIDENCE: `Tests 7 passed (7)`; caminho medido
  `.../company-abc/2026_03/<chave>-nfe.xml`.

- [x] G22: duas empresas com a MESMA chave não partilham ficheiro
  EVIDENCE: conteúdos distintos lidos de volta de cada caminho.

- [x] G23: permissões 0600 e escrita tmp+rename
  EXPECT: `mode & 0o777 === 0o600`; nenhum `.tmp` sobra
  EVIDENCE: asserido; diretórios criados com 0700.

- [x] G24: leitura cai no caminho legado, para não perder o que já está gravado
  EVIDENCE: ficheiro escrito à mão em `<BACKUP_DIR>/<mês>/` é lido; quando os
  dois existem, o novo (com empresa) vence.

- [x] G25: as 8 chamadas foram convertidas — **todas tinham companyId à mão**
  EVIDENCE: `nfe-emission/authorize.ts` (`finalizeAuthorized`, o mais
  importante segundo o brief), `sync-strategies/nsdocs.ts`,
  `sync-strategies/sefaz.ts`, `receita-nfse-sync.ts`, `original-issued-pdf.ts`
  (2 chamadas, via `invoice.companyId`) e `api/invoices/export-xml/route.ts`
  (passei a selecionar `companyId` na query e a usar `inv.companyId`).
  Nenhuma ficou por converter.

- [x] G26: `companyId` é validado como segmento de caminho, não confiado
  EVIDENCE: `buildCompanySegment('../../etc')` → `null`, e o save devolve
  `null` em vez de escrever fora.

- [x] G27: controlo positivo — layout legado e escrita sem 0600
  EVIDENCE: 4 testes VERMELHOS. Erros exatos:
  `expected '/tmp/qlmed-xml-store-*/2026_03/…' to contain '/company-abc/'` e
  `AssertionError: expected 420 to be 384` (0644 vs 0600). Restaurado → 7 passed.

- [ ] G28: migração dos ficheiros já gravados no volume — **NÃO FECHADO**
  MOTIVO: mover o que já existe em `<BACKUP_DIR>/<mês>/` para
  `<BACKUP_DIR>/<companyId>/<mês>/` é operação sobre o volume de produção, com
  a cópia do OneDrive a escrever no mesmo sítio ao mesmo tempo. O fallback de
  leitura cobre o período entre as duas coisas, então nada se perde enquanto a
  migração não corre.

## Portões finais

- [x] G29: `npm run typecheck` verde
  EVIDENCE: `> tsc --noEmit` sem saída.

- [x] G30: `npm run lint` verde
  EVIDENCE: `> eslint .` sem saída.

- [x] G31: `npm test` verde, contagem acima da base
  EVIDENCE: `Test Files 101 passed | 3 skipped (104)` /
  `Tests 810 passed | 4 skipped (814)` — base era 94/725.

- [x] G32: `npm run docs:validate` verde
  EVIDENCE: `Documentation validation passed (152 Markdown files, 46 IDs).`

- [x] G33: branch `fix/audit-l5-uploads` empurrada para `origin`
  EVIDENCE: `* [new branch] fix/audit-l5-uploads -> fix/audit-l5-uploads`;
  commit `1d909c1`; tracking `origin/fix/audit-l5-uploads`.

ABANDON: G24-no-sandbox `--no-sandbox` fica no launch do Chromium. Remover sem
poder medir se o sandbox arranca no contentor Alpine quebraria a geração de
DANFE em produção, e não há Chromium nem Docker neste ambiente para medir. O que
tornava a flag perigosa está desligado e testado: JavaScript off e toda a rede
abortada (só `data:` e `about:` passam). Quem fechar precisa de um contentor
real para verificar o arranque.

ABANDON: G28-migracao-volume Mover os ficheiros já gravados em
`<BACKUP_DIR>/<AAAA_MM>/` para o layout novo `<BACKUP_DIR>/<companyId>/<AAAA_MM>/`
é operação de infraestrutura sobre volume de produção, não mudança de código. O
código novo escreve no layout novo e a LEITURA tem fallback para o caminho
antigo, então nada no volume fica órfão enquanto a migração não corre.
