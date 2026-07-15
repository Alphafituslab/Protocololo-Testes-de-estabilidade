---
name: KineticsTab — design das BOXes de vida útil (c₀)
description: As duas cards de vida útil na aba Cinética usam c₀ diferentes; não usar a mesma fonte para as duas.
---

# KineticsTab — BOX 1 vs BOX 2: concentração inicial c₀

## A regra
- **BOX 1 (Vida Útil Estimada — sem sobreformulação):** usa `c₀ = 100%` (quantidade declarada exata).  
  Fórmula: `t = −ln(limiar / 100) / k`  
  Variável: `minBaselineShelfLife` (calculado na KineticsTab, não vem da API).
- **BOX 2 (Com Sobreformulação):** usa `c₀ = 100 + effectiveOverage%`.  
  `effectiveOverage = max(manual_overage, T0 − 100)` — inclui overage implícito quando T0 > 100%.  
  Variável: `minOverageShelfLife`.

## Por que importa
A API retorna `estimatedShelfLifeMonths` usando `c₀ = T0` (medição real). Se T0 > 100%, BOX 1 NÃO deve usar esse valor — usá-lo faz BOX 1 e BOX 2 mostrarem o mesmo resultado (ambos convergem para c₀ = T0).

**Exemplo real (protocol 45 produção):**  
- T0 = 107.16% → k_acc = 0.02638/mês (40°C)  
- BOX 1 (c₀=100%): 3.99 meses → "3 meses"  
- BOX 2 (c₀=107.16%, impl.): 6.61 meses → "6 meses"

## Como aplicar
Ao editar a KineticsTab, sempre recalcular `minBaselineShelfLife` independentemente do API para BOX 1. Nunca reutilizar `ov.shelfLife` (que usa T0 da API) como fonte de BOX 1.

O highlight da linha limitante na tabela deve usar `limitingBaselineParam`, não `limitingParam` (que apontava para o parâmetro limitante do API — pode ser diferente).
