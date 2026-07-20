// @refresh reset
import { createContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { setAuthTokenGetter } from "@workspace/api-client-react";

export type AuthUser = {
  id: number;
  username: string;
  displayName: string;
  role: string;
  hplcAccess?: boolean;
  permissions: string[];
  accessExpiresAt?: string | null;
  registrationNumber?: string | null;
};

export type AuthContextValue = {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
  isAdmin: boolean;
  hasPermission: (perm: string) => boolean;
};

export const AuthContext = createContext<AuthContextValue | null>(null);

const TOKEN_KEY = "alphafitus_token";
const USER_KEY = "alphafitus_user";

// localStorage persists across page reloads, new tabs, and browser restarts.
// The session is invalidated server-side (30-day token expiry + active check).
const store = {
  get: (key: string) => { try { return localStorage.getItem(key); } catch { return null; } },
  set: (key: string, value: string) => { try { localStorage.setItem(key, value); } catch { /* ignore */ } },
  remove: (key: string) => { try { localStorage.removeItem(key); } catch { /* ignore */ } },
};

export function AuthProvider({ children }: { children: ReactNode }) {
  // Read synchronously so protected routes never see a "not authenticated" flash.
  const [user, setUser] = useState<AuthUser | null>(() => {
    try {
      const stored = store.get(USER_KEY);
      return stored ? (JSON.parse(stored) as AuthUser) : null;
    } catch { return null; }
  });
  const [token, setToken] = useState<string | null>(() => {
    try {
      const t = store.get(TOKEN_KEY);
      if (t) setAuthTokenGetter(() => t);
      return t;
    } catch { return null; }
  });
  const isLoading = false;

  useEffect(() => {
    setAuthTokenGetter(token ? () => token : null);
  }, [token]);

  const login = useCallback(async (username: string, password: string): Promise<AuthUser> => {
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
    setToken(data.token);
    setUser(data.user);
    setAuthTokenGetter(() => data.token);
    return data.user;
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
    setToken(null);
    setUser(null);
    setAuthTokenGetter(null);
  }, [token]);

  /** Admin bypasses all permission checks. Non-admin must have the perm in their list. */
  const hasPermission = useCallback((perm: string): boolean => {
    if (!user) return false;
    if (user.role === "admin") return true;
    return (user.permissions ?? []).includes(perm);
  }, [user]);

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, logout, isAdmin: user?.role === "admin", hasPermission }}>
      {children}
    </AuthContext.Provider>
  );
}
