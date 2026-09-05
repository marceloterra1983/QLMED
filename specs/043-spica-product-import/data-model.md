# Data model — Spica product import

## SpicaProductRow (normalizado)

| Campo | Tipo | Origem |
|-------|------|--------|
| codigoInterno | string (6 dígitos) | Rel.Código / List.Cód.Int. |
| referencia | string | Rel.Referência |
| nome | string | Rel.Nome |
| tipoRaw | string | Rel.Tipo |
| tipo | string | tipoRaw sem `^\d+\s*[-–]\s*` |
| subtipo | string | Rel.SubTipo |
| fabricante | string | Rel.Fabricante |
| fornecedor | string? | Rel.Fornecedor |
| instrumental | boolean | Rel.Instrumental Sim/Não |
| outOfLine | boolean | tipoRaw contém FORA DE LINHA |
| anvisa | string? | Rel.RVS ≡ List.ANVISA |
| ncm | string? | Rel.NCM |
| sitTributaria | string | Rel.Situação Tributária |
| nomeTributacao | string | Rel.Nome da Tributação |
| aliqIcms/Pis/Cofins/IpiEntrada/IpiSaida | number? | parse BR |
| obsFiscal | string? | Rel.Obs / List.Obs ICMS |
| cstIcmsCadastro | string? | List.CST-ICMS Cadastro |

## ImportSpicaReport

```ts
type Bucket = 'matched' | 'create' | 'ambiguous' | 'skip' | 'quarantine';
interface ImportSpicaReport {
  dryRun: boolean;
  parsed: number;
  counts: Record<Bucket, number>;
  samples: Partial<Record<Bucket, Array<{ codigoInterno: string; ref: string; reason?: string }>>>;
}
```

## Persistência

- Update/insert apenas `product_registry` (+ opcional catálogo tipo/fabricante).
- Sem migration nova se campos existentes bastarem (CST dedicado = gap consciente).
- Unique existente: `(companyId, productKey)`; `codigo` Spica deve ser unique por empresa na prática (enforce na importação).
