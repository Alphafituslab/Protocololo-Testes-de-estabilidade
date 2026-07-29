/**
 * BackupDownloadWatcher — montado dentro do AuthProvider (App.tsx).
 *
 * Abre o diálogo de download no computador nas três situações:
 *  1. Horários agendados (08:45, 14:00, 16:30): polling a cada 60 s detecta
 *     que um novo backup foi gerado e mostra o diálogo imediatamente.
 *  2. Primeiro login do dia (ou após logout/login): ao detectar que o usuário
 *     acaba de autenticar, dispara um poll imediato — qualquer backup gerado
 *     desde o último download oferecido será apresentado.
 *  3. Backup manual: a página de Backup dispara o CustomEvent "backup-completed"
 *     e o diálogo aparece instantaneamente.
 *
 * Por arquivo: o diálogo só aparece UMA vez por filename. Após clicar em
 * "Baixar" ou "Não agora", o nome é gravado em localStorage e o diálogo não
 * reaparece para aquele arquivo específico. Na próxima geração (novo filename)
 * o ciclo recomeça.
 */
import { useState, useEffect, useRef, useCallback } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { DatabaseBackup, Download, X, RefreshCw, ShieldCheck, Clock } from "lucide-react";
import { useAuth } from "@/contexts/use-auth";

const OFFERED_KEY = "backup.last_offered_filename";

function fmtSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}
function fmtDate(iso: string | null | undefined) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

interface BackupOffer {
  filename: string;
  size?: number;
  exportedAt?: string;
}

export interface BackupCompletedDetail {
  filename: string;
  size?: number;
  exportedAt?: string;
}

export default function BackupDownloadWatcher() {
  const { token, user } = useAuth();

  const [offer, setOffer] = useState<BackupOffer | null>(null);
  const [downloading, setDownloading] = useState(false);
  const prevUsernameRef = useRef<string | null>(null);

  // ── Checa o servidor e oferece download se houver backup novo ────────────
  const pollConfig = useCallback(async (tok: string | null) => {
    if (!tok) return;
    try {
      const res = await fetch("/api/backup/config", {
        credentials: "include",
        headers: { "Authorization": `Bearer ${tok}` },
      });
      if (!res.ok) return; // sem permissão ou não autenticado — silencioso
      const data = await res.json() as {
        lastFile?: string; lastStatus?: string; lastRun?: string;
      };
      if (data.lastFile && data.lastStatus === "success") {
        const lastOffered = localStorage.getItem(OFFERED_KEY) ?? "";
        if (data.lastFile !== lastOffered) {
          setOffer({
            filename: data.lastFile,
            exportedAt: data.lastRun ?? undefined,
          });
        }
      }
    } catch { /* silencioso */ }
  }, []);

  // ── Polling a cada 60 s enquanto autenticado ──────────────────────────────
  useEffect(() => {
    if (!token) return;
    const id = setInterval(() => pollConfig(token), 60_000);
    return () => clearInterval(id);
  }, [token, pollConfig]);

  // ── Dispara poll imediato ao fazer login / ao iniciar com sessão salva ────
  // Garante que "primeiro login da manhã" veja o backup das 08:45 imediatamente.
  useEffect(() => {
    const username = user?.username ?? null;
    if (username && username !== prevUsernameRef.current) {
      // Novo usuário logado (login fresh ou sessão restaurada na abertura)
      prevUsernameRef.current = username;
      pollConfig(token);
    } else if (!username) {
      prevUsernameRef.current = null;
    }
  }, [user, token, pollConfig]);

  // ── Ouve backup manual disparado pela página de Backup ────────────────────
  useEffect(() => {
    const handler = (e: Event) => {
      const { filename, size, exportedAt } = (e as CustomEvent<BackupCompletedDetail>).detail;
      // Backup manual: remove o "já oferecido" para forçar o diálogo sempre
      localStorage.removeItem(OFFERED_KEY);
      setOffer({ filename, size, exportedAt });
    };
    window.addEventListener("backup-completed", handler);
    return () => window.removeEventListener("backup-completed", handler);
  }, []);

  // ── Ações do diálogo ───────────────────────────────────────────────────────
  const dismiss = () => {
    if (offer) localStorage.setItem(OFFERED_KEY, offer.filename);
    setOffer(null);
  };

  const doDownload = async () => {
    if (!offer || !token) return;
    setDownloading(true);
    try {
      const res = await fetch(
        `/api/backup/download/${encodeURIComponent(offer.filename)}`,
        { credentials: "include", headers: { "Authorization": `Bearer ${token}` } }
      );
      if (!res.ok) throw new Error(`Erro ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = offer.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      localStorage.setItem(OFFERED_KEY, offer.filename);
      setOffer(null);
    } catch (err) {
      console.error("Falha no download do backup:", err);
    } finally {
      setDownloading(false);
    }
  };

  // Não renderiza nada se não houver oferta pendente
  if (!offer) return null;

  return (
    <Dialog open onOpenChange={(open) => { if (!open) dismiss(); }}>
      <DialogContent className="max-w-md print:hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <DatabaseBackup className="h-5 w-5 text-primary shrink-0" />
            Backup Gerado — Salvar no Computador?
          </DialogTitle>
          <DialogDescription className="leading-relaxed">
            O sistema gerou uma cópia de segurança completa com todos os protocolos,
            resultados, lotes e referências. Deseja baixar agora para guardar uma
            cópia local no seu computador?
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {/* Arquivo */}
          <div className="rounded-md border border-muted bg-muted/40 px-4 py-2.5 text-xs">
            <p className="text-muted-foreground mb-0.5 uppercase tracking-wide text-[10px] font-semibold">
              Arquivo de backup
            </p>
            <p className="font-mono break-all text-foreground leading-snug">{offer.filename}</p>
            {offer.exportedAt && (
              <div className="flex items-center gap-1.5 mt-1.5 text-muted-foreground">
                <Clock className="h-3 w-3" />
                <span>Gerado em {fmtDate(offer.exportedAt)}</span>
              </div>
            )}
          </div>

          {/* Conteúdo do backup */}
          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700 space-y-1">
            <p className="font-semibold text-slate-800 mb-1">Conteúdo incluído neste backup:</p>
            <ul className="space-y-0.5 list-inside">
              {[
                "Todos os protocolos de estabilidade",
                "Lotes piloto e análises de resultados",
                "Referências bibliográficas e vínculos",
                "Banco de números ANVISA",
              ].map(item => (
                <li key={item} className="flex items-center gap-1.5">
                  <span className="text-green-600 shrink-0">✓</span> {item}
                </li>
              ))}
            </ul>
          </div>

          {/* Nota informativa */}
          <div className="flex items-start gap-2.5 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800 leading-relaxed">
            <ShieldCheck className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
            <span>
              O backup <strong>já está salvo no servidor e na nuvem automaticamente</strong>.
              Este download é uma cópia extra no seu computador — ideal para pen-drive ou pasta segura.
            </span>
          </div>
        </div>

        <DialogFooter className="flex-row justify-end gap-2 pt-1">
          <Button variant="outline" onClick={dismiss} className="gap-1.5">
            <X className="h-3.5 w-3.5" /> Não agora
          </Button>
          <Button onClick={doDownload} disabled={downloading} className="gap-1.5">
            {downloading
              ? <><RefreshCw className="h-4 w-4 animate-spin" /> Baixando...</>
              : <><Download className="h-4 w-4" /> Baixar no computador</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
