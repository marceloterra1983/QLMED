# Verification Evidence: AI workflow governance

**Verified:** 2026-08-03.

| Gate | Result | Evidence |
|---|---|---|
| Spec Kit pin and feature | PASS | manifest validates against the server Draft 2020-12 schema; feature resolves to `SPEC-003` and pin `0.14.2` |
| Documentation | PASS | `npm run docs:validate` validated 32 Markdown files and 10 IDs |
| Local GSD materialization | PASS | Toolkit installed 39 declared/support components at pin `1.41.2` and wrote `.ai/capabilities.lock.json` |
| Local GSD drift | PASS | Toolkit workspace diff returned `compliant` with zero findings |
| Runtime isolation | PASS | no deploy, migration, production or application command executed |
| Automation defaults | PASS | interactive mode, phase branching and `auto_advance=false` asserted mechanically |
