# Research: SPEC-016

## Web Push no PWA

Chrome/Android entrega com o site fechado após permissão. iOS 16.4+ só com o
PWA na Tela de Início (Safari). Declarative Web Push (Safari 18.4) é extra;
o caminho clássico (service worker + VAPID) cobre Chrome.

## Envio

`web-push` 3.6.7 implementa VAPID + RFC 8291. Não reimplementar.

## Outbox

O worker Python hoje cai no WhatsApp no `else`. Canal novo sem ramo próprio
enviaria `sendMedia` para uma URL HTTPS. O despacho `push` fica no Next.js
(mesmo `web-push`) e o worker só chama a API interna.
