---
name: KineticsTab — overage propagation
description: Como o overage% chega ao KineticsTab e por que estado local em ProtocolDetail é necessário
---

## O problema de escopo

`ativoLimits` state vive dentro de `ResultsTab` (linha ~1484). `KineticsTab` é renderizado em `ProtocolDetail` — componente irmão, não filho de `ResultsTab`. Portanto `KineticsTab` NÃO tem acesso ao state de `ResultsTab`.

`ProtocolDetail` passa `ativoLimitsJson` para `KineticsTab` via `protocol.ativoLimitsJson` (valor do DB). Quando o usuário edita overage em `ResultsTab`, o DB salva com debounce de 800ms, e só depois o refetch atualiza `protocol.ativoLimitsJson`. Isso causava delay/ausência de recálculo no `KineticsTab`.

## Solução adotada

Em `ProtocolDetail`, adicionar estado local:
```ts
const [localAtivoLimitsJson, setLocalAtivoLimitsJson] = useState<string | null>(null);
```

`handleApplyOverage` (em `ProtocolDetail`):
1. Lê `localAtivoLimitsJson ?? protocol.ativoLimitsJson` como base
2. Aplica o overage ao param
3. Chama `setLocalAtivoLimitsJson(nextJson)` IMEDIATAMENTE
4. Chama `updateProtocol.mutate(nextJson)` em background (persiste DB + invalida query)

`KineticsTab` recebe:
```tsx
ativoLimitsJson={localAtivoLimitsJson ?? protocol.ativoLimitsJson}
```

Assim KineticsTab re-renderiza instantaneamente sem esperar refetch.

## Ceiling rounding para recStr

`overageRequired` deve ser arredondado para CIMA (teto) em 1 casa decimal:
```ts
const recStr = (Math.ceil(overageRequired * 10) / 10).toFixed(1);
```

Com `.toFixed(1)` comum, 2.349% vira "2.3%" → qtyAtEnd fica ligeiramente abaixo de minRaw → mostra ⚠ após aplicar.

## Epsilon nas comparações

- `configuredOverageOk`: `projectedWithOverage >= specMinPct - 0.001`
- `qtyOk` (mg): `qtyAtEnd >= minRaw - 0.005`
- `qtyOk` (pct): `qtyAtEndPct >= specMinPct - 0.001`

**Why:** ponto flutuante em `e^(k×t) × e^(-k×t)` não cancela exatamente em JavaScript.
