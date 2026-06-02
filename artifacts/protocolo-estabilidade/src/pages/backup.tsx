import { useState, useEffect } from "react";
  import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
  import { Button } from "@/components/ui/button";
  import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
  import { Badge } from "@/components/ui/badge";
  import { Switch } from "@/components/ui/switch";
  import { Label } from "@/components/ui/label";
  import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
  import { Input } from "@/components/ui/input";
  import { useToast } from "@/hooks/use-toast";
  import {
    DatabaseBackup, CloudUpload, Clock, CheckCircle2, XCircle,
    Download, RefreshCw, HardDrive, CalendarClock, Info,
  } from "lucide-react";

  interface BackupConfig {
    enabled: boolean;
    schedule: string;
    time: string;
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

    const { data: config, isLoading } = useQuery<BackupConfig>({
      queryKey: ["backup-config"],
      queryFn: () => apiFetch("/api/backup/config"),
    });

    const { data: history = [] } = useQuery<BackupFile[]>({
      queryKey: ["backup-history"],
      queryFn: () => apiFetch("/api/backup/history"),
    });

    const [localEnabled,  setLocalEnabled]  = useState(false);
    const [localSchedule, setLocalSchedule] = useState("daily");
    const [localTime,     setLocalTime]     = useState("02:00");

    useEffect(() => {
      if (!config) return;
      setLocalEnabled(config.enabled);
      setLocalSchedule(config.schedule);
      setLocalTime(config.time);
    }, [config]);

    const saveMut = useMutation({
      mutationFn: () =>
        apiFetch("/api/backup/config", {
          method: "PUT",
          body: JSON.stringify({ enabled: localEnabled, schedule: localSchedule, time: localTime }),
        }),
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: ["backup-config"] });
        toast({ title: "Configuração salva", description: "Backup configurado com sucesso." });
      },
      onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
    });

    const runMut = useMutation({
      mutationFn: () =>
        apiFetch<{ ok: boolean; filename: string; size: number }>("/api/backup/run", { method: "POST" }),
      onSuccess: (data) => {
        qc.invalidateQueries({ queryKey: ["backup-config"] });
        qc.invalidateQueries({ queryKey: ["backup-history"] });
        toast({
          title: "Backup concluído!",
          description: `Arquivo: ${data.filename} (${fmtSize(data.size)})`,
        });
      },
      onError: (e: Error) => toast({ title: "Erro no backup", description: e.message, variant: "destructive" }),
    });

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
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <DatabaseBackup className="h-6 w-6 text-primary" />
            Backup de Dados
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Exporte e proteja os dados do sistema. Configure o backup automático para sua pasta do Google Drive.
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
                  <Badge
                    variant={lastOk ? "default" : lastErr ? "destructive" : "secondary"}
                    className="gap-1"
                  >
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
                <p className="text-muted-foreground text-xs uppercase tracking-wide mb-1">Pasta de destino</p>
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

        {/* Configuração */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <CalendarClock className="h-4 w-4" /> Backup Automático
            </CardTitle>
            <CardDescription>
              Configure o agendamento. Na instalação local (Docker), o backup é disparado também pela tarefa agendada do Windows.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="backup-enabled" className="font-medium">Habilitar backup automático</Label>
                <p className="text-xs text-muted-foreground mt-0.5">Salva automaticamente conforme o agendamento abaixo</p>
              </div>
              <Switch id="backup-enabled" checked={localEnabled} onCheckedChange={setLocalEnabled} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Frequência</Label>
                <Select value={localSchedule} onValueChange={setLocalSchedule} disabled={!localEnabled}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Diário</SelectItem>
                    <SelectItem value="weekly">Semanal (toda segunda-feira)</SelectItem>
                    <SelectItem value="manual">Somente manual</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="backup-time">Horário</Label>
                <Input
                  id="backup-time"
                  type="time"
                  value={localTime}
                  onChange={e => setLocalTime(e.target.value)}
                  disabled={!localEnabled || localSchedule === "manual"}
                />
              </div>
            </div>

            <div className="flex items-start gap-2 rounded-md bg-blue-50 border border-blue-200 p-3 text-xs text-blue-700">
              <Info className="h-4 w-4 mt-0.5 shrink-0" />
              <div>
                <p className="font-medium">Para salvar no Google Drive automaticamente:</p>
                <p className="mt-0.5">
                  Instale o <strong>Google Drive para Desktop</strong> e configure o caminho no arquivo
                  <code className="mx-1 px-1 bg-blue-100 rounded">backup-googledrive.bat</code>
                  do instalador para apontar para sua pasta do Drive.
                </p>
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

        {/* Histórico */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <HardDrive className="h-4 w-4" /> Histórico de Backups
            </CardTitle>
            <CardDescription>
              Últimos backups disponíveis para download direto.
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
    );
  }
  