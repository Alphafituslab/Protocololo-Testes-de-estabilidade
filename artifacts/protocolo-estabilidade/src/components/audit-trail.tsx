import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/use-auth";
import {
  Loader2, Clock, User, FilePlus, FilePen, FileX, CheckCircle,
  PackagePlus, PackageMinus, PackageCheck, FlaskConical, Trash2, History,
} from "lucide-react";

export type AuditLog = {
  id: number;
  userId: number | null;
  userDisplay: string;
  protocolId: number | null;
  action: string;
  entityType: string;
  entityId: string | null;
  description: string;
  createdAt: string;
};

const ACTION_META: Record<string, { label: string; color: string; dot: string; Icon: React.ElementType }> = {
  CRIAR_PROTOCOLO:    { label: "Protocolo criado",    color: "bg-green-100 text-green-800 border-green-200",   dot: "bg-green-500",  Icon: FilePlus },
  ATUALIZAR_PROTOCOLO:{ label: "Protocolo editado",   color: "bg-blue-100 text-blue-800 border-blue-200",     dot: "bg-blue-500",   Icon: FilePen },
  EXCLUIR_PROTOCOLO:  { label: "Protocolo excluído",  color: "bg-red-100 text-red-800 border-red-200",        dot: "bg-red-500",    Icon: FileX },
  FINALIZAR_PROTOCOLO:{ label: "Avaliação final",     color: "bg-purple-100 text-purple-800 border-purple-200",dot: "bg-purple-500", Icon: CheckCircle },
  CRIAR_LOTE:         { label: "Lote adicionado",     color: "bg-emerald-100 text-emerald-800 border-emerald-200", dot: "bg-emerald-500", Icon: PackagePlus },
  ATUALIZAR_LOTE:     { label: "Lote editado",        color: "bg-sky-100 text-sky-800 border-sky-200",        dot: "bg-sky-500",    Icon: PackageCheck },
  EXCLUIR_LOTE:       { label: "Lote removido",       color: "bg-orange-100 text-orange-800 border-orange-200",dot: "bg-orange-500", Icon: PackageMinus },
  REGISTRAR_RESULTADO:{ label: "Resultado registrado",color: "bg-teal-100 text-teal-800 border-teal-200",     dot: "bg-teal-500",   Icon: FlaskConical },
  ATUALIZAR_RESULTADO:{ label: "Resultado editado",   color: "bg-cyan-100 text-cyan-800 border-cyan-200",     dot: "bg-cyan-400",   Icon: FlaskConical },
  EXCLUIR_RESULTADO:  { label: "Resultado removido",  color: "bg-rose-100 text-rose-800 border-rose-200",     dot: "bg-rose-500",   Icon: Trash2 },
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function formatDateGroup(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const fmt = (dt: Date) => dt.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
  if (fmt(d) === fmt(today)) return "Hoje";
  if (fmt(d) === fmt(yesterday)) return "Ontem";
  return d.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
}

async function fetchLogs(protocolId: number, token: string | null): Promise<AuditLog[]> {
  const url = `/api/audit-logs?protocolId=${protocolId}&limit=500`;
  const res = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) throw new Error("Erro ao carregar histórico.");
  return res.json() as Promise<AuditLog[]>;
}

type Props = { protocolId: number; printMode?: boolean };

export function AuditTrail({ protocolId, printMode = false }: Props) {
  const { token } = useAuth();
  const { data: logs, isLoading, isError } = useQuery<AuditLog[]>({
    queryKey: ["audit-logs", protocolId],
    queryFn: () => fetchLogs(protocolId, token),
    staleTime: 10_000,
  });

  if (isLoading) {
    return (
      <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
        <span className="text-sm">Carregando histórico…</span>
      </div>
    );
  }
  if (isError) {
    return <p className="text-destructive text-sm text-center py-6">Erro ao carregar histórico de auditoria.</p>;
  }

  const allLogs = logs ?? [];

  if (allLogs.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-muted-foreground">
        <History className="h-8 w-8 opacity-30" />
        <p className="text-sm">Nenhuma ação registrada para este protocolo ainda.</p>
        <p className="text-xs opacity-70">As ações aparecerão aqui assim que você editar o protocolo.</p>
      </div>
    );
  }

  if (printMode) {
    return (
      <div className="space-y-1">
        {allLogs.map((log) => {
          const meta = ACTION_META[log.action];
          return (
            <div key={log.id} className="flex gap-3 text-xs py-1 border-b border-gray-100">
              <span className="w-32 shrink-0 text-gray-500">{formatDate(log.createdAt)}</span>
              <span className="w-36 shrink-0 font-medium">{meta?.label ?? log.action}</span>
              <span className="w-28 shrink-0 text-gray-600">{log.userDisplay}</span>
              <span className="flex-1 text-gray-700">{log.description}</span>
            </div>
          );
        })}
      </div>
    );
  }

  // Group by calendar day
  const groups: { day: string; logs: AuditLog[] }[] = [];
  for (const log of allLogs) {
    const day = new Date(log.createdAt).toDateString();
    const last = groups[groups.length - 1];
    if (last && last.day === day) {
      last.logs.push(log);
    } else {
      groups.push({ day, logs: [log] });
    }
  }

  return (
    <div className="space-y-6">
      <p className="text-xs text-muted-foreground">
        {allLogs.length} {allLogs.length === 1 ? "evento registrado" : "eventos registrados"} neste protocolo
      </p>

      {groups.map((group) => (
        <div key={group.day}>
          <div className="flex items-center gap-3 mb-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs font-semibold text-muted-foreground px-2 py-0.5 rounded-full bg-muted border capitalize">
              {formatDateGroup(group.logs[0]!.createdAt)}
            </span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <div className="relative">
            <div className="absolute left-3.5 top-0 bottom-0 w-px bg-border" />

            <div className="space-y-0">
              {group.logs.map((log, idx) => {
                const meta = ACTION_META[log.action];
                const Icon = meta?.Icon ?? History;
                const isLast = idx === group.logs.length - 1;

                return (
                  <div key={log.id} className={`relative flex gap-4 pl-8 ${isLast ? "pb-2" : "pb-4"}`}>
                    <div className={`absolute left-0 top-1 w-7 h-7 rounded-full border-2 border-background flex items-center justify-center ${meta?.dot ?? "bg-slate-400"}`}>
                      <Icon className="h-3 w-3 text-white" />
                    </div>

                    <div className="flex-1 min-w-0 bg-card border rounded-lg px-3 py-2.5 shadow-sm">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className={`text-[11px] px-2 py-0.5 rounded-full border font-semibold ${meta?.color ?? "bg-gray-100 text-gray-700 border-gray-200"}`}>
                          {meta?.label ?? log.action}
                        </span>
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatDate(log.createdAt)}
                        </span>
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <User className="h-3 w-3" />
                          {log.userDisplay}
                        </span>
                      </div>
                      <p className="text-xs text-foreground leading-relaxed">{log.description}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
