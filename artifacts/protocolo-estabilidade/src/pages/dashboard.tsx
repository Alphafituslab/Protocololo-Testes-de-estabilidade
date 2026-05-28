import { useGetProtocolStats, useListProtocols } from "@workspace/api-client-react";
import { Link, useLocation } from "wouter";
import { useState, useMemo } from "react";
import {
  FileText, Plus, CheckCircle2, Clock, XCircle, ShieldCheck,
  TrendingUp, ArrowRight, Activity, Beaker, Search, X,
} from "lucide-react";

function normalize(str: string) {
  return str
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

const STATUS_LABELS: Record<string, string> = {
  rascunho: "Rascunho",
  em_andamento: "Em Andamento",
  aprovado: "Aprovado",
  reprovado: "Reprovado",
  aprovado_com_ressalva: "Aprovado c/ Ressalva",
};

const STATUS_CONFIG: Record<string, { dot: string; text: string; bg: string; border: string }> = {
  rascunho:              { dot: "bg-slate-400",   text: "text-slate-600",  bg: "bg-slate-50",  border: "border-slate-200" },
  em_andamento:          { dot: "bg-blue-500",    text: "text-blue-700",   bg: "bg-blue-50",   border: "border-blue-200"  },
  aprovado:              { dot: "bg-emerald-500", text: "text-emerald-700",bg: "bg-emerald-50",border: "border-emerald-200"},
  reprovado:             { dot: "bg-red-500",     text: "text-red-700",    bg: "bg-red-50",    border: "border-red-200"   },
  aprovado_com_ressalva: { dot: "bg-amber-500",   text: "text-amber-700",  bg: "bg-amber-50",  border: "border-amber-200" },
};

function SkeletonDash() {
  return (
    <div className="space-y-8 animate-pulse">
      <div className="h-32 rounded-2xl bg-muted" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[1,2,3,4].map(i => <div key={i} className="h-28 rounded-xl bg-muted" />)}
      </div>
      <div className="h-64 rounded-xl bg-muted" />
    </div>
  );
}

