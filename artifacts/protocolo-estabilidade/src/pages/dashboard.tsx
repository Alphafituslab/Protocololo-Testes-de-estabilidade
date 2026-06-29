import {
  useGetProtocolStats, useListProtocols, useDeleteProtocol,
  getGetProtocolStatsQueryKey, getListProtocolsQueryKey,
} from "@workspace/api-client-react";
import { Link, useLocation } from "wouter";
import { useState, useMemo, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  FileText, Plus, CheckCircle2, Clock, XCircle, ShieldCheck,
  TrendingUp, ArrowRight, Activity, Beaker, Search, X, Trash2, PenLine,
} from "lucide-react";
import { useUnlock } from "@/hooks/use-unlock";
import { UnlockDialog } from "@/components/unlock-dialog";

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
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{ id: number; name: string } | null>(null);
  const [unlockOpen, setUnlockOpen] = useState(false);
  const { unlock } = useUnlock();
  const queryClient = useQueryClient();
  const listRef = useRef<HTMLDivElement>(null);

  const deleteMutation = useDeleteProtocol({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetProtocolStatsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListProtocolsQueryKey() });
        setPendingDelete(null);
      },
    },
  });

  function handleDeleteClick(e: React.MouseEvent, id: number, name: string) {
    e.preventDefault();
    e.stopPropagation();
    setPendingDelete({ id, name });
    setUnlockOpen(true);
  }

  const q = normalize(search);

  const needsAllProtocols = q.length > 0 || statusFilter !== null;
  const { data: allProtocols = [] } = useListProtocols(undefined, {
    query: { queryKey: ["protocols-all"], enabled: needsAllProtocols },
  });

  const displayList = useMemo(() => {
    if (q) {
      return allProtocols.filter((p) =>
        normalize(p.productName ?? "").includes(q) ||
        normalize(p.certNumber ?? "").includes(q) ||
        normalize(p.companyName ?? "").includes(q)
      );
    }
    if (statusFilter) {
      return allProtocols.filter((p) => p.status === statusFilter);
    }
    return stats?.recentProtocols ?? [];
  }, [allProtocols, q, statusFilter, stats?.recentProtocols]);

  function handleCardClick(status: string) {
    const next = statusFilter === status ? null : status;
    setStatusFilter(next);
    setSearch("");
    if (next !== null) {
      setTimeout(() => {
        listRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 60);
    }
  }

  if (isLoading) return <SkeletonDash />;

  const total = stats?.total ?? 0;
  const emAndamento = stats?.emAndamento ?? 0;
  const aprovado = stats?.aprovado ?? 0;
  const reprovado = stats?.reprovado ?? 0;
  const aprovadoComRessalva = stats?.aprovadoComRessalva ?? 0;
  const conformRate = total > 0 ? Math.round(((aprovado + aprovadoComRessalva) / total) * 100) : 0;

  const cards = [
    {
      status: "em_andamento",
      label: "Em Andamento",
      value: emAndamento,
      Icon: Clock,
      ring: "focus:ring-blue-400",
      activeBorder: "border-blue-500",
      inactiveBorder: "border-blue-100",
      activeFrom: "from-blue-100",
      inactiveFrom: "from-blue-50",
      numColor: "text-blue-700",
      labelColor: "text-blue-500",
      iconBg: "bg-blue-100",
      iconColor: "text-blue-600",
      arrowActive: "text-blue-500",
      arrowInactive: "text-blue-300",
    },
    {
      status: "aprovado",
      label: "Aprovados",
      value: aprovado,
      Icon: CheckCircle2,
      ring: "focus:ring-emerald-400",
      activeBorder: "border-emerald-500",
      inactiveBorder: "border-emerald-100",
      activeFrom: "from-emerald-100",
      inactiveFrom: "from-emerald-50",
      numColor: "text-emerald-700",
      labelColor: "text-emerald-500",
      iconBg: "bg-emerald-100",
      iconColor: "text-emerald-600",
      arrowActive: "text-emerald-500",
      arrowInactive: "text-emerald-300",
    },
    {
      status: "reprovado",
      label: "Reprovados",
      value: reprovado,
      Icon: XCircle,
      ring: "focus:ring-red-400",
      activeBorder: "border-red-500",
      inactiveBorder: "border-red-100",
      activeFrom: "from-red-100",
      inactiveFrom: "from-red-50",
      numColor: "text-red-700",
      labelColor: "text-red-500",
      iconBg: "bg-red-100",
      iconColor: "text-red-600",
      arrowActive: "text-red-500",
      arrowInactive: "text-red-300",
    },
    {
      status: "aprovado_com_ressalva",
      label: "Com Ressalva",
      value: aprovadoComRessalva,
      Icon: ShieldCheck,
      ring: "focus:ring-amber-400",
      activeBorder: "border-amber-500",
      inactiveBorder: "border-amber-100",
      activeFrom: "from-amber-100",
      inactiveFrom: "from-amber-50",
      numColor: "text-amber-700",
      labelColor: "text-amber-500",
      iconBg: "bg-amber-100",
      iconColor: "text-amber-600",
      arrowActive: "text-amber-500",
      arrowInactive: "text-amber-300",
    },
  ];

  const isFiltered = statusFilter !== null || q.length > 0;
  const listTitle = q
    ? "Resultado da Pesquisa"
    : statusFilter
      ? STATUS_LABELS[statusFilter] ?? statusFilter
      : "Protocolos Recentes";

  return (
    <>
    <div className="space-y-8">

      {/* ── Hero banner ── */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[hsl(215,40%,22%)] via-[hsl(215,40%,28%)] to-[hsl(200,45%,35%)] text-white px-8 py-7 shadow-lg">
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
        {cards.map(({ status, label, value, Icon, ring, activeBorder, inactiveBorder, activeFrom, inactiveFrom, numColor, labelColor, iconBg, iconColor, arrowActive, arrowInactive }) => {
          const active = statusFilter === status;
          return (
            <button
              key={status}
              onClick={() => handleCardClick(status)}
              className={`group text-left rounded-xl border-2 bg-gradient-to-br to-white p-5 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all focus:outline-none focus:ring-2 ${ring} ${active ? activeBorder : inactiveBorder} ${active ? activeFrom : inactiveFrom}`}
            >
              <div className="flex items-center justify-between mb-3">
                <div className={`w-9 h-9 rounded-lg ${iconBg} flex items-center justify-center`}>
                  <Icon className={`h-5 w-5 ${iconColor}`} />
                </div>
                {active ? (
                  <span className={`text-[10px] font-bold uppercase tracking-wide ${numColor} bg-white/70 rounded-full px-2 py-0.5 border ${activeBorder}`}>
                    filtrado ✓
                  </span>
                ) : (
                  <ArrowRight className={`h-4 w-4 ${arrowInactive} group-hover:${arrowActive} group-hover:translate-x-0.5 transition-all`} />
                )}
              </div>
              <p className={`text-3xl font-bold tabular-nums ${numColor}`}>{value}</p>
              <p className={`text-xs font-medium mt-1 ${labelColor}`}>{label}</p>
            </button>
          );
        })}
      </div>

      {/* ── Protocol list ── */}
      <div className="space-y-3" ref={listRef}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <h3 className="font-semibold text-foreground">{listTitle}</h3>
            {statusFilter && (
              <button
                onClick={() => setStatusFilter(null)}
                className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground bg-muted rounded-full px-2 py-0.5 transition-colors"
                title="Remover filtro"
              >
                <X className="h-3 w-3" /> limpar filtro
              </button>
            )}
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
            onChange={(e) => { setSearch(e.target.value); setStatusFilter(null); }}
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

        {/* Result count */}
        {isFiltered && (
          <p className="text-xs text-muted-foreground">
            {displayList.length === 0
              ? q
                ? `Nenhum resultado para "${search}"`
                : `Nenhum protocolo com status "${STATUS_LABELS[statusFilter!] ?? statusFilter}"`
              : `${displayList.length} protocolo${displayList.length !== 1 ? "s" : ""} encontrado${displayList.length !== 1 ? "s" : ""}`}
          </p>
        )}

        <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
          {displayList.length > 0 ? (
            <div className="divide-y divide-border">
              {displayList.map((protocol) => {
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
                      <div className="flex items-center gap-2 shrink-0 ml-4 flex-wrap justify-end">
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
                        {(protocol as { pendingSignatures?: boolean }).pendingSignatures && (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-300 rounded-full px-2.5 py-0.5">
                            <PenLine className="h-3 w-3" />
                            Ag. Assinatura
                          </span>
                        )}
                        <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border ${cfg.bg} ${cfg.text} ${cfg.border}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                          {STATUS_LABELS[protocol.status] ?? protocol.status}
                        </span>
                        <button
                          onClick={(e) => handleDeleteClick(e, protocol.id, protocol.productName ?? "Protocolo")}
                          className="p-1.5 rounded-md text-muted-foreground/40 hover:text-red-600 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all"
                          title="Excluir protocolo"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/40 group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          ) : isFiltered ? (
            <div className="py-12 text-center">
              <Search className="h-8 w-8 text-muted-foreground/30 mx-auto mb-3" />
              {q ? (
                <>
                  <p className="text-sm text-muted-foreground">Nenhum protocolo encontrado para <strong>"{search}"</strong>.</p>
                  <button onClick={() => setSearch("")} className="mt-3 text-xs text-primary hover:underline">Limpar pesquisa</button>
                </>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">Nenhum protocolo com status <strong>"{STATUS_LABELS[statusFilter!] ?? statusFilter}"</strong>.</p>
                  <button onClick={() => setStatusFilter(null)} className="mt-3 text-xs text-primary hover:underline">Limpar filtro</button>
                </>
              )}
            </div>
          ) : (
            <div className="py-16 text-center">
              <Beaker className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">Nenhum protocolo cadastrado ainda.</p>
              <Link href="/protocols/new">
                <button className="mt-4 inline-flex items-center gap-2 bg-primary text-primary-foreground text-xs font-semibold px-4 py-2 rounded-lg hover:bg-primary/90 transition-colors">
                  <Plus className="h-3.5 w-3.5" /> Criar primeiro protocolo
                </button>
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>

    <UnlockDialog
      open={unlockOpen}
      onOpenChange={(open) => {
        setUnlockOpen(open);
        if (!open) setPendingDelete(null);
      }}
      onUnlock={unlock}
      onSuccess={() => {
        if (pendingDelete) {
          deleteMutation.mutate({ id: pendingDelete.id });
        }
      }}
      title="Confirmar exclusão"
      description={
        pendingDelete
          ? `Digite a senha mestra para excluir permanentemente o protocolo "${pendingDelete.name}". Esta ação não pode ser desfeita.`
          : "Digite a senha mestra para confirmar a exclusão."
      }
      submitLabel="Excluir"
    />
    </>
  );
}
