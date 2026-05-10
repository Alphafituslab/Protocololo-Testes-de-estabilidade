import { useGetProtocolStats } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Link, useLocation } from "wouter";
import { FileText, Plus, CheckCircle2, Clock, XCircle, ShieldCheck } from "lucide-react";
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
  const [, navigate] = useLocation();

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

      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.total || 0}</div>
          </CardContent>
        </Card>

        <Card
          className="cursor-pointer hover:ring-2 hover:ring-blue-400 transition-all"
          onClick={() => navigate("/protocols?status=em_andamento")}
          title="Ver protocolos em andamento"
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Em Andamento</CardTitle>
            <Clock className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{stats?.emAndamento || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">Clique para ver</p>
          </CardContent>
        </Card>

        <Card
          className="cursor-pointer hover:ring-2 hover:ring-green-400 transition-all"
          onClick={() => navigate("/protocols?status=aprovado")}
          title="Ver protocolos aprovados"
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Aprovados</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats?.aprovado || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">Clique para ver</p>
          </CardContent>
        </Card>

        <Card
          className="cursor-pointer hover:ring-2 hover:ring-red-400 transition-all"
          onClick={() => navigate("/protocols?status=reprovado")}
          title="Ver protocolos reprovados"
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Reprovados</CardTitle>
            <XCircle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{stats?.reprovado || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">Clique para ver</p>
          </CardContent>
        </Card>

        <Card
          className="cursor-pointer hover:ring-2 hover:ring-amber-400 transition-all"
          onClick={() => navigate("/protocols?status=aprovado_com_ressalva")}
          title="Ver protocolos aprovados com ressalva"
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Aprov. c/ Ressalva</CardTitle>
            <ShieldCheck className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">{stats?.aprovadoComRessalva || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">Clique para ver</p>
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
