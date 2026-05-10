import { useGetProtocolStats } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { FileText, Plus, AlertCircle, CheckCircle2, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";

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

export default function Dashboard() {
  const { data: stats, isLoading } = useGetProtocolStats();

  if (isLoading) {
    return <div className="animate-pulse space-y-4">
      <div className="h-8 w-48 bg-muted rounded"></div>
      <div className="grid grid-cols-4 gap-4">
        {[1, 2, 3, 4].map(i => <div key={i} className="h-24 bg-muted rounded"></div>)}
      </div>
    </div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Painel</h2>
          <p className="text-muted-foreground">Visão geral dos protocolos de estabilidade e seus status atuais.</p>
        </div>
        <Link href="/protocols/new" className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2">
          <Plus className="mr-2 h-4 w-4" /> Novo Protocolo
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total de Protocolos</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.total || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Em Andamento</CardTitle>
            <Clock className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.emAndamento || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Aprovados</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.aprovado || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Não Conformidades</CardTitle>
            <AlertCircle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{stats?.totalNonConformities || 0}</div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Protocolos Recentes</h3>
        <Card>
          <div className="divide-y divide-border">
            {stats?.recentProtocols.map(protocol => (
              <div key={protocol.id} className="p-4 flex items-center justify-between hover:bg-muted/50 transition-colors">
                <div>
                  <Link href={`/protocols/${protocol.id}`} className="font-medium text-primary hover:underline">
                    {protocol.certNumber || `Protocolo #${protocol.id}`}
                  </Link>
                  <div className="text-sm text-muted-foreground">{protocol.productName} • {protocol.companyName}</div>
                </div>
                <div>
                  <Badge variant={STATUS_BADGE_VARIANT[protocol.status] ?? "secondary"}>
                    {STATUS_LABELS[protocol.status] ?? protocol.status}
                  </Badge>
                </div>
              </div>
            ))}
            {(!stats?.recentProtocols || stats.recentProtocols.length === 0) && (
              <div className="p-8 text-center text-muted-foreground">Nenhum protocolo encontrado.</div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
