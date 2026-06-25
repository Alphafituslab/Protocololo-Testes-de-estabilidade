---
name: HPLC Compound IDs estáveis
description: Por que DEFAULT_ACTIVE_COMPOUNDS usa IDs hardcoded e não uid()
---

# Regra: IDs fixos em DEFAULT_ACTIVE_COMPOUNDS

`compoundCalibrations` (localStorage `hplc_compound_calibrations_v1`) é um `Record<compoundId, CompoundCalibration>`.

Se `DEFAULT_ACTIVE_COMPOUNDS` usar `uid()`, cada reload do módulo gera IDs novos → `compoundCalibrations[compoundId]` nunca encontra o dado salvo → calibração parece resetar ao fechar.

**Why:** uid() é chamado no nível do módulo (não dentro de useState/useRef), portanto executa a cada importação do módulo (cada reload de página). O estado React é inicializado a partir do localStorage, mas a chave usada para buscar é o novo ID gerado, não o ID salvo.

**How to apply:** Todos os compostos padrão têm IDs do formato `"cmp-<slug>"` (ex: `"cmp-b6"`, `"cmp-vitd3"`, `"cmp-na-ic"`). Compostos criados pelo usuário podem usar uid() pois são salvos junto com activeCompounds no saveState e recarregados com o mesmo ID.
