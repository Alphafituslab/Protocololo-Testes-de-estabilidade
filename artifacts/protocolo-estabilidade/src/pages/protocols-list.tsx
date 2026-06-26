import { useListProtocols } from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Link, useLocation } from "wouter";
import { AlertCircle, Loader2, Search, X, PenLine, Trash2, RotateCcw, RefreshCw } from "lucide-react";
import { useState, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

const STATUS_LABELS: Record<string, string> = {
  rascunho: "Rascunho",
  em_andamento: "Em Andamento",
  aprovado: "Aprovado",
  reprovado: "Reprovado",
  aprovado_com_ressalva: "Aprovado c/ Ressalva",
};

const STATUS_BADGE_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  aprovado: "default",
  aprovado_com_ressalva: "default",
  reprovado: "destructive",
};

type StatusFilter = "rascunho" | "em_andamento" | "concluido" | "aprovado" | "aprovado_com_ressalva" | "reprovado";
const VALID_STATUS_SET = new Set<string>(["rascunho", "em_andamento", "concluido", "aprovado", "aprovado_com_ressalva", "reprovado"]);

interface TrashedProtocol {
  id: number;
  productName: string;
  certNumber: string | null;
  companyName: string;
  status: string;
  deletedAt: string | null;
}

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: "include", headers: { "Content-Type": "application/json" }, ...options });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? `Erro ${res.status}`);
  }
  return res.json() as Promise<T>;
}

function fmtDate(iso: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("pt-BR");
}

