import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  DatabaseBackup, CloudUpload, Clock, CheckCircle2, XCircle,
  Download, RefreshCw, HardDrive, CalendarClock, UploadCloud, AlertTriangle,
  Cloud, ShieldCheck, History,
} from "lucide-react";

interface BackupConfig {
  enabled: boolean;
  time: string;
  time2: string;
  lastRun: string | null;
  lastStatus: string | null;
  lastFile: string | null;
  backupDir: string;
}

interface BackupFile {
  filename: string;
  size: number;
  createdAt: string;
}

interface CloudBackupFile {
  filename: string;
  size: number;
  updatedAt: string;
}

interface RestoreResult {
  ok: boolean;
  protocolsRestored: number;
  lotsRestored: number;
  resultsRestored: number;
  exportedAt: string | null;
}

function fmt(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR");
}

function fmtSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(options?.headers ?? {}) },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? `Erro ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export default function BackupPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: config, isLoading } = useQuery<BackupConfig>({
    queryKey: ["backup-config"],
    queryFn: () => apiFetch("/api/backup/config"),
  });

  const { data: history = [] } = useQuery<BackupFile[]>({
    queryKey: ["backup-history"],
    queryFn: () => apiFetch("/api/backup/history"),
    refetchInterval: 30_000,
  });

  const { data: cloudHistory = [] } = useQuery<CloudBackupFile[]>({
    queryKey: ["backup-cloud-history"],
    queryFn: () => apiFetch("/api/backup/cloud-history"),
    refetchInterval: 30_000,
  });

  const [localEnabled, setLocalEnabled] = useState(false);
  const [localTime,    setLocalTime]    = useState("08:00");
  const [localTime2,   setLocalTime2]   = useState("20:00");

  useEffect(() => {
    if (!config) return;
    setLocalEnabled(config.enabled);
    setLocalTime(config.time);
    setLocalTime2(config.time2);
  }, [config]);

  const saveMut = useMutation({
    mutationFn: () =>
      apiFetch("/api/backup/config", {
        method: "PUT",
        body: JSON.stringify({ enabled: localEnabled, time: localTime, time2: localTime2 }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["backup-config"] });
      toast({ title: "Configuração salva", description: "Agendamento de backup configurado." });
    },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const runMut = useMutation({
    mutationFn: () =>
      apiFetch<{ ok: boolean; filename: string; size: number }>("/api/backup/run", { method: "POST" }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["backup-config"] });
      qc.invalidateQueries({ queryKey: ["backup-history"] });
      toast({ title: "Backup concluído!", description: `Arquivo: ${data.filename} (${fmtSize(data.size)})` });
    },
    onError: (e: Error) => toast({ title: "Erro no backup", description: e.message, variant: "destructive" }),
  });

  const [restoreFile, setRestoreFile] = useState<{ name: string; data: unknown } | null>(null);
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false);

  const restoreMut = useMutation({
    mutationFn: (data: unknown) =>
      apiFetch<RestoreResult>("/api/backup/restore", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["backup-history"] });
      setRestoreDialogOpen(false);
      setRestoreFile(null);
      if (fileRef.current) fileRef.current.value = "";
      toast({
        title: "Restore concluído!",
        description: `Protocolos: ${r.protocolsRestored} · Lotes: ${r.lotsRestored} · Resultados: ${r.resultsRestored}${r.exportedAt ? ` · Backup de ${fmt(r.exportedAt)}` : ""}`,
      });
    },
    onError: (e: Error) => {
      setRestoreDialogOpen(false);
      toast({ title: "Erro no restore", description: e.message, variant: "destructive" });
    },
  });

  const [cloudRestoreTarget, setCloudRestoreTarget] = useState<CloudBackupFile | null>(null);

  const cloudRestoreMut = useMutation({
    mutationFn: (filename: string) =>
      apiFetch<RestoreResult>(`/api/backup/cloud-restore/${encodeURIComponent(filename)}`, { method: "POST" }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["backup-history"] });
      qc.invalidateQueries({ queryKey: ["backup-cloud-history"] });
      setCloudRestoreTarget(null);
      toast({
        title: "Restauração da nuvem concluída!",
        description: `Protocolos: ${r.protocolsRestored} · Lotes: ${r.lotsRestored} · Resultados: ${r.resultsRestored}${r.exportedAt ? ` · Backup de ${fmt(r.exportedAt)}` : ""}`,
      });
    },
    onError: (e: Error) => {
      setCloudRestoreTarget(null);
      toast({ title: "Erro no restore da nuvem", description: e.message, variant: "destructive" });
    },
  });

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string) as unknown;
        setRestoreFile({ name: file.name, data });
        setRestoreDialogOpen(true);
      } catch {
        toast({ title: "Arquivo inválido", description: "O arquivo não é um JSON de backup válido.", variant: "destructive" });
        if (fileRef.current) fileRef.current.value = "";
      }
    };
    reader.readAsText(file);
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const lastOk  = config?.lastStatus === "success";
  const lastErr = config?.lastStatus === "error";

  return (
    <>
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <DatabaseBackup className="h-6 w-6 text-primary" />
            Backup de Dados
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Nenhum dado é excluído permanentemente. Faça backups regulares e restaure sempre que necessário.
          </p>
        </div>

        <div className="flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2.5">
          <ShieldCheck className="h-4 w-4 text-emerald-700 mt-0.5 shrink-0" />
          <p className="text-xs text-emerald-800">
            O backup automático está <strong>ativo por padrão</strong>, roda sozinho todo dia (nos dois horários abaixo)
            e cada cópia é enviada também para um armazenamento em nuvem separado do banco de dados — assim, mesmo em
            caso de invasão ou perda de dados, você tem como restaurar tudo rapidamente pela aba "Restaurar da Nuvem".
          </p>
        </div>

        {/* Status */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4" /> Status do Último Backup
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 text-sm mb-4">
              <div>
                <p className="text-muted-foreground text-xs uppercase tracking-wide mb-1">Último backup</p>
                <p className="font-medium">{fmt(config?.lastRun ?? null)}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs uppercase tracking-wide mb-1">Status</p>
                {config?.lastStatus ? (
                  <Badge variant={lastOk ? "default" : lastErr ? "destructive" : "secondary"} className="gap-1">
                    {lastOk
                      ? <><CheckCircle2 className="h-3 w-3" /> Sucesso</>
                      : lastErr
                        ? <><XCircle className="h-3 w-3" /> Erro</>
                        : config.lastStatus}
                  </Badge>
                ) : (
                  <span className="text-muted-foreground">Nenhum backup realizado</span>
                )}
              </div>
              <div>
                <p className="text-muted-foreground text-xs uppercase tracking-wide mb-1">Arquivo gerado</p>
                <p className="font-mono text-xs truncate">{config?.lastFile ?? "—"}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs uppercase tracking-wide mb-1">Pasta no servidor</p>
                <p className="font-mono text-xs truncate text-muted-foreground">{config?.backupDir ?? "—"}</p>
              </div>
            </div>
            <Button onClick={() => runMut.mutate()} disabled={runMut.isPending} className="gap-2">
              {runMut.isPending
                ? <><RefreshCw className="h-4 w-4 animate-spin" /> Gerando backup...</>
                : <><CloudUpload className="h-4 w-4" /> Fazer Backup Agora</>}
            </Button>
          </CardContent>
        </Card>

        {/* Agendamento */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <CalendarClock className="h-4 w-4" /> Backup Automático Diário
            </CardTitle>
            <CardDescription>
              O servidor faz backup automaticamente nos dois horários configurados abaixo, todo dia.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="backup-enabled" className="font-medium">Habilitar backup automático</Label>
                <p className="text-xs text-muted-foreground mt-0.5">Gera backups diários nos horários configurados</p>
              </div>
              <Switch id="backup-enabled" checked={localEnabled} onCheckedChange={setLocalEnabled} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="backup-time">1º horário (manhã)</Label>
                <Input
                  id="backup-time"
                  type="time"
                  value={localTime}
                  onChange={e => setLocalTime(e.target.value)}
                  disabled={!localEnabled}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="backup-time2">2º horário (noite)</Label>
                <Input
                  id="backup-time2"
                  type="time"
                  value={localTime2}
                  onChange={e => setLocalTime2(e.target.value)}
                  disabled={!localEnabled}
                />
              </div>
            </div>

            <div className="flex justify-end">
              <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending} variant="outline" className="gap-2">
                {saveMut.isPending
                  ? <><RefreshCw className="h-4 w-4 animate-spin" /> Salvando...</>
                  : "Salvar configuração"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Restaurar */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <UploadCloud className="h-4 w-4" /> Restaurar a partir de Arquivo
            </CardTitle>
            <CardDescription>
              Selecione um arquivo de backup (.json) que você baixou anteriormente para restaurar os dados.
              Registros existentes são atualizados; registros novos são inseridos.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <label htmlFor="restore-file" className="block">
              <input
                ref={fileRef}
                id="restore-file"
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={handleFileChange}
              />
              <Button variant="outline" className="gap-2 cursor-pointer" asChild>
                <span onClick={() => fileRef.current?.click()}>
                  <UploadCloud className="h-4 w-4" />
                  Selecionar arquivo de backup…
                </span>
              </Button>
            </label>
          </CardContent>
        </Card>

        {/* Restaurar da Nuvem */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Cloud className="h-4 w-4" /> Restaurar da Nuvem
            </CardTitle>
            <CardDescription>
              Cópia de segurança guardada fora do servidor. Restaure com um clique, sem precisar baixar arquivo nenhum
              — ideal em caso de ataque ou perda de dados no servidor.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {cloudHistory.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground text-sm">
                <Cloud className="h-8 w-8 mx-auto mb-2 opacity-20" />
                <p>Nenhuma cópia na nuvem ainda. Ela é criada automaticamente no próximo backup.</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {cloudHistory.map(f => (
                  <div key={f.filename} className="flex items-center justify-between py-2.5 text-sm">
                    <div>
                      <p className="font-mono text-xs">{f.filename}</p>
                      <p className="text-muted-foreground text-xs mt-0.5">
                        {fmt(f.updatedAt)} · {fmtSize(f.size)}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-1.5 h-7 text-xs text-emerald-700 hover:text-emerald-800 hover:bg-emerald-50"
                      onClick={() => setCloudRestoreTarget(f)}
                    >
                      <History className="h-3.5 w-3.5" /> Restaurar
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Histórico */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <HardDrive className="h-4 w-4" /> Histórico de Backups
            </CardTitle>
            <CardDescription>
              Últimos backups disponíveis. Baixe para guardar no computador e use para restaurar se necessário.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {history.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                <DatabaseBackup className="h-10 w-10 mx-auto mb-2 opacity-20" />
                <p>Nenhum backup realizado ainda.</p>
                <p className="mt-1">Clique em <strong>Fazer Backup Agora</strong> para criar o primeiro.</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {history.map(f => (
                  <div key={f.filename} className="flex items-center justify-between py-2.5 text-sm">
                    <div>
                      <p className="font-mono text-xs">{f.filename}</p>
                      <p className="text-muted-foreground text-xs mt-0.5">
                        {fmt(f.createdAt)} · {fmtSize(f.size)}
                      </p>
                    </div>
                    <a href={`/api/backup/download/${encodeURIComponent(f.filename)}`} download={f.filename}>
                      <Button variant="ghost" size="sm" className="gap-1.5 h-7 text-xs">
                        <Download className="h-3.5 w-3.5" /> Baixar
                      </Button>
                    </a>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Restore confirmation dialog */}
      <Dialog open={restoreDialogOpen} onOpenChange={setRestoreDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Confirmar Restauração
            </DialogTitle>
            <DialogDescription className="space-y-2 pt-2">
              <p>
                Você está prestes a restaurar o arquivo:
                <span className="block font-mono text-xs mt-1 text-foreground bg-muted px-2 py-1 rounded">{restoreFile?.name}</span>
              </p>
              <p>
                Protocolos, lotes e resultados do backup serão <strong>inseridos ou atualizados</strong> no banco de dados.
                Registros que existem tanto no backup quanto no sistema serão atualizados com os dados do backup.
              </p>
              <p className="text-amber-700 font-medium">
                Recomendamos fazer um backup atual antes de restaurar.
              </p>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setRestoreDialogOpen(false);
                setRestoreFile(null);
                if (fileRef.current) fileRef.current.value = "";
              }}
            >
              Cancelar
            </Button>
            <Button
              onClick={() => restoreFile && restoreMut.mutate(restoreFile.data)}
              disabled={restoreMut.isPending}
              className="gap-2"
            >
              {restoreMut.isPending
                ? <><RefreshCw className="h-4 w-4 animate-spin" /> Restaurando...</>
                : <><UploadCloud className="h-4 w-4" /> Restaurar agora</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cloud restore confirmation dialog */}
      <Dialog open={!!cloudRestoreTarget} onOpenChange={(open) => !open && setCloudRestoreTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Confirmar Restauração da Nuvem
            </DialogTitle>
            <DialogDescription className="space-y-2 pt-2">
              <p>
                Você está prestes a restaurar a cópia da nuvem:
                <span className="block font-mono text-xs mt-1 text-foreground bg-muted px-2 py-1 rounded">{cloudRestoreTarget?.filename}</span>
              </p>
              <p>
                Protocolos, lotes e resultados desse backup serão <strong>inseridos ou atualizados</strong> no banco de dados atual.
              </p>
              <p className="text-amber-700 font-medium">
                Recomendamos fazer um backup atual antes de restaurar.
              </p>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCloudRestoreTarget(null)}>
              Cancelar
            </Button>
            <Button
              onClick={() => cloudRestoreTarget && cloudRestoreMut.mutate(cloudRestoreTarget.filename)}
              disabled={cloudRestoreMut.isPending}
              className="gap-2 bg-emerald-600 hover:bg-emerald-700"
            >
              {cloudRestoreMut.isPending
                ? <><RefreshCw className="h-4 w-4 animate-spin" /> Restaurando...</>
                : <><Cloud className="h-4 w-4" /> Restaurar da nuvem</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
