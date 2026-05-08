import { useState, useCallback } from "react";

const SESSION_KEY = "alphafitus_unlocked";

function isUnlocked(): boolean {
  try {
    return sessionStorage.getItem(SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

function setUnlocked(val: boolean) {
  try {
    if (val) sessionStorage.setItem(SESSION_KEY, "1");
    else sessionStorage.removeItem(SESSION_KEY);
  } catch { /* ignore */ }
}

export function useUnlock() {
  const [unlocked, setUnlockedState] = useState<boolean>(isUnlocked);

  const unlock = useCallback(async (password: string): Promise<{ ok: boolean; error?: string }> => {
    try {
      const res = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        setUnlocked(true);
        setUnlockedState(true);
        return { ok: true };
      }
      const body = await res.json().catch(() => ({}));
      return { ok: false, error: (body as { error?: string }).error ?? "Senha incorreta." };
    } catch {
      return { ok: false, error: "Erro de conexão. Tente novamente." };
    }
  }, []);

  const lock = useCallback(() => {
    setUnlocked(false);
    setUnlockedState(false);
  }, []);

  return { unlocked, unlock, lock };
}
