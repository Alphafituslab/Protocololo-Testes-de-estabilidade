import { useState, useRef, useEffect, useCallback, useMemo, Fragment } from "react";
import {
  useUpdateProtocol,
  getGetProtocolQueryKey,
  getListLotsQueryKey,
  getListResultsQueryKey,
  getGetKineticsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { RotateCcw, Trash2, Plus, Download, Eye, EyeOff, Loader2, Save, Database, SaveAll, History as HistoryIcon, ShieldAlert } from "lucide-react";
import { AuditBadge } from "@/components/audit-badge";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/use-auth";
import { fmtDate } from "@/lib/utils";
import { STATUS_LABELS, STATUS_COLORS } from "./shared";

type ProtocolSnapshot = {
  id: number;
  protocolId: number;
  label: string;
  createdBy: string;
  createdAt: string;
};


function VersionsTab({ protocolId }: { protocolId: number }) {
  const { token } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: snapshots = [], isLoading, refetch } = useQuery<ProtocolSnapshot[]>({
    queryKey: ["snapshots", protocolId],
    queryFn: async () => {
      const res = await fetch(`/api/protocols/${protocolId}/snapshots`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("Erro ao carregar versões.");
      return res.json() as Promise<ProtocolSnapshot[]>;
    },
    staleTime: 15_000,
  });

  const [createOpen, setCreateOpen] = useState(false);
  const [createLabel, setCreateLabel] = useState("");
  const [creating, setCreating] = useState(false);

  const [restoreTarget, setRestoreTarget] = useState<ProtocolSnapshot | null>(null);
  const [restorePassword, setRestorePassword] = useState("");
  const [restoreError, setRestoreError] = useState("");
  const [restoring, setRestoring] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<ProtocolSnapshot | null>(null);
  const [deleting, setDeleting] = useState(false);

  const handleCreate = async () => {
    setCreating(true);
    try {
      const res = await fetch(`/api/protocols/${protocolId}/snapshots`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ label: createLabel.trim() || undefined }),
      });
      if (!res.ok) throw new Error("Erro ao salvar versão.");
      toast({ title: "Versão salva!", description: "O estado atual do protocolo foi salvo." });
      setCreateOpen(false);
      setCreateLabel("");
      queryClient.invalidateQueries({ queryKey: ["snapshots", protocolId] });
    } catch (e: unknown) {
      toast({ title: "Erro", description: e instanceof Error ? e.message : "Erro desconhecido.", variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/protocols/${protocolId}/snapshots/${deleteTarget.id}`, {
        method: "DELETE",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("Erro ao excluir versão.");
      toast({ title: "Versão excluída", description: `"${deleteTarget.label}" foi removida.` });
      setDeleteTarget(null);
      queryClient.invalidateQueries({ queryKey: ["snapshots", protocolId] });
    } catch (e: unknown) {
      toast({ title: "Erro", description: e instanceof Error ? e.message : "Erro desconhecido.", variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };

  const handleRestore = async () => {
    if (!restoreTarget) return;
    setRestoreError("");
    setRestoring(true);
    try {
      const res = await fetch(`/api/protocols/${protocolId}/snapshots/${restoreTarget.id}/restore`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ password: restorePassword }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "Erro ao restaurar." })) as { error?: string };
        setRestoreError(body.error ?? "Erro ao restaurar.");
        setRestoring(false);
        return;
      }
      toast({
        title: "Protocolo restaurado!",
        description: `Restaurado para "${restoreTarget.label}". Recarregue a página para ver todas as alterações.`,
      });
      setRestoreTarget(null);
      setRestorePassword("");
      queryClient.invalidateQueries({ queryKey: ["snapshots", protocolId] });
      queryClient.invalidateQueries({ queryKey: getGetProtocolQueryKey(protocolId) });
      queryClient.invalidateQueries({ queryKey: getListLotsQueryKey(protocolId) });
      queryClient.invalidateQueries({ queryKey: getListResultsQueryKey(protocolId) });
      queryClient.invalidateQueries({ queryKey: getGetKineticsQueryKey(protocolId) });
    } catch {
      setRestoreError("Erro inesperado. Tente novamente.");
    } finally {
      setRestoring(false);
    }
  };

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleString("pt-BR", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });

  const isAuto = (label: string) => label.startsWith("Auto:");

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">
            Salve o estado completo do protocolo a qualquer momento — lotes, resultados e parâmetros.
            Para restaurar uma versão anterior, use o botão <strong>Restaurar</strong> na linha desejada.
          </p>
          <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
            <ShieldAlert className="h-3.5 w-3.5 text-amber-500" />
            Versões automáticas são criadas antes de cada Finalização. A restauração requer senha mestra.
          </p>
        </div>
        <Button onClick={() => { setCreateLabel(""); setCreateOpen(true); }} className="gap-2 shrink-0">
          <SaveAll className="h-4 w-4" /> Salvar versão agora
        </Button>
      </div>

      {/* Create dialog */}
      <AlertDialog open={createOpen} onOpenChange={(o) => { if (!o) setCreateOpen(false); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <SaveAll className="h-5 w-5 text-primary" /> Salvar versão atual
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>Será salvo um snapshot completo do protocolo: dados gerais, lotes e todos os resultados de análise.</p>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">Descrição (opcional)</label>
                  <Input
                    placeholder="ex: Antes de inserir resultados T6"
                    value={createLabel}
                    onChange={(e) => setCreateLabel(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); }}
                    autoFocus
                  />
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={creating} onClick={() => setCreateOpen(false)}>Cancelar</AlertDialogCancel>
            <Button onClick={handleCreate} disabled={creating}>
              {creating ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Salvando…</> : "Salvar versão"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete dialog */}
      <AlertDialog open={deleteTarget !== null} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-red-700">
              <Trash2 className="h-5 w-5" /> Excluir versão
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>Tem certeza que deseja excluir a versão <strong className="text-foreground">"{deleteTarget?.label}"</strong>?</p>
                <p className="text-xs text-muted-foreground">Esta ação é permanente e não pode ser desfeita. Os dados do protocolo atual não serão afetados.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting} onClick={() => setDeleteTarget(null)}>Cancelar</AlertDialogCancel>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Excluindo…</> : "Excluir versão"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Restore dialog */}
      <AlertDialog open={restoreTarget !== null} onOpenChange={(o) => { if (!o) { setRestoreTarget(null); setRestorePassword(""); setRestoreError(""); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-red-700">
              <RotateCcw className="h-5 w-5" /> Restaurar versão
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  Restaurar para: <strong className="text-foreground">{restoreTarget?.label}</strong>
                  <br />
                  <span className="text-xs text-muted-foreground">{restoreTarget ? fmtDate(restoreTarget.createdAt) : ""} · por {restoreTarget?.createdBy}</span>
                </p>
                <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 space-y-1">
                  <p className="font-semibold">⚠ Esta ação é IRREVERSÍVEL.</p>
                  <p>O estado atual do protocolo (lotes + resultados + parâmetros) será substituído pela versão selecionada. Uma cópia do estado atual será salva automaticamente antes de restaurar.</p>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">Senha mestra para confirmar:</label>
                  <Input
                    type="password"
                    placeholder="Senha mestra"
                    autoComplete="off"
                    value={restorePassword}
                    onChange={(e) => { setRestorePassword(e.target.value); setRestoreError(""); }}
                    onKeyDown={(e) => { if (e.key === "Enter") handleRestore(); }}
                    autoFocus
                  />
                  {restoreError && <p className="text-xs text-red-600">{restoreError}</p>}
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={restoring} onClick={() => { setRestoreTarget(null); setRestorePassword(""); setRestoreError(""); }}>
              Cancelar
            </AlertDialogCancel>
            <Button variant="destructive" onClick={handleRestore} disabled={restoring || !restorePassword}>
              {restoring ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Restaurando…</> : "Restaurar esta versão"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Snapshots list */}
      {isLoading ? (
        <div className="flex items-center gap-2 py-8 text-muted-foreground justify-center">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">Carregando versões…</span>
        </div>
      ) : snapshots.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground space-y-2">
          <HistoryIcon className="h-10 w-10 mx-auto opacity-20" />
          <p className="text-sm font-medium">Nenhuma versão salva ainda.</p>
          <p className="text-xs">Clique em <strong>Salvar versão agora</strong> para criar o primeiro checkpoint.</p>
        </div>
      ) : (
        <div className="rounded-md border divide-y divide-border">
          {snapshots.map((snap) => (
            <div key={snap.id} className={`flex items-center justify-between gap-4 px-4 py-3 ${isAuto(snap.label) ? "bg-slate-50/60" : "bg-white"}`}>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  {isAuto(snap.label) ? (
                    <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200 font-medium">
                      <RotateCcw className="h-2.5 w-2.5" /> AUTO
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 border border-blue-200 font-medium">
                      <SaveAll className="h-2.5 w-2.5" /> MANUAL
                    </span>
                  )}
                  <span className="text-sm font-medium text-foreground truncate">{snap.label}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {fmtDate(snap.createdAt)} · {snap.createdBy}
                </p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 h-7 text-xs border-amber-300 text-amber-700 hover:bg-amber-50"
                  onClick={() => { setRestoreTarget(snap); setRestorePassword(""); setRestoreError(""); }}
                >
                  <RotateCcw className="h-3 w-3" /> Restaurar
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-slate-400 hover:text-red-500 hover:bg-red-50"
                  title="Excluir esta versão"
                  onClick={() => setDeleteTarget(snap)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex justify-end">
        <Button variant="ghost" size="sm" onClick={() => refetch()} className="text-xs gap-1.5 text-muted-foreground">
          <HistoryIcon className="h-3.5 w-3.5" /> Atualizar lista
        </Button>
      </div>
    </div>
  );
}


export { VersionsTab };
