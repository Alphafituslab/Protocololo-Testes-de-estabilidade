import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/use-auth";
import { Eye, EyeOff, Loader2, AlertCircle, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  const [showResetMasterPwd, setShowResetMasterPwd] = useState(false);
  const [showResetNewPwd, setShowResetNewPwd] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetUsername, setResetUsername] = useState("");
  const [resetMasterPwd, setResetMasterPwd] = useState("");
  const [resetNewPwd, setResetNewPwd] = useState("");
  const [resetLoading, setResetLoading] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  useEffect(() => {
    if (user) navigate("/");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

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
      window.location.replace(dest || "/");
    } catch (err) {
      const msg = (err as Error).message ?? "Erro ao fazer login.";
      setLoginError(msg);
    } finally {
      setLoading(false);
    }
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    setResetError(null);
    setResetLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ masterPassword: resetMasterPwd, username: resetUsername, newPassword: resetNewPwd }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((d as { error?: string }).error ?? "Erro ao redefinir senha.");
      toast({ title: "Senha redefinida", description: "Agora você pode fazer login com a nova senha." });
      setResetOpen(false);
      setResetUsername("");
      setResetMasterPwd("");
      setResetNewPwd("");
      setUsername(resetUsername);
    } catch (err) {
      setResetError((err as Error).message);
    } finally {
      setResetLoading(false);
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
      window.location.replace("/");
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
                <div className="relative">
                  <Input id="confirmPassword" type={showConfirmPassword ? "text" : "password"} value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)} required className="pr-10" />
                  <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                    onClick={() => setShowConfirmPassword((s) => !s)}>
                    {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
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

              <div className="text-center">
                <button
                  type="button"
                  onClick={() => { setResetOpen(true); setResetUsername(username); setResetError(null); }}
                  className="text-xs text-muted-foreground hover:text-primary underline-offset-2 hover:underline transition-colors"
                >
                  Esqueci minha senha
                </button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>

      <Dialog open={resetOpen} onOpenChange={setResetOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5" /> Redefinir senha
            </DialogTitle>
            <DialogDescription>
              Use a senha mestra do sistema para criar uma nova senha para qualquer usuário.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleResetPassword} className="space-y-4">
            <div className="space-y-2">
              <Label>Nome de usuário</Label>
              <Input
                placeholder="nome.usuario"
                value={resetUsername}
                onChange={(e) => setResetUsername(e.target.value)}
                required
                autoCapitalize="none"
              />
            </div>
            <div className="space-y-2">
              <Label>Senha mestra do sistema</Label>
              <div className="relative">
                <Input
                  type={showResetMasterPwd ? "text" : "password"}
                  placeholder="••••••••"
                  value={resetMasterPwd}
                  onChange={(e) => setResetMasterPwd(e.target.value)}
                  required
                  className="pr-10"
                />
                <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                  onClick={() => setShowResetMasterPwd((s) => !s)}>
                  {showResetMasterPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Nova senha (mín. 6 caracteres)</Label>
              <div className="relative">
                <Input
                  type={showResetNewPwd ? "text" : "password"}
                  placeholder="••••••••"
                  value={resetNewPwd}
                  onChange={(e) => setResetNewPwd(e.target.value)}
                  required
                  minLength={6}
                  className="pr-10"
                />
                <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                  onClick={() => setShowResetNewPwd((s) => !s)}>
                  {showResetNewPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            {resetError && (
              <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{resetError}</span>
              </div>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setResetOpen(false)} disabled={resetLoading}>
                Cancelar
              </Button>
              <Button type="submit" disabled={resetLoading}>
                {resetLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Redefinir senha
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
