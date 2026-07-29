/**
 * AuditBadge — badge "Alterado hoje" clicável com botão de dispensa manual.
 * Abre um popover com os eventos de auditoria do protocolo.
 * Invisível em impressão/PDF (print:hidden).
 */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/use-auth";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Pencil, Clock, User, History, Loader2, AlertCircle, X, CheckCheck } from "lucide-react";
import type { AuditLog } from "./audit-trail";

const ACTION_LABEL: Record<string, string> = {
  CRIAR_PROTOCOLO:     "Criado",
  ATUALIZAR_PROTOCOLO: "Editado",
  EXCLUIR_PROTOCOLO:   "Excluído",
  FINALIZAR_PROTOCOLO: "Avaliação final",
  CRIAR_LOTE:          "Lote adicionado",
  ATUALIZAR_LOTE:      "Lote editado",
  EXCLUIR_LOTE:        "Lote removido",
  REGISTRAR_RESULTADO: "Resultado registrado",
  ATUALIZAR_RESULTADO: "Resultado editado",
  EXCLUIR_RESULTADO:   "Resultado removido",
  RESTAURAR_PROTOCOLO: "Restaurado",
};

const ACTION_DOT: Record<string, string> = {
  CRIAR_PROTOCOLO:     "bg-green-500",
  ATUALIZAR_PROTOCOLO: "bg-blue-500",
  EXCLUIR_PROTOCOLO:   "bg-red-500",
  FINALIZAR_PROTOCOLO: "bg-purple-500",
  CRIAR_LOTE:          "bg-emerald-500",
  ATUALIZAR_LOTE:      "bg-sky-500",
  EXCLUIR_LOTE:        "bg-orange-500",
  REGISTRAR_RESULTADO: "bg-teal-500",
  ATUALIZAR_RESULTADO: "bg-cyan-400",
  EXCLUIR_RESULTADO:   "bg-rose-500",
  RESTAURAR_PROTOCOLO: "bg-indigo-500",
};

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function isToday(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
}

async function fetchLogs(protocolId: number, token: string | null): Promise<AuditLog[]> {
  const url = `/api/audit-logs?protocolId=${protocolId}&limit=100`;
  const res = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) throw new Error("Erro ao carregar histórico.");
  return res.json() as Promise<AuditLog[]>;
}

interface Props {
  protocolId: number;
  /** texto exibido no badge — padrão "Alterado hoje" */
  label?: string;
}

