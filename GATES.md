# Gates: 072 DANFE SPICA fidelity

Scope: Logo QL MED fiel, FOLHA X de Y, cabeçalho repetido, dados adicionais no rodapé de cada página

- [x] G1: SPEC-072 existe
  CHECK: test -f specs/072-danfe-spica-fidelity/spec.md && rg -n "^id: SPEC-072" specs/072-danfe-spica-fidelity/spec.md
  EXPECT: id: SPEC-072
  EVIDENCE: 2:id: SPEC-072

- [x] G2: HTML tem sheet thead/tfoot e folha com total
  CHECK: npx vitest run src/lib/__tests__/danfe-spica-layout.test.ts src/lib/__tests__/danfe-multipage.test.ts --reporter=dot
  EXPECT: /passed/
  EVIDENCE: Start at  17:45:00 | Duration  211ms (transform 140ms, setup 37ms, import 167ms, tests 32ms, environment 0ms)

- [x] G3: Logo SVG inline sem data:
  CHECK: rg -n "data:" src/lib/pdf/danfe-logo.ts src/lib/pdf/danfe-html.ts; rg -n "<svg" src/lib/pdf/danfe-logo.ts
  EXPECT: <svg
  EVIDENCE: src/lib/pdf/danfe-logo.ts:1:/** Marca QL do cabeçalho SPICA, SVG inline (renderer bloqueia data:). */ | 2:export const DANFE_LOGO_SVG = `<svg class="emit-logo" xmlns="http://www.w3.org/2000/svg" viewB

- [x] G4: persist-danfe re-renderiza quando há mais de uma página
  CHECK: npx vitest run src/lib/__tests__/persist-danfe.test.ts src/lib/__tests__/pdf-page-count.test.ts --reporter=dot
  EXPECT: /passed/
  EVIDENCE: Start at  17:45:01 | Duration  361ms (transform 217ms, setup 111ms, import 228ms, tests 30ms, environment 0ms)

- [x] G5: docs:validate + tsc + recorte de testes
  CHECK: npm run docs:validate && npx tsc --noEmit && npx vitest run src/lib/__tests__/danfe-spica-layout.test.ts src/lib/__tests__/danfe-multipage.test.ts src/lib/__tests__/persist-danfe.test.ts src/lib/__tests__/pdf-page-count.test.ts src/lib/__tests__/code128.test.ts --reporter=dot
  EXPECT: /passed/
  EVIDENCE: Start at  17:45:04 | Duration  305ms (transform 396ms, setup 110ms, import 461ms, tests 77ms, environment 0ms)
