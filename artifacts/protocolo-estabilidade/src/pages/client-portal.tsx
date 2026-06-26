import { useAuth } from "@/contexts/use-auth";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, LogOut, FileText, Award, AlertTriangle, Clock, CheckCircle2, XCircle, ShieldAlert, Printer } from "lucide-react";

type AssignedProtocol = {
  id: number;
  protocolId: number;
  createdAt: string;
  certNumber: string | null;
  productName: string;
  status: string;
  company: string | null;
  studyStart: string | null;
  studyEnd: string | null;
  conclusion: string | null;
  canViewCertificate: boolean;
  canViewReport: boolean;
  canPrint: boolean;
};

const STATUS_LABEL: Record<string, string> = {
  rascunho: "Rascunho",
  em_andamento: "Em Andamento",
  concluido: "Concluído",
  aprovado: "Aprovado",
  aprovado_com_ressalva: "Aprovado c/ Ressalva",
  reprovado: "Reprovado",
};

const STATUS_COLOR: Record<string, string> = {
  aprovado: "bg-emerald-100 text-emerald-800 border-emerald-200",
  aprovado_com_ressalva: "bg-amber-100 text-amber-800 border-amber-200",
  reprovado: "bg-red-100 text-red-800 border-red-200",
  em_andamento: "bg-blue-100 text-blue-800 border-blue-200",
  concluido: "bg-purple-100 text-purple-800 border-purple-200",
  rascunho: "bg-gray-100 text-gray-600 border-gray-200",
};

function StatusIcon({ status }: { status: string }) {
  if (status === "aprovado") return <CheckCircle2 className="h-4 w-4 text-emerald-600" />;
  if (status === "aprovado_com_ressalva") return <AlertTriangle className="h-4 w-4 text-amber-500" />;
  if (status === "reprovado") return <XCircle className="h-4 w-4 text-red-500" />;
  if (status === "em_andamento") return <Clock className="h-4 w-4 text-blue-500" />;
  return <FileText className="h-4 w-4 text-gray-400" />;
}

export default function ClientPortalPage() {
  const { user, logout, token } = useAuth();
  const [, navigate] = useLocation();

  const { data: protocols = [], isLoading } = useQuery<AssignedProtocol[]>({
    queryKey: ["my-protocols"],
    queryFn: async () => {
      const res = await fetch("/api/my/protocols", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("Erro ao carregar protocolos.");
      return res.json();
    },
    enabled: !!token,
  });

  const expiresAt = (user as { accessExpiresAt?: string | null } | null)?.accessExpiresAt;
  const expired = expiresAt && new Date(expiresAt) < new Date();
  const daysLeft = expiresAt ? Math.ceil((new Date(expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/logo-alphafitus.png" alt="Alphafitus" className="h-9 w-auto" />
            <div>
              <p className="text-sm font-semibold text-gray-800">Portal do Cliente</p>
              <p className="text-xs text-gray-500">Alphafitus Laboratório Nutracêutico</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-sm font-medium text-gray-800">{user?.displayName}</p>
              <p className="text-xs text-gray-500">@{user?.username}</p>
            </div>
            <Button variant="outline" size="sm" onClick={async () => { await logout(); navigate("/login"); }}>
              <LogOut className="h-4 w-4 mr-1.5" /> Sair
            </Button>
          </div>
        </div>
      </header>

      {/* Body */}
      <main className="flex-1 max-w-4xl mx-auto w-full px-6 py-8 space-y-6">

        {/* Expiry warning */}
        {expired ? (
          <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-lg">
            <ShieldAlert className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-red-800">Acesso expirado</p>
              <p className="text-sm text-red-700">Seu acesso ao portal expirou em {new Date(expiresAt!).toLocaleDateString("pt-BR")}. Entre em contato com o laboratório para renovação.</p>
            </div>
          </div>
        ) : daysLeft !== null && daysLeft <= 7 ? (
          <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-lg">
            <Clock className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
            <p className="text-sm text-amber-800">Seu acesso expira em <strong>{daysLeft} dia(s)</strong> ({new Date(expiresAt!).toLocaleDateString("pt-BR")}).</p>
          </div>
        ) : expiresAt ? (
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <Clock className="h-3.5 w-3.5" />
            Acesso válido até {new Date(expiresAt).toLocaleDateString("pt-BR")}
          </div>
        ) : null}

        {/* Title */}
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Seus laudos de análise</h1>
          <p className="text-sm text-gray-500 mt-1">Acesse os certificados e relatórios técnicos dos seus produtos.</p>
        </div>

        {/* Protocol list */}
        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-7 w-7 animate-spin text-primary" />
          </div>
        ) : protocols.length === 0 ? (
          <div className="text-center py-16 border border-dashed rounded-lg bg-white">
            <FileText className="h-10 w-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 font-medium">Nenhum laudo disponível</p>
            <p className="text-sm text-gray-400 mt-1">Os documentos aparecerão aqui quando forem liberados pelo laboratório.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {protocols.map((p) => {
              const hasAnyAction = p.canViewCertificate || p.canViewReport;
              return (
                <div key={p.id} className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <StatusIcon status={p.status} />
                        <h3 className="font-semibold text-gray-900 truncate">{p.productName}</h3>
                        {p.certNumber && (
                          <span className="text-xs text-gray-400 font-mono shrink-0">#{p.certNumber}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 flex-wrap">
                        <Badge className={`text-xs border ${STATUS_COLOR[p.status] ?? STATUS_COLOR["rascunho"]}`} variant="outline">
                          {STATUS_LABEL[p.status] ?? p.status}
                        </Badge>
                        {p.company && <span className="text-xs text-gray-500">{p.company}</span>}
                        {p.studyStart && (
                          <span className="text-xs text-gray-400">
                            Início: {new Date(p.studyStart).toLocaleDateString("pt-BR")}
                          </span>
                        )}
                      </div>
                      {p.conclusion && (
                        <p className="text-xs text-gray-500 mt-2 italic line-clamp-2">{p.conclusion}</p>
                      )}
                    </div>

                    {/* Action buttons — only shown if permission is granted */}
                    <div className="flex flex-col gap-2 shrink-0">
                      {p.canViewCertificate ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5 text-xs"
                          onClick={() => navigate(`/protocols/${p.protocolId}/certificate`)}
                        >
                          <Award className="h-3.5 w-3.5" /> Certificado
                        </Button>
                      ) : null}
                      {p.canViewReport ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5 text-xs"
                          onClick={() => navigate(`/protocols/${p.protocolId}/report`)}
                        >
                          <FileText className="h-3.5 w-3.5" /> Relatório
                        </Button>
                      ) : null}
                      {!hasAnyAction && (
                        <span className="text-xs text-gray-400 italic text-right">Sem documentos liberados</span>
                      )}
                    </div>
                  </div>

                  {/* Print notice — shown only if print is blocked but viewing is allowed */}
                  {(p.canViewCertificate || p.canViewReport) && !p.canPrint && (
                    <div className="mt-3 pt-3 border-t border-gray-100 flex items-center gap-1.5 text-xs text-amber-600">
                      <Printer className="h-3.5 w-3.5 shrink-0" />
                      Visualização apenas — impressão não autorizada neste laudo.
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <p className="text-center text-xs text-gray-400 pt-4">
          Alphafitus Laboratório Nutracêutico · Para suporte, entre em contato com seu representante.
        </p>
      </main>
    </div>
  );
}
