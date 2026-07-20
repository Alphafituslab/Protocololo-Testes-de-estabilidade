import React, { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/use-auth";
import {
  Plus, Trash2, Printer, ArrowLeft, ClipboardList,
  ChevronDown, CheckCircle2, XCircle, Clock, Save, Search, X,
  UserPlus, Mail, Users, Trash, AlertTriangle
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
  createdAt: string;
  updatedAt: string;
  linkedProtocolId: number | null;
  linkedLotId: number | null;
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
  const { token } = useAuth();
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

  // ── Client sharing state ──
  const [shareOpen, setShareOpen] = useState(false);
  const [shareForm, setShareForm] = useState({ displayName: "", email: "", accessExpiresAt: "", canPrint: false });
  const [shareLoading, setShareLoading] = useState(false);
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

  const setField = (field: keyof typeof header, value: string) => {
    const next = { ...header, [field]: value };
    setHeader(next);
    scheduleHeaderSave(next);
  };

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
            <Button variant="ghost" size="sm" onClick={() => navigate("/coa")} className="gap-1.5 text-muted-foreground">
              <ArrowLeft className="h-4 w-4" /> Laudos
            </Button>
            <div className="flex-1 min-w-0">
              <h1 className="font-semibold text-foreground truncate">
                CoA #{coa.id}{coa.productName ? ` — ${coa.productName}` : ""}
              </h1>
            </div>
            <div className="flex items-center gap-2">
              {coa.status === "emitido"
                ? <Badge className="bg-green-100 text-green-700 border-green-200">Emitido</Badge>
                : <Badge variant="secondary">Rascunho</Badge>}
              {coa.status !== "emitido" && (
                <Button size="sm" variant="outline" onClick={() => emitMut.mutate()} disabled={emitMut.isPending}>
                  <Save className="h-3.5 w-3.5 mr-1.5" /> Marcar como Emitido
                </Button>
              )}
              <Button size="sm" onClick={() => window.print()} className="gap-1.5">
                <Printer className="h-3.5 w-3.5" /> Imprimir Laudo
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
                <Label className="text-xs">CRQ / CRF / CFQ</Label>
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
                      <th className="px-3 py-2 text-left font-medium w-32">Resultado Encontrado</th>
                      <th className="px-3 py-2 text-left font-medium w-44">Critérios de Aceitação</th>
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

            {/* Assinatura — aparece apenas quando todos os itens estão Conformes e ainda não emitido */}
            {allConforme && coa.status !== "emitido" && (
              <div className="border-t px-5 py-5 bg-red-50/50 border-b border-red-100">
                <div className="flex items-center gap-2 mb-4">
                  <AlertTriangle className="h-4 w-4 text-red-600" />
                  <span className="text-sm font-semibold text-red-600">Certificado pronto para assinatura — assine e depois marque como Emitido</span>
                </div>
                <div className="flex flex-col sm:flex-row gap-6 items-end">
                  {/* Bloco de assinatura */}
                  <div className="flex-1 flex flex-col items-center min-w-[220px]">
                    {/* Espaço para assinatura manuscrita */}
                    <div className="w-full h-16 border border-dashed border-slate-300 rounded mb-2 bg-white flex items-center justify-center">
                      <span className="text-xs text-slate-400 italic">← espaço para assinatura (no impresso)</span>
                    </div>
                    <div className="w-full border-t-2 border-slate-500 pt-2 text-center">
                      <div className="font-semibold text-sm text-slate-700">
                        {header.responsibleTech || coa.responsibleTech || "Responsável Técnico"}
                      </div>
                      {(header.responsibleTechCrq || coa.responsibleTechCrq) && (
                        <div className="text-xs text-muted-foreground">
                          CRQ/CRF/CFQ: {header.responsibleTechCrq || coa.responsibleTechCrq}
                        </div>
                      )}
                      <div className="text-xs text-muted-foreground">
                        {header.company || coa.company || ""}
                      </div>
                    </div>
                    <span className="text-[10px] text-muted-foreground mt-1">Assinatura do Responsável Técnico</span>
                  </div>
                  {/* Botões Emitir + Imprimir */}
                  <div className="flex flex-col gap-2">
                    <Button
                      onClick={() => window.print()}
                      variant="outline"
                      className="gap-1.5 border-red-300 text-red-700 hover:bg-red-50"
                    >
                      <Printer className="h-4 w-4" />
                      1. Imprimir para Assinar
                    </Button>
                    <Button
                      onClick={() => emitMut.mutate()}
                      disabled={emitMut.isPending}
                      className="bg-green-600 hover:bg-green-700 text-white gap-1.5"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      2. Marcar como Emitido
                    </Button>
                  </div>
                </div>
              </div>
            )}
            {/* Após emissão — mostra selo simples sem o aviso */}
            {coa.status === "emitido" && (
              <div className="border-t px-5 py-3 bg-green-50/60 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <span className="text-sm font-semibold text-green-700">Laudo Emitido</span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => window.print()}
                >
                  <Printer className="h-4 w-4" />
                  Imprimir / Salvar PDF
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

          {/* ── Configurar PDF ── */}
          <div className="border rounded-xl bg-slate-50 p-4 space-y-3">
            <h2 className="font-semibold text-sm text-slate-600 uppercase tracking-wide flex items-center gap-2">
              🖨️ Configurar Seções do PDF
            </h2>
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
          </div>

          {/* ── Liberar para Cliente ── */}
          <div className="border rounded-xl bg-card shadow-sm p-5 space-y-4 print:hidden">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                  <Users className="h-4 w-4" /> Acesso do Cliente (Portal)
                </h2>
                <p className="text-xs text-muted-foreground mt-1">
                  Conceda acesso a este CoA para um cliente visualizar no Portal do Cliente.
                </p>
              </div>
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setShareOpen(true)}>
                <UserPlus className="h-4 w-4" /> Adicionar Cliente
              </Button>
            </div>

            {coaClients.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">Nenhum cliente com acesso a este CoA ainda.</p>
            ) : (
              <div className="divide-y border rounded-lg overflow-hidden">
                {coaClients.map(c => (
                  <div key={c.id} className="flex items-center justify-between px-3 py-2.5 bg-background hover:bg-muted/30 transition-colors">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{c.displayName}</p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Mail className="h-3 w-3 shrink-0" />
                        {c.email ?? c.username}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs text-muted-foreground hidden sm:block">
                        {new Date(c.createdAt).toLocaleDateString("pt-BR")}
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0 text-destructive hover:text-destructive hover:bg-red-50"
                        onClick={() => setRevokeId(c.id)}
                        title="Revogar acesso"
                      >
                        <Trash className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
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
            table { border-collapse: collapse; width: 100%; }
            th, td { border: 1px solid #cbd5e1; padding: 3px 6px; text-align: left; font-size: 9pt; }
            thead th { background-color: #f1f5f9 !important; font-weight: 700; }
            .status-conforme { color: #16a34a; font-weight: bold; }
            .status-nao_conforme { color: #dc2626; font-weight: bold; }
            .status-ar { color: #b45309; font-weight: bold; }
            .status-pendente { color: #94a3b8; }
          }
        `}</style>

        {/* Header */}
        <div style={{ borderBottom: "2px solid #1e3a5f", paddingBottom: "8px", marginBottom: "10px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
            <div>
              <div style={{ fontSize: "15pt", fontWeight: 800, color: "#1e3a5f", letterSpacing: "0.02em" }}>
                CERTIFICADO DE ANÁLISE
              </div>
              <div style={{ fontSize: "9pt", color: "#475569", marginTop: "2px" }}>
                Nº {String(coa.id).padStart(4, "0")} &nbsp;·&nbsp; Emissão: {todayBR()}
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
                <th>Resultado Encontrado</th>
                <th>Unidade</th>
                <th>Especificação</th>
                <th>Método Analítico</th>
                <th>Situação</th>
              </tr>
            </thead>
            <tbody>
              {results.length === 0 ? (
                <tr><td colSpan={7} style={{ textAlign: "center", color: "#94a3b8", fontStyle: "italic" }}>Nenhum resultado registrado</td></tr>
              ) : sortedResults.map((r, i) => (
                <tr key={r.id} style={i % 2 === 1 ? { background: "#f8fafc" } : {}}>
                  <td>{r.category}</td>
                  <td style={{ fontWeight: 600 }}>{r.parameter}</td>
                  <td style={{ fontWeight: 700 }}>{r.result || "—"}</td>
                  <td>{r.unit}</td>
                  <td>{r.spec || "—"}</td>
                  <td>{r.method || "—"}</td>
                  <td className={`status-${r.status}`}>
                    {r.status === "conforme" ? "✓ Conforme" : r.status === "nao_conforme" ? "✗ Não Conforme" : r.status === "ar" ? "⚠ Aprovado com Ressalva" : "Pendente"}
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

        {/* Signature block */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginTop: "28px", gap: "24px" }}>
          {/* Local e Data */}
          <div style={{ flex: 1, maxWidth: "260px" }}>
            <div style={{ height: "40px" }} />
            <div style={{ borderTop: "1px solid #475569", paddingTop: "5px" }}>
              <div style={{ fontSize: "8pt", color: "#475569" }}>Local e Data</div>
            </div>
          </div>
          {/* Assinatura do RT */}
          <div style={{ flex: 1, maxWidth: "260px", textAlign: "center" }}>
            {/* Espaço em branco para assinatura manuscrita */}
            <div style={{ height: "52px" }} />
            <div style={{ borderTop: "2px solid #1e3a5f", paddingTop: "6px" }}>
              <div style={{ fontWeight: 700, fontSize: "9pt" }}>{header.responsibleTech || coa.responsibleTech || "Responsável Técnico"}</div>
              {(header.responsibleTechCrq || coa.responsibleTechCrq) && (
                <div style={{ fontSize: "8pt", color: "#475569" }}>CRQ/CRF/CFQ: {header.responsibleTechCrq || coa.responsibleTechCrq}</div>
              )}
              <div style={{ fontSize: "8pt", color: "#475569" }}>{header.company || coa.company || ""}</div>
              <div style={{ fontSize: "7pt", color: "#94a3b8", marginTop: "2px" }}>Assinatura do Responsável Técnico</div>
            </div>
          </div>
        </div>

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

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => setShareOpen(false)} disabled={shareLoading}>Cancelar</Button>
              <Button
                disabled={!shareForm.email || shareLoading}
                onClick={async () => {
                  if (!shareForm.email) return;
                  setShareLoading(true);
                  try {
                    const res = await fetch(`/api/coa/${id}/share-client`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
                      body: JSON.stringify(shareForm),
                    });
                    const data = await res.json();
                    if (!res.ok) {
                      toast({ title: "Erro", description: data.error ?? "Falha ao compartilhar", variant: "destructive" });
                    } else {
                      toast({
                        title: "Acesso concedido",
                        description: data.emailSent
                          ? "E-mail com credenciais enviado ao cliente."
                          : "Acesso criado. (E-mail não configurado no servidor — envie as credenciais manualmente.)",
                      });
                      setShareOpen(false);
                      setShareForm({ displayName: "", email: "", accessExpiresAt: "", canPrint: false });
                      void refetchClients();
                    }
                  } finally {
                    setShareLoading(false);
                  }
                }}
              >
                {shareLoading ? <><Save className="h-4 w-4 animate-spin mr-1.5" /> Salvando…</> : <><Mail className="h-4 w-4 mr-1.5" /> Conceder Acesso</>}
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
          value={r} onChange={e => setR(e.target.value)}
          onBlur={() => scheduleSave({ result: r })}
          className="h-7 text-xs font-semibold"
          placeholder="Valor encontrado"
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
      <td className="px-2 py-1 min-w-[160px]">
        <Select value={method} onValueChange={handleMethodSelect}>
          <SelectTrigger className="h-7 text-xs">
            <SelectValue placeholder="Selecionar metodologia…" />
          </SelectTrigger>
          <SelectContent className="max-h-64 overflow-y-auto">
            {methodologies.map(m => (
              <SelectItem key={m.id} value={m.shortName}>
                <span className="font-medium">{m.shortName}</span>
                {m.parameter && <span className="text-muted-foreground ml-1 text-[10px]">— {m.parameter}</span>}
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
