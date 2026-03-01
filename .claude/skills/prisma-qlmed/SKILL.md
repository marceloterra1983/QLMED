---
name: prisma-qlmed
description: Prisma ORM conventions, schema patterns, and database management for the QLMED fiscal system. Use when working with database models, migrations, queries, or schema changes.
user-invocable: true
allowed-tools: Read, Grep, Bash, Glob, Edit, Write
---

# Prisma QLMED - Schema & Database Conventions

## Stack
- Prisma 5.22.0 + PostgreSQL 15
- Schema: `prisma/schema.prisma`
- DB: PostgreSQL at `10.0.1.8:5432/postgres` (Coolify internal network)

## CLI Commands

```bash
# Migrations
npx prisma migrate dev --name <description>   # Create + apply migration
npx prisma migrate deploy                      # Apply pending migrations (production)
npx prisma migrate status                      # Check migration status
npx prisma migrate reset                       # Reset DB (WARNING: drops data)

# Schema
npx prisma db push                             # Push schema without migration file
npx prisma generate                            # Regenerate Prisma Client
npx prisma studio                              # Visual DB browser (port 5555)
npx prisma validate                            # Validate schema syntax

# Direct DB access
docker exec coolify-db psql -U postgres -d postgres -c "SELECT ..."
```

## Schema Overview

### Core Domain: Fiscal Documents
- **Invoice** - Central table for NF-e, CT-e, NFS-e documents
  - `accessKey` (unique) - Chave de acesso do documento fiscal
  - `type`: NFE | CTE | NFSE
  - `direction`: received | issued
  - `status`: received | confirmed | rejected
  - `xmlContent` - XML completo do documento
  - Indexes: companyId, senderCnpj, issueDate, compound indexes for common queries

### Financial
- **FinanceiroDuplicataOverride** - Override de duplicatas do XML original
- **FinanceiroDuplicataManualInstallment** - Parcelas manuais criadas pelo usuario

### Contacts
- **ContactNickname** - Apelidos curtos para CNPJ (@@unique companyId+cnpj)
- **ContactOverride** - Dados de contato customizados por CNPJ

### Sync & Integration
- **NsdocsConfig** - Config de sync via NSDocs API
- **ReceitaNfseConfig** - Config de sync NFS-e via Receita
- **CertificateConfig** - Certificado digital A1 (PFX) para consulta SEFAZ
- **SyncLog** - Log de sincronizacoes (running/completed/error)
- **OneDriveConnection** - Integracao com OneDrive/SharePoint

### Auth & Multi-tenant
- **User** - Usuarios com roles (admin/editor/viewer) e status (pending/active/inactive/rejected)
- **Company** - Empresas (CNPJ). Multi-tenant: quase todas as tabelas tem `companyId`

## Naming Conventions

### Models
- PascalCase: `Invoice`, `SyncLog`, `ContactNickname`
- Nomes em ingles, campos de dominio fiscal em portugues quando vem do XML (dupNumero, dupVencimento)

### Fields
- `id` always `String @id @default(cuid())`
- Timestamps: `createdAt DateTime @default(now())` + `updatedAt DateTime @updatedAt`
- Foreign keys: `<model>Id String` + relation field
- Always add `@@index([companyId])` on tenant-scoped tables
- Unique constraints use `@@unique` with named maps for compound keys

### Relations
- All relations use `onDelete: Cascade` from Company
- Company is the root tenant entity
- Invoice is the central fiscal document entity

## Query Patterns (Prisma Client)

```typescript
// Always filter by companyId (multi-tenant)
const invoices = await prisma.invoice.findMany({
  where: { companyId, type: 'NFE', direction: 'received' },
  orderBy: { issueDate: 'desc' },
});

// Include related data
const invoice = await prisma.invoice.findUnique({
  where: { accessKey },
  include: {
    duplicataOverrides: true,
    manualInstallments: true,
  },
});

// Upsert pattern for sync operations
await prisma.invoice.upsert({
  where: { accessKey },
  create: { ...data },
  update: { ...data },
});
```

## Migration Guidelines

1. **Always run `npx prisma migrate dev`** - never `db push` in production
2. **Name migrations descriptively**: `add-contact-overrides`, `add-nfse-sync-config`
3. **Test migration**: run `npx prisma migrate status` after creating
4. **After schema change**: always run `npx prisma generate` to update the client
5. **New tables**: always include `companyId` + `@@index([companyId])` for multi-tenancy
6. **New fields on Invoice**: consider adding compound indexes for common query patterns
