---
name: Persistência de datas e metodologias por protocolo
description: periodDates e paramMethods foram movidos para o banco (3 colunas novas na tabela protocols); padrão de hidratação e save.
---

## Regra
`periodDatesJson`, `paramMethodsJson`, `paramMethodsCitationsJson` são colunas `text` na tabela `protocols`.
Elas armazenam JSON serializado das datas por período e das metodologias por parâmetro.

**Why:** Antes só ficavam no localStorage — desapareciam ao trocar dispositivo, limpar cache, ou após múltiplos deploys.

## How to apply
- `ResultsTab` recebe `initialPeriodDatesJson`, `initialParamMethodsJson`, `initialParamMethodsCitationsJson` como props e inicializa state a partir deles (fallback: localStorage).
- Ao montar: hidrata localStorage a partir dos valores do banco (useEffect de uma só vez, deps=[]).
- Ao mudar: save debounced 800ms via `updateProtocol.mutate({...})` — mesmo padrão de `customParamsJson`.
- `certificates.ts`: `analysisDates` prioriza `protocol.periodDatesJson` antes de usar `r.analysisDate` dos resultados.
- OpenAPI spec tem os 3 campos em `Protocol` e `UpdateProtocolBody`; regenerar com `pnpm --filter @workspace/api-spec run codegen` após mudar.
