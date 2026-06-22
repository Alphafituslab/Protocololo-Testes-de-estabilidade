---
name: kineticsOverridesJson DB format
description: The nested format used by saveOverridesToDb vs what consumers must parse
---

# kineticsOverridesJson — DB Format

`saveOverridesToDb` (KineticsTab) saves to the DB column `kineticsOverridesJson` in **nested** format:

```json
{
  "savedAt": "2024-01-01T00:00:00.000Z",
  "params": {
    "L-triptofano": { "t0": "95.00", "t3": "96.00", "t6": "96.31", "specMin": "...", "specMax": "...", "manualFields": ["t6"] },
    "Metionina": { ... }
  },
  "customShelfLife": "24"
}
```

**NOT** the flat format `{ "L-triptofano": { "t6": "96.31" } }`.

## Why this matters

The certificate route (`certificates.ts`) previously parsed it as a flat map, so `getKineticsT6(param)` always returned `undefined` for all params — the top-level keys were "savedAt", "params", "customShelfLife" (not parameter names). This caused ativoMgInfo to be null for any teor_ativo param that relied on kinetics T6 (especially amino acids with text-only analysis results).

## How to apply

Any server-side code reading `kineticsOverridesJson` must:
1. Parse the JSON
2. Check for `.params` key (nested format) → use `.params` as the paramMap
3. Fall back to the raw object as a flat map (legacy backward-compat)

```typescript
const raw = JSON.parse(protocol.kineticsOverridesJson);
const paramMap = raw.params && typeof raw.params === "object"
  ? raw.params
  : raw;
for (const [param, ov] of Object.entries(paramMap)) { ... }
```

## localStorage format (KineticsTab unsaved)

localStorage key: `kinetics_overrides_${protocolId}`
Format: `{ overrides: { [param]: { t0, t3, t6, ... } }, customShelfLife, cardValidity, kineticsObs }`

The `overrides` map is at `.overrides`, not at the root.
`saveOverridesToDb` clears localStorage on success, so non-empty localStorage = unsaved changes.
