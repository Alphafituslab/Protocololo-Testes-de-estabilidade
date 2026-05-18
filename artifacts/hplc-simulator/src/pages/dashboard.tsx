import { useLocation } from "wouter";
import { useAuth } from "@/contexts/use-auth";
import {
  FlaskConical, LogOut, BarChart3, FileText, Activity,
  ChevronRight, Microscope, Gauge, Database,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function DashboardPage() {
  const { user, logout } = useAuth();
  const [, navigate] = useLocation();

  function handleLogout() {
    logout();
    const base = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
    window.location.replace(base + "/login");
  }

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

      {/* Cards */}
      <main className="max-w-7xl mx-auto px-6 py-8">
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
      </main>

      {/* Footer */}
      <footer className="border-t mt-8 py-4 text-center text-xs text-muted-foreground">
        Alphafitus Laboratório Nutracêutico · Simulador HPLC Agilent ChemStation
      </footer>
    </div>
  );
}
