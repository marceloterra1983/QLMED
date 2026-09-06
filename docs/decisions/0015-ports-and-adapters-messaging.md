---
id: ADR-0015
status: accepted
date: 2026-09-06
supersedes: null
related_specs: []
---

# Ports & Adapters para canais externos de mensageria e armazenamento

## Context

Chamadas para a Evolution API (WhatsApp) e Microsoft Graph API (OneDrive e e-mails de operadoras) continham acoplamento direto com detalhes de transporte HTTP e assinaturas globais, tornando testes unitários dependentes de mocks em nível de `fetch` ou de variáveis de ambiente de rede.

## Decision drivers

- Arquitetura limpa e testabilidade isolada (Hexagonal / Ports & Adapters).
- Evitar vazamento de credenciais e de implementações HTTP para dentro dos casos de uso de negócio.
- Facilitar a substituição ou simulação de provedores em ambientes locais ou de homologação.

## Considered options

### A — Mocks dinâmicos pontuais em runtime
Manter funções soltas e mockar `globalThis.fetch` em cada teste. Custo: fragilidade diante de mudanças de rota ou formato de cabeçalho, além de vazamento de detalhes de protocolo.

### B — Arquitetura de Ports & Adapters (Hexagonal)
Definir contratos de porta tipados (`WhatsAppPort`, `GraphPort`, `OneDriveFolderPort`) e adapters concretos (`EvolutionWhatsAppAdapter`, `MicrosoftGraphAdapter`), com fábricas desacopladas.

## Decision

**Opção B.** Implementado em `src/lib/ports/whatsapp.ts`, `src/lib/ports/graph.ts` e `src/lib/onedrive-folder-port.ts`. As rotas e serviços interagem exclusivamente com as interfaces de porta, permitindo injeção limpa de adapters simulados ou reais.

## Consequences

### Positive
- Testes unitários limpos sem overhead de emulação de rede.
- Isolamento estrito de egress allowlist e limites de payload dentro de seus respectivos adapters.

### Negative
- Uma camada a mais de abstração por serviço externo integrado.

## Verification
- Testes unitários em `src/lib/__tests__/whatsapp-port.test.ts` e `src/lib/__tests__/onedrive-graph.test.ts`.
