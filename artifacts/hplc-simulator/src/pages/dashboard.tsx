import React, { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/use-auth";
import {
  FlaskConical, LogOut, BarChart3, FileText, Activity,
  ChevronRight, Microscope, Database, Lock, Unlock,
  CheckCircle2, XCircle, Clock, FileCheck2, TrendingUp, Layers, Scale,
  ScrollText, ClipboardCheck, ClipboardX,
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
  conclusionNotes?: string;
  snapshotState?: unknown;
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

type SortCol = "name" | "date" | "runs" | "status";

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
  em_andamento: "In Progress",
  aprovado: "Approved",
  reprovado: "Rejected",
  laudo_emitido: "Report Issued",
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
    return new Date(iso).toLocaleDateString("en-US", { day: "2-digit", month: "2-digit", year: "numeric" });
  } catch { return iso; }
}

export default function DashboardPage() {
  const { user, logout } = useAuth();
  const [, navigate] = useLocation();

  const [sessions, setSessions] = useState<StoredSession[]>([]);
  const [calibrations, setCalibrations] = useState<Record<string, StoredCalibration>>({});
  const [formulas, setFormulas] = useState<Record<string, string>>({});

  /* Sessions panel state */
  const sessionsRef = useRef<HTMLDivElement>(null);
  const [sessionSearch, setSessionSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortCol>("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  const handleStatCardClick = (filter: string | null, isActive: boolean) => {
    setStatusFilter(isActive ? null : filter);
    setTimeout(() => {
      sessionsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  };

  useEffect(() => {
    try {
      const raw = localStorage.getItem("hplc_analysis_sessions_v1");
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

  function openSimulatorTab(tab: string) {
    localStorage.setItem("hplc_dashboard_target_page", tab);
    navigate("/simulator");
  }

  const sessionStats = {
    total: sessions.length,
    em_andamento: sessions.filter(s => s.status === "em_andamento").length,
    aprovado: sessions.filter(s => s.status === "aprovado").length,
    reprovado: sessions.filter(s => s.status === "reprovado").length,
    laudo_emitido: sessions.filter(s => s.status === "laudo_emitido").length,
  };

  const calibEntries = Object.entries(calibrations);

  const cards = [
    {
      icon: <BarChart3 className="h-8 w-8 text-blue-600" />,
      title: "Chromatogram",
      description: "Configure peaks, detector DAD, baseline, noise and run the chromatographic simulation.",
      action: () => openSimulatorTab("chromatogram"),
      cta: "Open Chromatogram",
      color: "border-blue-200 hover:border-blue-400",
      badge: "Main",
      badgeColor: "bg-blue-100 text-blue-700",
    },
    {
      icon: <FlaskConical className="h-8 w-8 text-emerald-600" />,
      title: "Analysis Sessions",
      description: "Create and manage analysis sessions, attach chromatogram snapshots and link to lots.",
      action: () => openSimulatorTab("analise"),
      cta: "Open Analysis",
      color: "border-emerald-200 hover:border-emerald-400",
    },
    {
      icon: <FileText className="h-8 w-8 text-violet-600" />,
      title: "Calibration Curve",
      description: "Build and view the calibration curve, check R², export and print the analytical report.",
      action: () => openSimulatorTab("report"),
      cta: "Open Calibration Curve",
      color: "border-violet-200 hover:border-violet-400",
    },
    {
      icon: <Database className="h-8 w-8 text-orange-600" />,
      title: "Active Compounds",
      description: "Manage the compound bank with RT, wavelength, response factors and calibration data.",
      action: () => openSimulatorTab("ativos"),
      cta: "Open Compounds",
      color: "border-orange-200 hover:border-orange-400",
    },
    {
      icon: <Layers className="h-8 w-8 text-slate-600" />,
      title: "Lots / Formulas",
      description: "Register production lots, link them to analytical formulas and track batch results.",
      action: () => openSimulatorTab("lotes"),
      cta: "Open Lots",
      color: "border-slate-200 hover:border-slate-400",
    },
    {
      icon: <Scale className="h-8 w-8 text-red-600" />,
      title: "External Standard",
      description: "Single-point external standard quantification — calculate purity vs. reference standard.",
      action: () => openSimulatorTab("padrao"),
      cta: "Open Standard",
      color: "border-red-200 hover:border-red-400",
    },
  ];

  /* ── Sessions sort helper ── */
  const toggleSort = (col: SortCol) => {
    if (sortBy === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortBy(col); setSortDir("desc"); }
  };

  const searchQ = sessionSearch.trim().toLowerCase();
  const displayed = [...sessions]
    .filter(s => !statusFilter || s.status === statusFilter)
    .filter(s => {
      if (!searchQ) return true;
      const fName = s.formulaId ? (formulas[s.formulaId] ?? "") : "";
      return s.name.toLowerCase().includes(searchQ) || fName.toLowerCase().includes(searchQ);
    })
    .sort((a, b) => {
      let cmp = 0;
      if (sortBy === "name")        cmp = a.name.localeCompare(b.name);
      else if (sortBy === "date")   cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      else if (sortBy === "runs")   cmp = (a.runs?.length ?? 0) - (b.runs?.length ?? 0);
      else if (sortBy === "status") cmp = (STATUS_LABEL[a.status] ?? a.status).localeCompare(STATUS_LABEL[b.status] ?? b.status);
      return sortDir === "asc" ? cmp : -cmp;
    });

  const SortTh = ({ col, label, center }: { col: SortCol; label: string; center?: boolean }) => {
    const active = sortBy === col;
    return (
      <th onClick={() => toggleSort(col)}
        className={`px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide select-none cursor-pointer group whitespace-nowrap ${center ? "text-center" : "text-left"}`}>
        <span className={`inline-flex items-center gap-1 ${active ? "text-blue-600" : "group-hover:text-foreground transition-colors"}`}>
          {label}
          <span className="text-[10px]">{active ? (sortDir === "asc" ? "↑" : "↓") : <span className="opacity-30 group-hover:opacity-60">↕</span>}</span>
        </span>
      </th>
    );
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Topbar */}
      <header className="border-b bg-card shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/logo-alphafitus.png" alt="Alphafitus" className="h-9 w-auto" />
            <div className="border-l border-border pl-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground leading-none">Alphafitus Nutraceutical Laboratory</p>
              <p className="text-sm font-semibold text-foreground leading-snug mt-0.5">HPLC Simulator — Agilent ChemStation</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground hidden sm:block">
              {user?.displayName ?? user?.username}
            </span>
            <Button variant="ghost" size="sm" onClick={handleLogout} className="gap-1.5 text-muted-foreground hover:text-destructive">
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Sign Out</span>
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
              <h1 className="text-2xl font-bold tracking-tight">Control Panel</h1>
              <p className="text-blue-200 text-sm">Welcome, {user?.displayName ?? user?.username}. Select a module to get started.</p>
            </div>
          </div>

          {sessions.length > 0 && (
            <div className="mt-5 grid grid-cols-5 gap-3 max-w-xl">
              {[
                { label: "Total",       value: sessionStats.total,         color: "bg-white/10" },
                { label: "In Progress", value: sessionStats.em_andamento,  color: "bg-blue-400/20" },
                { label: "Approved",    value: sessionStats.aprovado,      color: "bg-green-400/20" },
                { label: "Rejected",    value: sessionStats.reprovado,     color: "bg-red-400/20" },
                { label: "Reports",     value: sessionStats.laudo_emitido, color: "bg-purple-400/20" },
              ].map(s => (
                <div key={s.label} className={`${s.color} rounded-lg px-3 py-2 text-center`}>
                  <div className="text-xl font-bold text-white">{s.value}</div>
                  <div className="text-[9px] text-blue-200 uppercase tracking-wide">{s.label}</div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-6">
            <Button
              size="lg"
              className="bg-white text-blue-900 hover:bg-blue-50 font-semibold gap-2 shadow-lg"
              onClick={() => openSimulatorTab("chromatogram")}
            >
              <BarChart3 className="h-5 w-5" />
              Open HPLC Simulator
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-10">

        {/* ── Module Cards ── */}
        <div>
          <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-4">Simulator Modules</h2>
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

        {/* ── Sessions Panel ── */}
        <div className="space-y-5">

          {/* Header + Search */}
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
              <ScrollText className="h-3.5 w-3.5" />
              Analysis Sessions
              {sessions.length > 0 && (
                <span className="bg-blue-100 text-blue-700 rounded-full px-2 py-0.5 text-[10px] font-bold normal-case tracking-normal">
                  {sessions.length}
                </span>
              )}
            </h2>
            <div className="flex items-center gap-3">
              <div className="relative">
                <Activity className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/60 pointer-events-none" />
                <input
                  value={sessionSearch}
                  onChange={e => setSessionSearch(e.target.value)}
                  placeholder="Search by name or formula…"
                  className="w-60 h-8 pl-8 pr-7 text-xs rounded-lg border border-border bg-muted/30 placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-blue-400/40 focus:border-blue-300 transition-all"
                />
                {sessionSearch && (
                  <button onClick={() => setSessionSearch("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-foreground transition-colors text-sm leading-none">
                    ✕
                  </button>
                )}
              </div>
              <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5"
                onClick={() => openSimulatorTab("analise")}>
                <FlaskConical className="h-3.5 w-3.5" /> Open in Simulator
              </Button>
            </div>
          </div>

          {/* 5 Stat cards */}
          {sessions.length > 0 && (
            <div className="grid grid-cols-5 gap-3">
              {([
                { label: "Total",       value: sessionStats.total,         bgCls: "bg-slate-50",  borderBase: "#cbd5e1", colorHex: "#334155", Icon: Activity,       filter: null },
                { label: "In Progress", value: sessionStats.em_andamento,  bgCls: "bg-blue-50",   borderBase: "#93c5fd", colorHex: "#1d4ed8", Icon: FlaskConical,   filter: "em_andamento" },
                { label: "Approved",    value: sessionStats.aprovado,      bgCls: "bg-green-50",  borderBase: "#86efac", colorHex: "#16a34a", Icon: ClipboardCheck, filter: "aprovado" },
                { label: "Rejected",    value: sessionStats.reprovado,     bgCls: "bg-red-50",    borderBase: "#fca5a5", colorHex: "#dc2626", Icon: ClipboardX,     filter: "reprovado" },
                { label: "Reports",     value: sessionStats.laudo_emitido, bgCls: "bg-violet-50", borderBase: "#d8b4fe", colorHex: "#7c3aed", Icon: FileCheck2,     filter: "laudo_emitido" },
              ] as { label: string; value: number; bgCls: string; borderBase: string; colorHex: string; Icon: React.ComponentType<{ className?: string }>; filter: string | null }[]).map(({ label, value, bgCls, borderBase, colorHex, Icon, filter }) => {
                const isActive = statusFilter === filter;
                return (
                  <div key={label}
                    onClick={() => handleStatCardClick(filter, isActive)}
                    className={`${bgCls} rounded-xl p-3 text-center cursor-pointer select-none transition-all duration-150 hover:shadow-md`}
                    style={{
                      border: `2px solid ${isActive ? colorHex : borderBase}`,
                      transform: isActive ? "scale(1.04)" : "scale(1)",
                      boxShadow: isActive ? `0 4px 16px ${colorHex}30` : undefined,
                    }}>
                    <Icon className="h-5 w-5 mx-auto mb-1.5" style={{ color: colorHex }} />
                    <div className="text-[22px] font-bold leading-none" style={{ color: colorHex }}>{value}</div>
                    <div className="text-[9px] text-muted-foreground uppercase tracking-wide mt-1.5">{label}</div>
                    {isActive && <div className="text-[8px] font-bold mt-0.5" style={{ color: colorHex }}>filtered ✓</div>}
                  </div>
                );
              })}
            </div>
          )}

          {/* Active filter pills */}
          {(statusFilter || sessionSearch) && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] text-muted-foreground">Showing {displayed.length} of {sessions.length}:</span>
              {statusFilter && (
                <span className="inline-flex items-center gap-1 bg-blue-100 text-blue-700 border border-blue-200 rounded-full px-2.5 py-0.5 text-[11px] font-medium">
                  Status: {STATUS_LABEL[statusFilter]}
                  <button onClick={() => setStatusFilter(null)} className="ml-1 hover:text-blue-900 leading-none">✕</button>
                </span>
              )}
              {sessionSearch && (
                <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-700 border border-slate-200 rounded-full px-2.5 py-0.5 text-[11px] font-medium">
                  "{sessionSearch}"
                  <button onClick={() => setSessionSearch("")} className="ml-1 hover:text-slate-900 leading-none">✕</button>
                </span>
              )}
              <button onClick={() => { setStatusFilter(null); setSessionSearch(""); }}
                className="text-[11px] text-muted-foreground hover:text-foreground underline underline-offset-2 ml-1">
                Clear all
              </button>
            </div>
          )}

          {/* Table */}
          <div ref={sessionsRef} />
          {sessions.length === 0 ? (
            <div className="rounded-xl border-2 border-dashed border-border p-12 text-center">
              <FlaskConical className="h-11 w-11 text-muted-foreground/20 mx-auto mb-3" />
              <p className="text-sm font-semibold text-muted-foreground">No analysis sessions yet</p>
              <p className="text-xs text-muted-foreground/50 mt-1">Open the HPLC Simulator and create a new session in the Analysis tab.</p>
              <Button size="sm" className="mt-4 gap-1.5" onClick={() => openSimulatorTab("analise")}>
                <FlaskConical className="h-4 w-4" /> Open Analysis
              </Button>
            </div>
          ) : displayed.length === 0 ? (
            <div className="rounded-xl border-2 border-dashed border-border p-10 text-center">
              <p className="text-sm text-muted-foreground">No sessions match your filters.</p>
              <button onClick={() => { setStatusFilter(null); setSessionSearch(""); }}
                className="text-xs text-blue-600 hover:underline mt-2 block mx-auto">Clear filters</button>
            </div>
          ) : (
            <div className="rounded-xl border border-border overflow-hidden shadow-sm">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/60 border-b border-border">
                    <SortTh col="name" label="Session" />
                    <th className="px-4 py-3 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Formula</th>
                    <SortTh col="runs" label="Runs" center />
                    <SortTh col="status" label="Status" />
                    <SortTh col="date" label="Date" />
                    <th className="px-4 py-3 text-right text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Details</th>
                  </tr>
                </thead>
                <tbody className="bg-card">
                  {displayed.map(s => {
                    const sc = STATUS_COLOR[s.status] ?? STATUS_COLOR.em_andamento;
                    const fName = s.formulaId ? (formulas[s.formulaId] ?? null) : null;
                    const isExpanded = expandedId === s.id;
                    const toggle = () => setExpandedId(isExpanded ? null : s.id);
                    const runsCount = s.runs?.length ?? 0;

                    return (
                      <React.Fragment key={s.id}>
                        <tr
                          onClick={toggle}
                          className={`border-b border-border cursor-pointer transition-colors ${isExpanded ? "bg-blue-50/70" : "hover:bg-muted/30"}`}>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <span className={`transition-transform duration-200 text-muted-foreground/50 text-xs ${isExpanded ? "rotate-90" : ""}`}>▶</span>
                              <span className="font-semibold text-blue-700 truncate max-w-[200px]" title={s.name}>{s.name}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-xs text-muted-foreground max-w-[160px]">
                            <span className="truncate block">{fName ?? <span className="italic opacity-40">—</span>}</span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <div className="flex items-center justify-center gap-0.5">
                              {Array.from({ length: Math.min(runsCount, 6) }).map((_, i) => (
                                <span key={i} className="w-1.5 h-1.5 rounded-full bg-blue-400 inline-block" />
                              ))}
                              {runsCount > 6 && <span className="text-[9px] text-blue-400 ml-0.5">+{runsCount - 6}</span>}
                              {runsCount === 0 && <span className="text-[10px] text-muted-foreground/40 italic">none</span>}
                            </div>
                            <div className="text-[10px] text-center text-muted-foreground mt-0.5">{runsCount}</div>
                          </td>
                          <td className="px-4 py-3">
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold"
                              style={{ background: sc.bg, color: sc.text, border: `1px solid ${sc.border}` }}>
                              {STATUS_ICON[s.status]}
                              {STATUS_LABEL[s.status] ?? s.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                            {fmt(s.createdAt)}
                          </td>
                          <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                            <Button size="sm" variant={isExpanded ? "default" : "outline"}
                              className={`h-7 text-xs gap-1 ${isExpanded ? "bg-blue-600 hover:bg-blue-700 text-white" : "border-blue-200 text-blue-700 hover:bg-blue-50"}`}
                              onClick={toggle}>
                              {isExpanded ? "Close ▲" : "Details ▼"}
                            </Button>
                          </td>
                        </tr>

                        {/* Expanded detail panel */}
                        {isExpanded && (
                          <tr className="border-b border-border">
                            <td colSpan={6} className="px-0 py-0">
                              <div className="bg-blue-50/40 border-t border-blue-100 px-6 py-4 space-y-4">

                                <div className="grid grid-cols-3 gap-4">
                                  <div className="bg-white rounded-lg border border-border p-3 space-y-1">
                                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Created</p>
                                    <p className="text-sm font-medium text-foreground">
                                      {new Date(s.createdAt).toLocaleDateString("en-US", { day: "2-digit", month: "short", year: "numeric" })}
                                    </p>
                                  </div>
                                  <div className="bg-white rounded-lg border border-border p-3 space-y-1">
                                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Snapshot</p>
                                    <p className={`text-sm font-medium ${s.snapshotState ? "text-green-700" : "text-muted-foreground"}`}>
                                      {s.snapshotState ? "✓ Available" : "— Not saved"}
                                    </p>
                                  </div>
                                  <div className="bg-white rounded-lg border border-border p-3 space-y-1">
                                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Formula</p>
                                    <p className="text-sm font-medium text-foreground truncate">
                                      {fName ?? <span className="italic text-muted-foreground">None linked</span>}
                                    </p>
                                  </div>
                                </div>

                                {s.conclusionNotes && (
                                  <div className="bg-white rounded-lg border border-amber-200 px-4 py-3">
                                    <p className="text-[10px] font-semibold text-amber-700 uppercase tracking-wide mb-1">Conclusion Notes</p>
                                    <p className="text-xs text-foreground leading-relaxed">{s.conclusionNotes}</p>
                                  </div>
                                )}

                                <div className="flex gap-2 pt-1">
                                  <Button size="sm" className="h-8 text-xs gap-1.5 bg-blue-600 hover:bg-blue-700 text-white"
                                    onClick={e => { e.stopPropagation(); openSessionInSimulator(s.id); }}>
                                    <FlaskConical className="h-3.5 w-3.5" /> Open in Simulator
                                  </Button>
                                  <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5"
                                    onClick={e => { e.stopPropagation(); openSimulatorTab("analise"); }}>
                                    <Activity className="h-3.5 w-3.5" /> Go to Analysis
                                  </Button>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── Calibration Curves ── */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Active Compound Calibration Curves
              {calibEntries.length > 0 && (
                <span className="ml-2 bg-emerald-100 text-emerald-700 rounded-full px-2 py-0.5 text-[10px] font-bold normal-case tracking-normal">
                  {calibEntries.length}
                </span>
              )}
            </h2>
            <Button variant="ghost" size="sm" className="text-xs text-blue-700 gap-1" onClick={() => openSimulatorTab("report")}>
              Manage in simulator <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>

          {calibEntries.length === 0 ? (
            <div className="rounded-lg border-2 border-dashed border-border p-10 text-center text-muted-foreground text-sm">
              No calibration curves saved yet. Set up curves in the Calibration Curve tab of the HPLC Simulator.
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
                          <div className="text-[10px] text-muted-foreground mt-0.5">Expected RT: {calib.calib.expRT} min</div>
                        ) : null}
                      </div>
                      {isLocked ? (
                        <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-700 border border-amber-300 rounded-full px-2 py-0.5 text-[10px] font-bold shrink-0">
                          <Lock className="h-3 w-3" /> Locked
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 bg-gray-100 text-gray-500 border border-gray-200 rounded-full px-2 py-0.5 text-[10px] shrink-0">
                          <Unlock className="h-3 w-3" /> Editable
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-center mb-3">
                      <div className="bg-muted rounded p-2">
                        <div className="text-sm font-bold text-foreground">{stds.length}</div>
                        <div className="text-[9px] text-muted-foreground uppercase tracking-wide">Standards</div>
                      </div>
                      <div className="bg-muted rounded p-2 col-span-2">
                        <div className="text-sm font-bold" style={{ color: r2Color }}>
                          {r2 !== null ? `R² = ${r2.toFixed(5)}` : "—"}
                        </div>
                        <div className="text-[9px] text-muted-foreground uppercase tracking-wide">
                          {r2 !== null ? (r2 >= 0.999 ? "Excellent" : r2 >= 0.99 ? "Good" : "Check") : "No data"}
                        </div>
                      </div>
                    </div>

                    {stds.length > 0 && (
                      <div className="text-[9px] text-muted-foreground font-mono border-t pt-2 space-y-0.5">
                        {[...stds].sort((a, b) => a.amount - b.amount).slice(0, 4).map((s, i) => (
                          <div key={s.id} className="flex justify-between">
                            <span>Level {i + 1}: {s.amount} µg/mL</span>
                            <span>{s.area.toFixed(0)} mAU·s</span>
                          </div>
                        ))}
                        {stds.length > 4 && (
                          <div className="text-center opacity-50">+ {stds.length - 4} more levels</div>
                        )}
                      </div>
                    )}

                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full mt-3 text-xs gap-1 h-7"
                      onClick={() => openSimulatorTab("report")}
                    >
                      {isLocked ? <Lock className="h-3 w-3" /> : <TrendingUp className="h-3 w-3" />}
                      {isLocked ? "View (locked)" : "Edit in Simulator"}
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
        Alphafitus Nutraceutical Laboratory · HPLC Simulator Agilent ChemStation
      </footer>
    </div>
  );
}
