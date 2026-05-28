import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/use-auth";
import { Eye, EyeOff, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

const REDIRECT_KEY = "alphafitus_redirect";

function popRedirect(): string {
  try {
    const saved = sessionStorage.getItem(REDIRECT_KEY);
    if (saved) { sessionStorage.removeItem(REDIRECT_KEY); return saved; }
  } catch { /* ignore */ }
  return "/";
}

export default function LoginPage() {
  const { login, user } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const [setupNeeded, setSetupNeeded] = useState<boolean | null>(null);
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  // Redirect only on mount if session was restored from sessionStorage.
  useEffect(() => {
    if (user) navigate("/", { replace: true });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetch("/api/auth/setup-needed")
      .then((r) => r.json())
      .then((d: { setupNeeded: boolean }) => setSetupNeeded(d.setupNeeded))
      .catch(() => setSetupNeeded(false));
  }, []);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoginError(null);
    setLoading(true);
    const dest = popRedirect();
    try {
      await login(username, password);
      // Full page replace ensures the auth token is wired up before any
      // React Query request fires, avoiding any 401 race.
      window.location.replace(dest || "/");
    } catch (err) {
      const msg = (err as Error).message ?? "Erro ao fazer login.";
      setLoginError(msg);
    } finally {
      setLoading(false);
    }
  }

  async function handleSetup(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirmPassword) {
      toast({ variant: "destructive", title: "Erro", description: "As senhas não coincidem." });
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, displayName, password }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error((d as { error?: string }).error ?? "Erro ao configurar.");
      }
      await login(username, password);
      navigate("/", { replace: true });
    } catch (err) {
      toast({ variant: "destructive", title: "Erro", description: (err as Error).message });
    } finally {
      setLoading(false);
    }
  }

  if (setupNeeded === null) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="text-center space-y-3">
          <div className="flex justify-center">
            <img src="/logo-alphafitus.png" alt="Alphafitus" className="h-20 w-auto" />
          </div>
          <div>
            <CardTitle className="text-xl">Alphafitus Laboratório Nutracêutico</CardTitle>
            <CardDescription className="mt-1">
              {setupNeeded
                ? "Configure o primeiro administrador do sistema"
                : "Protocolo de Estabilidade — Acesso seguro"}
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent>
          {setupNeeded ? (
            <form onSubmit={handleSetup} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="displayName">Nome completo</Label>
                <Input id="displayName" placeholder="Ex: Ana Paula Silva" value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="username">Nome de usuário</Label>
                <Input id="username" placeholder="Ex: ana.paula" value={username}
                  onChange={(e) => setUsername(e.target.value)} required autoCapitalize="none" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Senha (mínimo 6 caracteres)</Label>
                <div className="relative">
                  <Input id="password" type={showPassword ? "text" : "password"} value={password}
                    onChange={(e) => setPassword(e.target.value)} required minLength={6} className="pr-10" />
                  <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                    onClick={() => setShowPassword((s) => !s)}>
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirmar senha</Label>
                <Input id="confirmPassword" type="password" value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)} required />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Criar administrador e entrar
              </Button>
            </form>
          ) : (
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="username">Usuário</Label>
                <Input id="username" placeholder="nome.usuario" value={username}
                  onChange={(e) => { setUsername(e.target.value); setLoginError(null); }}
                  required autoCapitalize="none" autoComplete="username" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Senha</Label>
                <div className="relative">
                  <Input id="password" type={showPassword ? "text" : "password"} value={password}
                    onChange={(e) => { setPassword(e.target.value); setLoginError(null); }}
                    required className="pr-10" autoComplete="current-password" />
                  <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                    onClick={() => setShowPassword((s) => !s)}>
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {loginError && (
                <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{loginError}</span>
                </div>
              )}

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Entrar
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