export default function Dashboard() {
  const { data: stats, isLoading } = useGetProtocolStats();
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");

  const q = normalize(search);
  const { data: allProtocols = [] } = useListProtocols(undefined, {
    query: { queryKey: ["protocols-search"], enabled: q.length > 0 },
  });

  const filteredSearch = useMemo(() => {
    if (!q) return [];
    return allProtocols.filter((p) =>
      normalize(p.productName ?? "").includes(q) ||
      normalize(p.certNumber ?? "").includes(q) ||
      normalize(p.companyName ?? "").includes(q)
    );
  }, [allProtocols, q]);

  if (isLoading) return <SkeletonDash />;

  const total = stats?.total ?? 0;
  const emAndamento = stats?.emAndamento ?? 0;
  const aprovado = stats?.aprovado ?? 0;
  const reprovado = stats?.reprovado ?? 0;
  const aprovadoComRessalva = stats?.aprovadoComRessalva ?? 0;
  const conformRate = total > 0 ? Math.round(((aprovado + aprovadoComRessalva) / total) * 100) : 0;

  return (
    <div className="space-y-8">

      {/* ── Hero banner ── */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[hsl(215,40%,22%)] via-[hsl(215,40%,28%)] to-[hsl(200,45%,35%)] text-white px-8 py-7 shadow-lg">
        {/* decorative circles */}
        <div className="absolute -top-10 -right-10 w-52 h-52 rounded-full bg-white/5 pointer-events-none" />
        <div className="absolute -bottom-12 -right-24 w-64 h-64 rounded-full bg-white/5 pointer-events-none" />
        <div className="absolute top-4 right-44 w-20 h-20 rounded-full bg-white/5 pointer-events-none" />

        <div className="relative flex items-center justify-between gap-6">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-white/60 text-xs font-semibold uppercase tracking-widest mb-2">
              <Beaker className="h-3.5 w-3.5" />
              <span>Alphafitus — Estabilidade</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight">PROTOCOLOS</h1>
            <p className="text-white/70 text-sm max-w-md">
              Gerencie e acompanhe todos os protocolos de estabilidade de suplementos nutricionais.
            </p>
            <div className="flex items-center gap-4 pt-2">
              <div className="flex items-center gap-1.5 text-white/80 text-sm">
                <Activity className="h-4 w-4 text-emerald-300" />
                <span className="font-semibold text-white">{total}</span>
                <span className="text-white/60">protocolo{total !== 1 ? "s" : ""}</span>
              </div>
              {total > 0 && (
                <div className="flex items-center gap-1.5 text-white/80 text-sm">
                  <TrendingUp className="h-4 w-4 text-emerald-300" />
                  <span className="font-semibold text-emerald-300">{conformRate}%</span>
                  <span className="text-white/60">taxa de aprovação</span>
                </div>
              )}
            </div>
          </div>

          <Link href="/protocols/new">
            <button className="shrink-0 flex items-center gap-2 bg-white text-[hsl(215,40%,25%)] font-semibold text-sm px-5 py-2.5 rounded-xl shadow-md hover:bg-white/90 active:scale-95 transition-all">
              <Plus className="h-4 w-4" />
              Novo Protocolo
            </button>
          </Link>
        </div>
      </div>

      {/* ── Stat cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Em Andamento */}
        <button
          onClick={() => navigate("/protocols?status=em_andamento")}
          className="group text-left rounded-xl border border-blue-100 bg-gradient-to-br from-blue-50 to-white p-5 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all focus:outline-none focus:ring-2 focus:ring-blue-400"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="w-9 h-9 rounded-lg bg-blue-100 flex items-center justify-center">
              <Clock className="h-5 w-5 text-blue-600" />
            </div>
            <ArrowRight className="h-4 w-4 text-blue-300 group-hover:text-blue-500 group-hover:translate-x-0.5 transition-all" />
          </div>
          <p className="text-3xl font-bold text-blue-700 tabular-nums">{emAndamento}</p>
          <p className="text-xs font-medium text-blue-500 mt-1">Em Andamento</p>
        </button>

        {/* Aprovados */}
        <button
          onClick={() => navigate("/protocols?status=aprovado")}
          className="group text-left rounded-xl border border-emerald-100 bg-gradient-to-br from-emerald-50 to-white p-5 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all focus:outline-none focus:ring-2 focus:ring-emerald-400"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="w-9 h-9 rounded-lg bg-emerald-100 flex items-center justify-center">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            </div>
            <ArrowRight className="h-4 w-4 text-emerald-300 group-hover:text-emerald-500 group-hover:translate-x-0.5 transition-all" />
          </div>
          <p className="text-3xl font-bold text-emerald-700 tabular-nums">{aprovado}</p>
          <p className="text-xs font-medium text-emerald-500 mt-1">Aprovados</p>
        </button>

        {/* Reprovados */}
        <button
          onClick={() => navigate("/protocols?status=reprovado")}
          className="group text-left rounded-xl border border-red-100 bg-gradient-to-br from-red-50 to-white p-5 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all focus:outline-none focus:ring-2 focus:ring-red-400"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="w-9 h-9 rounded-lg bg-red-100 flex items-center justify-center">
              <XCircle className="h-5 w-5 text-red-600" />
            </div>
            <ArrowRight className="h-4 w-4 text-red-300 group-hover:text-red-500 group-hover:translate-x-0.5 transition-all" />
          </div>
          <p className="text-3xl font-bold text-red-700 tabular-nums">{reprovado}</p>
          <p className="text-xs font-medium text-red-500 mt-1">Reprovados</p>
        </button>

        {/* Aprovado c/ Ressalva */}
        <button
          onClick={() => navigate("/protocols?status=aprovado_com_ressalva")}
          className="group text-left rounded-xl border border-amber-100 bg-gradient-to-br from-amber-50 to-white p-5 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all focus:outline-none focus:ring-2 focus:ring-amber-400"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="w-9 h-9 rounded-lg bg-amber-100 flex items-center justify-center">
              <ShieldCheck className="h-5 w-5 text-amber-600" />
            </div>
            <ArrowRight className="h-4 w-4 text-amber-300 group-hover:text-amber-500 group-hover:translate-x-0.5 transition-all" />
          </div>
          <p className="text-3xl font-bold text-amber-700 tabular-nums">{aprovadoComRessalva}</p>
          <p className="text-xs font-medium text-amber-500 mt-1">Com Ressalva</p>
        </button>
      </div>

      {/* ── Recent protocols ── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <h3 className="font-semibold text-foreground">
              {q ? "Resultado da Pesquisa" : "Protocolos Recentes"}
            </h3>
          </div>
          <Link href="/protocols">
            <span className="text-xs text-primary hover:underline font-medium flex items-center gap-1">
              Ver todos <ArrowRight className="h-3 w-3" />
            </span>
          </Link>
        </div>

        {/* Search bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Pesquisar por nome do produto ou nº do certificado..."
            className="w-full pl-9 pr-9 py-2 text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors placeholder:text-muted-foreground/50"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Result count when searching */}
        {q && (
          <p className="text-xs text-muted-foreground">
            {filteredSearch.length === 0
              ? `Nenhum resultado para "${search}"`
              : `${filteredSearch.length} protocolo${filteredSearch.length !== 1 ? "s" : ""} encontrado${filteredSearch.length !== 1 ? "s" : ""}`}
          </p>
        )}

        <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
          {(() => {
            const list = q ? filteredSearch : (stats?.recentProtocols ?? []);
            if (list.length > 0) {
              return (
                <div className="divide-y divide-border">
                  {list.map((protocol) => {
                    const cfg = STATUS_CONFIG[protocol.status] ?? STATUS_CONFIG["rascunho"];
                    return (
                      <Link key={protocol.id} href={`/protocols/${protocol.id}`}>
                        <div className="group flex items-center justify-between px-5 py-4 hover:bg-muted/40 transition-colors cursor-pointer">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className={`w-8 h-8 rounded-lg ${cfg.bg} border ${cfg.border} flex items-center justify-center shrink-0`}>
                              <Beaker className={`h-4 w-4 ${cfg.text}`} />
                            </div>
                            <div className="min-w-0">
                              <p className="font-semibold text-sm text-foreground group-hover:text-primary transition-colors truncate">
                                {protocol.productName}
                              </p>
                              <p className="text-xs text-muted-foreground truncate mt-0.5">
                                {protocol.certNumber ? `${protocol.certNumber} · ` : ""}{protocol.companyName}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3 shrink-0 ml-4">
                            {protocol.status === "em_andamento" && (protocol as { progressPercent?: number | null }).progressPercent != null && (
                              <div className="flex items-center gap-2">
                                <div className="w-20 h-1.5 rounded-full bg-blue-100 overflow-hidden">
                                  <div
                                    className="h-full rounded-full bg-blue-500 transition-all"
                                    style={{ width: `${(protocol as { progressPercent?: number | null }).progressPercent}%` }}
                                  />
                                </div>
                                <span className="text-xs font-semibold text-blue-700 tabular-nums w-8 text-right">
                                  {(protocol as { progressPercent?: number | null }).progressPercent}%
                                </span>
                              </div>
                            )}
                            <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border ${cfg.bg} ${cfg.text} ${cfg.border}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                              {STATUS_LABELS[protocol.status] ?? protocol.status}
                            </span>
                            <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/40 group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              );
            }
            if (q) {
              return (
                <div className="py-12 text-center">
                  <Search className="h-8 w-8 text-muted-foreground/30 mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">Nenhum protocolo encontrado para <strong>"{search}"</strong>.</p>
                  <button onClick={() => setSearch("")} className="mt-3 text-xs text-primary hover:underline">Limpar pesquisa</button>
                </div>
              );
            }
            return (
              <div className="py-16 text-center">
                <Beaker className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">Nenhum protocolo cadastrado ainda.</p>
                <Link href="/protocols/new">
                  <button className="mt-4 inline-flex items-center gap-2 bg-primary text-primary-foreground text-xs font-semibold px-4 py-2 rounded-lg hover:bg-primary/90 transition-colors">
                    <Plus className="h-3.5 w-3.5" /> Criar primeiro protocolo
                  </button>
                </Link>
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
}
