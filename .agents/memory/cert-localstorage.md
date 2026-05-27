---
name: Certificate localStorage architecture
description: How certificate field edits are persisted and why unlocked certs must never write to localStorage
---

## Rule
`setCertEdit` / `clearCertEdit` only write to localStorage when `certLocked === true`. When unlocked, edits live in React state (memory) only. `saveCert()` is the single point where in-memory edits are flushed to localStorage alongside the lock flag.

**Why:** `CertEditField` uses `contentEditable`. Browser autocorrect, spellcheck, and extensions can modify the DOM directly, firing the `input` event and calling `onChange`, which would silently persist corrupted values to localStorage. By only persisting on explicit lock, any transient corruption is ephemeral and never survives a page reload.

## How to apply
- `setCertEdit(key, val)`: update `certEditsState`; if `certLocked`, also write to `localStorage.setItem(CERT_EDITS_KEY, ...)`.
- `saveCert()`: set locked=true, then `localStorage.setItem(CERT_EDITS_KEY, JSON.stringify(certEdits))`.
- `certEdits` useState initializer: only reads from localStorage if `cert_locked_${id} === "1"`. When unlocked, returns `{}`.
- localStorage key: `cert_edits_v4_${id}`. On init, clean up v1/v2/v3 keys unconditionally.

## Additional guards
- `CertEditField` has `spellCheck={false}`, `autoCorrect="off"`, `autoCapitalize="off"`.
- `isSyncing` ref blocks `handleInput` during programmatic `textContent` sync.
- `lbl_*` keys are stripped from stored edits on every load (defensive).
