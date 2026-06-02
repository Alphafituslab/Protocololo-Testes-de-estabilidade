import { Switch, Route, Router as WouterRouter, useLocation, Link } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Dashboard from "./pages/dashboard";
import ProtocolsList from "./pages/protocols-list";
import ProtocolForm from "./pages/protocol-form";
import ProtocolDetail from "./pages/protocol-detail";
import CertificatePage from "./pages/certificate";
import ProtocolReportPage from "./pages/protocol-report";
import LoginPage from "./pages/login";
import UsersPage, { ROLE_LABELS } from "./pages/users";
import CatalogPage from "./pages/catalog";
import BackupPage from "./pages/backup";
import { AuthProvider } from "@/contexts/auth-context";
import { useAuth } from "@/contexts/use-auth";
import { FileText, Home, Users, LogOut, Loader2, AlertTriangle, RefreshCcw, BookOpen, DatabaseBackup } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import React, { useEffect, Component } from "react";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
    },
    mutations: {
      onError: (err) => {
        // Only redirect to /login on 401 when NOT already on the login page.
        // Prevents a loop where a background mutation fires on /login and
        // causes a full-page reload that wipes the login form.
        if (
          (err as { status?: number }).status === 401 &&
          !window.location.pathname.endsWith("/login")
        ) {
          window.location.replace("/login");
        }
      },
    },
  },
});

// ── Error boundary ────────────────────────────────────────────────────────────

