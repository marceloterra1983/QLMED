# Specification Quality Checklist: Emissão manual de NF-e

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-08-30
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Notes

URLs de webservice, schemas XML e nomes de tabela ficam no plano,
não no contrato de negócio. Decisões de escopo: todas as saídas;
destinatário só PJ cadastrado; busca nome+CNPJ no mesmo campo;
endereço sucinto após o select; envio SEFAZ na primeira entrega.
Ordem visual da seção Dados (FR-017 / AC-020): destinatário primeiro;
natureza, série (badge) e finalidade nessa sequência.
Layout compacto (FR-022 / AC-026): série + finalidade + consumidor
final na mesma linha (wrap em mobile estreito).
Página única com âncoras e Concluir nesta etapa: FR-020, FR-021,
AC-021–AC-025.
Presença do comprador fixa `indPres=9` sem campo na UI: FR-024.