export function AuditBadge({ protocolId, label = "Alterado hoje" }: Props) {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [dismissing, setDismissing] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const { data: logs, isLoading, isError } = useQuery<AuditLog[]>({
    queryKey: ["audit-logs", protocolId],
    queryFn: () => fetchLogs(protocolId, token),
    staleTime: 30_000,
    enabled: open,   // só busca ao abrir
  });

  // Filtra só os eventos de hoje
  const todayLogs = (logs ?? []).filter((l) => isToday(l.createdAt));

  const handleDismiss = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (dismissing || dismissed) return;
    setDismissing(true);
    try {
      await fetch(`/api/audit-logs/dismiss/${protocolId}`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: "include",
      });
      setDismissed(true);
      setOpen(false);
      // Invalida a lista para remover o badge imediatamente
      await queryClient.invalidateQueries({ queryKey: ["audit-today-changed"] });
    } finally {
      setDismissing(false);
    }
  };

  if (dismissed) return null;

  return (
    <div className="print:hidden inline-flex items-center gap-0.5">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          {/* print:hidden garante que o badge não aparece em PDF/impressão */}
          <button
            type="button"
            className="inline-flex items-center gap-1 text-xs font-semibold text-orange-700 bg-orange-50 border border-orange-400 rounded-l-full px-2.5 py-0.5 shadow-sm hover:bg-orange-100 hover:border-orange-500 transition-colors cursor-pointer"
            title="Ver histórico de alterações de hoje"
            onClick={(e) => e.stopPropagation()}
          >
            <Pencil className="h-3 w-3" />
            {label}
          </button>
        </PopoverTrigger>

        <PopoverContent
          className="w-80 p-0 overflow-hidden print:hidden"
          align="end"
          sideOffset={6}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Cabeçalho */}
          <div className="flex items-center gap-2 px-4 py-3 bg-orange-50 border-b border-orange-100">
            <History className="h-4 w-4 text-orange-600 shrink-0" />
            <span className="text-sm font-semibold text-orange-800 flex-1">Alterações de hoje</span>
          </div>

          {/* Corpo */}
          <div className="max-h-72 overflow-y-auto px-4 py-3">
            {isLoading && (
              <div className="flex items-center justify-center gap-2 py-6 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-xs">Carregando…</span>
              </div>
            )}

            {isError && (
              <div className="flex items-center gap-2 py-4 text-destructive text-xs">
                <AlertCircle className="h-4 w-4 shrink-0" />
                Erro ao carregar histórico.
              </div>
            )}

            {!isLoading && !isError && todayLogs.length === 0 && (
              <div className="flex flex-col items-center gap-2 py-6 text-muted-foreground text-center">
                <History className="h-6 w-6 opacity-30" />
                <p className="text-xs">Nenhum evento registrado hoje.</p>
                <p className="text-[11px] opacity-60">
                  Alterações feitas antes desta versão<br />não possuem histórico detalhado.
                </p>
              </div>
            )}

            {!isLoading && !isError && todayLogs.length > 0 && (
              <div className="space-y-3">
                {todayLogs.map((log) => (
                  <div key={log.id} className="flex gap-3">
                    {/* Dot */}
                    <div className="mt-0.5 shrink-0">
                      <span className={`block w-2 h-2 rounded-full mt-1 ${ACTION_DOT[log.action] ?? "bg-slate-400"}`} />
                    </div>

                    <div className="flex-1 min-w-0">
                      {/* Tipo + horário */}
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs font-semibold text-foreground">
                          {ACTION_LABEL[log.action] ?? log.action}
                        </span>
                        <span className="text-[11px] text-muted-foreground flex items-center gap-0.5">
                          <Clock className="h-2.5 w-2.5" />
                          {fmtTime(log.createdAt)}
                        </span>
                      </div>

                      {/* Usuário */}
                      <div className="text-[11px] text-muted-foreground flex items-center gap-0.5 mt-0.5">
                        <User className="h-2.5 w-2.5" />
                        {log.userDisplay}
                      </div>

                      {/* Descrição */}
                      <p className="text-[11px] text-foreground/80 mt-0.5 leading-relaxed">
                        {log.description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Rodapé com total + botão dispensar */}
          <div className="border-t border-border px-4 py-2 bg-muted/30 flex items-center justify-between gap-2">
            {!isLoading && !isError && (logs ?? []).length > 0 ? (
              <p className="text-[11px] text-muted-foreground">
                {todayLogs.length} evento{todayLogs.length !== 1 ? "s" : ""} hoje ·{" "}
                {(logs ?? []).length} total no protocolo
              </p>
            ) : (
              <span />
            )}
            <button
              type="button"
              onClick={handleDismiss}
              disabled={dismissing}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground border border-border rounded px-2 py-0.5 hover:bg-muted transition-colors disabled:opacity-50"
              title="Dispensar notificação de alteração"
            >
              {dismissing ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCheck className="h-3 w-3" />}
              Dispensar
            </button>
          </div>
        </PopoverContent>
      </Popover>

      {/* Botão X — dispensa sem abrir o popover */}
      <button
        type="button"
        onClick={handleDismiss}
        disabled={dismissing}
        className="inline-flex items-center justify-center h-[22px] w-[22px] text-orange-600 bg-orange-50 border border-orange-400 border-l-0 rounded-r-full hover:bg-orange-100 hover:text-orange-800 transition-colors disabled:opacity-50"
        title="Dispensar notificação"
      >
        {dismissing ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />}
      </button>
    </div>
  );
}
