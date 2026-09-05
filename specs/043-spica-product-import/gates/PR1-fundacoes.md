# Gates: PR1 Spica fundações (nextCodigo + parse)

Scope: Unificar nextCodigo pad-6; parser Spica puro; testes; sem endpoint/apply.

- [x] G1: PRODUCT_CODIGO_WIDTH = 6 e padStart(width)
  CHECK: grep -E "PRODUCT_CODIGO_WIDTH = 6" src/lib/product-codigo-format.ts
  EXPECT: PRODUCT_CODIGO_WIDTH = 6
  EVIDENCE: export const PRODUCT_CODIGO_WIDTH = 6;

- [x] G2: Call sites sem padStart(5)
  CHECK: bash -c 'grep -rn "padStart(5" src/lib/product-aggregate-updater.ts src/lib/product-aggregate-rebuild.ts src/lib/product-registry-store.ts src/app/api/products/bulk-update/route.ts >/dev/null && echo FOUND || echo CLEAN'
  EXPECT: CLEAN
  EVIDENCE: CLEAN

- [x] G3: Call sites importam de product-codigo
  CHECK: grep -c "from '@/lib/product-codigo'" src/lib/product-aggregate-updater.ts src/lib/product-aggregate-rebuild.ts src/lib/product-registry-store.ts src/app/api/products/bulk-update/route.ts | awk -F: '{s+=$2} END{print s+0}'
  EXPECT: 4
  EVIDENCE: 4

- [x] G4: Parser Spica e product-codigo testes passam
  CHECK: ./node_modules/.bin/vitest run src/lib/__tests__/spica-parse.test.ts src/lib/__tests__/product-codigo.test.ts
  EXPECT: /Test Files\s+2 passed/
  EVIDENCE: Start at  21:44:53 | Duration  160ms (transform 76ms, setup 31ms, import 78ms, tests 10ms, environment 0ms)

- [x] G5: Partial unique codigo documentado (sem migration Prisma falsa)
  CHECK: grep -c 'product_registry_company_codigo_idx' specs/043-spica-product-import/research.md
  EXPECT: /[1-9]/
  EVIDENCE: 1

- [x] G6: tsc sem erro nos arquivos do PR1
  CHECK: bash -c './node_modules/.bin/tsc --noEmit 2>&1 | grep -E "product-codigo|spica/parse|product-aggregate-updater|product-aggregate-rebuild|product-registry-store|bulk-update/route" || echo TSC_PR1_OK'
  EXPECT: TSC_PR1_OK
  EVIDENCE: TSC_PR1_OK
