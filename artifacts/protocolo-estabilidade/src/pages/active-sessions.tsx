import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/use-auth";
import { useLocation } from "wouter";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { RefreshCw, Wifi, LogOut, Loader2, WifiOff } from "lucide-react";
import { ROLE_LABELS } from "./users";

interface ActiveSession {
  userId: number;
  username: string;
  displayName: string;
  role: string;
  loginAt: string;
  expiresAt: string;
  sessionCount: number;
}

function formatRelative(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return "agora mesmo";
  if (diff < 3600) return `há ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `há ${Math.floor(diff / 3600)}h`;
  return `há ${Math.floor(diff / 86400)}d`;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function isToday(iso: string): boolean {
  const d = new Date(iso);
  const now = new Date();
  return d.getDate() === now.getDate() && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
}

function initials(name: string) {
  return name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();
}

export default function ActiveSessionsPage() {
  const { user, isAdmin } = useAuth();
  const [, navigate] = useLocation();
  const [sessions, setSessions] = useState<ActiveSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [tick, setTick] = useState(0); // força re-render a cada 30s para atualizar tempos relativos

  // Confirmação de encerramento
  const [confirmKick, setConfirmKick] = useState<ActiveSession | null>(null);
  const [kicking, setKicking] = useState(false);
  const [kickError, setKickError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAdmin) { navigate("/"); return; }
  }, [isAdmin, navigate]);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const tok = localStorage.getItem("alphafitus_token");
      const res = await fetch("/api/users/active-sessions", {
        headers: tok ? { Authorization: `Bearer ${tok}` } : {},
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSessions(await res.json() as ActiveSession[]);
      setLastRefresh(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar sessões");
    } finally {
      setLoading(false);
    }
  };

  const kickUser = async (s: ActiveSession) => {
    setKicking(true);
    setKickError(null);
    try {
      const tok = localStorage.getItem("alphafitus_token");
      const res = await fetch(`/api/users/${s.userId}/sessions`, {
        method: "DELETE",
        headers: tok ? { Authorization: `Bearer ${tok}` } : {},
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      setConfirmKick(null);
      setSessions((prev) => prev.filter((x) => x.userId !== s.userId));
    } catch (e) {
      setKickError(e instanceof Error ? e.message : "Erro ao encerrar sessão");
    } finally {
      setKicking(false);
    }
  };

  // Carga inicial + auto-refresh a cada 30s
  useEffect(() => {
    load();
    const id = setInterval(() => { load(); setTick(t => t + 1); }, 30_000);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!isAdmin) return null;

  const isSelf = (userId: number) => user?.id === userId;

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      {/* Cabeçalho */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-3">
            <Wifi className="h-6 w-6 text-green-500" />
            Usuários Online
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Última verificação: <strong>{lastRefresh.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</strong>
            {" "}· atualiza automaticamente a cada 30 s
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading} className="shrink-0 mt-1">
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </div>

      {/* Contador de sessões */}
      <div className={`flex items-center gap-3 rounded-xl border px-5 py-3 ${sessions.length > 0 ? "border-green-200 bg-green-50" : "border-muted bg-muted/30"}`}>
        <span className={`relative flex h-4 w-4 ${sessions.length > 0 ? "" : "opacity-40"}`}>
          {sessions.length > 0 && (
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
          )}
          <span className={`relative inline-flex rounded-full h-4 w-4 ${sessions.length > 0 ? "bg-green-500" : "bg-slate-400"}`} />
        </span>
        <div>
          {sessions.length > 0 ? (
            <p className="text-sm font-semibold text-green-800">
              {sessions.length === 1
                ? "1 usuário conectado agora"
                : `${sessions.length} usuários conectados agora`}
            </p>
          ) : (
            <p className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
              <WifiOff className="h-3.5 w-3.5" /> Nenhum usuário conectado no momento
            </p>
          )}
          {sessions.length > 0 && (
            <p className="text-xs text-green-700 mt-0.5">
              Sessões ativas verificadas em {lastRefresh.toLocaleTimeString("pt-BR")}
            </p>
          )}
        </div>
      </div>

      {/* Erro */}
      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Lista */}
      {!error && sessions.length > 0 && (
        <div className="rounded-xl border border-border bg-card divide-y divide-border overflow-hidden">
          {sessions.map((s, idx) => {
            const self = isSelf(s.userId);
            const loginedToday = isToday(s.loginAt);

            return (
              <div
                key={s.userId}
                className={`flex items-center gap-4 px-5 py-4 ${idx === 0 ? "" : ""}`}
              >
                {/* Avatar */}
                <div className="relative shrink-0">
                  <Avatar className="h-11 w-11 ring-2 ring-green-400 ring-offset-2">
                    <AvatarFallback className="bg-primary/10 text-primary font-bold text-sm">
                      {initials(s.displayName)}
                    </AvatarFallback>
                  </Avatar>
                  {/* Bolinha verde ONLINE */}
                  <span className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-green-500 ring-2 ring-card">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-60" />
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-white" />
                  </span>
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm leading-none">{s.displayName}</span>
                    {/* Badge ONLINE */}
                    <Badge className="text-[10px] h-4 px-1.5 bg-green-500 hover:bg-green-500 text-white gap-1 shrink-0">
                      <span className="h-1.5 w-1.5 rounded-full bg-white inline-block" />
                      ONLINE
                    </Badge>
                    {self && (
                      <Badge variant="outline" className="text-[10px] h-4 px-1.5 text-primary border-primary/40 shrink-0">
                        você
                      </Badge>
                    )}
                    <Badge variant="secondary" className="text-[10px] h-4 px-1.5 shrink-0">
                      {ROLE_LABELS[s.role] ?? s.role}
                    </Badge>
                    {s.sessionCount > 1 && (
                      <Badge variant="outline" className="text-[10px] h-4 px-1.5 text-muted-foreground shrink-0">
                        {s.sessionCount} sessões abertas
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">@{s.username}</p>
                </div>

                {/* Horário de login + botão */}
                <div className="flex items-center gap-3 shrink-0">
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground font-medium">
                      {loginedToday ? "entrou hoje às" : "entrou em"}
                    </p>
                    <p className="text-sm font-bold text-foreground tabular-nums">
                      {loginedToday ? formatTime(s.loginAt) : formatDate(s.loginAt)}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      ({formatRelative(s.loginAt)})
                    </p>
                  </div>
                  {!self && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-9 w-9 p-0 text-destructive hover:text-destructive hover:bg-destructive/10 rounded-full"
                      onClick={() => { setKickError(null); setConfirmKick(s); }}
                      title="Encerrar sessão"
                    >
                      <LogOut className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Nota de rodapé */}
      <p className="text-xs text-muted-foreground text-center pb-2">
        Sessões exibidas são as que possuem token válido (não expirado) no momento desta consulta.
        A lista é atualizada automaticamente a cada 30 segundos.
      </p>

      {/* Dialog de confirmação de encerramento */}
      <AlertDialog open={!!confirmKick} onOpenChange={(o) => { if (!o) setConfirmKick(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Encerrar sessão</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  Deseja encerrar {confirmKick && confirmKick.sessionCount > 1
                    ? `todas as ${confirmKick.sessionCount} sessões`
                    : "a sessão"} de{" "}
                  <span className="font-semibold text-foreground">{confirmKick?.displayName}</span>?
                </p>
                <p className="text-xs">
                  O usuário será desconectado imediatamente e precisará fazer login novamente.
                </p>
                {kickError && (
                  <p className="text-xs text-destructive font-medium">{kickError}</p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={kicking}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={kicking}
              onClick={(e) => {
                e.preventDefault();
                if (confirmKick) kickUser(confirmKick);
              }}
            >
              {kicking ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Encerrando…</> : "Sim, encerrar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
