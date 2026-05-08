import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/auth-context";
import { Loader2, Clock, User, FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";

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

const ACTION_LABELS: Record<string, { label: string; color: string }> = {
  CRIAR_PROTOCOLO: { label: "Criação", color: "bg-green-100 text-green-800 border-green-200" },
  ATUALIZAR_PROTOCOLO: { label: "Atualização", color: "bg-blue-100 text-blue-800 border-blue-200" },
  EXCLUIR_PROTOCOLO: { label: "Exclusão", color: "bg-red-100 text-red-800 border-red-200" },
  FINALIZAR_PROTOCOLO: { label: "Finalização", color: "bg-purple-100 text-purple-800 border-purple-200" },
  CRIAR_LOTE: { label: "Lote adicionado", color: "bg-green-100 text-green-800 border-green-200" },
  ATUALIZAR_LOTE: { label: "Lote editado", color: "bg-blue-100 text-blue-800 border-blue-200" },
  EXCLUIR_LOTE: { label: "Lote removido", color: "bg-red-100 text-red-800 border-red-200" },
  REGISTRAR_RESULTADO: { label: "Resultado", color: "bg-green-100 text-green-800 border-green-200" },
  ATUALIZAR_RESULTADO: { label: "Resultado editado", color: "bg-blue-100 text-blue-800 border-blue-200" },
  EXCLUIR_RESULTADO: { label: "Resultado removido", color: "bg-red-100 text-red-800 border-red-200" },
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

async function fetchLogs(protocolId: number, token: string | null): Promise<AuditLog[]> {
  const url = `/api/audit-logs?protocolId=${protocolId}&limit=200`;
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
  });

  if (isLoading) return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  if (isError) return <p className="text-destructive text-sm">Erro ao carregar histórico de auditoria.</p>;

  const protocolLogs = (logs ?? []).filter((l) => l.protocolId === protocolId);

  if (protocolLogs.length === 0) {
    return <p className="text-muted-foreground text-sm text-center py-6">Nenhuma ação registrada para este protocolo ainda.</p>;
  }

  if (printMode) {
    return (
      <div className="space-y-1">
        {protocolLogs.map((log) => {
          const info = ACTION_LABELS[log.action];
          return (
            <div key={log.id} className="flex gap-3 text-xs py-1 border-b border-gray-100">
              <span className="w-32 shrink-0 text-gray-500">{formatDate(log.createdAt)}</span>
              <span className="w-28 shrink-0 font-medium">{info?.label ?? log.action}</span>
              <span className="w-32 shrink-0 text-gray-600">{log.userDisplay}</span>
              <span className="flex-1 text-gray-700">{log.description}</span>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {protocolLogs.map((log) => {
        const info = ACTION_LABELS[log.action];
        return (
          <div key={log.id} className="flex gap-3 items-start py-3 border-b border-border last:border-0">
            <div className="mt-0.5 flex-shrink-0 w-8 h-8 rounded-full bg-muted flex items-center justify-center">
              <FileText className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-0.5">
                <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${info?.color ?? "bg-gray-100 text-gray-700 border-gray-200"}`}>
                  {info?.label ?? log.action}
                </span>
                <span className="text-sm font-medium text-foreground">{log.description}</span>
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1"><User className="h-3 w-3" />{log.userDisplay}</span>
                <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{formatDate(log.createdAt)}</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
