# Integration boundaries

QLMED integrates with fiscal providers and operational services, including
SEFAZ, NSDocs, Receita NFS-e, OneDrive and messaging/notification channels.

Every integration must define:

- authentication and secret source;
- request timeout and retry behavior;
- idempotency or duplicate-handling strategy;
- safe error and audit logging;
- test seam that does not contact production;
- behavior when the provider is unavailable.

Development automations must use manual triggers and must not activate real
production cron or webhook ownership.

