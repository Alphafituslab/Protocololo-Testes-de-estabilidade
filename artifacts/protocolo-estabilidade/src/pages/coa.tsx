import React, { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/use-auth";
import {
  Plus, Trash2, Printer, ArrowLeft, ClipboardList,
  ChevronDown, CheckCircle2, XCircle, Clock, Save, Search, X,
  UserPlus, Mail, Users, Trash, AlertTriangle, UserCheck, PenLine, ShieldCheck
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle
} from "@/components/ui/alert-dialog";

// ── Types ─────────────────────────────────────────────────────────────────────

interface CoaDocument {
  id: number;
  productName: string;
  lotNumber: string;
  manufacturingDate: string;
  expiryDate: string;
  company: string;
  responsibleTech: string;
  responsibleTechCrq: string;
  cnpj: string;
  ie: string;
  address: string;
  cep: string;
  notes: string | null;
  status: string;
  signedAt: string | null;
  signedBy: string | null;
  signedRole: string | null;
  createdAt: string;
  updatedAt: string;
  linkedProtocolId: number | null;
  linkedLotId: number | null;
}

interface CoaAuditEntry {
  id: number;
  coaId: number;
  userId: number | null;
  userName: string;
  action: string;
  description: string | null;
  createdAt: string;
}

interface CoaResult {
  id: number;
  coaId: number;
  category: string;
  parameter: string;
  result: string;
  unit: string;
  spec: string;
  method: string;
  status: string;
  sortOrder: number;
}

interface ProtocolOption { id: number; productName: string; }
interface LotOption { id: number; lotNumber: string; manufacturingDate: string; expiryDate: string | null; }
interface ProtocolResultItem { id: number; parameter: string; category: string; result: string; status: string; period: number; }
interface LinkedProtocolDetail { id: number; productName: string; companyName: string; cnpj: string; ie: string | null; address: string | null; cep: string | null; approvedBy: string | null; }
interface Methodology { id: number; shortName: string; citation: string; category: string | null; parameter: string | null; criteria: string | null; }

interface CoaWithResults extends CoaDocument {
  results: CoaResult[];
  linkedProtocol: ProtocolOption | null;
  linkedLots: LotOption[];
  protocolResults: ProtocolResultItem[];
}

// ── Constants ─────────────────────────────────────────────────────────────────

const STANDARD_PARAMS: { category: string; params: string[] }[] = [
  {
    category: "Físico-Química",
    params: ["pH", "Perda por dessecação", "Cor", "Odor", "Aparência", "Cinzas totais", "Dissolução", "Massa média", "Kcal", "Sódio"],
  },
  {
    category: "Microbiológica",
    params: ["Coliformes totais", "Salmonella spp.", "Estafilococos coagulase+", "Bolores e leveduras", "Escherichia coli", "Enterobacteriaceae", "Contagem de Micro-organismos Aeróbios Mesófilos"],
  },
  {
    category: "Teor do Ativo",
    params: ["Cálcio", "Vitamina D", "Vitamina C", "Ferro", "Zinco", "Magnésio", "Vitamina A", "Vitamina E", "Proteína", "Colágeno"],
  },
  {
    category: "Embalagem",
    params: ["Torque de tampa", "Selagem por indução", "Integridade selagem", "Headspace"],
  },
];

// ── Templates predefinidos para Resumo / Observações ─────────────────────────
const NOTES_TEMPLATES = [
  "Produto aprovado conforme todas as especificações técnicas estabelecidas. Todas as análises físico-químicas, microbiológicas e de teor de ativos apresentaram resultados dentro dos limites preconizados.",
  "Produto aprovado com ressalva. Todos os parâmetros críticos estão em conformidade. Observou-se variação aceitável em parâmetros não críticos, sem impacto na qualidade, segurança ou eficácia do produto.",
  "Produto reprovado. Foram identificados desvios nos parâmetros analisados que não atendem às especificações técnicas estabelecidas. O lote não está liberado para comercialização.",
];

// ── Dados fixos da empresa ────────────────────────────────────────────────────
const COMPANY_DEFAULTS = {
  company:  "ALPHAFITUS LABORATÓRIO NUTRACÊUTICO LTDA",
  cnpj:     "",
  ie:       "253385210",
  address:  "Agenor Martinho Lima 41",
  cep:      "88823290",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(d: string) {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  return day && m && y ? `${day}/${m}/${y}` : d;
}

function todayBR() {
  return new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function getCrLabel(name: string): string {
  const n = (name ?? "").toLowerCase();
  if (n.includes("edson")) return "CRQ";
  if (n.includes("clayton") || n.includes("caroline")) return "CRF";
  return "CRF";
}

async function apiFetch<T>(url: string, token: string | null, opts?: RequestInit): Promise<T> {
  const r = await fetch(url, {
    ...opts,
    headers: {
      ...(opts?.headers as Record<string, string> | undefined),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!r.ok) {
    const txt = await r.text().catch(() => r.statusText);
    throw new Error(txt);
  }
  return r.json() as Promise<T>;
}

function statusBadge(s: string) {
  if (s === "conforme") return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-600">
      <CheckCircle2 className="h-3.5 w-3.5" /> Conforme
    </span>
  );
  if (s === "nao_conforme") return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-500">
      <XCircle className="h-3.5 w-3.5" /> Não Conforme
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 text-xs text-gray-400">
      <Clock className="h-3.5 w-3.5" /> Pendente
    </span>
  );
}

// ── CoaList ───────────────────────────────────────────────────────────────────

function CoaList() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { token } = useAuth();
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [fromProtoOpen, setFromProtoOpen] = useState(false);
  const [selProtoId, setSelProtoId] = useState<number | null>(null);
  const [selLotId, setSelLotId] = useState<number | null>(null);
  const [search, setSearch] = useState("");

  const { data: docs = [], isLoading } = useQuery<CoaDocument[]>({
    queryKey: ["coa-list"],
    queryFn: () => apiFetch("/api/coa", token),
  });

  const { data: allProtocols = [] } = useQuery<ProtocolOption[]>({
    queryKey: ["protocols-coa-dialog"],
    queryFn: () => apiFetch<ProtocolOption[]>("/api/protocols", token),
    enabled: fromProtoOpen,
  });

  const { data: protoLots = [] } = useQuery<LotOption[]>({
    queryKey: ["proto-lots-coa", selProtoId],
    queryFn: () => apiFetch<LotOption[]>(`/api/protocols/${selProtoId}/lots`, token),
    enabled: !!selProtoId,
  });

  const createMut = useMutation({
    mutationFn: () => apiFetch<CoaDocument>("/api/coa", token, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    }),
    onSuccess: (doc) => navigate(`/coa/${doc.id}`),
    onError: (e) => toast({ title: "Erro ao criar CoA", description: String(e), variant: "destructive" }),
  });

  const createFromProtoMut = useMutation({
    mutationFn: async () => {
      const lot = protoLots.find(l => l.id === selLotId);
      const proto = allProtocols.find(p => p.id === selProtoId);
      return apiFetch<CoaDocument>("/api/coa", token, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productName: proto?.productName ?? "",
          lotNumber: lot?.lotNumber ?? "",
          manufacturingDate: lot?.manufacturingDate ?? "",
          expiryDate: lot?.expiryDate ?? "",
          linkedProtocolId: selProtoId,
          linkedLotId: selLotId,
        }),
      });
    },
    onSuccess: (doc) => { setFromProtoOpen(false); navigate(`/coa/${doc.id}`); },
    onError: (e) => toast({ title: "Erro", description: String(e), variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/coa/${id}`, token, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["coa-list"] }); setDeleteId(null); },
    onError: (e) => toast({ title: "Erro ao excluir", description: String(e), variant: "destructive" }),
  });

  const q = search.trim().toLowerCase();
  const filteredDocs = q
    ? docs.filter(d =>
        (d.productName || "").toLowerCase().includes(q) ||
        (d.lotNumber || "").toLowerCase().includes(q)
      )
    : docs;

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-5xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <ClipboardList className="h-6 w-6 text-primary" />
              CoA — Laudos de Análise
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Certificado de Análise por lote de produção
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => { setSelProtoId(null); setSelLotId(null); setFromProtoOpen(true); }}>
              <Plus className="h-4 w-4 mr-1" /> De Protocolo
            </Button>
            <Button onClick={() => createMut.mutate()} disabled={createMut.isPending}>
              <Plus className="h-4 w-4 mr-1" /> Novo em Branco
            </Button>
          </div>
        </div>

        {/* Search */}
        {!isLoading && docs.length > 0 && (
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar por produto ou lote…"
              className="pl-9 pr-8"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )}

        {/* Table */}
        {isLoading ? (
          <div className="text-center text-muted-foreground py-12">Carregando…</div>
        ) : docs.length === 0 ? (
          <div className="text-center py-16 border border-dashed rounded-xl text-muted-foreground">
            <ClipboardList className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">Nenhum laudo criado ainda</p>
            <p className="text-sm mt-1">Clique em "Novo Laudo" para começar</p>
          </div>
        ) : filteredDocs.length === 0 ? (
          <div className="text-center py-12 border border-dashed rounded-xl text-muted-foreground">
            <Search className="h-8 w-8 mx-auto mb-3 opacity-30" />
            <p className="font-medium">Nenhum resultado para "{search}"</p>
            <p className="text-sm mt-1">Tente buscar por outro nome de produto ou número de lote</p>
          </div>
        ) : (
          <div className="border rounded-xl overflow-hidden bg-card shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Produto</th>
                  <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Lote</th>
                  <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Fabricação</th>
                  <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Validade</th>
                  <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {filteredDocs.map((doc, i) => (
                  <tr
                    key={doc.id}
                    className={`border-b last:border-0 hover:bg-muted/30 cursor-pointer transition-colors ${i % 2 === 1 ? "bg-muted/10" : ""}`}
                    onClick={() => navigate(`/coa/${doc.id}`)}
                  >
                    <td className="px-4 py-3 font-medium">{doc.productName || <span className="text-muted-foreground italic">Sem nome</span>}</td>
                    <td className="px-4 py-3 font-mono text-xs">{doc.lotNumber || "—"}</td>
                    <td className="px-4 py-3">{fmtDate(doc.manufacturingDate)}</td>
                    <td className="px-4 py-3">{fmtDate(doc.expiryDate)}</td>
                    <td className="px-4 py-3">
                      {doc.status === "emitido"
                        ? <Badge className="bg-green-100 text-green-700 border-green-200">Emitido</Badge>
                        : <Badge variant="secondary">Rascunho</Badge>}
                    </td>
                    <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                      <Button
                        size="sm" variant="ghost"
                        className="text-destructive hover:text-destructive hover:bg-destructive/10 h-7 w-7 p-0"
                        onClick={() => setDeleteId(doc.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <AlertDialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Laudo?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. Todos os resultados deste laudo serão removidos permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteId && deleteMut.mutate(deleteId)}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Gerar de Protocolo Dialog */}
      <Dialog open={fromProtoOpen} onOpenChange={setFromProtoOpen}>
        <DialogContent className="max-w-md max-h-[90vh] flex flex-col p-0 gap-0">
          <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
            <DialogTitle>Gerar CoA a partir de Protocolo</DialogTitle>
          </DialogHeader>
          <div className="overflow-y-auto flex-1 px-6 py-4 space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Protocolo</Label>
              <Select
                value={selProtoId ? String(selProtoId) : ""}
                onValueChange={(v) => { setSelProtoId(Number(v)); setSelLotId(null); }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o protocolo…" />
                </SelectTrigger>
                <SelectContent className="max-h-60 overflow-y-auto">
                  {allProtocols.map(p => (
                    <SelectItem key={p.id} value={String(p.id)}>{p.productName || `Protocolo #${p.id}`}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {selProtoId && (
              <div className="space-y-1.5">
                <Label className="text-xs">Lote Piloto</Label>
                <Select
                  value={selLotId ? String(selLotId) : ""}
                  onValueChange={(v) => setSelLotId(Number(v))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o lote…" />
                  </SelectTrigger>
                  <SelectContent className="max-h-60 overflow-y-auto">
                    {protoLots.map(l => (
                      <SelectItem key={l.id} value={String(l.id)}>{l.lotNumber} — {fmtDate(l.manufacturingDate)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              O CoA será vinculado ao protocolo e lote selecionados. Você poderá visualizar o comparativo de resultados e definir se o lote está liberado.
            </p>
          </div>
          <div className="flex justify-end gap-2 px-6 py-4 border-t shrink-0">
            <Button variant="outline" onClick={() => setFromProtoOpen(false)}>Cancelar</Button>
            <Button
              disabled={!selProtoId || !selLotId || createFromProtoMut.isPending}
              onClick={() => createFromProtoMut.mutate()}
            >
              {createFromProtoMut.isPending ? "Criando…" : "Criar CoA"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── CoaDetail ─────────────────────────────────────────────────────────────────

function CoaDetail({ id }: { id: number }) {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { token, user } = useAuth();
  const isCliente = user?.role === "cliente";

  // Auto-trigger print when ?print=1 is in the URL (client download flow)
  React.useEffect(() => {
    if (!isCliente) return undefined;
    const params = new URLSearchParams(window.location.search);
    if (params.get("print") === "1") {
      const t = setTimeout(() => handlePrint(), 1200);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [isCliente]);
  const [addParamOpen, setAddParamOpen] = useState(false);
  const [customParam, setCustomParam] = useState("");
  const [customCategory, setCustomCategory] = useState("Físico-Química");
  const [deleteResultId, setDeleteResultId] = useState<number | null>(null);
  const [importing, setImporting] = useState(false);
  const [printSections, setPrintSections] = useState({
    identificacao: true,
    analises: true,
    resumo: true,
  });

  // ── Signature state ──
  const [signConfirmed, setSignConfirmed] = useState(false);
  const [unsignOpen, setUnsignOpen] = useState(false);
  const [signDialogOpen, setSignDialogOpen] = useState(false);
  const [signForm, setSignForm] = useState({
    role: "",
    dateChoice: "hoje" as "emissao" | "hoje",
    customDate: new Date().toISOString().slice(0, 10),
    customTime: new Date().toTimeString().slice(0, 8),
  });

  // ── History state ──
  const [showHistoryInPdf, setShowHistoryInPdf] = useState(false);
  const [historyCollapsed, setHistoryCollapsed] = useState(false);
  const [pdfSectionsCollapsed, setPdfSectionsCollapsed] = useState(false);
  const [clientAccessCollapsed, setClientAccessCollapsed] = useState(false);

  // ── Client sharing state ──
  const [shareOpen, setShareOpen] = useState(false);
  const [shareForm, setShareForm] = useState({ displayName: "", email: "", accessExpiresAt: "", canPrint: false });
  const [shareLoading, setShareLoading] = useState(false);
  const [shareEmailError, setShareEmailError] = useState<string | null>(null);
  const [revokeId, setRevokeId] = useState<number | null>(null);

  const { data: coa, isLoading, isError } = useQuery<CoaWithResults>({
    queryKey: ["coa", id],
    queryFn: () => apiFetch(`/api/coa/${id}`, token),
    enabled: !!id,
  });

  // Fetch linked protocol for auto-fill
  const { data: linkedProto } = useQuery<LinkedProtocolDetail>({
    queryKey: ["protocol-header", coa?.linkedProtocolId],
    queryFn: () => apiFetch(`/api/protocols/${coa!.linkedProtocolId}`, token),
    enabled: !!coa?.linkedProtocolId,
  });

  // Fetch methodologies for method select + criteria auto-fill
  const { data: methodologies = [] } = useQuery<Methodology[]>({
    queryKey: ["methodologies-coa"],
    queryFn: () => apiFetch("/api/methodologies", token),
  });

  // Fetch clients with CoA access
  type CoaClientAccess = {
    id: number; clientUserId: number; canPrint: boolean; createdAt: string;
    displayName: string; username: string; email: string | null;
  };
  const { data: coaClients = [], refetch: refetchClients } = useQuery<CoaClientAccess[]>({
    queryKey: ["coa-clients", id],
    queryFn: () => apiFetch(`/api/coa/${id}/clients`, token),
    enabled: !!id,
  });

  // ── Local header state ──
  const [header, setHeader] = useState({
    productName: "", lotNumber: "", manufacturingDate: "", expiryDate: "",
    company: "", responsibleTech: "", responsibleTechCrq: "", cnpj: "",
    ie: "", address: "", cep: "", notes: "",
  });

  useEffect(() => {
    if (!coa) return;
    const next = {
      productName: coa.productName ?? "",
      lotNumber: coa.lotNumber ?? "",
      manufacturingDate: coa.manufacturingDate ?? "",
      expiryDate: coa.expiryDate ?? "",
      company:          coa.company          || COMPANY_DEFAULTS.company,
      responsibleTech:  coa.responsibleTech  ?? "",
      responsibleTechCrq: coa.responsibleTechCrq ?? "",
      cnpj:    coa.cnpj    || COMPANY_DEFAULTS.cnpj,
      ie:      coa.ie      || COMPANY_DEFAULTS.ie,
      address: coa.address || COMPANY_DEFAULTS.address,
      cep:     coa.cep     || COMPANY_DEFAULTS.cep,
      notes:   coa.notes   ?? "",
    };
    setHeader(next);
    // Se algum campo da empresa estava vazio no DB, persiste os defaults agora
    const needsSave = (
      !coa.company  || !coa.ie || !coa.address || !coa.cep
    );
    if (needsSave) setTimeout(() => updateDocMut.mutate(next), 0);
  }, [coa?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto-fill campos adicionais do protocolo vinculado e persiste ──
  useEffect(() => {
    if (!linkedProto || !coa) return;
    setHeader(prev => {
      const next = {
        ...prev,
        company:  prev.company  || linkedProto.companyName || COMPANY_DEFAULTS.company,
        cnpj:     prev.cnpj     || linkedProto.cnpj        || COMPANY_DEFAULTS.cnpj,
        ie:       prev.ie       || linkedProto.ie           || COMPANY_DEFAULTS.ie,
        address:  prev.address  || linkedProto.address      || COMPANY_DEFAULTS.address,
        cep:      prev.cep      || linkedProto.cep          || COMPANY_DEFAULTS.cep,
        responsibleTech: prev.responsibleTech || linkedProto.approvedBy || "",
      };
      const changed = Object.keys(next).some(k => next[k as keyof typeof next] !== prev[k as keyof typeof prev]);
      if (changed) setTimeout(() => updateDocMut.mutate(next), 0);
      return next;
    });
  }, [linkedProto?.id, coa?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto-save header ──
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const updateDocMut = useMutation({
    mutationFn: (data: Partial<typeof header>) =>
      apiFetch(`/api/coa/${id}`, token, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["coa", id] }),
  });

  const scheduleHeaderSave = useCallback((data: typeof header) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => updateDocMut.mutate(data), 800);
  }, [id]);

  const saveNow = useCallback((data?: typeof header): Promise<void> => {
    if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null; }
    const payload = data ?? header;
    return new Promise((resolve, reject) => {
      updateDocMut.mutate(payload, { onSuccess: () => resolve(), onError: reject });
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [header, id]);

  const setField = (field: keyof typeof header, value: string) => {
    const next = { ...header, [field]: value };
    setHeader(next);
    scheduleHeaderSave(next);
  };

  const handlePrint = useCallback(() => {
    const num = coa ? String(coa.id).padStart(4, "0") : "0000";
    const prev = document.title;
    document.title = `CERTIFICADO DE ANÁLISE Nº ${num} · Emissão: ${todayBR()}`;
    window.print();
    setTimeout(() => { document.title = prev; }, 2000);
  }, [coa]);

  // ── Mutations ──
  const addResultMut = useMutation({
    mutationFn: (body: { category: string; parameter: string; sortOrder: number; spec?: string; method?: string }) =>
      apiFetch(`/api/coa/${id}/results`, token, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["coa", id] }); setAddParamOpen(false); setCustomParam(""); },
    onError: (e) => toast({ title: "Erro", description: String(e), variant: "destructive" }),
  });

  const seedDefaultsMut = useMutation({
    mutationFn: () => apiFetch(`/api/coa/${id}/seed-defaults`, token, { method: "POST" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["coa", id] }); toast({ title: "Análises padrão adicionadas!" }); },
    onError: (e) => toast({ title: "Erro", description: String(e), variant: "destructive" }),
  });

  const updateResultMut = useMutation({
    mutationFn: ({ resultId, data }: { resultId: number; data: Partial<CoaResult> }) =>
      apiFetch(`/api/coa/${id}/results/${resultId}`, token, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["coa", id] }),
  });

  const deleteResultMut = useMutation({
    mutationFn: (resultId: number) =>
      apiFetch(`/api/coa/${id}/results/${resultId}`, token, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["coa", id] }); setDeleteResultId(null); },
    onError: (e) => toast({ title: "Erro", description: String(e), variant: "destructive" }),
  });

  const emitMut = useMutation({
    mutationFn: () => apiFetch(`/api/coa/${id}`, token, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "emitido" }),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["coa", id] });
      toast({ title: "Laudo marcado como emitido" });
    },
  });

  const signMut = useMutation({
    mutationFn: async () => {
      await saveNow();
      const signerName = header.responsibleTech || coa?.responsibleTech || user?.displayName || user?.username || "";
      const signerRole = signForm.role.trim() || null;
      const dateStr = signForm.dateChoice === "emissao" ? signForm.customDate : new Date().toISOString().slice(0, 10);
      const timeStr = signForm.customTime || new Date().toTimeString().slice(0, 8);
      const chosenDate = `${dateStr}T${timeStr}`;
      return apiFetch(`/api/coa/${id}/sign`, token, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signedBy: signerName, signedRole: signerRole, signedAt: new Date(chosenDate).toISOString() }),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["coa", id] });
      qc.invalidateQueries({ queryKey: ["coa-history", id] });
      setSignConfirmed(false);
      setSignDialogOpen(false);
      toast({ title: "✅ Documento assinado e emitido com sucesso!" });
    },
    onError: (e) => toast({ title: "Erro ao assinar", description: String(e), variant: "destructive" }),
  });

  const unsignMut = useMutation({
    mutationFn: () => apiFetch(`/api/coa/${id}/unsign`, token, { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["coa", id] });
      qc.invalidateQueries({ queryKey: ["coa-history", id] });
      setUnsignOpen(false);
      toast({ title: "Assinatura cancelada — documento em rascunho" });
    },
    onError: (e) => toast({ title: "Erro", description: String(e), variant: "destructive" }),
  });

  const { data: history = [] } = useQuery<CoaAuditEntry[]>({
    queryKey: ["coa-history", id],
    queryFn: () => apiFetch(`/api/coa/${id}/history`, token),
    enabled: !!id && !isCliente,
  });

  // ── Result row debounce (must be before any early returns — Rules of Hooks) ──
  const resultTimers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});

  if (isLoading) return <div className="flex items-center justify-center min-h-screen text-muted-foreground">Carregando…</div>;
  if (isError || !coa) return <div className="flex items-center justify-center min-h-screen text-destructive">Laudo não encontrado.</div>;

  const results = coa.results ?? [];
  const CAT_ORDER = Object.fromEntries(STANDARD_PARAMS.map((g, i) => [g.category, i]));
  const sortedResults = [...results].sort((a, b) => {
    const ca = CAT_ORDER[a.category] ?? 99;
    const cb = CAT_ORDER[b.category] ?? 99;
    if (ca !== cb) return ca - cb;
    return a.sortOrder - b.sortOrder;
  });
  const hasNaoConforme = results.some(r => r.status === "nao_conforme");
  const hasAR = results.some(r => r.status === "ar");
  const allConforme = results.length > 0 && results.every(r => r.status === "conforme" || r.status === "ar");
  const allConformeStrict = results.length > 0 && results.every(r => r.status === "conforme");
  const conclusao = hasNaoConforme ? "REPROVADO" : allConformeStrict ? "APROVADO" : (allConforme && hasAR) ? "AR" : "PENDENTE";

  const addParam = (category: string, parameter: string) => {
    if (!parameter.trim()) return;
    const match = methodologies.find(m => m.parameter === parameter.trim());
    addResultMut.mutate({
      category,
      parameter: parameter.trim(),
      sortOrder: results.length,
      spec: match?.criteria ?? "",
      method: match?.shortName ?? "",
    });
  };
  const scheduleResultSave = (resultId: number, data: Partial<CoaResult>) => {
    if (resultTimers.current[resultId]) clearTimeout(resultTimers.current[resultId]);
    resultTimers.current[resultId] = setTimeout(() => updateResultMut.mutate({ resultId, data }), 600);
  };

  async function handleImportFromProtocol() {
    if (!coa?.protocolResults?.length) return;
    setImporting(true);
    try {
      const protoMap = new Map<string, ProtocolResultItem>();
      coa.protocolResults.forEach(pr => {
        const ex = protoMap.get(pr.parameter);
        if (!ex || pr.period > ex.period) protoMap.set(pr.parameter, pr);
      });
      const toImport = Array.from(protoMap.values()).filter(
        pr => !results.some(r => r.parameter === pr.parameter)
      );
      if (toImport.length === 0) {
        toast({ title: "Todos os parâmetros já estão no laudo" }); return;
      }
      for (let i = 0; i < toImport.length; i++) {
        const pr = toImport[i];
        const match = methodologies.find(m => m.parameter === pr.parameter);
        await apiFetch(`/api/coa/${id}/results`, token, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            category: pr.category,
            parameter: pr.parameter,
            sortOrder: results.length + i,
            spec: match?.criteria ?? "",
            method: match?.shortName ?? "",
          }),
        });
      }
      await qc.invalidateQueries({ queryKey: ["coa", id] });
      toast({ title: `${toImport.length} parâmetro${toImport.length !== 1 ? "s" : ""} importado${toImport.length !== 1 ? "s" : ""} do protocolo` });
    } catch {
      toast({ title: "Erro ao importar parâmetros", variant: "destructive" });
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      {/* ── Screen UI (hidden on print) ─────────────────────────────────────── */}
      <div className="print:hidden">
        {/* Top bar */}
        <div className="sticky top-0 z-30 bg-background border-b shadow-sm">
          <div className="max-w-6xl mx-auto px-6 py-3 flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate(isCliente ? "/client-portal" : "/coa")} className="gap-1.5 text-muted-foreground">
              <ArrowLeft className="h-4 w-4" /> {isCliente ? "Portal" : "Laudos"}
            </Button>
            <div className="flex-1 min-w-0">
              <h1 className="font-semibold text-foreground truncate">
                CoA #{coa.id}{coa.productName ? ` — ${coa.productName}` : ""}
              </h1>
            </div>
            <div className="flex items-center gap-2">
              {!isCliente && (
                <>
                  {coa.signedAt
                    ? <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">✅ Emitido</Badge>
                    : <Badge variant="secondary">Rascunho</Badge>}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={async () => { await saveNow(); toast({ title: "✅ Alterações salvas!" }); }}
                    disabled={updateDocMut.isPending}
                    className="gap-1.5"
                  >
                    <Save className="h-3.5 w-3.5" />
                    {updateDocMut.isPending ? "Salvando…" : "Salvar"}
                  </Button>
                </>
              )}
              <Button size="sm" onClick={handlePrint} className="gap-1.5">
                <Printer className="h-3.5 w-3.5" /> {isCliente ? "Salvar PDF" : "Imprimir Laudo"}
              </Button>
            </div>
          </div>
        </div>

        <div className="max-w-6xl mx-auto px-6 py-6 space-y-6">
          {/* Document info */}
          <div className="border rounded-xl p-5 bg-card shadow-sm">
            <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide mb-4">
              Identificação do Produto
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-2 space-y-1.5">
                <Label className="text-xs">Nome do Produto</Label>
                <Input value={header.productName} onChange={e => setField("productName", e.target.value)} placeholder="Ex: CondFlex 60 Cápsulas" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Lote</Label>
                <Input value={header.lotNumber} onChange={e => setField("lotNumber", e.target.value)} placeholder="Ex: LP-20251105-744" className="font-mono" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Data de Fabricação</Label>
                <Input type="date" value={header.manufacturingDate} onChange={e => setField("manufacturingDate", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Data de Validade</Label>
                <Input type="date" value={header.expiryDate} onChange={e => setField("expiryDate", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">CNPJ</Label>
                <Input value={header.cnpj} onChange={e => setField("cnpj", e.target.value)} placeholder="00.000.000/0000-00" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">IE (Inscrição Estadual)</Label>
                <Input value={header.ie} onChange={e => setField("ie", e.target.value)} placeholder="000.000.000.000" />
              </div>
              <div className="md:col-span-2 space-y-1.5">
                <Label className="text-xs">Empresa / Fabricante</Label>
                <Input value={header.company} onChange={e => setField("company", e.target.value)} placeholder="Ex: ALPHAFITUS Laboratório Nutracêutico" />
              </div>
              <div className="lg:col-span-2 space-y-1.5">
                <Label className="text-xs">Endereço</Label>
                <Input value={header.address} onChange={e => setField("address", e.target.value)} placeholder="Ex: Rua das Palmeiras, 123 – Bairro – Cidade/UF" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">CEP</Label>
                <Input value={header.cep} onChange={e => setField("cep", e.target.value)} placeholder="00000-000" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Responsável Técnico</Label>
                <Input value={header.responsibleTech} onChange={e => setField("responsibleTech", e.target.value)} placeholder="Nome completo" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{getCrLabel(header.responsibleTech || coa.responsibleTech || "")} (Nº do registro)</Label>
                <Input value={header.responsibleTechCrq} onChange={e => setField("responsibleTechCrq", e.target.value)} placeholder="Ex: 13303282" />
              </div>
            </div>
          </div>

          {/* Analysis table */}
          <div className="border rounded-xl bg-card shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b bg-muted/30 gap-3 flex-wrap">
              <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                Análises — {results.length} parâmetro{results.length !== 1 ? "s" : ""}
              </h2>
              <div className="flex items-center gap-2">
                {coa.linkedProtocol && (coa.protocolResults?.length ?? 0) > 0 && (
                  <Button size="sm" variant="outline"
                    className="gap-1.5 border-blue-300 text-blue-700 hover:bg-blue-50"
                    onClick={handleImportFromProtocol}
                    disabled={importing}
                    title="Importa todos os parâmetros do período mais recente do protocolo vinculado"
                  >
                    {importing
                      ? <><span className="h-3.5 w-3.5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin inline-block" /> Importando…</>
                      : <><ClipboardList className="h-3.5 w-3.5" /> Importar do Protocolo</>}
                  </Button>
                )}
                <Button size="sm" variant="outline" onClick={() => setAddParamOpen(true)} className="gap-1.5">
                  <Plus className="h-3.5 w-3.5" /> Adicionar Análise
                </Button>
              </div>
            </div>

            {results.length === 0 ? (
              <div className="text-center py-10 space-y-3">
                <p className="text-muted-foreground text-sm">Nenhuma análise cadastrada neste laudo.</p>
                <button
                  onClick={() => seedDefaultsMut.mutate()}
                  disabled={seedDefaultsMut.isPending}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-60"
                >
                  {seedDefaultsMut.isPending
                    ? <><span className="h-3.5 w-3.5 border-2 border-primary-foreground/40 border-t-primary-foreground rounded-full animate-spin" /> Adicionando…</>
                    : <><Plus className="h-3.5 w-3.5" /> Preencher análises padrão (Físico-Química + Microbiológica)</>}
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/20 text-xs text-muted-foreground">
                      <th className="px-3 py-2 text-left font-medium w-28">Categoria</th>
                      <th className="px-3 py-2 text-left font-medium w-40">Parâmetro</th>
                      <th className="px-3 py-2 text-left font-medium w-44">Critérios de Aceitação</th>
                      <th className="px-3 py-2 text-left font-medium w-32">Resultado Encontrado</th>
                      <th className="px-3 py-2 text-left font-medium w-40">Metodologia</th>
                      <th className="px-3 py-2 text-left font-medium w-36">Situação</th>
                      <th className="px-3 py-2 w-8" />
                    </tr>
                  </thead>
                  <tbody>
                    {sortedResults.map((r, i) => (
                      <ResultRow
                        key={r.id}
                        result={r}
                        even={i % 2 === 0}
                        methodologies={methodologies}
                        onSave={(data) => scheduleResultSave(r.id, data)}
                        onDelete={() => setDeleteResultId(r.id)}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Conclusão */}
            {results.length > 0 && (
              <div className="border-t px-5 py-3 flex items-center gap-3">
                <span className="text-sm font-semibold text-muted-foreground">Conclusão:</span>
                {conclusao === "APROVADO" && (
                  <span className="flex items-center gap-1.5 font-bold text-green-600 text-sm">
                    <CheckCircle2 className="h-4 w-4" /> CONFORME
                  </span>
                )}
                {conclusao === "REPROVADO" && (
                  <span className="flex items-center gap-1.5 font-bold text-red-500 text-sm">
                    <XCircle className="h-4 w-4" /> NÃO CONFORME
                  </span>
                )}
                {conclusao === "AR" && (
                  <span className="flex items-center gap-1.5 font-bold text-amber-600 text-sm">
                    <AlertTriangle className="h-4 w-4" /> APROVADO COM RESSALVA
                  </span>
                )}
                {conclusao === "PENDENTE" && (
                  <span className="flex items-center gap-1.5 text-slate-400 text-sm font-medium">
                    <Clock className="h-4 w-4" /> Aguardando avaliação
                  </span>
                )}
              </div>
            )}

            {/* Status badge inline — a assinatura formal está na seção "Assinatura e Validação" abaixo */}
            {coa.signedAt && (
              <div className="border-t px-5 py-3 bg-emerald-50/60 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  <span className="text-sm font-semibold text-emerald-700">Assinado por {coa.signedBy}</span>
                </div>
                <Button variant="outline" size="sm" className="gap-1.5" onClick={handlePrint}>
                  <Printer className="h-4 w-4" /> Imprimir / Salvar PDF
                </Button>
              </div>
            )}
          </div>

          {/* ── Resumo / Observações ── */}
          <div className="border rounded-xl bg-card shadow-sm p-5 space-y-3">
            <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
              Resumo / Observações do Comparativo
            </h2>
            <div className="flex flex-wrap gap-2">
              {NOTES_TEMPLATES.map((tpl, i) => (
                <button
                  key={i}
                  type="button"
                  title={tpl}
                  onClick={() => setField("notes", tpl)}
                  className={`px-2.5 py-1 rounded-full border text-xs font-medium transition-colors cursor-pointer ${
                    header.notes === tpl
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-muted/40 border-muted-foreground/20 text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {i === 0 ? "✅ Aprovado" : i === 1 ? "⚠️ Aprovado c/ ressalva" : "❌ Reprovado"}
                </button>
              ))}
            </div>
            <textarea
              className="w-full min-h-[100px] text-sm rounded-md border border-input bg-background px-3 py-2 resize-y focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="Descreva brevemente o resultado geral das análises, desvios encontrados, conclusões do comparativo com o protocolo, condições especiais ou informações relevantes que devem constar no laudo…"
              value={header.notes}
              onChange={e => setField("notes", e.target.value)}
            />
            <p className="text-xs text-muted-foreground">Este texto aparece no PDF quando a seção "Resumo" estiver ativada nas configurações abaixo. Clique em um dos chips para preencher automaticamente.</p>
          </div>

          {/* ── Assinatura e Validação (admin only) ── */}
          {!isCliente && (
          <div className={`border-2 rounded-xl p-5 space-y-4 ${coa.signedAt ? "border-emerald-300 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <h2 className="font-semibold text-sm uppercase tracking-wide flex items-center gap-2 text-gray-700">
                  ✍️ Assinatura e Validação do Documento
                </h2>
                {coa.signedAt ? (
                  <p className="text-sm text-emerald-700 mt-1 font-medium">
                    Assinado por <strong>{coa.signedBy}</strong> em{" "}
                    {new Date(coa.signedAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                  </p>
                ) : (
                  <p className="text-xs text-amber-700 mt-1">
                    Este documento ainda não foi assinado. Após a assinatura, o status muda para <strong>Emitido</strong> e o download do PDF é liberado para o cliente.
                  </p>
                )}
              </div>
              {coa.signedAt && (
                <span className="flex items-center gap-1.5 bg-emerald-100 text-emerald-700 border border-emerald-300 rounded-full px-3 py-1 text-xs font-semibold shrink-0">
                  ✅ Documento Assinado
                </span>
              )}
            </div>

            {!coa.signedAt ? (
              <div className="space-y-4">
                {(!(header.productName || coa.productName) || !(header.lotNumber || coa.lotNumber) || !(header.responsibleTech || coa.responsibleTech)) && (
                  <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-100 border border-amber-200 rounded-lg px-3 py-2">
                    <span className="shrink-0">⚠️</span>
                    <span>Preencha os campos obrigatórios antes de assinar: {[!(header.productName || coa.productName) && "Produto", !(header.lotNumber || coa.lotNumber) && "Lote", !(header.responsibleTech || coa.responsibleTech) && "Responsável Técnico"].filter(Boolean).join(", ")}.</span>
                  </div>
                )}
                {/* Prévia do bloco de assinatura — como aparecerá no documento */}
                <div className="border border-dashed border-amber-300 rounded-xl p-4 bg-white">
                  <p className="text-xs text-amber-600 font-medium mb-3 uppercase tracking-wide">Prévia da assinatura no documento</p>
                  <div className="flex justify-end">
                    <div className="text-center min-w-[220px]">
                      <div className="h-10 flex items-end justify-center pb-1">
                        <span style={{ fontFamily: "Dancing Script, cursive", fontSize: "22px", color: "#1e3a5f", opacity: 0.4 }}>
                          {header.responsibleTech || coa.responsibleTech || "Responsável Técnico"}
                        </span>
                      </div>
                      <div style={{ borderTop: "2px solid #1e3a5f", paddingTop: "6px" }}>
                        <div className="font-bold text-sm text-slate-800">{header.responsibleTech || coa.responsibleTech || "Responsável Técnico"}</div>
                        {(header.responsibleTechCrq || coa.responsibleTechCrq) && (
                          <div className="text-xs text-slate-500">{getCrLabel(header.responsibleTech || coa.responsibleTech || "")}: {header.responsibleTechCrq || coa.responsibleTechCrq}</div>
                        )}
                        <div className="text-xs text-slate-400">Assinatura do Responsável Técnico</div>
                      </div>
                    </div>
                  </div>
                </div>
                <Button
                  onClick={() => {
                    setSignForm(f => ({
                      ...f,
                      customDate: new Date().toISOString().slice(0, 10),
                      customTime: new Date().toTimeString().slice(0, 5),
                    }));
                    setSignDialogOpen(true);
                  }}
                  disabled={!(header.responsibleTech || coa.responsibleTech) || !(header.productName || coa.productName) || !(header.lotNumber || coa.lotNumber)}
                  className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  ✍️ Assinar Digitalmente
                </Button>
              </div>
            ) : (
              /* ── Bloco de assinatura após assinar (ASSINATURAS) ── */
              <div className="space-y-4">
                <div className="border border-emerald-200 rounded-xl overflow-hidden bg-white">
                  <div className="bg-slate-800 px-4 py-2.5 flex items-center gap-2">
                    <span className="text-emerald-400 text-sm">🔒</span>
                    <span className="text-white font-semibold text-xs uppercase tracking-widest">Assinaturas</span>
                  </div>
                  <div className="p-5 flex justify-center">
                    <div className="text-center min-w-[260px] max-w-[320px]">
                      {/* Cursive signature */}
                      <div className="h-14 flex items-end justify-center pb-1">
                        <span style={{ fontFamily: "Dancing Script, cursive", fontSize: "28px", color: "#1e3a5f" }}>
                          {coa.signedBy}
                        </span>
                      </div>
                      <div style={{ borderTop: "2px solid #1e3a5f", paddingTop: "8px" }}>
                        <div className="font-bold text-sm text-slate-800">{coa.signedBy}</div>
                        {coa.signedRole && <div className="text-xs text-slate-500">{coa.signedRole}</div>}
                        {(header.responsibleTechCrq || coa.responsibleTechCrq) && (
                          <div className="text-xs text-slate-500">{getCrLabel(header.responsibleTech || coa.responsibleTech || "")}: {header.responsibleTechCrq || coa.responsibleTechCrq}</div>
                        )}
                        <div className="text-xs text-emerald-600">{header.company || coa.company || ""}</div>
                        <div className="text-xs text-emerald-600 font-medium mt-1">
                          ✅ Assinado digitalmente em {new Date(coa.signedAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                  <p className="text-xs text-gray-500 flex-1">Para fazer correções, cancele a assinatura. O status voltará para rascunho e o PDF será bloqueado para clientes.</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive border-destructive hover:bg-red-50 shrink-0"
                    onClick={() => setUnsignOpen(true)}
                    disabled={unsignMut.isPending}
                  >
                    Cancelar assinatura
                  </Button>
                </div>
              </div>
            )}
          </div>
          )}

          {/* ── Configurar PDF (admin only) ── */}
          {!isCliente && (
          <div className="border rounded-xl bg-slate-50 p-4 space-y-3">
            <button
              type="button"
              className="w-full flex items-center justify-between gap-2 text-left"
              onClick={() => setPdfSectionsCollapsed(v => !v)}
            >
              <h2 className="font-semibold text-sm text-slate-600 uppercase tracking-wide flex items-center gap-2">
                🖨️ Configurar Seções do PDF
              </h2>
              <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform duration-200 ${pdfSectionsCollapsed ? "-rotate-90" : ""}`} />
            </button>
            {!pdfSectionsCollapsed && (
              <>
                <p className="text-xs text-slate-500">Escolha quais seções aparecerão ao imprimir / salvar como PDF:</p>
                <div className="flex flex-wrap gap-4">
                  {([
                    { key: "identificacao", label: "Identificação do Produto" },
                    { key: "analises",      label: "Tabela de Análises + Conclusão" },
                    { key: "resumo",        label: "Resumo / Observações" },
                  ] as { key: keyof typeof printSections; label: string }[]).map(({ key, label }) => (
                    <label key={key} className="flex items-center gap-2 cursor-pointer select-none text-sm text-slate-700">
                      <input
                        type="checkbox"
                        checked={printSections[key]}
                        onChange={e => setPrintSections(prev => ({ ...prev, [key]: e.target.checked }))}
                        className="h-4 w-4 rounded accent-primary"
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </>
            )}
          </div>
          )}

          {/* ── Liberar para Cliente (admin only) ── */}
          {!isCliente && (
          <div className="border rounded-xl bg-card shadow-sm p-5 space-y-4 print:hidden">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <button
                type="button"
                className="flex items-center gap-2 text-left flex-1 min-w-0"
                onClick={() => setClientAccessCollapsed(v => !v)}
              >
                <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                  <Users className="h-4 w-4" /> Acesso do Cliente (Portal)
                </h2>
                <ChevronDown className={`h-4 w-4 text-muted-foreground/50 transition-transform duration-200 ${clientAccessCollapsed ? "-rotate-90" : ""}`} />
              </button>
              {!clientAccessCollapsed && (
                <Button size="sm" variant="outline" className="gap-1.5 shrink-0" onClick={() => { setShareEmailError(null); setShareOpen(true); }}>
                  <UserPlus className="h-4 w-4" /> Adicionar Cliente
                </Button>
              )}
            </div>

            {!clientAccessCollapsed && (
              <>
                <p className="text-xs text-muted-foreground">
                  Clientes criados aqui aparecem automaticamente em{" "}
                  <a href="/catalog" className="underline text-primary hover:opacity-80" onClick={e => { e.preventDefault(); (window as Window).location.href = "/catalog#clientes"; }}>
                    Cadastros → Clientes com Acesso ao Portal
                  </a>{" "}
                  para gerenciar acesso, excluir ou estender prazo.
                </p>

            {coaClients.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">Nenhum cliente com acesso a este CoA ainda.</p>
            ) : (
              <div className="divide-y border rounded-lg overflow-hidden">
                {coaClients.map(c => (
                  <div key={c.id} className="flex items-center justify-between px-3 py-2.5 bg-background hover:bg-muted/30 transition-colors gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium text-foreground truncate">{c.displayName}</p>
                        {c.canPrint && (
                          <span className="text-[10px] font-medium bg-blue-50 text-blue-700 border border-blue-200 rounded px-1.5 py-0.5 shrink-0">PDF liberado</span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                        <Mail className="h-3 w-3 shrink-0" />
                        {c.email ?? c.username}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs text-muted-foreground hidden sm:block">
                        {new Date(c.createdAt).toLocaleDateString("pt-BR")}
                      </span>
                      <Button
                        size="sm" variant="outline"
                        className="h-7 px-2 text-xs gap-1 text-muted-foreground"
                        onClick={() => navigate("/users")}
                        title="Gerenciar em Cadastros → Clientes com Acesso ao Portal"
                      >
                        <UserCheck className="h-3 w-3" /> Gerenciar
                      </Button>
                      <Button
                        size="sm" variant="ghost"
                        className="h-7 w-7 p-0 text-destructive hover:text-destructive hover:bg-red-50"
                        onClick={() => setRevokeId(c.id)}
                        title="Revogar acesso a este CoA"
                      >
                        <Trash className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
              </>
            )}
          </div>
          )}

          {/* ── Histórico de Mudanças (admin only) ── */}
          {!isCliente && (
          <div className="border rounded-xl bg-card shadow-sm p-5 space-y-4 print:hidden">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <button
                type="button"
                className="flex items-center gap-2 text-left flex-1 min-w-0"
                onClick={() => setHistoryCollapsed(v => !v)}
              >
                <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                  📋 Histórico de Mudanças
                </h2>
                <ChevronDown className={`h-4 w-4 text-muted-foreground/50 transition-transform duration-200 ${historyCollapsed ? "-rotate-90" : ""}`} />
              </button>
              {!historyCollapsed && (
                <label className="flex items-center gap-2 cursor-pointer select-none text-sm text-slate-600">
                  <input
                    type="checkbox"
                    checked={showHistoryInPdf}
                    onChange={e => setShowHistoryInPdf(e.target.checked)}
                    className="h-4 w-4 rounded accent-primary"
                  />
                  Incluir no PDF
                </label>
              )}
            </div>
            {!historyCollapsed && (history.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">Nenhum registro de auditoria ainda.</p>
            ) : (
              <div className="divide-y border rounded-lg overflow-hidden">
                {history.map(entry => (
                  <div key={entry.id} className="flex items-start gap-3 px-3 py-2.5 bg-background hover:bg-muted/20 transition-colors">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-xs font-semibold rounded-full px-2 py-0.5 ${
                          entry.action === "Assinado" ? "bg-emerald-100 text-emerald-700" :
                          entry.action === "Assinatura cancelada" ? "bg-red-100 text-red-700" :
                          entry.action === "Acesso concedido" ? "bg-blue-100 text-blue-700" :
                          entry.action === "Acesso revogado" ? "bg-orange-100 text-orange-700" :
                          "bg-slate-100 text-slate-600"
                        }`}>{entry.action}</span>
                        <span className="text-xs text-muted-foreground">{entry.userName}</span>
                      </div>
                      {entry.description && (
                        <p className="text-xs text-gray-600 mt-0.5">{entry.description}</p>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0 whitespace-nowrap">
                      {new Date(entry.createdAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                    </span>
                  </div>
                ))}
              </div>
            ))}
          </div>
          )}
        </div>
      </div>

      {/* ── Comparativo com Protocolo ─────────────────────────────────────── */}
      {coa.linkedProtocol && coa.protocolResults && coa.protocolResults.length > 0 && (() => {
        const protoResultsMap = new Map<string, ProtocolResultItem>();
        coa.protocolResults.forEach(pr => {
          const existing = protoResultsMap.get(pr.parameter);
          if (!existing || pr.period > existing.period) protoResultsMap.set(pr.parameter, pr);
        });
        const allParams = Array.from(protoResultsMap.values());
        const matchCount = allParams.filter(pr => {
          const coaresult = results.find(r => r.parameter === pr.parameter);
          return coaresult ? coaresult.status === pr.status : pr.status === "conforme";
        }).length;
        const allOk = allParams.every(pr => pr.status === "conforme");
        return (
          <div className="border rounded-xl bg-card shadow-sm overflow-hidden print:hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b bg-blue-50/60">
              <div>
                <h2 className="font-semibold text-sm text-blue-800 uppercase tracking-wide flex items-center gap-2">
                  <ClipboardList className="h-4 w-4" />
                  Comparativo — Protocolo: {coa.linkedProtocol.productName}
                </h2>
                <p className="text-xs text-blue-600 mt-0.5">
                  Lote vinculado · Período mais recente
                </p>
              </div>
              <div className="flex items-center gap-2">
                {allOk
                  ? <span className="flex items-center gap-1.5 text-green-700 font-semibold text-sm"><CheckCircle2 className="h-4 w-4" /> Todos conformes no protocolo</span>
                  : <span className="flex items-center gap-1.5 text-amber-600 font-semibold text-sm"><Clock className="h-4 w-4" /> {matchCount}/{allParams.length} conformes</span>}
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/20 text-xs text-muted-foreground">
                    <th className="px-3 py-2 text-left font-medium">Categoria</th>
                    <th className="px-3 py-2 text-left font-medium">Parâmetro</th>
                    <th className="px-3 py-2 text-left font-medium">Resultado Protocolo</th>
                    <th className="px-3 py-2 text-left font-medium">Status Protocolo</th>
                    <th className="px-3 py-2 text-left font-medium">Resultado CoA</th>
                    <th className="px-3 py-2 text-left font-medium">Status CoA</th>
                  </tr>
                </thead>
                <tbody>
                  {allParams.map((pr, i) => {
                    const coaR = results.find(r => r.parameter === pr.parameter);
                    return (
                      <tr key={pr.id} className={`border-b last:border-0 ${i % 2 === 1 ? "bg-muted/10" : ""}`}>
                        <td className="px-3 py-2 text-xs text-muted-foreground">{pr.category}</td>
                        <td className="px-3 py-2 font-medium text-sm">{pr.parameter}</td>
                        <td className="px-3 py-2 text-sm">{pr.result || "—"}</td>
                        <td className="px-3 py-2">{statusBadge(pr.status)}</td>
                        <td className="px-3 py-2 text-sm">{coaR?.result || <span className="text-muted-foreground italic">Não registrado</span>}</td>
                        <td className="px-3 py-2">{coaR ? statusBadge(coaR.status) : <span className="text-xs text-muted-foreground">—</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="px-5 py-3 border-t bg-muted/20 text-xs text-muted-foreground">
              Este comparativo é informativo. A decisão de liberação do lote no CoA é independente.
            </div>
          </div>
        );
      })()}

      {/* ── Print layout (hidden on screen) ─────────────────────────────────── */}
      <div className="hidden print:block text-[10pt] leading-snug" style={{ fontFamily: "Arial, sans-serif" }}>
        <style>{`
          @page { margin: 12mm 14mm; size: A4 portrait; }
          @media print {
            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            aside, header, nav { display: none !important; }
            table { border-collapse: collapse; width: 100%; table-layout: auto; }
            th, td { border: 1px solid #cbd5e1; padding: 3px 5px; text-align: left; font-size: 7pt; white-space: nowrap; }
            thead th { background-color: #f1f5f9 !important; font-weight: 700; }
            .cell-method { white-space: normal !important; font-size: 6.5pt; line-height: 1.35; width: 99%; }
            .status-conforme { color: #16a34a; font-weight: bold; }
            .status-nao_conforme { color: #dc2626; font-weight: bold; }
            .status-ar { color: #b45309; font-weight: bold; }
            .status-pendente { color: #94a3b8; }
          }
        `}</style>

        {/* Header */}
        <div style={{ borderBottom: "2px solid #1e3a5f", paddingBottom: "8px", marginBottom: "10px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <img
                src={`${import.meta.env.BASE_URL}logo-alphafitus.png`}
                alt="Alphafitus"
                style={{ height: "52px", width: "auto", objectFit: "contain" }}
              />
              <div>
                <div style={{ fontSize: "15pt", fontWeight: 800, color: "#1e3a5f", letterSpacing: "0.02em" }}>
                  CERTIFICADO DE ANÁLISE
                </div>
                <div style={{ fontSize: "9pt", color: "#475569", marginTop: "2px" }}>
                  Nº {String(coa.id).padStart(4, "0")} &nbsp;·&nbsp; Emissão: {todayBR()}
                </div>
              </div>
            </div>
            <div style={{ textAlign: "right", fontSize: "9pt", color: "#475569" }}>
              <div style={{ fontWeight: 700, fontSize: "11pt", color: "#1e3a5f" }}>
                {header.company || coa.company || "ALPHAFITUS Laboratório Nutracêutico"}
              </div>
              {(header.cnpj || coa.cnpj) && <div>CNPJ: {header.cnpj || coa.cnpj}</div>}
              {(header.ie || coa.ie) && <div>IE: {header.ie || coa.ie}</div>}
              {(header.address || coa.address) && <div>{header.address || coa.address}</div>}
              {(header.cep || coa.cep) && <div>CEP: {header.cep || coa.cep}</div>}
            </div>
          </div>
        </div>

        {/* Product info */}
        {printSections.identificacao && (
        <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "4px", padding: "8px 10px", marginBottom: "10px" }}>
          <table style={{ border: "none" }}>
            <tbody>
              <tr>
                <td style={{ border: "none", padding: "2px 8px 2px 0", fontWeight: 700, color: "#475569", width: "120px", whiteSpace: "nowrap" }}>Produto</td>
                <td style={{ border: "none", padding: "2px 24px 2px 0", fontWeight: 700, fontSize: "11pt", color: "#0f172a" }}>
                  {header.productName || coa.productName || "—"}
                </td>
                <td style={{ border: "none", padding: "2px 8px 2px 0", fontWeight: 700, color: "#475569", width: "80px", whiteSpace: "nowrap" }}>Lote</td>
                <td style={{ border: "none", padding: "2px 0", fontFamily: "monospace", letterSpacing: "0.05em" }}>
                  {header.lotNumber || coa.lotNumber || "—"}
                </td>
              </tr>
              <tr>
                <td style={{ border: "none", padding: "2px 8px 2px 0", fontWeight: 700, color: "#475569", whiteSpace: "nowrap" }}>Fabricação</td>
                <td style={{ border: "none", padding: "2px 24px 2px 0" }}>{fmtDate(header.manufacturingDate || coa.manufacturingDate)}</td>
                <td style={{ border: "none", padding: "2px 8px 2px 0", fontWeight: 700, color: "#475569", whiteSpace: "nowrap" }}>Validade</td>
                <td style={{ border: "none", padding: "2px 0" }}>{fmtDate(header.expiryDate || coa.expiryDate)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        )}

        {/* Analysis table + Conclusion */}
        {printSections.analises && (
        <div>
        <div style={{ marginBottom: "12px" }}>
          <div style={{ fontWeight: 700, fontSize: "9pt", color: "#1e3a5f", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "4px" }}>
            Resultados das Análises
          </div>
          <table>
            <thead>
              <tr>
                <th>Categoria</th>
                <th>Parâmetro</th>
                <th>Especificação</th>
                <th>Resultado Encontrado</th>
                <th className="cell-method">Método Analítico</th>
                <th>Situação</th>
              </tr>
            </thead>
            <tbody>
              {results.length === 0 ? (
                <tr><td colSpan={6} style={{ textAlign: "center", color: "#94a3b8", fontStyle: "italic" }}>Nenhum resultado registrado</td></tr>
              ) : sortedResults.map((r, i) => (
                <tr key={r.id} style={i % 2 === 1 ? { background: "#f8fafc" } : {}}>
                  <td>{r.category}</td>
                  <td style={{ fontWeight: 600 }}>{r.parameter}</td>
                  <td>{r.spec || "—"}</td>
                  <td style={{ fontWeight: 700 }}>{r.result || "—"}</td>
                  <td className="cell-method">
                    {methodologies.find(m => m.shortName === r.method)?.citation || r.method || "—"}
                  </td>
                  <td className={`status-${r.status}`}>
                    {r.status === "conforme" ? "✓ Conforme" : r.status === "nao_conforme" ? "✗ Não Conforme" : r.status === "ar" ? "⚠ Aprovado c/ Ressalva" : "Pendente"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Conclusion */}
        {conclusao === "APROVADO" && (
          <div style={{ border: "2px solid #16a34a", borderRadius: "4px", padding: "8px 12px", marginBottom: "16px", background: "#f0fdf4" }}>
            <div style={{ fontWeight: 900, fontSize: "10pt", color: "#15803d", letterSpacing: "0.04em", marginBottom: "5px" }}>CONCLUSÃO: ✓ CONFORME</div>
            <p style={{ fontSize: "8.5pt", color: "#1e293b", lineHeight: "1.55", margin: 0 }}>
              Os resultados apresentados neste Certificado de Análise demonstram conformidade com as especificações previamente estabelecidas para os ensaios executados, considerando os critérios de aceitação, métodos analíticos aplicáveis e requisitos regulatórios vigentes. Não foram evidenciadas não conformidades nos parâmetros avaliados, sendo o lote considerado <strong>CONFORME</strong> para os ensaios realizados.
            </p>
          </div>
        )}
        {conclusao === "REPROVADO" && (
          <div style={{ border: "2px solid #dc2626", borderRadius: "4px", padding: "8px 12px", marginBottom: "16px", background: "#fef2f2" }}>
            <div style={{ fontWeight: 900, fontSize: "10pt", color: "#b91c1c", letterSpacing: "0.04em", marginBottom: "5px" }}>CONCLUSÃO: ✗ NÃO CONFORME</div>
            <p style={{ fontSize: "8.5pt", color: "#1e293b", lineHeight: "1.55", margin: 0 }}>
              Os resultados apresentados evidenciam desvio em relação a um ou mais critérios de aceitação estabelecidos nas especificações técnicas, metodologia analítica aplicável ou requisitos regulatórios pertinentes. Em razão da(s) não conformidade(s) identificada(s), o lote é considerado <strong>NÃO CONFORME</strong> para os ensaios executados, não atendendo aos requisitos definidos para sua plena conformidade analítica.
            </p>
          </div>
        )}
        {conclusao === "AR" && (
          <div style={{ border: "2px solid #b45309", borderRadius: "4px", padding: "8px 12px", marginBottom: "16px", background: "#fffbeb" }}>
            <div style={{ fontWeight: 900, fontSize: "10pt", color: "#92400e", letterSpacing: "0.04em", marginBottom: "5px" }}>CONCLUSÃO: ⚠ APROVADO COM RESSALVA</div>
            <p style={{ fontSize: "8.5pt", color: "#1e293b", lineHeight: "1.55", margin: 0 }}>
              Os resultados apresentados demonstram atendimento aos requisitos aplicáveis para os ensaios executados, sendo registrada ressalva técnica relacionada a condição específica descrita neste certificado, a qual não compromete a qualidade, segurança, identidade ou desempenho do produto. Em razão da avaliação técnica realizada, o lote é considerado <strong>APROVADO COM RESSALVA</strong>, devendo a observação registrada ser considerada para fins de rastreabilidade e gestão da qualidade.
            </p>
          </div>
        )}
        {conclusao === "PENDENTE" && (
          <div style={{ border: "1px solid #e2e8f0", borderRadius: "4px", padding: "6px 10px", marginBottom: "16px" }}>
            <span style={{ fontWeight: 700, fontSize: "10pt", color: "#94a3b8" }}>CONCLUSÃO: Avaliação Pendente</span>
          </div>
        )}
        </div>
        )}

        {/* Legenda */}
        <div style={{ borderTop: "1px solid #e2e8f0", marginTop: "10px", paddingTop: "8px", marginBottom: "10px" }}>
          <p style={{ fontSize: "7.5pt", color: "#1e293b", fontWeight: 700, marginBottom: "4px", lineHeight: "1.5" }}>
            Este documento deve ser reproduzido integralmente. A reprodução parcial somente é permitida mediante autorização formal e escrita do laboratório.
          </p>
          <p style={{ fontSize: "7.5pt", color: "#475569", marginBottom: "4px", lineHeight: "1.5" }}>
            Os resultados apresentados referem-se exclusivamente às amostras recebidas e foram obtidos e reportados de acordo com as condições analíticas estabelecidas e metodologias aplicáveis.
          </p>
          <p style={{ fontSize: "7.5pt", color: "#475569", lineHeight: "1.5" }}>
            <strong>NA</strong> = Não se aplica &nbsp;&nbsp;
            <strong>ND</strong> = Não detectado &nbsp;&nbsp;
            <strong>LQ</strong> = Limite de quantificação &nbsp;&nbsp;
            <strong>AR</strong> = Aprovado com Ressalva
          </p>
        </div>

        {/* Notes / Summary */}
        {printSections.resumo && (header.notes || coa.notes) && (
        <div style={{ border: "1px solid #e2e8f0", borderRadius: "4px", padding: "8px 10px", marginBottom: "12px", background: "#fafafa" }}>
          <div style={{ fontWeight: 700, fontSize: "9pt", color: "#1e3a5f", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "4px" }}>
            Resumo / Observações
          </div>
          <div style={{ fontSize: "9pt", color: "#374151", whiteSpace: "pre-wrap", lineHeight: "1.5" }}>
            {header.notes || coa.notes}
          </div>
        </div>
        )}

        {/* ── Assinatura Digital no PDF ── */}
        {coa.signedAt && (
          <div style={{ marginTop: "20px", pageBreakInside: "avoid", display: "flex", justifyContent: "center" }}>
            <div style={{ border: "1px solid #e2e8f0", borderRadius: "6px", overflow: "hidden", width: "220px" }}>
              <div style={{ background: "#fff", padding: "10px 14px 8px", textAlign: "center" }}>
                <div style={{ fontFamily: "'Dancing Script', cursive", fontSize: "13pt", color: "#1e3a5f", lineHeight: 1.1, marginBottom: "6px" }}>
                  {coa.signedBy}
                </div>
                <div style={{ borderTop: "1.5px solid #1e3a5f", paddingTop: "6px" }}>
                  <div style={{ fontWeight: 700, fontSize: "7.5pt", color: "#1e293b" }}>{coa.signedBy}</div>
                  {coa.signedRole && <div style={{ fontSize: "7pt", color: "#475569", marginTop: "1px" }}>{coa.signedRole}</div>}
                  {(header.responsibleTechCrq || coa.responsibleTechCrq) && (
                    <div style={{ fontSize: "7pt", color: "#475569", marginTop: "1px" }}>{getCrLabel(header.responsibleTech || coa.responsibleTech || "")}: {header.responsibleTechCrq || coa.responsibleTechCrq}</div>
                  )}
                  <div style={{ fontSize: "7pt", color: "#16a34a", marginTop: "1px" }}>{header.company || coa.company || ""}</div>
                  <div style={{ fontSize: "6.5pt", color: "#16a34a", fontWeight: 600, marginTop: "4px" }}>
                    ✅ Assinado digitalmente em {new Date(coa.signedAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Histórico de Mudanças no PDF */}
        {showHistoryInPdf && history.length > 0 && (
          <div style={{ marginTop: "18px", pageBreakInside: "avoid" }}>
            <div style={{ borderBottom: "1.5px solid #1e3a5f", paddingBottom: "4px", marginBottom: "8px" }}>
              <span style={{ fontSize: "9pt", fontWeight: 800, color: "#1e3a5f", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Histórico de Mudanças — Auditoria
              </span>
            </div>
            <table style={{ width: "100%", fontSize: "8pt", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#f1f5f9" }}>
                  <th style={{ padding: "3px 6px", textAlign: "left", border: "1px solid #cbd5e1", width: "130px" }}>Data/Hora</th>
                  <th style={{ padding: "3px 6px", textAlign: "left", border: "1px solid #cbd5e1", width: "120px" }}>Ação</th>
                  <th style={{ padding: "3px 6px", textAlign: "left", border: "1px solid #cbd5e1", width: "130px" }}>Usuário</th>
                  <th style={{ padding: "3px 6px", textAlign: "left", border: "1px solid #cbd5e1" }}>Descrição</th>
                </tr>
              </thead>
              <tbody>
                {history.map(entry => (
                  <tr key={entry.id}>
                    <td style={{ padding: "3px 6px", border: "1px solid #cbd5e1", whiteSpace: "nowrap" }}>
                      {new Date(entry.createdAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                    </td>
                    <td style={{ padding: "3px 6px", border: "1px solid #cbd5e1", fontWeight: 600 }}>{entry.action}</td>
                    <td style={{ padding: "3px 6px", border: "1px solid #cbd5e1" }}>{entry.userName}</td>
                    <td style={{ padding: "3px 6px", border: "1px solid #cbd5e1", color: "#475569" }}>{entry.description || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Footer */}
        <div style={{ borderTop: "1px solid #e2e8f0", marginTop: "16px", paddingTop: "6px", textAlign: "center", fontSize: "7.5pt", color: "#94a3b8" }}>
          Documento gerado em {todayBR()} — Sistema Protocolo Técnico ANVISA — {header.company || coa.company || "ALPHAFITUS Laboratório Nutracêutico"}
          {(header.cnpj || coa.cnpj) ? ` — CNPJ ${header.cnpj || coa.cnpj}` : ""}
        </div>
      </div>

      {/* ── Add Param Dialog ─────────────────────────────────────────────────── */}
      <Dialog open={addParamOpen} onOpenChange={setAddParamOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Adicionar Análise</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground -mt-1">
            Físico-Química e Microbiológica são pré-carregadas automaticamente.
            Escolha abaixo os parâmetros adicionais necessários.
          </p>
          <div className="space-y-4">
            {/* Somente Teor do Ativo e Embalagem aparecem como chips */}
            {STANDARD_PARAMS.filter(g => g.category === "Teor do Ativo" || g.category === "Embalagem").map(group => (
              <div key={group.category}>
                <div className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-2">{group.category}</div>
                <div className="flex flex-wrap gap-1.5">
                  {group.params.filter(p => !results.some(r => r.parameter === p)).map(p => (
                    <button
                      key={p}
                      onClick={() => addParam(group.category, p)}
                      disabled={addResultMut.isPending}
                      className="text-xs px-2.5 py-1 rounded-full border border-primary/30 bg-primary/5 text-primary hover:bg-primary/15 transition-colors font-medium disabled:opacity-50"
                    >
                      + {p}
                    </button>
                  ))}
                  {group.params.every(p => results.some(r => r.parameter === p)) && (
                    <span className="text-xs text-muted-foreground italic">Todos adicionados</span>
                  )}
                </div>
              </div>
            ))}
            <div className="border-t pt-4">
              <div className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-2">Parâmetro Personalizado</div>
              <div className="flex gap-2">
                <Select value={customCategory} onValueChange={setCustomCategory}>
                  <SelectTrigger className="w-40 h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STANDARD_PARAMS.map(g => (
                      <SelectItem key={g.category} value={g.category}>{g.category}</SelectItem>
                    ))}
                    <SelectItem value="Outro">Outro</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  value={customParam}
                  onChange={e => setCustomParam(e.target.value)}
                  placeholder="Nome do parâmetro"
                  className="h-8 text-xs flex-1"
                  onKeyDown={e => { if (e.key === "Enter" && customParam.trim()) addParam(customCategory, customParam); }}
                />
                <Button size="sm" className="h-8" onClick={() => addParam(customCategory, customParam)} disabled={!customParam.trim() || addResultMut.isPending}>
                  Adicionar
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Dialog Assinar Digitalmente ─────────────────────────────────── */}
      {signDialogOpen && (() => {
        const initials = (user?.displayName ?? "?").split(" ").filter(Boolean).slice(0, 2).map((n: string) => n[0]?.toUpperCase()).join("");
        const todayDateStr = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
        const fmtInputDate = (d: string) => { const [y,m,day] = d.split("-"); return day && m && y ? `${day}/${m}/${y}` : "—"; };
        const emissaoDisplay = signForm.customDate ? fmtInputDate(signForm.customDate) : todayDateStr;
        return (
          <div className="print:hidden fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setSignDialogOpen(false)}>
            <div className="bg-white rounded-xl shadow-2xl w-[420px] max-w-[95vw] max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              {/* Header */}
              <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100">
                <h3 className="font-bold text-base flex items-center gap-2 text-gray-900">
                  <PenLine className="h-4 w-4 text-primary" /> Assinar Digitalmente
                </h3>
                <button type="button" onClick={() => setSignDialogOpen(false)} className="text-gray-400 hover:text-gray-700 rounded-full hover:bg-gray-100 w-7 h-7 flex items-center justify-center transition-colors">
                  <span className="text-xl leading-none">×</span>
                </button>
              </div>

              <div className="px-6 py-4 space-y-4">
                <p className="text-xs text-gray-500">Confirme os dados abaixo. A assinatura será registrada com seu nome de usuário.</p>

                {/* User card */}
                <div className="border border-gray-200 rounded-lg p-3 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-white font-bold text-sm flex-shrink-0">{initials}</div>
                  <div className="min-w-0">
                    <p className="font-semibold text-sm text-gray-900 truncate">{user?.displayName || user?.username}</p>
                    <p className="text-xs text-gray-400 capitalize">{user?.role === "admin" ? "Admin" : "Analista"}</p>
                    <p className="text-[10px] text-emerald-600 flex items-center gap-1 mt-0.5"><ShieldCheck className="h-3 w-3" /> Usuário verificado</p>
                  </div>
                </div>

                {/* Signature preview */}
                <div className="border border-gray-200 rounded-lg p-3 bg-gray-50/50">
                  <p className="text-[9px] font-semibold uppercase tracking-widest text-gray-400 mb-1 text-center">Prévia da assinatura</p>
                  <p style={{ fontFamily: "'Dancing Script', cursive", fontSize: "1.5rem", lineHeight: 1.4, color: "#1e3a5f", fontWeight: 600, textAlign: "center" }}>
                    {header.responsibleTech || coa?.responsibleTech || user?.displayName || user?.username}
                  </p>
                </div>

                {/* Role */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1.5">Cargo / Função nesta assinatura</label>
                  <select
                    value={signForm.role || "Responsável Técnico"}
                    onChange={e => setSignForm(f => ({ ...f, role: e.target.value }))}
                    className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                  >
                    {["Responsável Técnico", "Farmacêutico", "Analista Sênior", "Analista", "Supervisor de Qualidade", "Gerente de Qualidade", "Diretor Técnico"].map(r => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </div>

                {/* Date choice */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1.5">Data da assinatura</label>
                  <div className="space-y-2">
                    {(["emissao", "hoje"] as const).map(opt => {
                      const isEmissao = opt === "emissao";
                      const label = isEmissao ? "Data de Emissão do documento" : "Data de hoje";
                      const sub   = isEmissao ? emissaoDisplay : todayDateStr;
                      const sel   = signForm.dateChoice === opt;
                      return (
                        <div key={opt}>
                          <button
                            type="button"
                            onClick={() => setSignForm(f => ({ ...f, dateChoice: opt }))}
                            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg border-2 transition-all text-left ${sel ? "border-primary bg-primary/5" : "border-gray-200 hover:border-gray-300 bg-white"}`}
                          >
                            <span className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${sel ? "border-primary" : "border-gray-300"}`}>
                              {sel && <span className="w-2 h-2 rounded-full bg-primary block" />}
                            </span>
                            <span>
                              <span className={`block text-sm font-medium ${sel ? "text-primary" : "text-gray-700"}`}>{label}</span>
                              <span className="block text-xs text-gray-400 mt-0.5">{sub}</span>
                            </span>
                          </button>
                          {sel && isEmissao && (
                            <div className="mt-1.5 px-1">
                              <input
                                type="date"
                                value={signForm.customDate}
                                onChange={e => setSignForm(f => ({ ...f, customDate: e.target.value }))}
                                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Time */}
                <div className="flex items-center gap-3">
                  <label className="text-xs font-medium text-gray-700 w-14 flex-shrink-0">Horário</label>
                  <input
                    type="time"
                    step="1"
                    value={signForm.customTime}
                    onChange={e => setSignForm(f => ({ ...f, customTime: e.target.value }))}
                    className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                  />
                  <span className="text-xs text-gray-400">Altere se necessário</span>
                </div>
              </div>

              {/* Footer */}
              <div className="flex gap-3 px-6 pb-5">
                <button
                  type="button"
                  onClick={() => setSignDialogOpen(false)}
                  className="flex-1 border border-gray-200 rounded-lg py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => signMut.mutate()}
                  disabled={signMut.isPending}
                  className="flex-1 bg-primary text-white rounded-lg py-2.5 text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  <ShieldCheck className="h-4 w-4" />
                  {signMut.isPending ? "Assinando…" : "Confirmar Assinatura"}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Unsign confirmation */}
      <AlertDialog open={unsignOpen} onOpenChange={setUnsignOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar assinatura?</AlertDialogTitle>
            <AlertDialogDescription>
              O documento voltará para <strong>Rascunho</strong> e o download do PDF será bloqueado para todos os clientes até que seja assinado novamente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Manter assinado</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => unsignMut.mutate()}
            >
              Cancelar assinatura
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete result confirmation */}
      <AlertDialog open={deleteResultId !== null} onOpenChange={() => setDeleteResultId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover análise?</AlertDialogTitle>
            <AlertDialogDescription>O resultado será removido permanentemente deste laudo.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteResultId && deleteResultMut.mutate(deleteResultId)}
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Share CoA with client dialog */}
      <Dialog open={shareOpen} onOpenChange={setShareOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-4 w-4" /> Conceder Acesso ao Cliente
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Informe os dados do cliente. O sistema criará (ou reutilizará) o usuário e enviará as credenciais por e-mail automaticamente.
            </p>

            {/* Identificação */}
            <div className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="share-name">Nome do cliente</Label>
                <Input
                  id="share-name"
                  placeholder="Ex: João Silva"
                  value={shareForm.displayName}
                  onChange={e => setShareForm(f => ({ ...f, displayName: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="share-email">E-mail <span className="text-destructive">*</span></Label>
                <Input
                  id="share-email"
                  type="email"
                  placeholder="cliente@empresa.com"
                  value={shareForm.email}
                  onChange={e => setShareForm(f => ({ ...f, email: e.target.value }))}
                />
              </div>
            </div>

            {/* Período de acesso */}
            <div className="rounded-lg border p-3 space-y-1 bg-muted/30">
              <Label htmlFor="share-expiry" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Período de acesso</Label>
              <Input
                id="share-expiry"
                type="date"
                value={shareForm.accessExpiresAt}
                onChange={e => setShareForm(f => ({ ...f, accessExpiresAt: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">Deixe em branco para acesso sem data de expiração.</p>
            </div>

            {/* O que o cliente pode ver */}
            <div className="rounded-lg border p-3 space-y-2 bg-muted/30">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">O que o cliente pode fazer</span>
              <label className="flex items-start gap-3 cursor-pointer select-none">
                <div className="mt-0.5">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-primary"
                    checked={true}
                    readOnly
                  />
                </div>
                <div>
                  <div className="text-sm font-medium">Visualizar o CoA no portal</div>
                  <div className="text-xs text-muted-foreground">O cliente pode ver os resultados online (sempre habilitado)</div>
                </div>
              </label>
              <label className="flex items-start gap-3 cursor-pointer select-none">
                <div className="mt-0.5">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-primary"
                    checked={shareForm.canPrint}
                    onChange={e => setShareForm(f => ({ ...f, canPrint: e.target.checked }))}
                  />
                </div>
                <div>
                  <div className="text-sm font-medium">Imprimir / baixar PDF</div>
                  <div className="text-xs text-muted-foreground">Permite que o cliente imprima ou salve o certificado em PDF</div>
                </div>
              </label>
            </div>

            {/* Feedback de e-mail */}
            {shareEmailError && (
              <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2.5 space-y-1">
                <p className="text-xs font-semibold text-red-700 flex items-center gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> Falha ao enviar o e-mail
                </p>
                <p className="text-xs text-red-600">{shareEmailError}</p>
                <p className="text-xs text-red-500 mt-1">
                  Corrija o e-mail acima e clique em <strong>Reenviar E-mail</strong>, ou feche e acesse <strong>Cadastros → Clientes</strong> para enviar depois.
                </p>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => { setShareOpen(false); setShareEmailError(null); }} disabled={shareLoading}>Fechar</Button>
              <Button
                disabled={!shareForm.email || shareLoading}
                onClick={async () => {
                  if (!shareForm.email) return;
                  setShareLoading(true);
                  setShareEmailError(null);
                  try {
                    const res = await fetch(`/api/coa/${id}/share-client`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
                      body: JSON.stringify(shareForm),
                    });
                    const data = await res.json();
                    if (!res.ok) {
                      toast({ title: "Erro", description: data.error ?? "Falha ao compartilhar", variant: "destructive" });
                    } else if (!data.emailSent) {
                      // Acesso criado mas e-mail falhou — mantém dialog aberto com erro
                      setShareEmailError(data.emailError ?? "O e-mail não pôde ser enviado. Verifique o endereço e tente novamente.");
                      void refetchClients();
                      toast({ title: "Acesso criado", description: "Mas o e-mail não foi enviado — veja o aviso abaixo.", variant: "destructive" });
                    } else {
                      toast({ title: "✅ Acesso concedido", description: `E-mail com credenciais enviado para ${shareForm.email}.` });
                      setShareOpen(false);
                      setShareEmailError(null);
                      setShareForm({ displayName: "", email: "", accessExpiresAt: "", canPrint: false });
                      void refetchClients();
                    }
                  } finally {
                    setShareLoading(false);
                  }
                }}
              >
                {shareLoading
                  ? <><Save className="h-4 w-4 animate-spin mr-1.5" /> Enviando…</>
                  : shareEmailError
                    ? <><Mail className="h-4 w-4 mr-1.5" /> Reenviar E-mail</>
                    : <><Mail className="h-4 w-4 mr-1.5" /> Conceder Acesso</>}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Revoke CoA access confirmation */}
      <AlertDialog open={revokeId !== null} onOpenChange={() => setRevokeId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revogar acesso?</AlertDialogTitle>
            <AlertDialogDescription>O cliente perderá o acesso a este CoA no portal. Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                if (!revokeId) return;
                const res = await fetch(`/api/coa/${id}/clients/${revokeId}`, {
                  method: "DELETE",
                  headers: token ? { Authorization: `Bearer ${token}` } : {},
                });
                if (res.ok) {
                  toast({ title: "Acesso revogado" });
                  void refetchClients();
                } else {
                  toast({ title: "Erro ao revogar", variant: "destructive" });
                }
                setRevokeId(null);
              }}
            >
              Revogar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ── ResultRow — inline editable ───────────────────────────────────────────────

function ResultRow({
  result, even, methodologies, onSave, onDelete,
}: {
  result: CoaResult;
  even: boolean;
  methodologies: Methodology[];
  onSave: (data: Partial<CoaResult>) => void;
  onDelete: () => void;
}) {
  const [r, setR] = useState(result.result);
  const [spec, setSpec] = useState(result.spec);
  const [method, setMethod] = useState(result.method);
  const [status, setStatus] = useState(result.status);
  const [param, setParam] = useState(result.parameter);

  // Sync ONLY when the row identity changes (not on every server refetch).
  // This prevents background refetches from overwriting what the user is typing.
  useEffect(() => {
    setR(result.result);
    setSpec(result.spec);
    setMethod(result.method);
    setStatus(result.status);
    setParam(result.parameter);
  }, [result.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Accumulate pending field changes so that one field's debounce doesn't cancel another's.
  const pendingRef = useRef<Partial<CoaResult>>({});
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleSave = (changes: Partial<CoaResult>) => {
    pendingRef.current = { ...pendingRef.current, ...changes };
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      onSave({ ...pendingRef.current });
      pendingRef.current = {};
    }, 500);
  };

  const handleMethodSelect = (shortName: string) => {
    const selected = methodologies.find(m => m.shortName === shortName);
    setMethod(shortName);
    const changes: Partial<CoaResult> = { method: shortName };
    // Sempre aplica o critério da metodologia selecionada (inclusive ao trocar)
    if (selected?.criteria) {
      setSpec(selected.criteria);
      changes.spec = selected.criteria;
    }
    scheduleSave(changes);
  };

  return (
    <tr className={`border-b last:border-0 ${even ? "" : "bg-muted/10"}`}>
      <td className="px-3 py-1.5 text-xs text-muted-foreground">{result.category || <span className="italic text-muted-foreground/40">—</span>}</td>
      <td className="px-2 py-1">
        <input
          value={param}
          onChange={e => setParam(e.target.value)}
          onBlur={() => param !== result.parameter && scheduleSave({ parameter: param })}
          className={`w-full bg-transparent font-medium text-sm border-b transition-colors focus:outline-none ${
            param ? "border-transparent focus:border-primary" : "border-dashed border-destructive/50 focus:border-destructive placeholder:text-destructive/50"
          }`}
          placeholder="Nome do parâmetro"
        />
      </td>
      <td className="px-2 py-1">
        <Input
          value={spec} onChange={e => setSpec(e.target.value)}
          onBlur={() => scheduleSave({ spec })}
          className="h-7 text-xs"
          placeholder="Ex: 6,0 – 8,0"
        />
      </td>
      <td className="px-2 py-1">
        <Input
          value={r} onChange={e => setR(e.target.value)}
          onBlur={() => scheduleSave({ result: r })}
          className="h-7 text-xs font-semibold"
          placeholder="Valor encontrado"
        />
      </td>
      <td className="px-2 py-1 min-w-[200px] max-w-[320px]">
        <Select value={method} onValueChange={handleMethodSelect}>
          <SelectTrigger className="h-auto min-h-7 text-xs py-1 px-2 items-start">
            <span className="text-left block leading-snug line-clamp-3 whitespace-normal break-words">
              {method
                ? (methodologies.find(m => m.shortName === method)?.citation || method)
                : <span className="text-muted-foreground/70 italic">Selecionar metodologia…</span>}
            </span>
          </SelectTrigger>
          <SelectContent className="max-h-72 overflow-y-auto">
            {methodologies.map(m => (
              <SelectItem key={m.id} value={m.shortName}>
                <div className="flex flex-col gap-0.5 py-0.5">
                  <span className="font-medium text-xs">{m.shortName}</span>
                  {m.citation && <span className="text-muted-foreground text-[10px] leading-snug line-clamp-2 max-w-xs">{m.citation}</span>}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </td>
      <td className="px-2 py-1">
        <Select value={status} onValueChange={v => { setStatus(v); scheduleSave({ status: v }); }}>
          <SelectTrigger className={`h-7 text-xs font-semibold border ${
            status === "conforme"
              ? "bg-green-50 text-green-700 border-green-300 focus:ring-green-300"
              : status === "nao_conforme"
              ? "bg-red-50 text-red-700 border-red-300 focus:ring-red-300"
              : "bg-amber-50 text-amber-700 border-amber-200 focus:ring-amber-200"
          }`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="pendente">Pendente</SelectItem>
            <SelectItem value="conforme">✓ Conforme</SelectItem>
            <SelectItem value="nao_conforme">✗ Não Conforme</SelectItem>
            <SelectItem value="ar">⚠ Aprovado com Ressalva</SelectItem>
          </SelectContent>
        </Select>
      </td>
      <td className="px-2 py-1">
        <Button
          size="sm" variant="ghost"
          className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
          onClick={onDelete}
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </td>
    </tr>
  );
}

// ── Named exports (distinct component types — prevents React hooks mismatch) ──

export function CoaListPage() {
  return <CoaList />;
}

export function CoaDetailPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params?.id);
  if (!id || id <= 0) return null;
  return <CoaDetail id={id} />;
}

// ── Default export (legacy fallback) ─────────────────────────────────────────

export default function CoaPage() {
  const params = useParams<{ id?: string }>();
  const id = params?.id ? Number(params.id) : null;
  if (id && id > 0) return <CoaDetail id={id} />;
  return <CoaList />;
}
