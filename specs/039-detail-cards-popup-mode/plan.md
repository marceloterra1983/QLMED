# Technical Plan: Modo Popup e Recolhimento Inicial nos Cards de Detalhes

## Overview

Implementar o modo de visualização em popup e o recolhimento inicial padrão dos cards de detalhes de clientes, fornecedores e produtos (`ContactDetailsModal` e `ProductDetailModal`), com botão de alternância no topo (`Abrir em popup` vs `Expandir no modal`).

## Components & Architecture

1. **CardViewMode & UI Components**:
   - `CardViewMode`: `'popup' | 'expand'` (default `'popup'`).
   - Componente `CardViewModeToggle` no topo de cada modal de detalhes.
   - Componente `CardDetailPopupModal` para encapsular a janela popup de um card individual com acessibilidade, z-index apropriado (`z-[60]`) e botão fechar.
   - Atualização de `SectionCard` e `DetailSectionCard` para suportar `viewMode` e `onOpenPopup`.

2. **ContactDetailsModal**:
   - Inicializar todos os cards como fechados (`isGeneralOpen` começa `false`).
   - Gerenciar `activePopupCard` e `cardViewMode`.
   - No topo (header), incluir `CardViewModeToggle`.
   - Se `cardViewMode === 'popup'`, o clique em qualquer card define `activePopupCard` e abre o modal secundário.
   - Se `cardViewMode === 'expand'`, o clique continua expandindo inline como acordeon.

3. **ProductDetailModal**:
   - Inicializar `detailOpenSections` como vazio (sem adicionar `'geral'` compulsoriamente).
   - Gerenciar `activePopupCard` e `cardViewMode`.
   - No topo (header), incluir `CardViewModeToggle`.
   - Suporte a popup dedicado para cada uma das seções: Dados Gerais, Dados do Cadastro, Dados Fiscais, Dados da ANVISA.

4. **Automated Tests**:
   - Teste unitário e de contrato de renderização para validar que os cards começam recolhidos.
   - Teste de alternância do modo no botão do topo.
   - Teste de abertura de card em popup e fechamento.
