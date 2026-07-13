import React, { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/use-auth";
import {
  Plus, Trash2, Printer, ArrowLeft, ClipboardList,
  ChevronDown, CheckCircle2, XCircle, Clock, Save
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
interface LinkedProtocolDetail { id: number; productName: string; companyName: string; cnpj: string; approvedBy: string | null; }

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

        {/* Table */}
        {isLoading ? (
          <div className="text-center text-muted-foreground py-12">Carregando…</div>
        ) : docs.length === 0 ? (
          <div className="text-center py-16 border border-dashed rounded-xl text-muted-foreground">
            <ClipboardList className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">Nenhum laudo criado ainda</p>
            <p className="text-sm mt-1">Clique em "Novo Laudo" para começar</p>
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
                {docs.map((doc, i) => (
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
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Gerar CoA a partir de Protocolo</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Protocolo</Label>
              <Select
                value={selProtoId ? String(selProtoId) : ""}
                onValueChange={(v) => { setSelProtoId(Number(v)); setSelLotId(null); }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o protocolo…" />
                </SelectTrigger>
                <SelectContent>
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
                  <SelectContent>
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
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => setFromProtoOpen(false)}>Cancelar</Button>
              <Button
                disabled={!selProtoId || !selLotId || createFromProtoMut.isPending}
                onClick={() => createFromProtoMut.mutate()}
              >
                {createFromProtoMut.isPending ? "Criando…" : "Criar CoA"}
              </Button>
            </div>
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

  // ── Local header state ──
  const [header, setHeader] = useState({
    productName: "", lotNumber: "", manufacturingDate: "", expiryDate: "",
    company: "", responsibleTech: "", responsibleTechCrq: "", cnpj: "", notes: "",
  });

  useEffect(() => {
    if (coa) {
      setHeader({
        productName: coa.productName ?? "",
        lotNumber: coa.lotNumber ?? "",
        manufacturingDate: coa.manufacturingDate ?? "",
        expiryDate: coa.expiryDate ?? "",
        company: coa.company ?? "",
        responsibleTech: coa.responsibleTech ?? "",
        responsibleTechCrq: coa.responsibleTechCrq ?? "",
        cnpj: coa.cnpj ?? "",
        notes: coa.notes ?? "",
      });
    }
  }, [coa?.id]);

  // ── Auto-fill empty header fields from linked protocol (state only — DB save happens on blur) ──
  useEffect(() => {
    if (!linkedProto || !coa) return;
    setHeader(prev => ({
      ...prev,
      company: prev.company || linkedProto.companyName || "",
      cnpj: prev.cnpj || linkedProto.cnpj || "",
      responsibleTech: prev.responsibleTech || linkedProto.approvedBy || "",
    }));
  }, [linkedProto?.id, coa?.id]);

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
    mutationFn: (body: { category: string; parameter: string; sortOrder: number }) =>
      apiFetch(`/api/coa/${id}/results`, token, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["coa", id] }); setAddParamOpen(false); setCustomParam(""); },
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
  const hasNaoConforme = results.some(r => r.status === "nao_conforme");
  const allConforme = results.length > 0 && results.every(r => r.status === "conforme");
  const conclusao = hasNaoConforme ? "REPROVADO" : allConforme ? "APROVADO" : "PENDENTE";

  const addParam = (category: string, parameter: string) => {
    if (!parameter.trim()) return;
    addResultMut.mutate({ category, parameter: parameter.trim(), sortOrder: results.length });
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
        await apiFetch(`/api/coa/${id}/results`, token, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ category: pr.category, parameter: pr.parameter, sortOrder: results.length + i }),
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
              <div className="md:col-span-2 space-y-1.5">
                <Label className="text-xs">Empresa / Fabricante</Label>
                <Input value={header.company} onChange={e => setField("company", e.target.value)} placeholder="Ex: ALPHAFITUS Laboratório Nutracêutico" />
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
              <div className="text-center py-10 text-muted-foreground text-sm">
                Nenhuma análise adicionada. Clique em "Adicionar Análise" para começar.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/20 text-xs text-muted-foreground">
                      <th className="px-3 py-2 text-left font-medium w-28">Categoria</th>
                      <th className="px-3 py-2 text-left font-medium w-40">Parâmetro</th>
                      <th className="px-3 py-2 text-left font-medium w-32">Resultado Encontrado</th>
                      <th className="px-3 py-2 text-left font-medium w-20">Unidade</th>
                      <th className="px-3 py-2 text-left font-medium w-36">Especificação</th>
                      <th className="px-3 py-2 text-left font-medium w-32">Método</th>
                      <th className="px-3 py-2 text-left font-medium w-36">Situação</th>
                      <th className="px-3 py-2 w-8" />
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((r, i) => (
                      <ResultRow
                        key={r.id}
                        result={r}
                        even={i % 2 === 0}
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
                    <CheckCircle2 className="h-4 w-4" /> APROVADO
                  </span>
                )}
                {conclusao === "REPROVADO" && (
                  <span className="flex items-center gap-1.5 font-bold text-red-500 text-sm">
                    <XCircle className="h-4 w-4" /> REPROVADO
                  </span>
                )}
                {conclusao === "PENDENTE" && (
                  <span className="flex items-center gap-1.5 text-amber-500 text-sm font-medium">
                    <Clock className="h-4 w-4" /> Aguardando avaliação
                  </span>
                )}
              </div>
            )}
          </div>

          {/* ── Resumo / Observações ── */}
          <div className="border rounded-xl bg-card shadow-sm p-5 space-y-2">
            <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
              Resumo / Observações do Comparativo
            </h2>
            <textarea
              className="w-full min-h-[100px] text-sm rounded-md border border-input bg-background px-3 py-2 resize-y focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="Descreva brevemente o resultado geral das análises, desvios encontrados, conclusões do comparativo com o protocolo, condições especiais ou informações relevantes que devem constar no laudo…"
              value={header.notes}
              onChange={e => setField("notes", e.target.value)}
            />
            <p className="text-xs text-muted-foreground">Este texto aparece no PDF quando a seção "Resumo" estiver ativada nas configurações abaixo.</p>
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
            .status-pendente { color: #94a3b8; }
          }
        `}</style>

        {/* Header */}
        <div style={{ borderBottom: "2px solid #1e3a5f", paddingBottom: "8px", marginBottom: "10px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
            <div>
              <div style={{ fontSize: "15pt", fontWeight: 800, color: "#1e3a5f", letterSpacing: "0.02em" }}>
                LAUDO DE ANÁLISE
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
              ) : results.map((r, i) => (
                <tr key={r.id} style={i % 2 === 1 ? { background: "#f8fafc" } : {}}>
                  <td>{r.category}</td>
                  <td style={{ fontWeight: 600 }}>{r.parameter}</td>
                  <td style={{ fontWeight: 700 }}>{r.result || "—"}</td>
                  <td>{r.unit}</td>
                  <td>{r.spec || "—"}</td>
                  <td>{r.method || "—"}</td>
                  <td className={`status-${r.status}`}>
                    {r.status === "conforme" ? "✓ Conforme" : r.status === "nao_conforme" ? "✗ Não Conforme" : "Pendente"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Conclusion */}
        <div style={{ border: "1px solid #e2e8f0", borderRadius: "4px", padding: "6px 10px", marginBottom: "16px", display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ fontWeight: 700, color: "#475569" }}>CONCLUSÃO:</span>
          {conclusao === "APROVADO" && (
            <span style={{ fontWeight: 900, fontSize: "11pt", color: "#16a34a", letterSpacing: "0.05em" }}>✓ PRODUTO APROVADO</span>
          )}
          {conclusao === "REPROVADO" && (
            <span style={{ fontWeight: 900, fontSize: "11pt", color: "#dc2626", letterSpacing: "0.05em" }}>✗ PRODUTO REPROVADO</span>
          )}
          {conclusao === "PENDENTE" && (
            <span style={{ fontWeight: 700, fontSize: "10pt", color: "#94a3b8" }}>Avaliação Pendente</span>
          )}
        </div>
        </div>
        )}

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

        {/* Signature */}
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "24px" }}>
          <div style={{ textAlign: "center", minWidth: "200px" }}>
            <div style={{ borderTop: "1px solid #475569", paddingTop: "6px" }}>
              <div style={{ fontWeight: 700 }}>{header.responsibleTech || coa.responsibleTech || "Responsável Técnico"}</div>
              {(header.responsibleTechCrq || coa.responsibleTechCrq) && (
                <div style={{ fontSize: "8pt", color: "#475569" }}>CRQ/CRF/CFQ: {header.responsibleTechCrq || coa.responsibleTechCrq}</div>
              )}
              <div style={{ fontSize: "8pt", color: "#475569" }}>{header.company || coa.company || ""}</div>
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
          <div className="space-y-4">
            {STANDARD_PARAMS.map(group => (
              <div key={group.category}>
                <div className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-2">{group.category}</div>
                <div className="flex flex-wrap gap-1.5">
                  {group.params.filter(p => !results.some(r => r.parameter === p)).map(p => (
                    <button
                      key={p}
                      onClick={() => addParam(group.category, p)}
                      className="text-xs px-2.5 py-1 rounded-full border border-primary/30 bg-primary/5 text-primary hover:bg-primary/15 transition-colors font-medium"
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
                <Button size="sm" className="h-8" onClick={() => addParam(customCategory, customParam)} disabled={!customParam.trim()}>
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
    </div>
  );
}

// ── ResultRow — inline editable ───────────────────────────────────────────────

function ResultRow({
  result, even, onSave, onDelete,
}: {
  result: CoaResult;
  even: boolean;
  onSave: (data: Partial<CoaResult>) => void;
  onDelete: () => void;
}) {
  const [r, setR] = useState(result.result);
  const [unit, setUnit] = useState(result.unit);
  const [spec, setSpec] = useState(result.spec);
  const [method, setMethod] = useState(result.method);
  const [status, setStatus] = useState(result.status);

  useEffect(() => {
    setR(result.result); setUnit(result.unit);
    setSpec(result.spec); setMethod(result.method);
    setStatus(result.status);
  }, [result.id, result.result, result.unit, result.spec, result.method, result.status]);

  const save = (field: Partial<CoaResult>) => onSave(field);

  return (
    <tr className={`border-b last:border-0 ${even ? "" : "bg-muted/10"}`}>
      <td className="px-3 py-1.5 text-xs text-muted-foreground">{result.category}</td>
      <td className="px-3 py-1.5 font-medium text-sm">{result.parameter}</td>
      <td className="px-2 py-1">
        <Input
          value={r} onChange={e => setR(e.target.value)}
          onBlur={() => save({ result: r })}
          className="h-7 text-xs font-semibold"
          placeholder="Valor encontrado"
        />
      </td>
      <td className="px-2 py-1">
        <Input
          value={unit} onChange={e => setUnit(e.target.value)}
          onBlur={() => save({ unit })}
          className="h-7 text-xs"
          placeholder="un."
        />
      </td>
      <td className="px-2 py-1">
        <Input
          value={spec} onChange={e => setSpec(e.target.value)}
          onBlur={() => save({ spec })}
          className="h-7 text-xs"
          placeholder="Ex: 6,0 – 8,0"
        />
      </td>
      <td className="px-2 py-1">
        <Input
          value={method} onChange={e => setMethod(e.target.value)}
          onBlur={() => save({ method })}
          className="h-7 text-xs"
          placeholder="AOAC, USP…"
        />
      </td>
      <td className="px-2 py-1">
        <Select value={status} onValueChange={v => { setStatus(v); save({ status: v }); }}>
          <SelectTrigger className="h-7 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="pendente">Pendente</SelectItem>
            <SelectItem value="conforme">✓ Conforme</SelectItem>
            <SelectItem value="nao_conforme">✗ Não Conforme</SelectItem>
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
