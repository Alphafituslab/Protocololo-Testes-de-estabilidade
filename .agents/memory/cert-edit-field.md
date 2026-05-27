---
name: CertEditField — contentEditable obrigatório
description: Por que o CertEditField DEVE usar contentEditable e nunca <input>/<textarea>
---

## Regra
CertEditField em certificate.tsx DEVE usar `contentEditable` div, nunca `<input>` ou `<textarea>`.

**Why:** O Chrome autofill ignora `autoComplete="off"` e `autoComplete="new-password"` em elementos `<input>`. Quando a página carrega com campos `<input>`, o browser injeta valores de formulários salvos disparando `onChange` → `setCertEdit` → localStorage recebe dados corrompidos. Ao clicar "Salvar e Bloquear", os valores do autofill ficam travados no certificado. contentEditable é completamente invisível para o motor de autofill do browser.

**How to apply:** Sempre que for reescrever ou refatorar CertEditField, manter a estrutura `<div contentEditable suppressContentEditableWarning ...>` com os guards `isSyncing` e `isFocused`.
