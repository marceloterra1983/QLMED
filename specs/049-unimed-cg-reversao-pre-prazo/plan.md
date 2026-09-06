# Plan: SPEC-049

1. Schema expand-only (3 entidades + sources + patientName nas tabelas com processId)
2. Migration `20260905240000_unimed_cg_reversao_pre_prazo` + pin janela produção
3. Parsers/subject matchers (`parse-email-kinds.ts`)
4. Stores + ingest classify + PDF HTML + WhatsApp
5. Portal OPME (`opme-portal.ts`) com login anti-automation + Fechar + busca Beneficiário
6. API list/detail/arquivo + UI 5 sections
7. Testes parsers/ingest/whatsapp/migration/opme regex
