---
name: MethodologiaTab JSX — Fragment obrigatório
description: O return do MethodologiaTab tem dois divs raiz separados e requer Fragment; como adicionar dialogs globais corretamente.
---

## Regra

O `return` do `MethodologiaTab` usa obrigatoriamente um Fragment `<>...</>` porque tem **dois elementos raiz separados**:

1. `<div className="space-y-6">` — wraps Seção 1 (Parâmetros Cadastrados) e fecha antes da Seção 2.
2. `<div className="border-t pt-5">` — Seção 2 (Biblioteca de Referências Metodológicas), elemento irmão.

Ambos são filhos diretos do Fragment.

## Para adicionar dialogs/modals globais

Colocar como **terceiro filho do Fragment**, após o `</div>` que fecha a Seção 2:

```jsx
return (
  <>
    <div className="space-y-6">
      {/* Seção 1 */}
    </div>

    <div className="border-t pt-5">
      {/* Seção 2 */}
    </div>

    {/* Dialogs globais aqui */}
    <AlertDialog ...>...</AlertDialog>
  </>
);
```

## Por que separados

Os dois `<div>` são elementos irmãos no JSX — confirmado por contagem de abertura/fechamento: depth vai de 1 para 0 ao final de cada seção.

**Why:** Estrutura herdada do design original; unificar em um único div wrapper alteraria o layout visual (padding/spacing) de ambas as seções.

**How to apply:** Antes de adicionar qualquer `</div>` extra ou Fragment, usar script Python para contar profundidade de divs a partir do `return (` e confirmar onde cada seção abre e fecha.
