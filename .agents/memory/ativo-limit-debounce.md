---
name: setAtivoLimit debounce pattern
description: Padrão correto para salvar ativoLimitsJson no DB — evita race condition por keystrokes rápidos.
---

## Regra

`updateProtocol.mutate(...)` NUNCA deve ser chamado dentro do callback de `setAtivoLimitsState`.
Sempre usar debounce de 600ms fora do setState, lendo o estado via `latestAtivoLimitsRef.current`.

**Why:** Chamar `mutate` dentro de um setState callback dispara um PUT HTTP em cada keystroke.
Com digitação rápida, múltiplos PUTs viajam em paralelo e chegam ao servidor fora de ordem
(HTTP não garante ordem). Um PUT com valor parcial ("5") pode sobrescrever o PUT final ("50"),
deixando o DB com o valor errado. Certificado e cinética ficam desatualizados pois leem o DB.

**How to apply:**

```typescript
// CORRETO:
const latestAtivoLimitsRef = useRef(ativoLimits);
latestAtivoLimitsRef.current = ativoLimits;  // sincroniza a cada render
const saveAtivoTimerRef = useRef<ReturnType<typeof setTimeout>>();

const setAtivoLimit = (param, field, value) => {
  // 1. Atualiza estado local + localStorage imediatamente
  setAtivoLimitsState(prev => {
    const next = { ...prev, [param]: { ...prev[param], [field]: value } };
    localStorage.setItem(ATIVO_LIMITS_KEY, JSON.stringify(next));
    latestAtivoLimitsRef.current = next;  // ref em sync
    return next;
  });
  // 2. Debounce DB save — apenas UM PUT após 600ms de inatividade
  clearTimeout(saveAtivoTimerRef.current);
  saveAtivoTimerRef.current = setTimeout(() => {
    updateProtocol.mutate(
      { id: protocolId, data: { ativoLimitsJson: JSON.stringify(latestAtivoLimitsRef.current) } },
      { onSuccess: () => { /* invalidate certificate + kinetics */ } }
    );
  }, 600);
};
```

O mesmo padrão de stale closure se aplica aos timers do `bankSyncTimersRef`:
usar `latestAtivoLimitsRef.current[param]` no callback, não `next` capturado no closure.
