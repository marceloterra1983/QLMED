---
name: tailwind-components
description: QLMED UI component patterns — Modal, CollapsibleCard, ConfirmDialog, table patterns, and Tailwind conventions
---

# QLMED Tailwind Component Patterns

## When to activate
Activate when creating new UI components, modals, pages, or modifying existing interface elements in the QLMED project.

## Design system

### Color palette
- **Primary**: `bg-primary` / `hover:bg-primary-dark` (blue `#2563eb` / `#1d4ed8`)
- **Accent**: `accent` (`#10b981`) — success-ish, not a second brand
- **Background**: `bg-background-light` / `dark:bg-background-dark`
- **Card**: `bg-white dark:bg-card-dark` (`#1e293b`)
- **Poço de detalhe (modal panel)**: `bg-slate-50 dark:bg-surface-sunken` (`#1a1e2e`) — distinto de `card-dark` (header/cards internos)
- **Text**: `text-slate-800` / `dark:text-slate-100`
- **Borders**: `border-slate-200 dark:border-slate-700`

Não usar hex de chrome. Theme PWA = `#2563eb` (token `primary`).

### Dark mode
- ALL components MUST support dark mode using `dark:` prefix
- Use `suppressHydrationWarning` on html/body elements
- Theme detection is client-side (`qlmed-theme`)

### Icons
- Use **Material Symbols Outlined**: `<span className="material-symbols-outlined">icon_name</span>`
- Do NOT use Heroicons, Lucide, or other icon libraries

### Typography
- Font: Manrope via `--font-manrope`
- Headings: `text-xl font-bold` / `text-lg font-semibold`
- Body: `text-sm text-slate-600 dark:text-slate-400`

## Component patterns

### Modal (formulário CRUD simples)
```tsx
import Modal from '@/components/ui/Modal';

<Modal isOpen={open} onClose={() => setOpen(false)} title="Title">
  {/* content */}
</Modal>
```

Dialog **novo e simples** (título + corpo + fechar) usa `Modal`. Não copiar overlay fiscal.

### Detail modals (entidade rica)
Já existentes (`NfeDetailsModal`, `CteDetailsModal`, etc.):
- Painel: `dark:bg-surface-sunken`; header/footer/cards: `dark:bg-card-dark`
- Accept `invoiceId` ou ID da entidade
- Fetch on open; skeleton enquanto carrega
- Seções fiscais usam `SectionBlock` / `Field` (`InvoiceDetailHelpers`), não `CollapsibleCard`

Não migrar esses shells para `Modal.tsx`. Não criar `variant="detail"`.

### CollapsibleCard
`icon` é obrigatório.

```tsx
import CollapsibleCard from '@/components/ui/CollapsibleCard';

<CollapsibleCard icon="palette" title="Aparência" defaultOpen={true}>
  {/* content */}
</CollapsibleCard>
```

### ConfirmDialog
Props reais: `onClose` (não `onCancel`), `confirmVariant`, `loading`.

```tsx
import ConfirmDialog from '@/components/ui/ConfirmDialog';

<ConfirmDialog
  isOpen={confirm}
  onClose={() => setConfirm(false)}
  onConfirm={handleDelete}
  title="Confirmar exclusão"
  message="Deseja realmente excluir este item?"
  confirmVariant="danger"
/>
```

### Table pattern
```tsx
<div className="overflow-x-auto">
  <table className="w-full text-sm">
    <thead className="bg-slate-50 dark:bg-slate-700/50">
      <tr>
        <th className="px-4 py-3 text-left font-semibold text-slate-600 dark:text-slate-300">
          Column
        </th>
      </tr>
    </thead>
    <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
      <tr className="hover:bg-slate-50 dark:hover:bg-slate-700/30">
        <td className="px-4 py-3">Value</td>
      </tr>
    </tbody>
  </table>
</div>
```

### Toast notifications
```tsx
import { toast } from 'sonner';

toast.success('Salvo com sucesso');
toast.error('Erro ao salvar');
```

### Loading skeleton
```tsx
import Skeleton from '@/components/ui/Skeleton';

<Skeleton className="h-4 w-32" />
```

### Row actions (invoice-only)
`RowActions` é específico de documento fiscal (`invoiceId`, PDF/XML). Não é um menu genérico de `actions[]`.

```tsx
import RowActions from '@/components/ui/RowActions';

<RowActions
  invoiceId={invoice.id}
  accessKey={invoice.accessKey}
  onView={openViewer}
  onDetails={openDetails}
  onDelete={canWrite ? askDelete : undefined}
/>
```

### Filtros de listagem
Use `FILTER_INPUT_CLS` de `@/lib/utils` (py-2.5). Não copiar a string. Não unificar com `DETAIL_INPUT_CLS` de produtos (`rounded-xl` / `bg-white`).

### Page layout pattern
```tsx
export default function SectionPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Page Title</h1>
        <button className="inline-flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary-dark text-white rounded-lg text-sm font-medium transition-colors">
          <span className="material-symbols-outlined text-[18px]">add</span>
          Novo Item
        </button>
      </div>
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-md p-4">
        {/* filter controls */}
      </div>
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-md overflow-hidden">
        {/* table or cards */}
      </div>
    </div>
  );
}
```

## Rules
1. **Language**: All UI text in Portuguese (pt-BR)
2. **Responsive**: Mobile-first, use `MobileFilterWrapper` for filter sections
3. **Virtual scrolling**: Use `@tanstack/react-virtual` for lists with 100+ items
4. **No component libraries**: Do NOT install shadcn/ui, Radix, Material UI, etc.
5. **Buttons**: Always include hover state, transition, and appropriate size (`text-sm` + `px-4 py-2`)
6. **Forms**: Use `@tailwindcss/forms` plugin styles, validate with Zod
