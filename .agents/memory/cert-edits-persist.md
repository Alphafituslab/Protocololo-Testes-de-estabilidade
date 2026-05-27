---
name: setCertEdit — sempre gravar no localStorage
description: setCertEdit deve persistir no localStorage a cada keystroke, não só quando bloqueado
---

## Regra
`setCertEdit` deve chamar `localStorage.setItem(CERT_EDITS_KEY, ...)` dentro do updater funcional SEMPRE — não apenas quando `certLocked === true`.

**Why:** Ao usar contentEditable (sem autofill), é seguro gravar no localStorage em cada keystroke. Isso garante que saveCert nunca depende de capturar estado React em uma closure: os dados já estão no localStorage antes de o botão ser clicado. Elimina race conditions entre o último input do usuário e o clique em "Salvar e Bloquear".

**How to apply:** Remover qualquer `if (certLocked)` guard no setCertEdit/clearCertEdit.
