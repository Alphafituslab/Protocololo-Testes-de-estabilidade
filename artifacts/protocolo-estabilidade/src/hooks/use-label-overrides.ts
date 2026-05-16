import { useState, useCallback } from "react";

const STORAGE_KEY = "alphafitus_label_overrides_v1";

type Overrides = Record<string, string>;

function load(): Overrides {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as Overrides; }
  catch { return {}; }
}

export function useLabelOverrides() {
  const [overrides, setOverrides] = useState<Overrides>(load);

  const setLabel = useCallback((key: string, value: string) => {
    setOverrides(prev => {
      const next = { ...prev };
      if (value.trim()) next[key] = value; else delete next[key];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const lbl = useCallback((key: string, defaultText: string): string =>
    overrides[key] ?? defaultText, [overrides]);

  return { setLabel, lbl };
}
