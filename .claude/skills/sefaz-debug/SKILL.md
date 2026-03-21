---
name: sefaz-debug
description: Debug Sefaz/NSDocs/Receita NFS-e integration issues — SOAP errors, rejection codes, sync failures, certificate problems
---

# Sefaz & Fiscal Integration Debug

## When to activate
Activate when the user mentions Sefaz errors, NF-e rejection codes, SOAP faults, NSDocs sync failures, Receita NFS-e issues, or certificate problems.

## Key files
- `src/lib/sefaz-client.ts` — SOAP client for Sefaz DistribuicaoDFe
- `src/lib/nsdocs-client.ts` — NSDocs REST API client
- `src/lib/nsdocs-sync-window.ts` — NSDocs sync scheduling
- `src/lib/receita-nfse-client.ts` — Receita Federal NFS-e API
- `src/lib/receita-nfse-sync.ts` — NFS-e sync logic
- `src/lib/certificate-manager.ts` — PFX certificate handling (node-forge)
- `src/lib/auto-sync.ts` — Automatic sync orchestration
- `src/lib/sync-recovery.ts` — Sync error recovery
- `src/lib/parse-invoice-xml.ts` — XML parsing for NF-e/CT-e/NFS-e

## Debug checklist

### Sefaz SOAP errors
1. Check certificate expiration: `CertificateConfig` table, `expiresAt` field
2. Verify `DATABASE_URL` is accessible and `Company` has valid CNPJ
3. Common Sefaz status codes:
   - `137` — NF-e não encontrada
   - `138` — Documento já está na base
   - `215` — Rejeição: falha de schema XML
   - `225` — Rejeição: falha no certificado digital
   - `573` — Duplicidade de NF-e
   - `593` — Consumo indevido (throttling)
   - `656` — Consumo indevido, aguardar 1h
4. Check if `SINGLE_COMPANY_CNPJ` matches the certificate's CNPJ

### NSDocs errors
1. Verify `NsdocsConfig` has valid `token` for the company
2. Check `syncWindowStart`/`syncWindowEnd` in nsdocs-sync-window.ts
3. HTTP 401 → token expired, needs refresh
4. HTTP 429 → rate limited, check sync interval

### Receita NFS-e errors
1. Verify `ReceitaNfseConfig` exists for the company
2. SSL verification issues → check `RECEITA_NFSE_VERIFY_SSL` env var
3. NSU tracking: each sync stores last NSU processed

### Certificate issues
1. PFX parsing: uses node-forge to extract cert + key
2. Certificate is stored encrypted via `ENCRYPTION_KEY`
3. Common errors: wrong password, expired cert, CNPJ mismatch
4. Test: read `CertificateConfig`, decrypt, check `expiresAt`

## Response format
- Always identify the specific integration (Sefaz/NSDocs/Receita)
- Show the relevant error code and its meaning
- Check the database for config state before suggesting fixes
- Suggest concrete fix with file and line reference
