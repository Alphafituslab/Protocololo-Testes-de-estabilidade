---
name: Bibliographic References — cor e auto-sync
description: Campo color na ref, acordeão por tipo no catálogo, lista flat no protocolo, e sync automático ao marcar autoInclude=true
---

## Regras deste módulo

### Campo `color` na referência
- Coluna `color text` adicionada em `bibliographic_references` (migração aplicada via `drizzle-kit push`).
- Tipo `BibliographicReference` e `BibliographicReferenceInput` em `lib/api-client-react/src/generated/api.schemas.ts` incluem `color`.
- POST e PUT em `/api/bibliographic-references` aceitam e persistem `color`.
- `toRefInput()` em `catalog.tsx` deve incluir `color: data.color || undefined`.

### Auto-sync retroativo ao marcar autoInclude=true
- Quando POST ou PUT salva `autoInclude=true`, o servidor chama `syncOneRefToAllProtocols(refId)` **inline** (não precisa chamar o endpoint `/sync-auto-include` separado).
- `syncOneRefToAllProtocols` em `bibliographic-references.ts`: busca todos os protocolos, filtra os que já têm a ref, insere os restantes com `sortOrder: 10000` e `onConflictDoNothing`.
- O endpoint `/sync-auto-include` continua existindo para bulk sync manual (todas as refs de uma vez).

### Layout do catálogo (catalog.tsx)
- `BibliographicReferencesTable` usa acordeão de dois níveis: grupos por tipo (expansíveis) → refs dentro (expansíveis individualmente).
- `TIPO_ORDER` define a ordem de exibição dos grupos; grupos com tipo desconhecido aparecem no final.
- Botão "copiar citação ABNT" (clipboard) dentro de cada ref expandida.
- Seletor de cor (bolinhas) dentro do formulário criar/editar.
- Badge "★ auto-incluída" visível na linha recolhida e na expandida.

### Layout da lista de refs do protocolo (protocol-detail.tsx)
- Lista flat numerada (não agrupada por cor).
- Cada item tem borda esquerda colorida (`border-l-4`) se `ref.color` estiver definida.
- O dot de cor é inserido **dentro** do badge de tipo (substitui o emoji do tipo quando há cor definida).
- Badge "★ auto-incluída" visível ao lado do badge de tipo.
- Descrição renderizada em bloco com borda (not just italic text).
- Botões reorder (▲▼) e remover aparecem no hover.

**Why:** usuário quer sinalização visual de cor e auto-include em todos os pontos da UI; sync retroativo garante que marcar autoInclude=true num ref já existente cubra os 50+ protocolos sem passo manual.
