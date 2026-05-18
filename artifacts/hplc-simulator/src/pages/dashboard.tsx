import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/use-auth";
import {
  FlaskConical, LogOut, BarChart3, FileText, Activity,
  ChevronRight, Microscope, Gauge, Database, Lock, Unlock,
  CheckCircle2, XCircle, Clock, FileCheck2, TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface StoredSession {
  id: string;
  name: string;
  status: "em_andamento" | "aprovado" | "reprovado" | "laudo_emitido";
  createdAt: string;
  updatedAt?: string;
  runs: { id: string }[];
  formulaId?: string;
  notes?: string;
}

interface StoredCalibration {
  calib: { compoundName?: string; expRT?: number; curveType?: string };
  standards: { id: string; amount: number; area: number }[];
  locked?: boolean;
}

interface StoredFormula {
  id: string;
  name: string;
}

function linReg(pts: { x: number; y: number }[]): number {
  if (pts.length < 2) return 0;
  const n = pts.length;
  const mx = pts.reduce((a, p) => a + p.x, 0) / n;
  const my = pts.reduce((a, p) => a + p.y, 0) / n;
  const ssxy = pts.reduce((a, p) => a + (p.x - mx) * (p.y - my), 0);
  const ssxx = pts.reduce((a, p) => a + (p.x - mx) ** 2, 0);
  const ssyy = pts.reduce((a, p) => a + (p.y - my) ** 2, 0);
  if (ssxx === 0 || ssyy === 0) return 0;
  return ssxy / Math.sqrt(ssxx * ssyy);
}

const STATUS_LABEL: Record<string, string> = {
  em_andamento: "Em Andamento",
  aprovado: "Aprovado",
  reprovado: "Reprovado",
  laudo_emitido: "Laudo Emitido",
};
const STATUS_COLOR: Record<string, { bg: string; text: string; border: string }> = {
  em_andamento: { bg: "#dbeafe", text: "#1d4ed8", border: "#93c5fd" },
  aprovado:     { bg: "#dcfce7", text: "#16a34a", border: "#86efac" },
  reprovado:    { bg: "#fee2e2", text: "#dc2626", border: "#fca5a5" },
  laudo_emitido:{ bg: "#f3e8ff", text: "#7c3aed", border: "#d8b4fe" },
};
const STATUS_ICON: Record<string, React.ReactNode> = {
  em_andamento: <Clock className="h-3.5 w-3.5" />,
  aprovado:     <CheckCircle2 className="h-3.5 w-3.5" />,
  reprovado:    <XCircle className="h-3.5 w-3.5" />,
  laudo_emitido:<FileCheck2 className="h-3.5 w-3.5" />,
};

function fmt(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
  } catch { return iso; }
}

