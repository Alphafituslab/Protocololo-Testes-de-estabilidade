import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import {
  History, Plus, Download, RotateCcw, ShieldAlert,
  Clock, User, HardDrive, Loader2, Search, CheckCircle2,
  AlertTriangle, Info, FolderOpen,
} from "lucide-react";

/**
 * Download a blob using the File System Access API ("Save As" dialog).
 * Falls back to a regular <a download> if the API is not available.
 */
async function saveFileAs(blob: Blob, suggestedName: string): Promise<void> {
  if ("showSaveFilePicker" in window) {
    try {
      const handle = await (window as unknown as {
        showSaveFilePicker: (opts: object) => Promise<{ createWritable: () => Promise<{ write: (b: Blob) => Promise<void>; close: () => Promise<void> }> }>;
      }).showSaveFilePicker({
        suggestedName,
        types: [{ description: "Arquivo JSON de backup", accept: { "application/json": [".json"] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return;
    } catch (e) {
      // User cancelled — don't fall through to auto-download
      if ((e as Error).name === "AbortError") return;
    }
  }
  // Fallback: browser default download (no folder picker)
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = suggestedName;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 1000);
}

/**
 * Fetch snapshot data from API and save via "Save As" dialog (or browser default).
 */
async function downloadSnapshot(id: number, createdAt: string): Promise<void> {
  const res = await fetch(`/api/global-snapshots/${id}/download`, { credentials: "include" });
  if (!res.ok) throw new Error(`Erro ${res.status} ao buscar snapshot`);
  const text = await res.text();
  const blob = new Blob([text], { type: "application/json" });
  const ts = new Date(createdAt).toISOString().replace(/[:.]/g, "-").slice(0, 19);
  await saveFileAs(blob, `alphafitus-backup-${id}-${ts}.json`);
}

interface Snapshot {
  id: number;
  label: string;
  notes: string | null;
  createdAt: string;
  createdBy: string;
  isAuto: boolean;
  sizeBytes: number;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

function fmtSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

async function apiFetch<T>(url: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(opts?.headers ?? {}) },
    ...opts,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? `Erro ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export default function SnapshotsGlobalPage() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: snapshots = [], isLoading } = useQuery<Snapshot[]>({
    queryKey: ["global-snapshots"],
    queryFn: () => apiFetch("/api/global-snapshots"),
  });

  // ── Create snapshot ───────────────────────────────────────────────────────
  const [createOpen, setCreateOpen] = useState(false);
  const [createLabel, setCreateLabel] = useState("");
  const [createNotes, setCreateNotes] = useState("");

  const createMut = useMutation({
    mutationFn: () =>
      apiFetch<Snapshot>("/api/global-snapshots", {
        method: "POST",
        body: JSON.stringify({ label: createLabel.trim() || undefined, notes: createNotes.trim() || undefined }),
      }),
    onSuccess: (snap) => {
      qc.invalidateQueries({ queryKey: ["global-snapshots"] });
      toast({ title: "Snapshot criado!", description: snap.label });
      setCreateOpen(false);
      setCreateLabel("");
      setCreateNotes("");
    },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  // ── Restore dialog ────────────────────────────────────────────────────────
  const [restoreTarget, setRestoreTarget] = useState<Snapshot | null>(null);
  const [restorePassword, setRestorePassword] = useState("");
  const [isDownloadingBefore, setIsDownloadingBefore] = useState(false);

  const restoreMut = useMutation({
    mutationFn: () =>
      apiFetch<{ ok: boolean; restoredLabel: string }>(`/api/global-snapshots/${restoreTarget!.id}/restore`, {
        method: "POST",
        body: JSON.stringify({ password: restorePassword }),
      }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["global-snapshots"] });
      toast({
        title: "Sistema restaurado com sucesso!",
        description: `Restaurado para: ${data.restoredLabel}. Um backup automático da versão anterior foi salvo.`,
      });
      setRestoreTarget(null);
      setRestorePassword("");
    },
    onError: (e: Error) => toast({ title: "Erro na restauração", description: e.message, variant: "destructive" }),
  });

  async function handleDownloadBefore() {
    if (!restoreTarget) return;
    setIsDownloadingBefore(true);
    try {
      const snap = await apiFetch<Snapshot>("/api/global-snapshots", {
        method: "POST",
        body: JSON.stringify({ label: "Backup manual antes de restaurar" }),
      });
      qc.invalidateQueries({ queryKey: ["global-snapshots"] });
      await downloadSnapshot(snap.id, snap.createdAt);
      toast({ title: "Backup salvo!", description: snap.label });
    } catch (e) {
      toast({ title: "Erro ao baixar backup", description: (e as Error).message, variant: "destructive" });
    } finally {
      setIsDownloadingBefore(false);
    }
  }

  // ── Export now ────────────────────────────────────────────────────────────
  const [isExporting, setIsExporting] = useState(false);

  async function handleExportNow() {
    setIsExporting(true);
    try {
      const snap = await apiFetch<Snapshot>("/api/global-snapshots", {
        method: "POST",
        body: JSON.stringify({ label: `Exportação manual — ${new Date().toLocaleString("pt-BR")}` }),
      });
      qc.invalidateQueries({ queryKey: ["global-snapshots"] });
      await downloadSnapshot(snap.id, snap.createdAt);
      toast({ title: "Banco exportado!", description: "Arquivo salvo no local escolhido." });
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        toast({ title: "Erro na exportação", description: (e as Error).message, variant: "destructive" });
      }
    } finally {
      setIsExporting(false);
    }
  }

  // ── Date/time filter ──────────────────────────────────────────────────────
  const [filterDate, setFilterDate] = useState("");
  const [filterTime, setFilterTime] = useState("");

  const targetTs = useMemo(() => {
    if (!filterDate) return null;
    const dateStr = filterDate + (filterTime ? `T${filterTime}:00` : "T00:00:00");
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? null : d.getTime();
  }, [filterDate, filterTime]);

  const nearestId = useMemo(() => {
    if (targetTs === null || snapshots.length === 0) return null;
    let best = snapshots[0];
    let bestDiff = Math.abs(new Date(best.createdAt).getTime() - targetTs);
    for (const s of snapshots) {
      const diff = Math.abs(new Date(s.createdAt).getTime() - targetTs);
      if (diff < bestDiff) { best = s; bestDiff = diff; }
    }
    return best.id;
  }, [targetTs, snapshots]);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <History className="h-6 w-6 text-primary" />
            Snapshots &amp; Restauração
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Salve e restaure o estado completo do banco de dados (protocolos, lotes, resultados e metodologias).
            Snapshots nunca são excluídos automaticamente.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" /> Criar Snapshot
        </Button>
      </div>

      {/* Export now */}
      <Card className="border-primary/30 bg-primary/5">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <FolderOpen className="h-4 w-4 text-primary" /> Exportar banco de dados para o seu computador
          </CardTitle>
          <CardDescription>
            Cria um snapshot da versão atual e abre o diálogo <strong>"Salvar como…"</strong> para você escolher
            a pasta no seu computador onde o arquivo JSON será salvo.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={handleExportNow} disabled={isExporting} className="gap-2">
            {isExporting
              ? <><Loader2 className="h-4 w-4 animate-spin" /> Gerando arquivo...</>
              : <><FolderOpen className="h-4 w-4" /> Exportar agora — Salvar como...</>}
          </Button>
          <p className="text-xs text-muted-foreground mt-2">
            O arquivo também fica salvo na lista de snapshots abaixo, no servidor, como garantia adicional.
          </p>
        </CardContent>
      </Card>

      {/* Date/time finder */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Search className="h-4 w-4" /> Encontrar snapshot por data e horário
          </CardTitle>
          <CardDescription>
            Informe a data e hora desejada — o snapshot mais próximo ficará destacado na lista abaixo.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-3">
            <div className="space-y-1.5 flex-1">
              <Label>Voltar até a data</Label>
              <Input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)} />
            </div>
            <div className="space-y-1.5 flex-1">
              <Label>Horário</Label>
              <Input type="time" value={filterTime} onChange={e => setFilterTime(e.target.value)} />
            </div>
            <Button
              variant="outline"
              onClick={() => { setFilterDate(""); setFilterTime(""); }}
              disabled={!filterDate}
              className="mb-0"
            >
              Limpar
            </Button>
          </div>
          {nearestId !== null && (
            <div className="mt-3 flex items-center gap-2 text-sm text-primary bg-primary/5 border border-primary/20 rounded-md px-3 py-2">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              Snapshot mais próximo destacado na lista abaixo — clique em <strong>Restaurar</strong> para utilizá-lo.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Snapshot list */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="h-4 w-4" /> Histórico de Snapshots
          </CardTitle>
          <CardDescription>
            {snapshots.length === 0
              ? "Nenhum snapshot criado ainda."
              : `${snapshots.length} snapshot${snapshots.length > 1 ? "s" : ""} — mais recente primeiro.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> Carregando...
            </div>
          ) : snapshots.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">
              <History className="h-10 w-10 mx-auto mb-3 opacity-20" />
              <p>Nenhum snapshot ainda. Clique em <strong>Criar Snapshot</strong> para salvar o estado atual.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {snapshots.map(s => {
                const isNearest = s.id === nearestId;
                return (
                  <div
                    key={s.id}
                    className={`rounded-lg border p-3 transition-colors ${
                      isNearest
                        ? "border-primary bg-primary/5 shadow-sm"
                        : "border-border bg-card hover:bg-secondary/30"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          {isNearest && (
                            <Badge className="text-[10px] h-4 px-1.5 bg-primary text-primary-foreground">
                              ← mais próximo
                            </Badge>
                          )}
                          <Badge
                            variant={s.isAuto ? "secondary" : "outline"}
                            className="text-[10px] h-4 px-1.5"
                          >
                            {s.isAuto ? "Auto" : "Manual"}
                          </Badge>
                          <span className="text-sm font-medium truncate">{s.label}</span>
                        </div>
                        {s.notes && (
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{s.notes}</p>
                        )}
                        <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground flex-wrap">
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {fmtDate(s.createdAt)}
                          </span>
                          <span className="flex items-center gap-1">
                            <User className="h-3 w-3" />
                            {s.createdBy}
                          </span>
                          <span className="flex items-center gap-1">
                            <HardDrive className="h-3 w-3" />
                            {fmtSize(s.sizeBytes)}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 gap-1.5 text-xs"
                          onClick={() => downloadSnapshot(s.id, s.createdAt).catch(e => {
                            if ((e as Error).name !== "AbortError") toast({ title: "Erro ao baixar", description: (e as Error).message, variant: "destructive" });
                          })}
                        >
                          <Download className="h-3.5 w-3.5" /> Baixar
                        </Button>
                        <Button
                          size="sm"
                          variant={isNearest ? "default" : "outline"}
                          className="h-8 gap-1.5 text-xs"
                          onClick={() => { setRestoreTarget(s); setRestorePassword(""); }}
                        >
                          <RotateCcw className="h-3.5 w-3.5" /> Restaurar
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create snapshot dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5" /> Criar Snapshot
            </DialogTitle>
            <DialogDescription>
              Salva uma fotografia completa do banco de dados neste momento.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div className="space-y-1.5">
              <Label>Rótulo (opcional)</Label>
              <Input
                placeholder="Ex: Antes da atualização de junho"
                value={createLabel}
                onChange={e => setCreateLabel(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Observações (opcional)</Label>
              <Textarea
                placeholder="Motivo ou contexto deste snapshot..."
                rows={3}
                value={createNotes}
                onChange={e => setCreateNotes(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button>
            <Button onClick={() => createMut.mutate()} disabled={createMut.isPending} className="gap-2">
              {createMut.isPending
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Salvando...</>
                : <><Plus className="h-4 w-4" /> Criar Snapshot</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Restore dialog */}
      <Dialog open={!!restoreTarget} onOpenChange={(o) => { if (!o && !restoreMut.isPending) { setRestoreTarget(null); setRestorePassword(""); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <ShieldAlert className="h-5 w-5" /> Confirmar Restauração
            </DialogTitle>
            <DialogDescription>
              Esta operação substituirá todos os dados atuais pelos dados do snapshot selecionado.
            </DialogDescription>
          </DialogHeader>

          {restoreTarget && (
            <div className="space-y-4">
              <div className="rounded-md bg-secondary p-3 text-sm space-y-1">
                <p className="font-medium">{restoreTarget.label}</p>
                <p className="text-muted-foreground text-xs">{fmtDate(restoreTarget.createdAt)} · {restoreTarget.createdBy}</p>
              </div>

              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  Um <strong>snapshot automático da versão atual</strong> será criado antes de restaurar,
                  garantindo que você possa voltar para o estado de agora se necessário.
                </AlertDescription>
              </Alert>

              <div className="rounded-md border p-3 space-y-2">
                <p className="text-sm font-medium flex items-center gap-2">
                  <Download className="h-4 w-4" /> Salvar versão atual na sua máquina
                </p>
                <p className="text-xs text-muted-foreground">
                  Além do backup automático no servidor, você pode baixar o estado atual como arquivo JSON.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2 w-full"
                  onClick={handleDownloadBefore}
                  disabled={isDownloadingBefore || restoreMut.isPending}
                >
                  {isDownloadingBefore
                    ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Gerando download...</>
                    : <><Download className="h-3.5 w-3.5" /> Baixar backup atual antes de restaurar</>}
                </Button>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="restore-pwd" className="flex items-center gap-1.5">
                  <ShieldAlert className="h-4 w-4 text-destructive" />
                  Senha mestra para confirmar
                </Label>
                <Input
                  id="restore-pwd"
                  type="password"
                  placeholder="Digite a senha mestra..."
                  value={restorePassword}
                  onChange={e => setRestorePassword(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && restorePassword) restoreMut.mutate(); }}
                  disabled={restoreMut.isPending}
                />
              </div>

              {restoreMut.isError && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>{(restoreMut.error as Error).message}</AlertDescription>
                </Alert>
              )}
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => { setRestoreTarget(null); setRestorePassword(""); restoreMut.reset(); }}
              disabled={restoreMut.isPending}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => restoreMut.mutate()}
              disabled={!restorePassword || restoreMut.isPending}
              className="gap-2"
            >
              {restoreMut.isPending
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Restaurando...</>
                : <><RotateCcw className="h-4 w-4" /> Confirmar Restauração</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
