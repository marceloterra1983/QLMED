# Gates: 071 OneDrive NF-e backup

Scope: Após autorizar NF-e, gravar XML e DANFE no OneDrive em /BACKUP_QL MED/NFE/{XML|Danfes}/{YYYY_MM}

- [x] G1: SPEC-071 existe com id SPEC-071
  CHECK: test -f specs/071-onedrive-nfe-backup/spec.md && rg -n "^id: SPEC-071" specs/071-onedrive-nfe-backup/spec.md
  EXPECT: id: SPEC-071
  EVIDENCE: 2:id: SPEC-071

- [x] G2: Pastas OneDrive usam YYYY_MM da emissão
  CHECK: npx vitest run src/lib/__tests__/onedrive-nfe-backup.test.ts --reporter=dot
  EXPECT: /Tests.*passed|passed/
  EVIDENCE: Start at  17:34:13 | Duration  216ms (transform 76ms, setup 21ms, import 88ms, tests 13ms, environment 0ms)

- [x] G3: Upload XML+PDF usa Graph helpers existentes
  CHECK: rg -n "uploadIssuedNfeToOneDrive|ensureOneDriveFolder|uploadOneDriveFile" src/lib/nfe-emission/onedrive-backup.ts src/lib/nfe-emission/authorize.ts
  EXPECT: uploadIssuedNfeToOneDrive
  EVIDENCE: src/lib/nfe-emission/onedrive-backup.ts:69:      await ensureOneDriveFolder(accessToken, driveId, pdfFolder); | src/lib/nfe-emission/onedrive-backup.ts:70:      await uploadOneDriveFile(

- [x] G4: Falha de OneDrive não altera autorização
  CHECK: rg -n "uploadIssuedNfeToOneDrive" src/lib/nfe-emission/authorize.ts src/lib/__tests__/nfe-emission-authorize-atomic.test.ts src/lib/__tests__/onedrive-nfe-backup.test.ts
  EXPECT: uploadIssuedNfeToOneDrive
  EVIDENCE: src/lib/nfe-emission/authorize.ts:8:import { uploadIssuedNfeToOneDrive } from './onedrive-backup'; | src/lib/nfe-emission/authorize.ts:496:  await uploadIssuedNfeToOneDrive({

- [x] G5: docs:validate + typecheck + testes do recorte
  CHECK: npm run docs:validate && npx tsc --noEmit && npx vitest run src/lib/__tests__/onedrive-nfe-backup.test.ts src/lib/__tests__/persist-danfe.test.ts src/lib/__tests__/nfe-emission-authorize-atomic.test.ts --reporter=dot
  EXPECT: /passed/
  EVIDENCE: Start at  17:34:39 | Duration  953ms (transform 381ms, setup 51ms, import 312ms, tests 812ms, environment 0ms)
