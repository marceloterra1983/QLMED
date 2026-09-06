# Domain Invariants

Os invariantes de domínio são regras inegociáveis que o sistema garante em todas as circunstâncias, independentemente da entrada do usuário, camada de transporte ou canal de integração.

---

## 1. Segurança, Isolamento e Acesso
- A user may operate only within the company context resolved by the server. Client-side company selection is not authorization.
- A viewer cannot perform mutating administrative or fiscal operations. Feature access and RBAC are validated server-side (`requireFeatureAccess`, `canWriteRole`).
- Integration credentials, certificates, private keys and bearer tokens are never returned by ordinary APIs, exposed in query strings, or written to logs.
- Persistent QLMED data is addressed only through the protected `DATABASE_URL` for the canonical `postgres` database; `qlmed_ci` is disposable CI state, and application code never reads backup files or backup credentials.

---

## 2. Integridade Fiscal e Tributária
- The same fiscal document (NF-e, CT-e, NFS-e) must not be duplicated within its defined uniqueness boundary (access key / document number).
- Invoice direction is derived deterministically from fiscal identity and emitter CNPJ, never from arbitrary UI input or request bodies.
- Ingestion of invoices executes all post-ingestion satellite steps (tax stores, contact fiscal records, duplicatas, Spica link check) within an atomic pipeline boundary (`InvoiceIngestionPipeline`).

---

## 3. Ingestão de Operadoras de Saúde
- An authorization document without a valid authorization/OF number or subject does not persist a confirmed record; model stamp numbers (e.g. CASSEMS template codes) are never accepted as authorization numbers.
- Authorization records with parsing failures (`falha`) are preserved with their original attachments and filenames for auditability, never generating fabricated clinical or financial data.
- Operator notifications via WhatsApp are dispatched strictly for events within the configured time window (`NOTIFY_MAX_AGE_MS`), preventing backfill scans of historical mailboxes from triggering flood alerts.

---

## 4. Representação Monetária e Numérica
- Monetary arithmetic and database persistence adhere to 2-decimal half-up rounding (`ROUND_HALF_UP`) via `Decimal` to avoid IEEE-754 floating-point drift.
- Textual representations in APIs and machine contracts use `formatMoneyDecimalString` (`"0.00"`), while UI presentation formatting uses `formatCurrency` with Brazilian Real (`R$`) symbols.

---

## 5. Plataforma, Concorrência e Notificações
- Background synchronization must not create concurrent runs for the same company and method when a run is already active (enforced via PostgreSQL advisory locks).
- Notification delivery is recorded durably in the transactional outbox before asynchronous publication.
- File streaming HTTP responses sanitize filenames against RFC 5987 / RFC 6266 and neutralize CRLF injection.
- Development automations never own production schedules or real webhooks.
