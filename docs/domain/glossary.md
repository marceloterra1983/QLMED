# Domain Glossary (Linguagem Ubíqua)

Este documento define o vocabulário oficial e canônico de domínio do QLMED. Todos os desenvolvedores, especificações técnicas, códigos-fonte e agentes devem utilizar estes termos de maneira rigorosa e consistente, evitando sinônimos ambíguos ou terminologias divergentes.

---

## 1. Documentos Fiscais & Tributário (Fiscal & Invoicing)

| Termo | Significado |
| :--- | :--- |
| **NF-e** | Nota Fiscal Eletrônica de produtos (modelo 55), representada por arquivo XML estruturado de acordo com o padrão nacional da SEFAZ. |
| **CT-e** | Conhecimento de Transporte Eletrônico (modelo 57), documento fiscal digital que acoberta prestações de serviço de transporte de cargas e fretes. |
| **NFS-e** | Nota Fiscal de Serviços Eletrônica, documento fiscal emitido para acobertar serviços prestados sob legislação municipal. |
| **Access Key (Chave de Acesso)** | Identificador numérico exclusivo de 44 dígitos que unifica e endereça univocamente uma NF-e ou CT-e em âmbito nacional. |
| **Invoice Direction (Direção da Nota)** | Classificação funcional do documento fiscal em emitida pela empresa (`issued`) ou recebida de terceiros (`received`), derivada determinísticamente da chave de acesso e CNPJs envolvidos. |
| **SEFAZ** | Secretaria de Estado da Fazenda, autoridade tributária integrada para consulta, distribuição e autorização de documentos fiscais eletrônicos. |
| **NSDocs** | Provedor externo integrado para captura e monitoramento contínuo de documentos fiscais emitidos contra o CNPJ da empresa. |
| **infCpl (Informações Complementares)** | Campo de texto livre do XML (`infAdic/infCpl`) utilizado para vincular identificadores de processos hospitalares, autorizações de operadoras, dados de pacientes e contratos. |
| **Duplicata** | Parcela financeira mercantil registrada no grupo de cobrança (`cobr/dup`) da NF-e, definindo vencimento, número sequencial e valor nominal. |

---

## 2. Operadoras de Saúde & OPME (Health Plans & Medical Supplies)

| Termo | Significado |
| :--- | :--- |
| **Ofício / Autorização** | Documento clínico e administrativo emitido por operadora de saúde (CASSEMS, IMPCG, Unimed-CG) autorizando fornecimento de materiais e execução de procedimentos cirúrgicos. |
| **OPME** | Órteses, Próteses e Materiais Especiais. Dispositivos médicos cirúrgicos de alto custo e alta rastreabilidade fornecidos pela QLMED. |
| **Beneficiário / Paciente** | Pessoa física titular ou dependente coberta pelo plano de saúde que recebe os materiais OPME e procedimentos cirúrgicos autorizados. |
| **Matrícula** | Código identificador único do beneficiário no cadastro da respectiva operadora de saúde. |
| **CRM / Prestador** | Registro profissional no Conselho Regional de Medicina do cirurgião assistente, ou código de credenciamento do hospital prestador. |
| **Parse Status** | Classificação da integridade da extração de dados de um ofício: `ok` (extração íntegra de número e beneficiário), `parcial` (dados incompletos) ou `falha` (erro de leitura preservado para auditoria manual sem fabricação de dados). |
| **Billing Match (Processo Faturado)** | Conciliação automatizada que vincula um processo de autorização de operadora a uma NF-e emitida, prioritariamente via `infCpl` ou chave de acesso. |
| **Reversão pré-prazo** | Ajuste administrativo em autorizações (ex.: Unimed-CG) onde prazos de faturamento foram renegociados ou reabertos antes da perda de vigência. |
| **Operadora de Saúde** | Entidade pagadora de assistência médica com quem a QLMED mantém canais de ingestão automatizada (atualmente CASSEMS, IMPCG e Unimed Campo Grande). |

---

## 3. Catálogo, Estoque & ERP (Catalog, Inventory & Spica ERP)

| Termo | Significado |
| :--- | :--- |
| **Product Registry (Catálogo de Produtos)** | Base de dados consolidada de itens e materiais hospitalares da QLMED, derivada de documentos fiscais, cadastro manual e códigos de integração. |
| **Spica** | Sistema ERP externo hospitalar integrado para controle de faturamento, estoque consignado e pedidos de venda. |
| **Conciliação Spica** | Processo de conferência e pareamento automatizado entre itens de notas fiscais da QLMED e registros operacionais do Spica. |
| **Chave Spica** | Identificador de agrupamento operacional do Spica utilizado para rastrear faturamentos e lotes cirúrgicos vinculados a cada documento. |

---

## 4. Plataforma & Arquitetura (Core Platform & Architecture)

| Termo | Significado |
| :--- | :--- |
| **Company (Empresa)** | A entidade corporativa QLMED proprietária de todos os dados fiscais e operacionais, isolada sob a arquitetura *single-company*. |
| **Transactional Outbox** | Padrão arquitetural durável em que notificações externas (WhatsApp, alertas, webhooks) são persistidas na mesma transação da mutação de dados para publicação assíncrona desacoplada. |
| **Background Supervisor** | Módulo profundo central que gerencia o ciclo de vida, atraso escalonado de inicialização (*staggered delay*), monitoramento de saúde (*heartbeats*) e desligamento gracioso de rotinas assíncronas. |
| **Advisory Lock** | Mecanismo de sincronização distribuída do PostgreSQL utilizado para garantir que tarefas de sincronização e ingestão nunca sejam executadas em duplicidade concorrente. |
| **Deep Module (Módulo Profundo)** | Abstração com interface pública simples e concisa que esconde complexidades substanciais de infraestrutura ou regras de negócio (princípio de John Ousterhout e Matt Pocock). |