function TrashView({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: trashed = [], isLoading, refetch } = useQuery<TrashedProtocol[]>({
    queryKey: ["protocols-trash"],
    queryFn: () => apiFetch("/api/protocols/trash"),
  });

  const [search, setSearch] = useState("");
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return trashed;
    return trashed.filter(p =>
      p.productName?.toLowerCase().includes(q) ||
      (p.certNumber ?? "").toLowerCase().includes(q) ||
      p.companyName?.toLowerCase().includes(q)
    );
  }, [trashed, search]);

  const restoreMut = useMutation({
    mutationFn: (id: number) =>
      apiFetch(`/api/protocols/${id}/restore`, { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["protocols-trash"] });
      qc.invalidateQueries({ queryKey: ["protocols"] });
      qc.invalidateQueries({ queryKey: ["protocolStats"] });
      toast({ title: "Protocolo restaurado", description: "O protocolo foi restaurado da lixeira." });
    },
    onError: (e: Error) => toast({ title: "Erro ao restaurar", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Trash2 className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-xl font-bold tracking-tight">Lixeira de Protocolos</h2>
          {trashed.length > 0 && (
            <Badge variant="secondary">{trashed.length}</Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => refetch()} className="gap-1.5 h-8 text-xs">
            <RefreshCw className="h-3.5 w-3.5" /> Atualizar
          </Button>
          <Button variant="outline" size="sm" onClick={onClose} className="h-8 text-xs">
            ← Voltar à lista
          </Button>
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        Protocolos excluídos ficam aqui e podem ser restaurados a qualquer momento.
      </p>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : (
        <>
          {trashed.length > 4 && (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                placeholder="Buscar na lixeira…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9"
                autoComplete="off"
              />
            </div>
          )}

          <Card>
            <div className="divide-y divide-border">
              {filtered.length === 0 ? (
                <div className="p-10 text-center text-muted-foreground text-sm">
                  <Trash2 className="h-10 w-10 mx-auto mb-2 opacity-20" />
                  <p>{trashed.length === 0 ? "A lixeira está vazia." : `Nenhum resultado para "${search}".`}</p>
                </div>
              ) : filtered.map(p => (
                <div key={p.id} className="p-4 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-semibold text-foreground truncate">{p.productName}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {p.certNumber ? `${p.certNumber} · ` : ""}{p.companyName}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Excluído em {fmtDate(p.deletedAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Badge variant={STATUS_BADGE_VARIANT[p.status] ?? "secondary"} className="text-xs">
                      {STATUS_LABELS[p.status] ?? p.status}
                    </Badge>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 h-8 text-xs border-green-300 text-green-700 hover:bg-green-50"
                      onClick={() => restoreMut.mutate(p.id)}
                      disabled={restoreMut.isPending}
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      Restaurar
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

export default function ProtocolsList() {
  const [location] = useLocation();
  const params = new URLSearchParams(location.split("?")[1] ?? "");
  const nonConformes = params.get("nonConformes") === "true";
  const rawStatus = params.get("status");
  const statusFilter: StatusFilter | null = rawStatus && VALID_STATUS_SET.has(rawStatus) ? rawStatus as StatusFilter : null;
  const [showTrash, setShowTrash] = useState(false);

  const queryParams = nonConformes
    ? { nonConformes: true }
    : statusFilter
      ? { status: statusFilter }
      : {};

  const { data: protocols, isLoading } = useListProtocols(queryParams);

  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!protocols) return [];
    const q = search.trim().toLowerCase();
    if (!q) return protocols;
    return protocols.filter(p =>
      p.productName?.toLowerCase().includes(q) ||
      p.certNumber?.toLowerCase().includes(q) ||
      p.companyName?.toLowerCase().includes(q)
    );
  }, [protocols, search]);

  const title = nonConformes
    ? "Protocolos com Não Conformidades"
    : statusFilter && STATUS_LABELS[statusFilter]
      ? `Protocolos — ${STATUS_LABELS[statusFilter]}`
      : "Todos os Protocolos";
  const subtitle = nonConformes
    ? "Protocolos que possuem ao menos um resultado fora das especificações."
    : statusFilter
      ? `Filtrando por status: ${STATUS_LABELS[statusFilter] ?? statusFilter}.`
      : "Lista completa de protocolos de estabilidade.";

  if (showTrash) {
    return (
      <div className="space-y-6">
        <TrashView onClose={() => setShowTrash(false)} />
        <div className="text-sm text-muted-foreground">
          <Link href="/" className="hover:underline text-primary">← Voltar ao Painel</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          {nonConformes && (
            <div className="flex items-center gap-2 mb-1">
              <AlertCircle className="h-5 w-5 text-orange-500" />
              <span className="text-xs font-semibold text-orange-600 uppercase tracking-wide">Filtro ativo</span>
            </div>
          )}
          <h2 className="text-2xl font-bold tracking-tight">{title}</h2>
          <p className="text-muted-foreground text-sm">{subtitle}</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowTrash(true)}
          className="gap-1.5 h-8 text-xs shrink-0 mt-1"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Lixeira
        </Button>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      )}

      {!isLoading && (
        <>
          {/* Search box */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Buscar por nome do produto, Nº do certificado ou empresa…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 pr-9"
              autoComplete="off"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Limpar busca"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Result count when searching */}
          {search.trim() && (
            <p className="text-xs text-muted-foreground -mt-3">
              {filtered.length === 0
                ? "Nenhum protocolo encontrado para essa busca."
                : `${filtered.length} protocolo${filtered.length !== 1 ? "s" : ""} encontrado${filtered.length !== 1 ? "s" : ""}`}
            </p>
          )}

          <Card>
            <div className="divide-y divide-border">
              {filtered.length > 0 ? filtered.map((protocol) => (
                <div key={protocol.id} className="p-4 flex items-center justify-between hover:bg-muted/50 transition-colors">
                  <div>
                    <Link href={`/protocols/${protocol.id}`} className="font-semibold text-primary hover:underline">
                      {protocol.productName}
                    </Link>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {protocol.certNumber ? `${protocol.certNumber} · ` : ""}{protocol.companyName}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap justify-end">
                    {(protocol as { pendingSignatures?: boolean }).pendingSignatures && (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-300 rounded-full px-2.5 py-0.5">
                        <PenLine className="h-3 w-3" />
                        Aguardando Assinatura
                      </span>
                    )}
                    <Badge variant={STATUS_BADGE_VARIANT[protocol.status] ?? "secondary"}>
                      {STATUS_LABELS[protocol.status] ?? protocol.status}
                    </Badge>
                    {protocol.status === "em_andamento" && protocol.progressPercent != null && (
                      <span className="text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded px-2 py-0.5">
                        {protocol.progressPercent}%
                      </span>
                    )}
                  </div>
                </div>
              )) : (
                <div className="p-8 text-center text-muted-foreground">
                  {search.trim()
                    ? `Nenhum resultado para "${search}".`
                    : nonConformes
                      ? "Nenhum protocolo com não conformidades encontrado."
                      : "Nenhum protocolo encontrado."}
                </div>
              )}
            </div>
          </Card>
        </>
      )}

      <div className="text-sm text-muted-foreground">
        <Link href="/" className="hover:underline text-primary">← Voltar ao Painel</Link>
      </div>
    </div>
  );
}
