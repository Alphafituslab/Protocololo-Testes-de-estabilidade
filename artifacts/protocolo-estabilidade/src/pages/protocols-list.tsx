import { useListProtocols } from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Link, useLocation } from "wouter";
import { AlertCircle, Loader2, Search, X, PenLine } from "lucide-react";
import { useState, useMemo } from "react";

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

export default function ProtocolsList() {
  const [location] = useLocation();
  const params = new URLSearchParams(location.split("?")[1] ?? "");
  const nonConformes = params.get("nonConformes") === "true";
  const rawStatus = params.get("status");
  const statusFilter: StatusFilter | null = rawStatus && VALID_STATUS_SET.has(rawStatus) ? rawStatus as StatusFilter : null;

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

  return (
    <div className="space-y-6">
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
