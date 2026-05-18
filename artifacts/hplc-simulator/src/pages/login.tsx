// @refresh reset
import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/use-auth";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

const REDIRECT_KEY = "hplc_redirect";

function popRedirect(): string {
  try {
    const saved = sessionStorage.getItem(REDIRECT_KEY);
    if (saved) { sessionStorage.removeItem(REDIRECT_KEY); return saved; }
  } catch { /* ignore */ }
  return "/dashboard";
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

  const hardNavPending = useRef(false);

  useEffect(() => {
    if (user && !hardNavPending.current) {
      navigate("/dashboard");
    }
  }, [user]);

  useEffect(() => {
    fetch("/api/auth/setup-needed")
      .then((r) => r.json())
      .then((d: { setupNeeded: boolean }) => setSetupNeeded(d.setupNeeded))
      .catch(() => setSetupNeeded(false));
  }, []);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const dest = popRedirect();
    try {
      await login(username, password);
      hardNavPending.current = true;
      const base = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
      const path = dest === "/dashboard" ? "/dashboard" : dest;
      window.location.replace(base + path);
    } catch (err) {
      toast({ variant: "destructive", title: "Error", description: (err as Error).message });
      setLoading(false);
    }
  }

  async function handleSetup(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirmPassword) {
      toast({ variant: "destructive", title: "Error", description: "Passwords do not match." });
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
        throw new Error((d as { error?: string }).error ?? "Setup error.");
      }
      await login(username, password);
      hardNavPending.current = true;
      const base = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
      window.location.replace(base + "/dashboard");
    } catch (err) {
      toast({ variant: "destructive", title: "Error", description: (err as Error).message });
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
            <CardTitle className="text-xl">Alphafitus Nutraceutical Laboratory</CardTitle>
            <CardDescription className="mt-1">
              {setupNeeded
                ? "Set up the first system administrator"
                : "HPLC Simulator — Agilent ChemStation — Secure Access"}
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent>
          {setupNeeded ? (
            <form onSubmit={handleSetup} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="displayName">Full name</Label>
                <Input id="displayName" placeholder="Ex: Ana Paula Silva" value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="username">Username</Label>
                <Input id="username" placeholder="Ex: ana.paula" value={username}
                  onChange={(e) => setUsername(e.target.value)} required autoCapitalize="none" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password (minimum 6 characters)</Label>
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
                <Label htmlFor="confirmPassword">Confirm password</Label>
                <Input id="confirmPassword" type="password" value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)} required />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Create administrator and sign in
              </Button>
            </form>
          ) : (
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="username">Username</Label>
                <Input id="username" placeholder="nome.usuario" value={username}
                  onChange={(e) => setUsername(e.target.value)} required autoCapitalize="none" autoComplete="username" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Input id="password" type={showPassword ? "text" : "password"} value={password}
                    onChange={(e) => setPassword(e.target.value)} required className="pr-10" autoComplete="current-password" />
                  <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                    onClick={() => setShowPassword((s) => !s)}>
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Sign In
              </Button>
            </form>
          )}

        </CardContent>
      </Card>
    </div>
  );
}
