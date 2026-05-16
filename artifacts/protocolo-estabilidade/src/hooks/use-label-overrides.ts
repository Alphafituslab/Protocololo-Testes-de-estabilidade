import { useState, useCallback, useEffect } from "react";

const TOKEN_KEY = "alphafitus_token";
const CACHE_KEY = "alphafitus_label_cache_v2";

type Overrides = Record<string, string>;

function loadCache(): Overrides {
  try { return JSON.parse(sessionStorage.getItem(CACHE_KEY) ?? "{}") as Overrides; }
  catch { return {}; }
}

function saveCache(o: Overrides) {
  try { sessionStorage.setItem(CACHE_KEY, JSON.stringify(o)); } catch { /* ignore */ }
}

function getToken(): string | null {
  try { return sessionStorage.getItem(TOKEN_KEY); } catch { return null; }
}

export function useLabelOverrides() {
  const [overrides, setOverrides] = useState<Overrides>(loadCache);

  useEffect(() => {
    fetch("/api/settings")
      .then(r => r.ok ? r.json() : {})
      .then((data: Overrides) => {
        setOverrides(data);
        saveCache(data);
      })
      .catch(() => { /* keep cache */ });
  }, []);

  const setLabel = useCallback(async (key: string, value: string) => {
    setOverrides(prev => {
      const next = { ...prev };
      if (value.trim()) next[key] = value; else delete next[key];
      saveCache(next);
      return next;
    });
    const token = getToken();
    if (!token) return;
    if (value.trim()) {
      await fetch(`/api/settings/${encodeURIComponent(key)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ value }),
      }).catch(() => { /* ignore network errors */ });
    } else {
      await fetch(`/api/settings/${encodeURIComponent(key)}`, {
        method: "DELETE",
        headers: { "Authorization": `Bearer ${token}` },
      }).catch(() => { /* ignore */ });
    }
  }, []);

  const lbl = useCallback((key: string, defaultText: string): string =>
    overrides[key] ?? defaultText, [overrides]);

  return { setLabel, lbl };
}
