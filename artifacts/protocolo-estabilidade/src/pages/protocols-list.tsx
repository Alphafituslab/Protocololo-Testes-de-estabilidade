import { useListProtocols } from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Link, useLocation } from "wouter";
import { AlertCircle, Loader2 } from "lucide-react";

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

export default function ProtocolsList() {
  const [location] = useLocation();
  const params = new URLSearchParams(location.split("?")[1] ?? "");
  const nonConformes = params.get("nonConformes") === "true";

  const { data: protocols, isLoading } = useListProtocols(
    nonConformes ? { nonConformes: true } : {},
  );

  const title = nonConformes ? "Protocolos com Não Conformidades" : "Todos os Protocolos";
  const subtitle = nonConformes
    ? "Protocolos que possuem ao menos um resultado fora das especificações."
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
        <Card>
          <div className="divide-y divide-border">
            {protocols && protocols.length > 0 ? protocols.map((protocol) => (
              <div key={protocol.id} className="p-4 flex items-center justify-between hover:bg-muted/50 transition-colors">
                <div>
                  <Link href={`/protocols/${protocol.id}`} className="font-semibold text-primary hover:underline">
                    {protocol.productName}
                  </Link>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {protocol.certNumber ? `${protocol.certNumber} · ` : ""}{protocol.companyName}
                  </div>
                </div>
                <div className="flex items-center gap-2">
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
                {nonConformes ? "Nenhum protocolo com não conformidades encontrado." : "Nenhum protocolo encontrado."}
              </div>
            )}
          </div>
        </Card>
      )}

      <div className="text-sm text-muted-foreground">
        <Link href="/" className="hover:underline text-primary">← Voltar ao Painel</Link>
      </div>
    </div>
  );
}
