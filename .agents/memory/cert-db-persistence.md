---
name: Certificado — persistência no banco de dados
description: certEdits e analyses overrides agora são salvos no DB; padrão locked=true; merge DB→localStorage na carga.
---

## Regra
`certEditsJson` e `certAnalysesOverridesJson` são colunas TEXT no `protocolsTable`.
Ambos são atualizados via `updateProtocol.mutate({ id, data: { certEditsJson, certAnalysesOverridesJson } })`.

## Como funciona
- `certLocked` padrão: `v !== "0"` — locked=true a menos que localStorage tenha "0" explícito.
- Auto-save debounced 1.5s via `useEffect` em `certEdits` (certEditsDbSaveTimerRef).
- Auto-save debounced 1.5s via `scheduleAnalysesDbSave(overrides)` chamado dentro de `updateAnalysis`.
- Na carga do cert: se localStorage(`cert_edits_v4_${id}`) estiver vazio E DB tiver dados → carrega do DB e escreve no localStorage.
- Para analyses overrides: se `cert_overrides_${id}` localStorage estiver vazio → carrega `cert.certAnalysesOverridesJson`.
- `saveCert` (botão "Salvar e Bloquear") faz save IMEDIATO ao DB (sem debounce).
- Indicador visual: "☁ Salvando no servidor…" / "✓ Salvo no servidor" via `certSaveStatus` state.

**Why:** localStorage é limpo quando usuário usa modo privado, limpa dados do browser ou usa outro dispositivo.

**How to apply:** Ao adicionar novos campos editáveis no certificado, salvar via `setCertEdit` (auto-persiste) OU via `updateAnalysis` — ambos disparam auto-save para o DB automaticamente.
