import { Switch, Route, Router as WouterRouter, useLocation, Link } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Dashboard from "./pages/dashboard";
import ProtocolForm from "./pages/protocol-form";
import ProtocolDetail from "./pages/protocol-detail";
import CertificatePage from "./pages/certificate";
import { Beaker, FileText, Settings, ShieldCheck, Home } from "lucide-react";

const queryClient = new QueryClient();

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
            <FileText className="h-4 w-4" /> New Protocol
          </Link>
        </nav>
      </aside>
      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="h-14 border-b border-border bg-card flex items-center px-6">
          <h1 className="font-medium">Stability Management System</h1>
        </header>
        <div className="flex-1 overflow-auto p-6">
          {children}
        </div>
      </main>
    </div>
  );
}

function Router() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/protocols/new" component={ProtocolForm} />
        <Route path="/protocols/:id/edit" component={ProtocolForm} />
        <Route path="/protocols/:id/certificate" component={CertificatePage} />
        <Route path="/protocols/:id" component={ProtocolDetail} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL?.replace(/\/$/, "") || ""}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
