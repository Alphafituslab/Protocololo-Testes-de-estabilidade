import React from "react";
import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import HplcSimulator from "@/pages/HplcSimulator";
import LoginPage from "@/pages/login";
import DashboardPage from "@/pages/dashboard";
import { AuthProvider } from "@/contexts/auth-context";
import { useAuth } from "@/contexts/use-auth";
import { Loader2 } from "lucide-react";

const queryClient = new QueryClient();

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[ErrorBoundary] Render error:", error, info.componentStack);
  }

  handleReload = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#e8e8e8",
          fontFamily: "Courier New, monospace",
          padding: 32,
          gap: 16,
        }}>
          <div style={{ fontSize: 32 }}>⚠️</div>
          <div style={{ fontSize: 16, fontWeight: "bold", color: "#1e293b" }}>
            Ocorreu um erro inesperado
          </div>
          <div style={{ fontSize: 12, color: "#64748b", maxWidth: 400, textAlign: "center", lineHeight: 1.6 }}>
            {this.state.error?.message ?? "Erro desconhecido"}
          </div>
          <button
            type="button"
            onClick={this.handleReload}
            style={{
              marginTop: 8,
              padding: "8px 24px",
              background: "#1d4ed8",
              color: "#fff",
              border: "none",
              borderRadius: 6,
              fontSize: 13,
              cursor: "pointer",
              fontFamily: "Courier New, monospace",
            }}
          >
            Tentar novamente
          </button>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              padding: "6px 20px",
              background: "transparent",
              color: "#64748b",
              border: "1px solid #cbd5e1",
              borderRadius: 6,
              fontSize: 12,
              cursor: "pointer",
              fontFamily: "Courier New, monospace",
            }}
          >
            Recarregar página
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { user, isLoading } = useAuth();
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-700" />
      </div>
    );
  }
  if (!user) return <Redirect to="/login" />;
  return <Component />;
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={LoginPage} />
      <Route path="/dashboard" component={() => <ProtectedRoute component={DashboardPage} />} />
      <Route path="/simulator" component={() => <ProtectedRoute component={HplcSimulator} />} />
      <Route path="/" component={() => <Redirect to="/dashboard" />} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <ErrorBoundary>
            <WouterRouter base={import.meta.env.BASE_URL?.replace(/\/$/, "") || ""}>
              <Router />
            </WouterRouter>
          </ErrorBoundary>
        </AuthProvider>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
