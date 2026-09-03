# Technical Plan: Correção de Renderização do Popup da Nota Fiscal

## Overview

Corrigir a cadeia de classes flexbox e altura em `InvoiceDetailsModal.tsx` e `Modal.tsx` para assegurar que a visualização da DANFE (`iframe`) e o visualizador XML expandam até 100% da área do modal (`sm:h-[92vh]`).

## Root Cause Analysis

1. No `Modal.tsx`, a div do corpo tem `flex-1 overflow-y-auto custom-scrollbar ${bodyClassName}`.
2. Em `InvoiceDetailsModal.tsx`, `bodyClassName` era passado como `""`.
3. A div do corpo não tinha `display: flex`, logo o filho com `flex-1` não esticava.
4. O container do `iframe` com `h-full` computava `height: auto`, fazendo com que o `<iframe>` recaísse na altura padrão da especificação HTML (`150px`).
5. A DANFE aparecia cortada com 150px e uma grande área vazia/branca abaixo.

## Implementation Details

1. `Modal.tsx`:
   - Se `bodyClassName` contiver `overflow-`, omite `overflow-y-auto custom-scrollbar` padrão para evitar conflito de regras.
2. `InvoiceDetailsModal.tsx`:
   - Configura `bodyClassName="flex flex-col flex-1 h-full min-h-0 overflow-hidden"`.
   - Ajusta o container filho para `flex-1 flex flex-col h-full min-h-0 overflow-hidden`.
   - Ajusta os containers do iframe e XML para `w-full h-full flex-1 min-h-0`.
3. Automated Tests:
   - Adiciona `src/components/__tests__/InvoiceDetailsModal.render.test.tsx` com validação de contrato do layout.
