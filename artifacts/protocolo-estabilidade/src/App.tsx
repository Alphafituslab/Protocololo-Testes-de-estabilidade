import { Switch, Route, Router as WouterRouter, useLocation, Link, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Dashboard from "./pages/dashboard";
import ProtocolForm from "./pages/protocol-form";
import ProtocolDetail from "./pages/protocol-detail";
import CertificatePage from "./pages/certificate";
import LoginPage from "./pages/login";
import UsersPage from "./pages/users";
import { AuthProvider, useAuth } from "@/contexts/auth-context";
import { Beaker, FileText, Home, Users, LogOut, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

const queryClient = new QueryClient({
  defaultOptions: {
    mutations: {
      onError: (err) => {
        if ((err as { status?: number }).status === 401) {
          window.location.href = "/login";
        }
      },
    },
  },
});

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
            <p className="text-xs text-muted-foreground">@{user.username} · {user.role === "admin" ? "Admin" : "Analista"}</p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {isAdmin && (
          <DropdownMenuItem onClick={() => navigate("/users")}>
            <Users className="h-4 w-4 mr-2" /> Gerenciar usuários
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={async () => { await logout(); navigate("/login"); }} className="text-destructive focus:text-destructive">
          <LogOut className="h-4 w-4 mr-2" /> Sair
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  return (
    <div className="min-h-screen w-full flex bg-background">
      <aside className="w-64 border-r border-border bg-card flex flex-col">
        <div className="p-4 border-b border-border flex items-center gap-2 text-primary">
          <ShieldCheck className="h-6 w-6" />
          <span className="font-semibold tracking-tight text-lg">Alphafitus</span>
        </div>
        <nav className="flex-1 p-4 flex flex-col gap-1">
          <Link href="/" className={`flex items-center gap-2 px-3 py-2 rounded-md transition-colors ${location === "/" ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:bg-secondary hover:text-foreground"}`}>
            <Home className="h-4 w-4" /> Dashboard
          </Link>
          <Link href="/protocols/new" className={`flex items-center gap-2 px-3 py-2 rounded-md transition-colors ${location === "/protocols/new" ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:bg-secondary hover:text-foreground"}`}>
            <FileText className="h-4 w-4" /> Novo Protocolo
          </Link>
        </nav>
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

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return (
    <div className="min-h-screen flex items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
  if (!user) return <Redirect to="/login" />;
  return (
    <Layout>
      <Component />
    </Layout>
  );
}

function ProtectedDetailRoute({ component: Component }: { component: React.ComponentType }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return (
    <div className="min-h-screen flex items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
  if (!user) return <Redirect to="/login" />;
  return <Component />;
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={LoginPage} />
      <Route path="/" component={() => <ProtectedRoute component={Dashboard} />} />
      <Route path="/protocols/new" component={() => <ProtectedRoute component={ProtocolForm} />} />
      <Route path="/protocols/:id/edit" component={() => <ProtectedRoute component={ProtocolForm} />} />
      <Route path="/protocols/:id/certificate" component={() => <ProtectedDetailRoute component={CertificatePage} />} />
      <Route path="/protocols/:id" component={() => <ProtectedRoute component={ProtocolDetail} />} />
      <Route path="/users" component={() => <ProtectedRoute component={UsersPage} />} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
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
