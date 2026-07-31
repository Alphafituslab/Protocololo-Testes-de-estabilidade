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
import { RefreshCw, Wifi, LogOut, Loader2 } from "lucide-react";
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
  if (diff < 60) return "agora";
  if (diff < 3600) return `há ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `há ${Math.floor(diff / 3600)}h`;
  return `há ${Math.floor(diff / 86400)}d`;
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
      // Remove da lista localmente antes do próximo auto-refresh
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
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!isAdmin) return null;

  const isCurrentUser = (userId: number) => user?.id === userId;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500" />
            </span>
            Usuários Online
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {sessions.length} sessão(ões) ativa(s) · atualizado {formatRelative(lastRefresh.toISOString())}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </div>

      {/* Erro de carregamento */}
      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Lista */}
      {!error && (
        <div className="rounded-lg border border-border bg-card divide-y divide-border">
          {sessions.length === 0 && !loading && (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
              <Wifi className="h-8 w-8 opacity-30" />
              <p className="text-sm">Nenhuma sessão ativa no momento</p>
            </div>
          )}
          {sessions.map((s) => {
            const isSelf = isCurrentUser(s.userId);
            return (
              <div key={s.userId} className="flex items-center gap-4 px-5 py-4">
                {/* Avatar com indicador online */}
                <div className="relative shrink-0">
                  <Avatar className="h-10 w-10">
                    <AvatarFallback className="bg-primary/10 text-primary font-semibold text-sm">
                      {initials(s.displayName)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="absolute -bottom-0.5 -right-0.5 block h-3 w-3 rounded-full bg-green-500 ring-2 ring-card" />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">{s.displayName}</span>
                    {isSelf && (
                      <Badge variant="outline" className="text-[10px] h-4 px-1.5 text-primary border-primary/40">
                        você
                      </Badge>
                    )}
                    <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
                      {ROLE_LABELS[s.role] ?? s.role}
                    </Badge>
                    {s.sessionCount > 1 && (
                      <Badge variant="outline" className="text-[10px] h-4 px-1.5 text-muted-foreground">
                        {s.sessionCount} sessões
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">@{s.username}</p>
                </div>

                {/* Tempo + botão encerrar */}
                <div className="flex items-center gap-3 shrink-0">
                  <div className="text-right">
                    <p className="text-xs font-medium text-muted-foreground">logado</p>
                    <p className="text-xs text-foreground">{formatRelative(s.loginAt)}</p>
                  </div>
                  {!isSelf && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 px-2 text-destructive hover:text-destructive hover:bg-destructive/10"
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

      {/* Nota */}
      <p className="text-xs text-muted-foreground text-center">
        Encerrar a sessão de um usuário desconecta-o imediatamente. A lista atualiza a cada 30 segundos.
      </p>

      {/* Dialog de confirmação */}
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
