---
name: Full-array sync vs body size limits
description: Why syncing an entire list to the server on every single-item save is dangerous once records embed heavy data (HTML/SVG/blobs).
---

When a client persists a growing list of records by POSTing the ENTIRE array on every single add/edit/delete (a "sync entire collection" endpoint), the request body grows unbounded as the collection grows. If any record embeds heavy inline data (full HTML documents, serialized SVG, base64 images, etc.), the array can exceed the server's JSON body size limit within a normal usage lifetime — not just at extreme scale.

Express's `express.json()` defaults to a 100kb body limit. Once the array-sync payload crosses that threshold, every future sync silently fails (a `.catch(() => {})` swallowing the rejected/oversized request is a common pattern that hides this). The failure is invisible until local state (e.g. localStorage) is lost — at which point data that was "saved" appears to have been deleted, because the server never actually received the up-to-date backup.

**Why:** This exact pattern caused the Alphafitus HPLC simulator's "PDFs Salvos" to intermittently disappear — `persistSavedAnalyses(list)` POSTed the full saved-analyses array (each record embedding full certificate HTML + chromatogram SVG) to `/api/hplc/analyses/sync` on every save/delete. As the list grew, the payload exceeded Express's default 100kb JSON limit, sync started failing silently, and any subsequent localStorage loss made the "saved" PDFs vanish because the server copy was stale.

**How to apply:**
- Never design a "sync" endpoint that expects the full collection on every routine mutation. Use it only for one-time bulk migration/merge (e.g. first login pushing local-only data).
- For routine single-record saves/updates/deletes, add a lightweight per-record endpoint (e.g. `POST /resource/one`, `DELETE /resource/:id`) and call that instead.
- Set an explicit, generous `express.json({ limit: ... })` as a safety net regardless — the default 100kb is too small for any payload with embedded rich content.
- Don't let `.catch(() => {})` on a sync fetch hide a systemic problem — if you must swallow network errors for offline resilience, at least log them so the failure pattern is discoverable before users notice data loss.
