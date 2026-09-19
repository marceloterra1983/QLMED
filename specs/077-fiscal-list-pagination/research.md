# Research: SPEC-077

## Decisão 1 — page size 50

Produtos já usa 50. O pedido admite 50–100. 50 reduz payload e DOM sem fragmentar demais um ano típico (~119 NF-e no diagnóstico).

## Decisão 2 — COUNT condicional

`GET /api/invoices` já faz:

```
page === 1 && length < limit → total = length
senão → prisma.invoice.count
```

Estender com `includeTotal=0` nas páginas seguintes: o cliente reutiliza `pagination.total` anterior. Default true para não quebrar clientes antigos.

## Decisão 3 — ListCount paginado, não apagar QLMED-UI-001

O aviso “lista truncada” era o remendo do cap 5000. Com página real, o texto passa a ser intervalo. O aviso de truncamento fica só se `total > shown` e não houver metadados de página (cap residual).

## Decisão 4 — prefetch={false}

Next `Link` faz prefetch por padrão. O diagnóstico liga steal/CPU a isso. Um atributo no `SidebarNav` é o menor remendo; não mexe no router.

## Decisão 5 — numeração 077

Pedido original: “maior id 075 → SPEC-076”. No host já existe worktree `076-jev-sefaz-followup` com `specs/076-jev-sefaz-followup`. Colidir 076 quebraria `docs:validate` no merge. 077 é o próximo livre considerando in-flight.
