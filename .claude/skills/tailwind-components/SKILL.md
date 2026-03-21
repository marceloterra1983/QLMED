---
name: tailwind-components
description: QLMED UI component patterns — Modal, CollapsibleCard, ConfirmDialog, table patterns, and Tailwind conventions
---

# QLMED Tailwind Component Patterns

## When to activate
Activate when creating new UI components, modals, pages, or modifying existing interface elements in the QLMED project.

## Design system

### Color palette
- **Primary**: `bg-primary` / `hover:bg-primary-dark` (blue #2952b8)
- **Background**: `bg-background-light` / `dark:bg-background-dark`
- **Text**: `text-slate-800` / `dark:text-slate-100`
- **Cards**: `bg-white dark:bg-slate-800 rounded-xl shadow-md`
- **Borders**: `border-slate-200 dark:border-slate-700`

### Dark mode
- ALL components MUST support dark mode using `dark:` prefix
- Use `suppressHydrationWarning` on html/body elements
- Theme detection is client-side

### Icons
- Use **Material Symbols Outlined**: `<span className="material-symbols-outlined">icon_name</span>`
- Do NOT use Heroicons, Lucide, or other icon libraries

### Typography
- Font: system font stack via Tailwind
- Headings: `text-xl font-bold` / `text-lg font-semibold`
- Body: `text-sm text-slate-600 dark:text-slate-400`

## Component patterns

### Modal (reusable wrapper)
```tsx
// Use src/components/ui/Modal.tsx
import Modal from '@/components/ui/Modal';

<Modal isOpen={open} onClose={() => setOpen(false)} title="Title">
  {/* content */}
</Modal>
```

### Detail modals
Follow the pattern in existing modals (`NfeDetailsModal`, `CteDetailsModal`, etc.):
- Accept `invoiceId` or entity ID as prop
- Fetch data on open via API route
- Show loading skeleton while fetching
- Use `CollapsibleCard` for sections

### CollapsibleCard
```tsx
import CollapsibleCard from '@/components/ui/CollapsibleCard';

<CollapsibleCard title="Section Title" defaultOpen={true}>
  {/* content */}
</CollapsibleCard>
```

### ConfirmDialog
```tsx
import ConfirmDialog from '@/components/ui/ConfirmDialog';

<ConfirmDialog
  isOpen={confirm}
  onConfirm={handleDelete}
  onCancel={() => setConfirm(false)}
  title="Confirmar exclusão"
  message="Deseja realmente excluir este item?"
/>
```

### Table pattern
Tables use a consistent structure:
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

### Row actions (table)
```tsx
import RowActions from '@/components/ui/RowActions';

<RowActions
  actions={[
    { label: 'Editar', icon: 'edit', onClick: handleEdit },
    { label: 'Excluir', icon: 'delete', onClick: handleDelete, variant: 'danger' },
  ]}
/>
```

### Page layout pattern
```tsx
// (painel)/section/page.tsx
export default function SectionPage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Page Title</h1>
        <button className="inline-flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary-dark text-white rounded-lg text-sm font-medium transition-colors">
          <span className="material-symbols-outlined text-[18px]">add</span>
          Novo Item
        </button>
      </div>
      {/* Filters */}
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-md p-4">
        {/* filter controls */}
      </div>
      {/* Content */}
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