class AppErrorBoundary extends Component<
  { children: React.ReactNode },
  { hasError: boolean; errorMessage: string; isTransient: boolean }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, errorMessage: "", isTransient: false };
  }

  static getDerivedStateFromError(error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    // DOM reconciliation errors (insertBefore / removeChild) are caused by browser
    // extensions (password managers, translators, Grammarly, etc.) modifying the DOM
    // outside React. They resolve on a clean page reload — auto-reload instead of
    // showing a permanent error screen.
    const isTransient =
      msg.includes("insertBefore") ||
      msg.includes("removeChild") ||
      msg.includes("NotFoundError") ||
      msg.includes("não é filho") ||
      msg.includes("not a child");
    return { hasError: true, errorMessage: msg, isTransient };
  }

  componentDidUpdate() {
    // Trigger the reload AFTER the render cycle completes.
    if (this.state.hasError && this.state.isTransient) {
      window.location.reload();
    }
  }

  render() {
    if (this.state.hasError) {
      if (this.state.isTransient) {
        // Show a spinner while the page reloads (componentDidUpdate fires next).
        return (
          <div className="min-h-screen flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        );
      }
      return (
        <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-8 text-center">
          <AlertTriangle className="h-10 w-10 text-destructive" />
          <div>
            <h2 className="text-lg font-semibold">Algo deu errado</h2>
            <p className="text-sm text-muted-foreground mt-1">{this.state.errorMessage}</p>
          </div>
          <Button
            variant="outline"
            onClick={() => { this.setState({ hasError: false, errorMessage: "", isTransient: false }); window.location.replace("/"); }}
          >
            <RefreshCcw className="h-4 w-4 mr-2" /> Recarregar
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ── Layout & Nav ──────────────────────────────────────────────────────────────

function UserMenu() {
  const { user, logout, isAdmin } = useAuth();
  const [, navigate] = useLocation();
  if (!user) return null;
  const initials = user.displayName.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="relative h-9 px-2 gap-2 hover:bg-secondary">
          <Avatar className="h-7 w-7">
            <AvatarFallback className="text-xs bg-primary/10 text-primary font-semibold">{initials}</AvatarFallback>
          </Avatar>
          <span className="text-sm font-medium hidden sm:block">{user.displayName}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium">{user.displayName}</p>
            <p className="text-xs text-muted-foreground">@{user.username} · {ROLE_LABELS[user.role] ?? "Analista"}</p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {isAdmin && (
          <DropdownMenuItem onClick={() => navigate("/users")}>
            <Users className="h-4 w-4 mr-2" /> Gerenciar usuários
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={async () => { await logout(); }}
          className="text-destructive focus:text-destructive"
        >
          <LogOut className="h-4 w-4 mr-2" /> Sair
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SidebarFooter() {
  const { user, logout, isAdmin } = useAuth();
  const [, navigate] = useLocation();
  if (!user) return null;
  const initials = user.displayName.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();
  return (
    <div className="border-t border-border p-3 space-y-2">
      <div className="flex items-center gap-2 px-2 py-1">
        <Avatar className="h-7 w-7 shrink-0">
          <AvatarFallback className="text-xs bg-primary/10 text-primary font-semibold">{initials}</AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium truncate">{user.displayName}</p>
          <p className="text-[10px] text-muted-foreground truncate">@{user.username} · {ROLE_LABELS[user.role] ?? "Analista"}</p>
        </div>
      </div>
      {isAdmin && (
        <button
          onClick={() => navigate("/users")}
          className="w-full flex items-center gap-2 px-3 py-1.5 rounded-md text-xs text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
        >
          <Users className="h-3.5 w-3.5" /> Gerenciar usuários
        </button>
      )}
      <button
        onClick={async () => { await logout(); }}
        className="w-full flex items-center gap-2 px-3 py-1.5 rounded-md text-xs text-destructive hover:bg-destructive/10 transition-colors font-medium"
      >
        <LogOut className="h-3.5 w-3.5" /> Sair da conta
      </button>
    </div>
  );
}

function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { isAdmin } = useAuth();
  return (
    <div className="min-h-screen w-full flex bg-background">
      <aside className="w-64 border-r border-border bg-card flex flex-col">
        <div className="p-4 border-b border-border flex items-center justify-center">
          <img src="/logo-alphafitus.png" alt="Alphafitus" className="h-12 w-auto" />
        </div>
        <nav className="flex-1 p-4 flex flex-col gap-1">
          <Link href="/" className={`flex items-center gap-2 px-3 py-2 rounded-md transition-colors ${location === "/" ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:bg-secondary hover:text-foreground"}`}>
            <Home className="h-4 w-4" /> Dashboard
          </Link>
          <Link href="/protocols/new" className={`flex items-center gap-2 px-3 py-2 rounded-md transition-colors ${location === "/protocols/new" ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:bg-secondary hover:text-foreground"}`}>
            <FileText className="h-4 w-4" /> Novo Protocolo
          </Link>
          <Link href="/catalog" className={`flex items-center gap-2 px-3 py-2 rounded-md transition-colors ${location === "/catalog" ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:bg-secondary hover:text-foreground"}`}>
            <BookOpen className="h-4 w-4" /> Cadastros
          </Link>
        </nav>
        <SidebarFooter />
      </aside>
      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="h-14 border-b border-border bg-card flex items-center px-6 justify-between">
          <h1 className="font-medium">Protocolo de Estabilidade</h1>
          <UserMenu />
        </header>
        <div className="flex-1 overflow-auto p-6">
          {children}
        </div>
      </main>
    </div>
  );
}

// ── Protected routes ──────────────────────────────────────────────────────────

const REDIRECT_KEY = "alphafitus_redirect";

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { user, isLoading } = useAuth();
  const [location, navigate] = useLocation();

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      try {
        if (location && location !== "/" && location !== "/login") {
          localStorage.setItem(REDIRECT_KEY, location);
        }
      } catch { /* ignore */ }
      navigate("/login", { replace: true });
    }
  }, [user, isLoading]);

  if (isLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <AppErrorBoundary>
      <Layout>
        <AppErrorBoundary>
          <Component />
        </AppErrorBoundary>
      </Layout>
    </AppErrorBoundary>
  );
}

function ProtectedDetailRoute({ component: Component }: { component: React.ComponentType }) {
  const { user, isLoading } = useAuth();
  const [location, navigate] = useLocation();

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      try {
        if (location && location !== "/" && location !== "/login") {
          localStorage.setItem(REDIRECT_KEY, location);
        }
      } catch { /* ignore */ }
      navigate("/login", { replace: true });
    }
  }, [user, isLoading]);

  if (isLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <AppErrorBoundary>
      <Component />
    </AppErrorBoundary>
  );
}

