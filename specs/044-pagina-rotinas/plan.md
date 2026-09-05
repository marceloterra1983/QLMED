# Technical Plan: Página de Rotinas do Sistema

## Architecture & Design

### 1. Modelo de Dados e Catálogo de Rotinas (`src/lib/system-routines.ts`)
Criaremos um módulo compartilhado `src/lib/system-routines.ts` definindo a estrutura e catálogo das rotinas:
```ts
export interface SystemRoutine {
  id: string;
  name: string;
  category: 'fiscal' | 'gestao' | 'documentos' | 'estoque' | 'notificacoes' | 'infra';
  triggerType: 'background_service' | 'scheduled_timer' | 'event_driven' | 'worker_cron';
  frequency: string;
  scheduleDetails: string;
  concurrencyLock: string;
  sourceModule: string;
  description: string;
  backgroundServiceName?: BackgroundServiceName;
}
```

### 2. Rota de API (`src/app/api/sistema/rotinas/route.ts`)
- Requer autenticação via `requireAuth()`.
- Lê o status ao vivo via `getBackgroundServiceHealth()`.
- Lê estatísticas recentes do banco de dados (ex: contagem de logs de sincronização, outbox pendente) para enriquecer o contexto de saúde.
- Retorna JSON com o catálogo de rotinas e o estado em tempo real.

### 3. Página de Rotinas (`src/app/(painel)/sistema/rotinas/page.tsx` e `page-client.tsx`)
- App Router client component com `PageHeader`.
- Cards de resumo: Total de Rotinas, Background Services, Agendamentos / Cron, Proteção & Watchdogs.
- Barra de filtros: Busca por texto (nome, descrição, módulo) e filtro por Categoria.
- Tabela moderna, responsiva, estilizada com Tailwind CSS conforme design system QLMED:
  - Suporte a tema claro e tema escuro (`dark:`).
  - Badges de categoria e status.
  - Expansão de linha / modal de detalhes com informações técnicas (locks, módulos, variáveis de ambiente).
  - Botão de recarregamento / atualização imediata com feedback visual.

### 4. Navegação e ACL (`src/lib/navigation.ts` e `src/components/SidebarNav.tsx`)
- Inclusão em `PAGE_GROUPS` (seção Sistema).
- Mapeamento de prefixo em `API_PREFIX_TO_PAGES`: `{ prefix: '/api/sistema/rotinas', pages: ['/sistema/rotinas'] }`.
- Inclusão em `PAGE_LABELS` e `buildNavItems` em `SidebarNav.tsx`.

### 5. Testes Automatizados
- Teste unitário para a lista de rotinas e integridade dos dados (`system-routines.test.ts`).
- Teste de integração da API `/api/sistema/rotinas`.
- Teste de regressão do menu de navegação (`sidebar-nav-paths.test.ts`).
- Teste de conformidade de cabeçalho (`page-header-contract.test.ts`).
