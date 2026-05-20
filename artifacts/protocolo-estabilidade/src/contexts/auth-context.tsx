// @refresh reset
import { createContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { setAuthTokenGetter } from "@workspace/api-client-react";

export type AuthUser = {
  id: number;
  username: string;
  displayName: string;
  role: string;
};

export type AuthContextValue = {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  isAdmin: boolean;
};

export const AuthContext = createContext<AuthContextValue | null>(null);

const TOKEN_KEY = "alphafitus_token";
const USER_KEY = "alphafitus_user";

// Use sessionStorage so the session expires when the browser/tab closes.
// Each new browser session requires login.
const store = {
  get: (key: string) => sessionStorage.getItem(key),
  set: (key: string, value: string) => sessionStorage.setItem(key, value),
  remove: (key: string) => sessionStorage.removeItem(key),
};

export function AuthProvider({ children }: { children: ReactNode }) {
  // Read sessionStorage synchronously so the protected routes never see a
  // "not authenticated" flash after login + window.location.replace().
  const [user, setUser] = useState<AuthUser | null>(() => {
    try {
      const stored = store.get(USER_KEY);
      return stored ? (JSON.parse(stored) as AuthUser) : null;
    } catch { return null; }
  });
  const [token, setToken] = useState<string | null>(() => {
    try {
      const t = store.get(TOKEN_KEY);
      // Set the token getter synchronously during state initialisation so that
      // React Query requests fired on the very first render already carry the
      // Authorization header. Without this, the getter would only be wired up
      // after the first useEffect flush, causing a 401 flash on page reload.
      if (t) setAuthTokenGetter(() => t);
      return t;
    } catch { return null; }
  });
  // isLoading is always false: we initialise synchronously, no async step needed.
  const isLoading = false;

  // Keep the token getter in sync whenever the token changes after mount
  // (login / logout flows that do NOT trigger a full page reload).
  useEffect(() => {
    setAuthTokenGetter(token ? () => token : null);
  }, [token]);

  const login = useCallback(async (username: string, password: string) => {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error((data as { error?: string }).error ?? "Erro ao fazer login.");
    }
    const data = await res.json() as { token: string; user: AuthUser };
    store.set(TOKEN_KEY, data.token);
    store.set(USER_KEY, JSON.stringify(data.user));
    // Token getter must be set BEFORE flushSync so that any query fired
    // by effects inside flushSync already carries the Authorization header.
    setAuthTokenGetter(() => data.token);
    // flushSync commits user/token state synchronously — navigate() called
    // right after will see user !== null in ProtectedRoute immediately.
    flushSync(() => {
      setToken(data.token);
      setUser(data.user);
    });
  }, []);

  const logout = useCallback(async () => {
    if (token) {
      await fetch("/api/auth/logout", {
        method: "POST",
        headers: { "Authorization": `Bearer ${token}` },
      }).catch(() => {});
    }
    store.remove(TOKEN_KEY);
    store.remove(USER_KEY);
    // Also clear any old localStorage leftovers from previous version
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setToken(null);
    setUser(null);
    setAuthTokenGetter(null);
  }, [token]);

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, logout, isAdmin: user?.role === "admin" }}>
      {children}
    </AuthContext.Provider>
  );
}
