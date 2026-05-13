import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { setAuthTokenGetter } from "@workspace/api-client-react";

export type AuthUser = {
  id: number;
  username: string;
  displayName: string;
  role: string;
  hplcAccess: boolean;
};

type AuthContextValue = {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  isAdmin: boolean;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const TOKEN_KEY = "alphafitus_token";
const USER_KEY = "alphafitus_user";

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
    try { return store.get(TOKEN_KEY); } catch { return null; }
  });
  // isLoading is always false: we initialise synchronously, no async step needed.
  const isLoading = false;

  // Wire up the API client token getter whenever the token changes.
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
    if (!data.user.hplcAccess) {
      await fetch("/api/auth/logout", {
        method: "POST",
        headers: { "Authorization": `Bearer ${data.token}` },
      }).catch(() => {});
      throw new Error("Seu usuário não tem acesso ao Simulador HPLC. Contate o administrador.");
    }
    store.set(TOKEN_KEY, data.token);
    store.set(USER_KEY, JSON.stringify(data.user));
    setToken(data.token);
    setUser(data.user);
    setAuthTokenGetter(() => data.token);
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

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
