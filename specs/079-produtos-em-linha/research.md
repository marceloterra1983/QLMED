# Research: SPEC-079

O contrato `produtos-groups-expanded-contract` exigia default `'all'` para
não esconder Spica fora de linha. O operador pediu o contrário no uso
diário. A API permanece `all` para export/outros clientes.

Na árvore, `serverLineStatus = 'all'` forçado baixava o catálogo inteiro.
Alinhar o GET ao botão reduz payload no caminho feliz (Em Linha).