export default function DashboardPage() {
  const { user, logout } = useAuth();
  const [, navigate] = useLocation();

  const [sessions, setSessions] = useState<StoredSession[]>([]);
  const [calibrations, setCalibrations] = useState<Record<string, StoredCalibration>>({});
  const [formulas, setFormulas] = useState<Record<string, string>>({});

  useEffect(() => {
    try {
      const raw = localStorage.getItem("hplc_sessions_v1");
      const parsed = raw ? (JSON.parse(raw) as StoredSession[]) : [];
      setSessions(Array.isArray(parsed) ? parsed : []);
    } catch { /* ignore */ }

    try {
      const raw = localStorage.getItem("hplc_compound_calibrations_v1");
      const parsed = raw ? (JSON.parse(raw) as Record<string, StoredCalibration>) : {};
      setCalibrations(typeof parsed === "object" && parsed ? parsed : {});
    } catch { /* ignore */ }

    try {
      const raw = localStorage.getItem("hplc_formulas_v1");
      const parsed = raw ? (JSON.parse(raw) as StoredFormula[]) : [];
      const map: Record<string, string> = {};
      if (Array.isArray(parsed)) parsed.forEach(f => { map[f.id] = f.name; });
      setFormulas(map);
    } catch { /* ignore */ }
  }, []);

  function handleLogout() {
    logout();
    const base = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
    window.location.replace(base + "/login");
  }

  function openSessionInSimulator(sessionId: string) {
    localStorage.setItem("hplc_dashboard_open_session", sessionId);
    navigate("/simulator");
  }

  const recentSessions = [...sessions]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 6);

  const calibEntries = Object.entries(calibrations);

  const cards = [
    {
      icon: <FlaskConical className="h-8 w-8 text-blue-600" />,
      title: "Simulador HPLC",
      description: "Agilent ChemStation — Simulação de cromatogramas, configuração de picos, gradiente e relatório analítico.",
      action: () => navigate("/simulator"),
      cta: "Abrir Simulador",
      color: "border-blue-200 hover:border-blue-400",
      badge: "Principal",
      badgeColor: "bg-blue-100 text-blue-700",
    },
    {
      icon: <BarChart3 className="h-8 w-8 text-emerald-600" />,
      title: "Análise de Picos",
      description: "Configure picos, áreas, fatores de resposta e parâmetros de integração do cromatograma.",
      action: () => navigate("/simulator"),
      cta: "Configurar Picos",
      color: "border-emerald-200 hover:border-emerald-400",
    },
    {
      icon: <FileText className="h-8 w-8 text-violet-600" />,
      title: "Relatório Analítico",
      description: "Gere e exporte o relatório completo no padrão Agilent ChemStation com todos os parâmetros do ensaio.",
      action: () => navigate("/simulator"),
      cta: "Gerar Relatório",
      color: "border-violet-200 hover:border-violet-400",
    },
    {
      icon: <Activity className="h-8 w-8 text-orange-600" />,
      title: "Parâmetros do Sistema",
      description: "Ajuste detector DAD, linha de base, ruído, deriva e condições de corrida cromatográfica.",
      action: () => navigate("/simulator"),
      cta: "Ajustar Parâmetros",
      color: "border-orange-200 hover:border-orange-400",
    },
    {
      icon: <Database className="h-8 w-8 text-slate-600" />,
      title: "Banco de Métodos",
      description: "Gerencie e salve configurações de métodos analíticos para reutilização em diferentes análises.",
      action: () => navigate("/simulator"),
      cta: "Ver Métodos",
      color: "border-slate-200 hover:border-slate-400",
    },
    {
      icon: <Gauge className="h-8 w-8 text-red-600" />,
      title: "Validação do Método",
      description: "Parâmetros de validação: linearidade, precisão, exatidão, limites de detecção e quantificação.",
      action: () => navigate("/simulator"),
      cta: "Iniciar Validação",
      color: "border-red-200 hover:border-red-400",
    },
  ];

  const sessionStats = {
    total: sessions.length,
    em_andamento: sessions.filter(s => s.status === "em_andamento").length,
    aprovado: sessions.filter(s => s.status === "aprovado").length,
    reprovado: sessions.filter(s => s.status === "reprovado").length,
    laudo_emitido: sessions.filter(s => s.status === "laudo_emitido").length,
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Topbar */}
      <header className="border-b bg-card shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/logo-alphafitus.png" alt="Alphafitus" className="h-9 w-auto" />
            <div className="border-l border-border pl-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground leading-none">Alphafitus Laboratório Nutracêutico</p>
              <p className="text-sm font-semibold text-foreground leading-snug mt-0.5">Simulador HPLC — Agilent ChemStation</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground hidden sm:block">
              {user?.displayName ?? user?.username}
            </span>
            <Button variant="ghost" size="sm" onClick={handleLogout} className="gap-1.5 text-muted-foreground hover:text-destructive">
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Sair</span>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <div className="bg-gradient-to-br from-blue-950 via-blue-900 to-blue-800 text-white">
        <div className="max-w-7xl mx-auto px-6 py-10">
          <div className="flex items-center gap-4 mb-3">
            <div className="bg-white/10 rounded-xl p-3">
              <Microscope className="h-7 w-7" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Painel de Controle</h1>
              <p className="text-blue-200 text-sm">Bem-vindo, {user?.displayName ?? user?.username}. Selecione uma função para começar.</p>
            </div>
          </div>

          {/* Stats bar */}
          {sessions.length > 0 && (
            <div className="mt-5 grid grid-cols-4 gap-3 max-w-xl">
              {[
                { label: "Total", value: sessionStats.total, color: "bg-white/10" },
                { label: "Em Andamento", value: sessionStats.em_andamento, color: "bg-blue-400/20" },
                { label: "Aprovadas", value: sessionStats.aprovado, color: "bg-green-400/20" },
                { label: "Laudos", value: sessionStats.laudo_emitido, color: "bg-purple-400/20" },
              ].map(s => (
                <div key={s.label} className={`${s.color} rounded-lg px-3 py-2 text-center`}>
                  <div className="text-2xl font-bold text-white">{s.value}</div>
                  <div className="text-[10px] text-blue-200 uppercase tracking-wide">{s.label}</div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-6">
            <Button
              size="lg"
              className="bg-white text-blue-900 hover:bg-blue-50 font-semibold gap-2 shadow-lg"
              onClick={() => navigate("/simulator")}
            >
              <FlaskConical className="h-5 w-5" />
              Abrir Simulador HPLC
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-10">

        {/* Module Cards */}
        <div>
          <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-4">Módulos disponíveis</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {cards.map((c) => (
              <Card
                key={c.title}
                className={`cursor-pointer transition-all border-2 ${c.color}`}
                onClick={c.action}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div className="bg-gray-50 rounded-lg p-2.5">{c.icon}</div>
                    {c.badge && (
                      <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${c.badgeColor}`}>
                        {c.badge}
                      </span>
                    )}
                  </div>
                  <CardTitle className="text-base mt-2">{c.title}</CardTitle>
                  <CardDescription className="text-xs leading-relaxed">{c.description}</CardDescription>
                </CardHeader>
                <CardContent className="pt-0">
                  <Button variant="ghost" size="sm" className="gap-1 px-0 text-blue-700 hover:text-blue-900 hover:bg-transparent font-medium text-xs">
                    {c.cta} <ChevronRight className="h-3.5 w-3.5" />
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Análises Salvas */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Análises Salvas
              {sessions.length > 0 && (
                <span className="ml-2 bg-blue-100 text-blue-700 rounded-full px-2 py-0.5 text-[10px] font-bold normal-case tracking-normal">
                  {sessions.length}
                </span>
              )}
            </h2>
            <Button variant="ghost" size="sm" className="text-xs text-blue-700 gap-1" onClick={() => navigate("/simulator")}>
              Ver todas no simulador <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>

          {sessions.length === 0 ? (
            <div className="rounded-lg border-2 border-dashed border-border p-10 text-center text-muted-foreground text-sm">
              Nenhuma análise salva ainda. Abra o Simulador HPLC e crie uma nova análise.
            </div>
          ) : (
            <div className="rounded-lg border overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-muted">
                  <tr>
                    {["Sessão", "Fórmula", "Corridas", "Status", "Data", ""].map(h => (
                      <th key={h} className="px-4 py-2.5 text-left font-semibold text-muted-foreground text-[11px] uppercase tracking-wide">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {recentSessions.map(s => {
                    const sc = STATUS_COLOR[s.status] ?? STATUS_COLOR.em_andamento;
                    return (
                      <tr key={s.id} className="hover:bg-muted/40 transition-colors">
                        <td className="px-4 py-3 font-medium text-foreground max-w-[200px]">
                          <span className="block truncate" title={s.name}>{s.name}</span>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {s.formulaId ? (formulas[s.formulaId] ?? <span className="italic opacity-50">—</span>) : <span className="italic opacity-50">—</span>}
                        </td>
                        <td className="px-4 py-3 text-center font-mono">
                          {s.runs?.length ?? 0}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-medium text-[10px]"
                            style={{ background: sc.bg, color: sc.text, border: `1px solid ${sc.border}` }}
                          >
                            {STATUS_ICON[s.status]}
                            {STATUS_LABEL[s.status] ?? s.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                          {fmt(s.createdAt)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs gap-1"
                            onClick={() => openSessionInSimulator(s.id)}
                          >
                            Abrir <ChevronRight className="h-3 w-3" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {sessions.length > 6 && (
                <div className="px-4 py-2 text-center border-t bg-muted/30">
                  <button
                    className="text-xs text-blue-700 hover:text-blue-900 font-medium"
                    onClick={() => navigate("/simulator")}
                  >
                    + {sessions.length - 6} análises — ver todas no simulador
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Curvas de Calibração */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Curvas de Calibração dos Ativos
              {calibEntries.length > 0 && (
                <span className="ml-2 bg-emerald-100 text-emerald-700 rounded-full px-2 py-0.5 text-[10px] font-bold normal-case tracking-normal">
                  {calibEntries.length}
                </span>
              )}
            </h2>
            <Button variant="ghost" size="sm" className="text-xs text-blue-700 gap-1" onClick={() => navigate("/simulator")}>
              Gerenciar no simulador <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>

          {calibEntries.length === 0 ? (
            <div className="rounded-lg border-2 border-dashed border-border p-10 text-center text-muted-foreground text-sm">
              Nenhuma curva de calibração salva ainda. Configure as curvas na aba Calibração do Simulador HPLC.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {calibEntries.map(([compoundId, calib]) => {
                const name = calib.calib?.compoundName || compoundId;
                const stds = calib.standards ?? [];
                const r = stds.length >= 2
                  ? linReg(stds.map(s => ({ x: s.amount, y: s.area })))
                  : null;
                const r2 = r !== null ? r * r : null;
                const r2Color = r2 === null ? "#64748b" : r2 >= 0.999 ? "#16a34a" : r2 >= 0.99 ? "#d97706" : "#dc2626";
                const isLocked = calib.locked === true;

                return (
                  <div
                    key={compoundId}
                    className="border rounded-lg p-4 bg-card hover:shadow-sm transition-shadow"
                    style={{ borderColor: isLocked ? "#fde68a" : undefined }}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <div className="font-semibold text-sm text-foreground flex items-center gap-1.5">
                          <TrendingUp className="h-4 w-4 text-emerald-600 shrink-0" />
                          <span className="truncate max-w-[140px]" title={name}>{name}</span>
                        </div>
                        {calib.calib?.expRT ? (
                          <div className="text-[10px] text-muted-foreground mt-0.5">RT esperado: {calib.calib.expRT} min</div>
                        ) : null}
                      </div>
                      {isLocked ? (
                        <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-700 border border-amber-300 rounded-full px-2 py-0.5 text-[10px] font-bold shrink-0">
                          <Lock className="h-3 w-3" /> Travada
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 bg-gray-100 text-gray-500 border border-gray-200 rounded-full px-2 py-0.5 text-[10px] shrink-0">
                          <Unlock className="h-3 w-3" /> Editável
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-center mb-3">
                      <div className="bg-muted rounded p-2">
                        <div className="text-sm font-bold text-foreground">{stds.length}</div>
                        <div className="text-[9px] text-muted-foreground uppercase tracking-wide">Padrões</div>
                      </div>
                      <div className="bg-muted rounded p-2 col-span-2">
                        <div className="text-sm font-bold" style={{ color: r2Color }}>
                          {r2 !== null ? `R² = ${r2.toFixed(5)}` : "—"}
                        </div>
                        <div className="text-[9px] text-muted-foreground uppercase tracking-wide">
                          {r2 !== null ? (r2 >= 0.999 ? "Excelente" : r2 >= 0.99 ? "Bom" : "Verificar") : "Sem dados"}
                        </div>
                      </div>
                    </div>

                    {stds.length > 0 && (
                      <div className="text-[9px] text-muted-foreground font-mono border-t pt-2 space-y-0.5">
                        {[...stds].sort((a, b) => a.amount - b.amount).slice(0, 4).map((s, i) => (
                          <div key={s.id} className="flex justify-between">
                            <span>Nível {i + 1}: {s.amount} µg/mL</span>
                            <span>{s.area.toFixed(0)} mAU·s</span>
                          </div>
                        ))}
                        {stds.length > 4 && (
                          <div className="text-center opacity-50">+ {stds.length - 4} níveis</div>
                        )}
                      </div>
                    )}

                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full mt-3 text-xs gap-1 h-7"
                      onClick={() => navigate("/simulator")}
                    >
                      {isLocked ? <Lock className="h-3 w-3" /> : <TrendingUp className="h-3 w-3" />}
                      {isLocked ? "Ver (travada)" : "Editar no Simulador"}
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </main>

      {/* Footer */}
      <footer className="border-t mt-8 py-4 text-center text-xs text-muted-foreground">
        Alphafitus Laboratório Nutracêutico · Simulador HPLC Agilent ChemStation
      </footer>
    </div>
  );
}