// ── Router ────────────────────────────────────────────────────────────────────

const DashboardRoute = () => <ProtectedRoute component={Dashboard} />;
const ProtocolsListRoute = () => <ProtectedRoute component={ProtocolsList} />;
const ProtocolFormRoute = () => <ProtectedRoute component={ProtocolForm} />;
const CertificateRoute = () => <ProtectedDetailRoute component={CertificatePage} />;
const ProtocolReportRoute = () => <ProtectedDetailRoute component={ProtocolReportPage} />;
const ProtocolDetailRoute = () => <ProtectedRoute component={ProtocolDetail} />;
const UsersRoute = () => <ProtectedRoute component={UsersPage} />;
const CatalogRoute = () => <ProtectedRoute component={CatalogPage} />;
  const BackupRoute   = () => <ProtectedRoute component={BackupPage} />;

const LoginRoute = () => (
  <AppErrorBoundary>
    <LoginPage />
  </AppErrorBoundary>
);

function Router() {
  return (
    <Switch>
      <Route path="/login" component={LoginRoute} />
      <Route path="/" component={DashboardRoute} />
      <Route path="/protocols" component={ProtocolsListRoute} />
      <Route path="/protocols/new" component={ProtocolFormRoute} />
      <Route path="/protocols/:id/edit" component={ProtocolFormRoute} />
      <Route path="/protocols/:id/certificate" component={CertificateRoute} />
      <Route path="/protocols/:id/report" component={ProtocolReportRoute} />
      <Route path="/protocols/:id" component={ProtocolDetailRoute} />
      <Route path="/users" component={UsersRoute} />
      <Route path="/catalog" component={CatalogRoute} />
        <Route path="/backup"  component={BackupRoute} />
      <Route component={NotFound} />
    </Switch>
  );
}

// ── One-time global localStorage migration ────────────────────────────────────
// Runs on every page load. Scans ALL cert_edits_* keys and purges any
// lbl_*, certTitle, docTitle fields that older versions of the app stored.
// This guarantees that even if the browser is running a cached old JS bundle,
// the bad values are cleaned before the certificate can display them.
function useGlobalLocalStorageMigration() {
  useEffect(() => {
    try {
      // certTitle and docTitle are always invalid inside cert_edits_v3 —
      // certTitle now lives in its own dedicated cert_custom_title_${id} key.
      const BAD_KEYS = new Set(["certTitle", "docTitle"]);
      const keysToScan: string[] = [];
      const keysToDelete: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k) continue;
        // Wipe all old v1 and v2 keys entirely — they may have corrupt data.
        if (k.match(/^cert_edits_(?!v3_)\d+$/) || k.match(/^cert_edits_v2_/)) {
          keysToDelete.push(k);
        } else if (k.startsWith("cert_edits_")) {
          keysToScan.push(k);
        }
      }
      keysToDelete.forEach(k => { try { localStorage.removeItem(k); } catch { /* ignore */ } });
      for (const storeKey of keysToScan) {
        try {
          const obj = JSON.parse(localStorage.getItem(storeKey) ?? "{}") as Record<string, string>;
          let dirty = false;
          for (const field of Object.keys(obj)) {
            if (field.startsWith("lbl_") || BAD_KEYS.has(field)) {
              delete obj[field];
              dirty = true;
            }
          }
          if (dirty) localStorage.setItem(storeKey, JSON.stringify(obj));
        } catch { /* skip malformed entry */ }
      }
      try { localStorage.removeItem("cert_lbl_migration_v"); } catch { /* ignore */ }
    } catch { /* ignore */ }
  }, []);
}

function App() {
  useGlobalLocalStorageMigration();
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <WouterRouter base={import.meta.env.BASE_URL?.replace(/\/$/, "") || ""}>
            <Router />
          </WouterRouter>
        </AuthProvider>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
