# Deferred Items - Phase 08

## Pre-existing Build Failure

- **File:** `src/app/(painel)/cadastro/produtos/page-client.tsx`
- **Issue:** Imports `./components/ProductTable` and `./components/HistoryModal` which don't exist
- **Origin:** Previous phase work (08-01 or 08-02 split of produtos page) left incomplete
- **Impact:** `npm run build` fails but this is NOT related to 08-03 changes
- **Resolution:** Must be completed in 08-01 plan execution
