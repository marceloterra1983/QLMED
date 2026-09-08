---
id: SPEC-064
status: implemented
owner: QLMED
affected_modules:
  - nfe-emission
---

# Feature Specification: Assinatura C14N (cStat 297) e XML de doação

**Created**: 2026-09-08

## Problem

Reemissão Procat (CFOP 5910) retornou **cStat 297** — Assinatura difere do calculado.

## Cause (verified)

O Joinner assina o `SignedInfo` na forma C14N 1.0: `xmlns` explícito e elementos vazios como `<tag></tag>`. O QLMED assinava a string com `/>`. A SEFAZ parseia, canonicaliza e a SignatureValue não confere.

Evidência local: XML 297 verifica contra `xmlns+selfclose`; XML 65229 autorizado verifica contra `xmlns+expand`.

## Also aligned to authorized 65082 (doação 5910)

- PIS/COFINS NT CST 08 em CFOP sem pagamento
- `<med>` só com ANVISA **e** vPMC (XSD)
- `indPag` omitido quando `tPag=90`
- Transporte próprio completa CNPJ/IE/endereço do emitente + volume padrão
