import { useState, useRef, useEffect, useCallback, useMemo, Fragment } from "react";
import {
  useListBibliographicReferences,
  useCreateBibliographicReference,
  useUpdateBibliographicReference,
  getListBibliographicReferencesQueryKey,
  useListProtocolBibliographicReferences,
  useAddProtocolBibliographicReference,
  useRemoveProtocolBibliographicReference,
  useBulkAddProtocolBibliographicReferences,
  useReorderProtocolBibliographicReferences,
  getListProtocolBibliographicReferencesQueryKey,
  type BibliographicReference,
  type BibliographicReferenceInput,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Separator } from "@/components/ui/separator";
import { Plus, Pencil, Trash2, Search, BookOpen, GripVertical, Download, X, ExternalLink, CheckCircle2, Loader2, PenLine, Eye, EyeOff } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/use-auth";
import { fmtDate } from "@/lib/utils";

const TIPO_LABELS_REF: Record<string, string> = {
  geral: "Geral",
  ativo: "Referência do Ativo",
  analitica: "Metodologia Analítica",
  regulatoria: "Regulatória",
  embalagem: "Embalagem",
  degradacao: "Degradação",
  artigo: "Artigo", livro: "Livro", site: "Site/URL",
  regulamentacao: "Regulamentação", norma: "Norma Técnica", outro: "Outro",
};

const TIPO_COLORS_REF: Record<string, { bg: string; text: string; dot: string }> = {
  geral:       { bg: "bg-green-100",  text: "text-green-800",  dot: "🟢" },
  ativo:       { bg: "bg-blue-100",   text: "text-blue-800",   dot: "🔵" },
  analitica:   { bg: "bg-purple-100", text: "text-purple-800", dot: "🟣" },
  regulatoria: { bg: "bg-orange-100", text: "text-orange-800", dot: "🟠" },
  embalagem:   { bg: "bg-yellow-100", text: "text-yellow-800", dot: "🟡" },
  degradacao:  { bg: "bg-red-100",    text: "text-red-800",    dot: "🔴" },
};

const TIPO_ORDER_REF = ["geral", "ativo", "analitica", "regulatoria", "embalagem", "degradacao"] as const;
const TIPO_LEGACY = ["artigo", "livro", "site", "regulamentacao", "norma", "outro"];

function formatAbntRef(r: BibliographicReference): string {
  const parts: string[] = [];
  if (r.autores) parts.push(r.autores + ".");
  if (r.titulo) parts.push(r.titulo + ".");
  if (r.fonte) parts.push(r.fonte + (r.volume || r.numero || r.paginas || r.ano ? "," : "."));
  if (r.volume) parts.push(`v. ${r.volume}${r.numero || r.paginas || r.ano ? "," : "."}`);
  if (r.numero) parts.push(`n. ${r.numero}${r.paginas || r.ano ? "," : "."}`);
  if (r.paginas) parts.push(`p. ${r.paginas}${r.ano ? "," : "."}`);
  if (r.ano) parts.push(`${r.ano}.`);
  if (r.doi) parts.push(`Disponível em: ${r.doi}.`);
  return parts.join(" ");
}

const EMPTY_NEW_REF: BibliographicReferenceInput = {
  titulo: "", autores: "", ano: undefined, fonte: "",
  tipoReferencia: "geral", ativoRelacionado: "", descricao: "", doi: "",
  volume: "", numero: "", paginas: "", color: "",
};

const REF_COLOR_SWATCHES_PD = [
  { value: "",         label: "Padrão",  tw: "bg-gray-300",   ring: "ring-gray-400" },
  { value: "vermelho", label: "Vermelho",tw: "bg-red-500",    ring: "ring-red-400" },
  { value: "laranja",  label: "Laranja", tw: "bg-orange-500", ring: "ring-orange-400" },
  { value: "amarelo",  label: "Amarelo", tw: "bg-yellow-400", ring: "ring-yellow-400" },
  { value: "verde",    label: "Verde",   tw: "bg-green-500",  ring: "ring-green-400" },
  { value: "ciano",    label: "Ciano",   tw: "bg-teal-500",   ring: "ring-teal-400" },
  { value: "azul",     label: "Azul",    tw: "bg-blue-500",   ring: "ring-blue-400" },
  { value: "violeta",  label: "Violeta", tw: "bg-violet-500", ring: "ring-violet-400" },
  { value: "rosa",     label: "Rosa",    tw: "bg-pink-500",   ring: "ring-pink-400" },
  { value: "cinza",    label: "Cinza",   tw: "bg-slate-500",  ring: "ring-slate-400" },
];

const COLOR_BLOCK_PD: Record<string, { border: string; bg: string; dot: string; label: string }> = {
  vermelho: { border: "border-l-red-400",    bg: "bg-red-50",    dot: "bg-red-400",    label: "Vermelho" },
  laranja:  { border: "border-l-orange-400", bg: "bg-orange-50", dot: "bg-orange-400", label: "Laranja" },
  amarelo:  { border: "border-l-yellow-400", bg: "bg-yellow-50", dot: "bg-yellow-400", label: "Amarelo" },
  verde:    { border: "border-l-green-400",  bg: "bg-green-50",  dot: "bg-green-400",  label: "Verde" },
  ciano:    { border: "border-l-teal-400",   bg: "bg-teal-50",   dot: "bg-teal-400",   label: "Ciano" },
  azul:     { border: "border-l-blue-400",   bg: "bg-blue-50",   dot: "bg-blue-400",   label: "Azul" },
  violeta:  { border: "border-l-violet-400", bg: "bg-violet-50", dot: "bg-violet-400", label: "Violeta" },
  rosa:     { border: "border-l-pink-400",   bg: "bg-pink-50",   dot: "bg-pink-400",   label: "Rosa" },
  cinza:    { border: "border-l-slate-400",  bg: "bg-slate-50",  dot: "bg-slate-400",  label: "Cinza" },
};

function RefSelectRow({ ref, selectedIds, toggleSelect }: {
  ref: BibliographicReference;
  selectedIds: Set<number>;
  toggleSelect: (id: number) => void;
}) {
  return (
    <label
      className={`flex items-start gap-3 w-full p-3 rounded-lg cursor-pointer transition-colors ${selectedIds.has(ref.id) ? "bg-primary/8 border border-primary/30" : "hover:bg-muted/60"}`}
    >
      <input
        type="checkbox"
        className="mt-0.5 h-4 w-4 accent-primary flex-shrink-0"
        checked={selectedIds.has(ref.id)}
        onChange={() => toggleSelect(ref.id)}
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium leading-snug">{ref.titulo}</p>
        {ref.autores && <p className="text-xs text-muted-foreground">{ref.autores}</p>}
        {ref.ano && <p className="text-xs text-muted-foreground">{ref.ano}</p>}
        {ref.autoInclude && (
          <span className="text-xs px-1.5 py-0.5 rounded bg-green-100 text-green-700 font-medium">auto-incluída</span>
        )}
      </div>
    </label>
  );
}


function ReferencesTab({ protocolId }: { protocolId: number }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [search, setSearch] = useState("");
  // "select" = browsing existing refs | "create" = new-ref form
  const [mode, setMode] = useState<"select" | "create">("select");
  const [newRef, setNewRef] = useState<BibliographicReferenceInput>(EMPTY_NEW_REF);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [filterTipos, setFilterTipos] = useState<Set<string>>(new Set());
  const [filterDropOpen, setFilterDropOpen] = useState(false);
  // Aviso de possível duplicata: guarda a referência encontrada e como foi detectada
  const [dupWarn, setDupWarn] = useState<{
    existing: BibliographicReference;
    byDoi: boolean;
    byAutores: boolean;
    inProtocol: boolean;
  } | null>(null);

  // ── Edição inline de referência ──────────────────────────────────
  const [editingRef, setEditingRef] = useState<BibliographicReference | null>(null);
  const [editRefData, setEditRefData] = useState<BibliographicReferenceInput>(EMPTY_NEW_REF);
  const [editConfirmOpen, setEditConfirmOpen] = useState(false);

  // Senha para remover referência do protocolo
  const [pendingRemoveRef, setPendingRemoveRef] = useState<{ id: number; title: string } | null>(null);
  const [removeRefPwd, setRemoveRefPwd] = useState("");
  const [removeRefPwdError, setRemoveRefPwdError] = useState("");
  const [removeRefPwdLoading, setRemoveRefPwdLoading] = useState(false);
  const [removeRefPwdShow, setRemoveRefPwdShow] = useState(false);

  const confirmRemoveRef = async () => {
    if (!pendingRemoveRef || !removeRefPwd.trim()) return;
    setRemoveRefPwdLoading(true);
    setRemoveRefPwdError("");
    try {
      const res = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: removeRefPwd }),
      });
      if (res.ok) {
        removeRef.mutate({ id: protocolId, refId: pendingRemoveRef.id });
        setPendingRemoveRef(null);
        setRemoveRefPwd("");
        setRemoveRefPwdShow(false);
      } else {
        setRemoveRefPwdError("Senha incorreta.");
        setRemoveRefPwd("");
      }
    } catch {
      setRemoveRefPwdError("Erro de conexão.");
    }
    setRemoveRefPwdLoading(false);
  };

  const { data: protocolRefs = [], isLoading } = useListProtocolBibliographicReferences(protocolId);
  const { data: allRefs = [] } = useListBibliographicReferences();

  const addRef = useAddProtocolBibliographicReference({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListProtocolBibliographicReferencesQueryKey(protocolId) });
        toast({ title: "Referência adicionada ao protocolo" });
      },
      onError: () => toast({ title: "Erro ao adicionar referência", variant: "destructive" }),
    },
  });

  const removeRef = useRemoveProtocolBibliographicReference({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListProtocolBibliographicReferencesQueryKey(protocolId) });
        toast({ title: "Referência removida do protocolo" });
      },
      onError: () => toast({ title: "Erro ao remover referência", variant: "destructive" }),
    },
  });

  const createRef = useCreateBibliographicReference({
    mutation: {
      onSuccess: (created) => {
        queryClient.invalidateQueries({ queryKey: getListBibliographicReferencesQueryKey() });
        addRef.mutate({ id: protocolId, data: { referenceId: created.id } });
        toast({ title: "Referência cadastrada e adicionada ao protocolo" });
        setDupWarn(null);
        closeDialog();
      },
      onError: (err) => toast({ title: "Erro ao cadastrar referência", description: (err as Error).message, variant: "destructive" }),
    },
  });

  const updateRef = useUpdateBibliographicReference({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListBibliographicReferencesQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListProtocolBibliographicReferencesQueryKey(protocolId) });
        toast({ title: "Referência atualizada no banco" });
        setEditingRef(null);
        setEditConfirmOpen(false);
      },
      onError: (err) => toast({ title: "Erro ao atualizar referência", description: (err as Error).message, variant: "destructive" }),
    },
  });

  // Verifica duplicata por DOI ou Autores antes de salvar.
  // Se encontrar, exibe aviso; o usuário pode confirmar para cadastrar mesmo assim.
  function handleTrySave() {
    if (!newRef.titulo.trim() || createRef.isPending) return;
    setDupWarn(null);

    const doiNorm = (newRef.doi ?? "").trim().toLowerCase();
    const autoresNorm = (newRef.autores ?? "").trim().toLowerCase();
    const hasDoi = doiNorm.length > 0;
    const hasAutores = autoresNorm.length > 0;

    if (!hasDoi && !hasAutores) {
      createRef.mutate({ data: { ...newRef, titulo: newRef.titulo.trim() } });
      return;
    }

    const protocolRefIds = new Set(protocolRefs.map(r => r.id));
    // Checar primeiro no protocolo atual, depois no banco global
    const toCheck: BibliographicReference[] = [
      ...protocolRefs,
      ...allRefs.filter(r => !protocolRefIds.has(r.id)),
    ];

    for (const r of toCheck) {
      const rDoi = (r.doi ?? "").trim().toLowerCase();
      const rAutores = (r.autores ?? "").trim().toLowerCase();
      const byDoi = hasDoi && rDoi.length > 0 && doiNorm === rDoi;
      const byAutores = hasAutores && rAutores.length > 0 && autoresNorm === rAutores;
      if (byDoi || byAutores) {
        setDupWarn({ existing: r, byDoi, byAutores, inProtocol: protocolRefIds.has(r.id) });
        return;
      }
    }

    createRef.mutate({ data: { ...newRef, titulo: newRef.titulo.trim() } });
  }

  const bulkAddRefs = useBulkAddProtocolBibliographicReferences({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListProtocolBibliographicReferencesQueryKey(protocolId) });
        toast({ title: `Referências adicionadas ao protocolo` });
        closeDialog();
      },
      onError: () => toast({ title: "Erro ao adicionar referências", variant: "destructive" }),
    },
  });

  const reorderRefs = useReorderProtocolBibliographicReferences({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListProtocolBibliographicReferencesQueryKey(protocolId) });
      },
    },
  });

  function openDialog(startInCreate = false) {
    setSearch("");
    setNewRef(EMPTY_NEW_REF);
    setSelectedIds(new Set());
    setMode(startInCreate ? "create" : "select");
    setSelectorOpen(true);
  }

  function closeDialog() {
    setSelectorOpen(false);
    setMode("select");
    setSearch("");
    setNewRef(EMPTY_NEW_REF);
    setSelectedIds(new Set());
    setFilterTipos(new Set());
    setFilterDropOpen(false);
  }

  function toggleSelect(id: number) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function moveRef(idx: number, dir: -1 | 1) {
    const newOrder = [...protocolRefs];
    const target = idx + dir;
    if (target < 0 || target >= newOrder.length) return;
    [newOrder[idx], newOrder[target]] = [newOrder[target]!, newOrder[idx]!];
    reorderRefs.mutate({ id: protocolId, data: { orderedIds: newOrder.map(r => r.id) } });
  }

  const linkedIds = new Set(protocolRefs.map(r => r.id));

  // ── Ordenação automática das referências do protocolo ─────────────
  // 1º RDC  2º IN  3º Guia  4º Portaria  5º com ativo  6º demais (por tipo)
  const tipoOrderAll = [...TIPO_ORDER_REF, ...TIPO_LEGACY] as string[];
  const refRank = (r: BibliographicReference): number => {
    const t = r.titulo.trim();
    if (/^rdc\b/i.test(t))      return 0;
    if (/^in\b/i.test(t))       return 1;
    if (/^guia\b/i.test(t))     return 2;
    if (/^portaria\b/i.test(t)) return 3;
    if (r.ativoRelacionado?.trim()) return 4;
    return 5;
  };
  const sortedProtocolRefs = [...protocolRefs].sort((a, b) => {
    // Auto-incluídas sempre primeiro
    const aa = a.autoInclude ? 0 : 1;
    const ab = b.autoInclude ? 0 : 1;
    if (aa !== ab) return aa - ab;
    const ra = refRank(a), rb = refRank(b);
    if (ra !== rb) return ra - rb;
    if (ra === 4) {
      // mesmo grupo "ativo": ordena pelo nome do ativo, depois pelo título
      const ca = (a.ativoRelacionado ?? "").trim().toLowerCase();
      const cb = (b.ativoRelacionado ?? "").trim().toLowerCase();
      if (ca !== cb) return ca.localeCompare(cb, "pt-BR");
    }
    if (ra === 5) {
      // mesmo grupo "demais": ordena pelo tipo, depois pelo título
      const firstTipo = (r: BibliographicReference) =>
        r.tipoReferencia.split(",").filter(Boolean)[0] ?? "";
      const ta = tipoOrderAll.indexOf(firstTipo(a));
      const tb = tipoOrderAll.indexOf(firstTipo(b));
      const oa = ta === -1 ? 99 : ta;
      const ob = tb === -1 ? 99 : tb;
      if (oa !== ob) return oa - ob;
    }
    return a.titulo.localeCompare(b.titulo, "pt-BR", { sensitivity: "base" });
  });

  // Normaliza: minúsculas + remove acentos + remove pontuação/símbolos
  const normSearch = (s: string) =>
    s.toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")  // acentos
      .replace(/[^a-z0-9\s]/g, "")                        // pontuação / símbolos
      .replace(/\s+/g, " ").trim();

  const sq = normSearch(search);

  const available = allRefs.filter(r => {
    if (filterTipos.size > 0 && !r.tipoReferencia.split(",").some(t => filterTipos.has(t))) return false;
    if (linkedIds.has(r.id)) return false;
    if (sq === "") return true;
    return (
      normSearch(r.titulo).includes(sq) ||
      normSearch(r.autores ?? "").includes(sq) ||
      normSearch(r.fonte ?? "").includes(sq) ||
      normSearch(r.descricao ?? "").includes(sq) ||
      normSearch(r.ativoRelacionado ?? "").includes(sq) ||
      normSearch(r.doi ?? "").includes(sq) ||
      normSearch(String(r.ano ?? "")).includes(sq)
    );
  });

  const noResults = available.length === 0;

  // All tipos that exist in the bank (excluding already-linked refs)
  const allAvailableTipos = Array.from(new Set(
    allRefs.filter(r => !linkedIds.has(r.id)).map(r => r.tipoReferencia)
  )).sort((a, b) => {
    const oa = [...TIPO_ORDER_REF, ...TIPO_LEGACY].indexOf(a);
    const ob = [...TIPO_ORDER_REF, ...TIPO_LEGACY].indexOf(b);
    return (oa === -1 ? 99 : oa) - (ob === -1 ? 99 : ob);
  });

  return (
    <>
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-primary" />
            <CardTitle className="text-base">Referências Bibliográficas</CardTitle>
            <span className="text-xs text-muted-foreground">(ABNT NBR 6023)</span>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => openDialog(true)}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Nova Referência
            </Button>
            <Button size="sm" variant="outline" onClick={() => openDialog(false)}>
              <BookOpen className="h-3.5 w-3.5 mr-1" /> Selecionar do Banco
            </Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Adicione uma nova referência diretamente aqui ou selecione do banco de cadastros já existente.
        </p>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : protocolRefs.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground text-sm">
            <BookOpen className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p>Nenhuma referência associada a este protocolo.</p>
            <div className="flex items-center justify-center gap-2 mt-3">
              <Button size="sm" variant="outline" onClick={() => openDialog(false)}>
                <BookOpen className="h-3.5 w-3.5 mr-1" /> Selecionar do banco
              </Button>
              <Button size="sm" variant="outline" onClick={() => openDialog(true)}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Cadastrar nova
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {sortedProtocolRefs.map((ref, idx) => {
              const colorBlock = (ref as any).color ? COLOR_BLOCK_PD[(ref as any).color] : null;
              return (
                <div
                  key={ref.id}
                  className={`flex items-start gap-3 py-4 group border-b border-border last:border-b-0 ${colorBlock ? `border-l-4 ${colorBlock.border} pl-3 -ml-3` : ""}`}
                >
                  <span className="text-sm font-bold text-muted-foreground w-6 mt-0.5 flex-shrink-0">{idx + 1}.</span>
                  <div className="flex-1 min-w-0">
                    {/* Tipo badge + cor + ano */}
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      {ref.tipoReferencia.split(",").filter(Boolean).map((tipo, ti) => {
                        const c = TIPO_COLORS_REF[tipo];
                        const label = TIPO_LABELS_REF[tipo] ?? tipo;
                        return c ? (
                          <span key={ti} className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded font-medium ${c.bg} ${c.text}`}>
                            {colorBlock && ti === 0
                              ? <span className={`inline-block w-2 h-2 rounded-full ${colorBlock.dot}`} />
                              : <span>{c.dot}</span>}
                            {label}
                            {tipo === "ativo" && ref.ativoRelacionado ? ` — ${ref.ativoRelacionado}` : ""}
                          </span>
                        ) : (
                          <span key={ti} className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-primary/10 text-primary font-medium">
                            {colorBlock && ti === 0 && <span className={`inline-block w-2 h-2 rounded-full ${colorBlock.dot}`} />}
                            {label}
                          </span>
                        );
                      })}
                      {ref.autoInclude && (
                        <span className="text-xs px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 font-semibold">★ auto-incluída</span>
                      )}
                      {ref.ano && <span className="text-xs text-muted-foreground">{ref.ano}</span>}
                    </div>
                    {/* Título */}
                    <p className="text-sm font-semibold leading-snug">{ref.titulo}</p>
                    {/* Autores */}
                    {ref.autores && <p className="text-xs text-muted-foreground mt-0.5">{ref.autores}</p>}
                    {/* Citação ABNT */}
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed italic">{formatAbntRef(ref)}</p>
                    {/* Descrição */}
                    {ref.descricao && (
                      <div className="mt-2 border border-muted rounded px-3 py-2 bg-muted/30">
                        <p className="text-xs text-muted-foreground leading-relaxed">{ref.descricao}</p>
                      </div>
                    )}
                    {/* DOI / URL */}
                    {ref.doi && (
                      <a href={ref.doi} target="_blank" rel="noopener noreferrer"
                        className="text-xs text-primary underline mt-1.5 inline-flex items-center gap-0.5">
                        <ExternalLink className="h-2.5 w-2.5" />
                        {ref.doi.length > 60 ? ref.doi.slice(0, 60) + "…" : ref.doi}
                      </a>
                    )}
                  </div>
                  {/* Edit button */}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0 text-muted-foreground hover:text-primary hover:bg-primary/10 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 mt-0.5"
                    title="Editar esta referência"
                    onClick={() => {
                      setEditingRef(ref);
                      setEditRefData({
                        titulo: ref.titulo,
                        autores: ref.autores ?? "",
                        ano: ref.ano ?? undefined,
                        fonte: ref.fonte ?? "",
                        tipoReferencia: ref.tipoReferencia,
                        ativoRelacionado: ref.ativoRelacionado ?? "",
                        descricao: ref.descricao ?? "",
                        doi: ref.doi ?? "",
                        volume: ref.volume ?? "",
                        numero: ref.numero ?? "",
                        paginas: ref.paginas ?? "",
                        color: (ref as any).color ?? "",
                        autoInclude: ref.autoInclude ?? false,
                      });
                      setEditConfirmOpen(false);
                    }}
                  >
                    <PenLine className="h-3.5 w-3.5" />
                  </Button>

                  {/* Remove button — exige senha mestra */}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0 text-destructive hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 mt-0.5"
                    title="Remover do protocolo"
                    onClick={() => {
                      const title = ref.autores
                        ? `${ref.autores.split(",")[0].trim()} (${ref.ano ?? "s.d."})`
                        : ref.titulo ?? `Referência #${ref.id}`;
                      setPendingRemoveRef({ id: ref.id, title });
                      setRemoveRefPwd("");
                      setRemoveRefPwdError("");
                    }}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      {/* ── Dialog: editar referência existente ───────────────────── */}
      {editingRef && !editConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setEditingRef(null)}>
          <div className="bg-background rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col mx-4" onClick={e => e.stopPropagation()}>
            {/* Cabeçalho */}
            <div className="flex items-center justify-between p-4 border-b">
              <div className="flex items-center gap-2">
                <PenLine className="h-4 w-4 text-primary" />
                <p className="font-semibold text-sm">Editar referência</p>
              </div>
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setEditingRef(null)}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              <p className="text-xs text-muted-foreground">
                As alterações serão salvas no banco de cadastros e refletidas em <strong>todos os protocolos</strong> que utilizam esta referência.
              </p>

              {/* Tipo — multi-select */}
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">
                  Tipo(s) * <span className="font-normal">(selecione um ou mais)</span>
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {([...TIPO_ORDER_REF, ...TIPO_LEGACY] as string[]).map(v => {
                    const c = TIPO_COLORS_REF[v];
                    const label = TIPO_LABELS_REF[v] ?? v;
                    const activeTipos = (editRefData.tipoReferencia ?? "geral").split(",").filter(Boolean);
                    const active = activeTipos.includes(v);
                    return (
                      <button key={v} type="button"
                        onClick={() => {
                          const current = (editRefData.tipoReferencia ?? "geral").split(",").filter(Boolean);
                          const next = active ? current.filter(t => t !== v) : [...current, v];
                          if (next.length === 0) return;
                          setEditRefData(r => ({ ...r, tipoReferencia: next.join(","), ativoRelacionado: next.includes("ativo") ? r.ativoRelacionado : "" }));
                        }}
                        className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border transition-all select-none ${active ? `${c?.bg ?? "bg-primary/10"} ${c?.text ?? "text-primary"} border-current font-semibold shadow-sm` : "bg-background border-border text-muted-foreground hover:border-primary/40 hover:bg-muted/50"}`}
                      >
                        <span>{c?.dot ?? "•"}</span><span>{label}</span>{active && <span className="font-bold ml-0.5">✓</span>}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Título */}
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">Título *</label>
                <Input autoFocus placeholder="Título da referência" value={editRefData.titulo} onChange={e => setEditRefData(r => ({ ...r, titulo: e.target.value }))} className="h-8 text-sm" />
              </div>

              {/* Autores */}
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">Autores / Órgão emissor</label>
                <Input placeholder="Ex: ANVISA; Ministério da Saúde" value={editRefData.autores ?? ""} onChange={e => setEditRefData(r => ({ ...r, autores: e.target.value }))} className="h-8 text-sm" />
              </div>

              {/* Ano + Fonte */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">Ano</label>
                  <Input type="number" placeholder="Ex: 2019" value={editRefData.ano ?? ""} onChange={e => setEditRefData(r => ({ ...r, ano: e.target.value ? Number(e.target.value) : undefined }))} className="h-8 text-sm" />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">Fonte / Periódico</label>
                  <Input placeholder="Ex: Diário Oficial" value={editRefData.fonte ?? ""} onChange={e => setEditRefData(r => ({ ...r, fonte: e.target.value }))} className="h-8 text-sm" />
                </div>
              </div>

              {/* Volume + Número + Páginas */}
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">Volume</label>
                  <Input placeholder="v." value={editRefData.volume ?? ""} onChange={e => setEditRefData(r => ({ ...r, volume: e.target.value }))} className="h-8 text-sm" />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">Número</label>
                  <Input placeholder="n." value={editRefData.numero ?? ""} onChange={e => setEditRefData(r => ({ ...r, numero: e.target.value }))} className="h-8 text-sm" />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">Páginas</label>
                  <Input placeholder="p." value={editRefData.paginas ?? ""} onChange={e => setEditRefData(r => ({ ...r, paginas: e.target.value }))} className="h-8 text-sm" />
                </div>
              </div>

              {/* DOI / URL */}
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">DOI / URL</label>
                <Input placeholder="https://... ou 10.xxxx/..." value={editRefData.doi ?? ""} onChange={e => setEditRefData(r => ({ ...r, doi: e.target.value }))} className="h-8 text-sm" />
              </div>

              {/* Descrição */}
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">Descrição / Observação</label>
                <textarea rows={2} placeholder="Contexto de uso, capítulo relevante, etc." value={editRefData.descricao ?? ""} onChange={e => setEditRefData(r => ({ ...r, descricao: e.target.value }))} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary resize-none" />
              </div>

              {/* Cor do bloco */}
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1.5">Cor do bloco</label>
                <div className="flex flex-wrap gap-2 items-center">
                  {REF_COLOR_SWATCHES_PD.map(s => (
                    <button key={s.value} type="button" title={s.label}
                      onClick={() => setEditRefData(r => ({ ...r, color: s.value }))}
                      className={`w-6 h-6 rounded-full border-2 transition-all ${s.tw} ${editRefData.color === s.value ? `ring-2 ring-offset-1 ${s.ring} border-white` : "border-white hover:scale-110"}`}
                    />
                  ))}
                  <span className="text-xs text-muted-foreground ml-1">
                    {editRefData.color ? REF_COLOR_SWATCHES_PD.find(s => s.value === editRefData.color)?.label : "Padrão"}
                  </span>
                </div>
              </div>

              {/* Auto-incluir */}
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input type="checkbox" className="h-4 w-4 accent-primary" checked={editRefData.autoInclude ?? false} onChange={e => setEditRefData(r => ({ ...r, autoInclude: e.target.checked }))} />
                <span className="text-xs font-medium text-foreground">Auto-incluir em protocolos novos</span>
              </label>
            </div>

            {/* Rodapé */}
            <div className="p-3 border-t flex justify-end gap-2">
              <Button size="sm" variant="outline" onClick={() => setEditingRef(null)}>Cancelar</Button>
              <Button size="sm" disabled={!editRefData.titulo.trim()} onClick={() => setEditConfirmOpen(true)}>
                <PenLine className="h-3.5 w-3.5 mr-1" />Salvar alterações
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Dialog: confirmar salvamento ───────────────────────────── */}
      {editingRef && editConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setEditConfirmOpen(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-[420px] mx-4 p-5 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-start gap-3">
              <span className="text-amber-500 text-xl leading-none mt-0.5">⚠</span>
              <div>
                <p className="font-semibold text-sm">Tem certeza que deseja salvar as alterações?</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Esta referência será atualizada no <strong>banco de cadastros</strong> e as mudanças refletirão em todos os protocolos que a utilizam.
                </p>
              </div>
            </div>
            <div className="rounded-lg bg-muted/50 border px-3 py-2">
              <p className="text-xs font-semibold text-foreground leading-snug">{editRefData.titulo}</p>
              {editRefData.autores && <p className="text-[11px] text-muted-foreground mt-0.5">{editRefData.autores}</p>}
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button size="sm" variant="outline" onClick={() => setEditConfirmOpen(false)}>Voltar e revisar</Button>
              <Button
                size="sm"
                disabled={updateRef.isPending}
                className="bg-amber-600 hover:bg-amber-700 text-white"
                onClick={() => updateRef.mutate({ id: editingRef.id, data: editRefData })}
              >
                {updateRef.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
                Confirmar e salvar
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Dialog ── */}
      {selectorOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={closeDialog}>
          <div
            className="bg-background rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col mx-4"
            onClick={e => e.stopPropagation()}
          >
            {/* Header with mode toggle */}
            <div className="flex items-center justify-between p-4 border-b gap-3">
              <div className="flex gap-1 bg-muted rounded-lg p-1">
                <button
                  className={`text-xs px-3 py-1.5 rounded-md font-medium transition-colors ${mode === "select" ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                  onClick={() => setMode("select")}
                >
                  <BookOpen className="h-3 w-3 inline mr-1" />Selecionar do banco
                </button>
                <button
                  className={`text-xs px-3 py-1.5 rounded-md font-medium transition-colors ${mode === "create" ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                  onClick={() => { setMode("create"); setNewRef(EMPTY_NEW_REF); }}
                >
                  <Plus className="h-3 w-3 inline mr-1" />Cadastrar nova
                </button>
              </div>
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0 shrink-0" onClick={closeDialog}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>

            {/* ── SELECT MODE ── */}
            {mode === "select" && (
              <>
                <div className="p-3 border-b space-y-2">
                  <Input
                    autoFocus
                    placeholder="Buscar por título ou autor..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="h-8 text-sm"
                  />
                  {/* ── Filtro multi-tipo ── */}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setFilterDropOpen(o => !o)}
                      className={`w-full flex items-center justify-between gap-2 text-xs px-3 py-1.5 rounded-md border transition-colors ${filterTipos.size > 0 ? "border-primary bg-primary/5 text-primary font-medium" : "border-input bg-background text-muted-foreground hover:border-primary/50"}`}
                    >
                      <span>
                        {filterTipos.size === 0
                          ? "Filtrar por tipo/categoria…"
                          : `Tipos selecionados: ${Array.from(filterTipos).map(t => TIPO_LABELS_REF[t] ?? t).join(", ")}`}
                      </span>
                      <span className="shrink-0 text-muted-foreground">▾</span>
                    </button>
                    {filterDropOpen && (
                      <>
                        {/* Backdrop fora do dropdown — fecha ao clicar fora */}
                        <div
                          className="fixed inset-0 z-40"
                          onClick={() => setFilterDropOpen(false)}
                        />
                        {/* Dropdown acima do backdrop */}
                        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-background border border-border rounded-lg shadow-xl overflow-hidden">
                          {/* Cabeçalho */}
                          <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/40">
                            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Tipo de referência</span>
                            {filterTipos.size > 0 && (
                              <button
                                type="button"
                                onClick={e => { e.stopPropagation(); setFilterTipos(new Set()); }}
                                className="text-[10px] text-primary hover:underline"
                              >Limpar filtro</button>
                            )}
                          </div>
                          {/* Opções — clique mantém dropdown aberto */}
                          <div className="max-h-56 overflow-y-auto py-1">
                            {allAvailableTipos.map(tipo => {
                              const c = TIPO_COLORS_REF[tipo];
                              const label = TIPO_LABELS_REF[tipo] ?? tipo;
                              const active = filterTipos.has(tipo);
                              return (
                                <button
                                  key={tipo}
                                  type="button"
                                  onClick={e => {
                                    e.stopPropagation();
                                    setFilterTipos(prev => {
                                      const next = new Set(prev);
                                      if (next.has(tipo)) next.delete(tipo); else next.add(tipo);
                                      return next;
                                    });
                                  }}
                                  className={`w-full flex items-center justify-between gap-2 px-4 py-2 text-sm text-left transition-colors hover:bg-muted/50 ${active ? "bg-primary/5 font-medium" : ""}`}
                                >
                                  <span className="flex items-center gap-2">
                                    <span>{c?.dot ?? "•"}</span>
                                    <span>{label}</span>
                                  </span>
                                  {active && <span className="text-primary font-bold text-base leading-none">✓</span>}
                                </button>
                              );
                            })}
                          </div>
                          {/* Rodapé com botão fechar */}
                          <div className="border-t px-3 py-2 bg-muted/20 flex justify-end">
                            <button
                              type="button"
                              onClick={() => setFilterDropOpen(false)}
                              className="text-xs text-muted-foreground hover:text-foreground font-medium"
                            >Fechar ✕</button>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                  {/* Chips dos tipos ativos */}
                  {filterTipos.size > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {Array.from(filterTipos).map(tipo => {
                        const c = TIPO_COLORS_REF[tipo];
                        const label = TIPO_LABELS_REF[tipo] ?? tipo;
                        return (
                          <span
                            key={tipo}
                            className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium cursor-pointer ${c?.bg ?? "bg-muted"} ${c?.text ?? "text-foreground"}`}
                            onClick={() => setFilterTipos(prev => { const n = new Set(prev); n.delete(tipo); return n; })}
                            title="Clique para remover filtro"
                          >
                            {c?.dot} {label} <span className="ml-0.5 opacity-60">×</span>
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>
                <div className="flex-1 overflow-y-auto p-2 space-y-2">
                  {(() => {
                    if (available.length === 0) return null;
                    const byTipo: Record<string, BibliographicReference[]> = {};
                    for (const r of available) {
                      const t = r.tipoReferencia;
                      if (!byTipo[t]) byTipo[t] = [];
                      byTipo[t]!.push(r);
                    }
                    const orderedTipos = [
                      ...TIPO_ORDER_REF.filter(t => byTipo[t]),
                      ...Object.keys(byTipo).filter(t => !TIPO_ORDER_REF.includes(t as never)),
                    ];
                    return orderedTipos.map(tipo => {
                      const refs = byTipo[tipo]!;
                      const c = TIPO_COLORS_REF[tipo];
                      const label = TIPO_LABELS_REF[tipo] ?? tipo;
                      if (tipo === "ativo") {
                        const byAtivo: Record<string, BibliographicReference[]> = {};
                        for (const r of refs) {
                          const k = r.ativoRelacionado?.trim() || "";
                          if (!byAtivo[k]) byAtivo[k] = [];
                          byAtivo[k]!.push(r);
                        }
                        const ativoKeys = Object.keys(byAtivo).sort((a, b) => a.localeCompare(b));
                        return (
                          <div key={tipo}>
                            <p className={`text-xs font-semibold px-2 py-1 rounded mb-1 ${c?.bg ?? "bg-muted"} ${c?.text ?? "text-foreground"}`}>
                              {c?.dot} {label}
                            </p>
                            {ativoKeys.map(ativo => (
                              <div key={ativo} className="mb-1">
                                {ativo && (
                                  <p className="text-xs text-muted-foreground font-medium px-2 mt-1 mb-0.5">— {ativo} ({byAtivo[ativo]!.length})</p>
                                )}
                                {byAtivo[ativo]!.map(ref => (
                                  <RefSelectRow key={ref.id} ref={ref} selectedIds={selectedIds} toggleSelect={toggleSelect} />
                                ))}
                              </div>
                            ))}
                          </div>
                        );
                      }
                      return (
                        <div key={tipo}>
                          <p className={`text-xs font-semibold px-2 py-1 rounded mb-1 ${c?.bg ?? "bg-muted"} ${c?.text ?? "text-foreground"}`}>
                            {c?.dot ?? ""} {label} ({refs.length})
                          </p>
                          {refs.map(ref => (
                            <RefSelectRow key={ref.id} ref={ref} selectedIds={selectedIds} toggleSelect={toggleSelect} />
                          ))}
                        </div>
                      );
                    });
                  })()}

                  {/* Empty state — prompt to create */}
                  {noResults && (
                    <div className="text-center py-6 space-y-3">
                      <p className="text-sm text-muted-foreground">
                        {allRefs.length === 0
                          ? "Nenhuma referência cadastrada ainda."
                          : search
                            ? `Nenhum resultado para "${search}".`
                            : "Todas as referências do banco já estão neste protocolo."}
                      </p>
                      <Button size="sm" variant="outline" onClick={() => { setMode("create"); setNewRef(r => ({ ...r, titulo: search })); }}>
                        <Plus className="h-3.5 w-3.5 mr-1" />
                        Cadastrar "{search || "nova referência"}"
                      </Button>
                    </div>
                  )}
                </div>
                {/* Sticky footer with bulk-add button */}
                <div className="p-3 border-t bg-background flex items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground">
                    {selectedIds.size > 0 ? `${selectedIds.size} selecionada(s)` : "Marque uma ou mais referências"}
                  </span>
                  <div className="flex gap-2">
                    <Button size="sm" variant="ghost" onClick={closeDialog}>Cancelar</Button>
                    <Button
                      size="sm"
                      disabled={selectedIds.size === 0 || bulkAddRefs.isPending}
                      onClick={() => bulkAddRefs.mutate({ id: protocolId, data: { referenceIds: Array.from(selectedIds) } })}
                    >
                      {bulkAddRefs.isPending ? "Adicionando..." : `Adicionar ${selectedIds.size > 0 ? selectedIds.size : ""} selecionada(s)`}
                    </Button>
                  </div>
                </div>
              </>
            )}

            {/* ── CREATE MODE ── */}
            {mode === "create" && (
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                <p className="text-xs text-muted-foreground">
                  A referência será salva no banco de cadastros e automaticamente associada a este protocolo.
                </p>

                {/* Tipo — multi-select */}
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">
                    Tipo(s) * <span className="font-normal text-muted-foreground">(selecione um ou mais)</span>
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {([...TIPO_ORDER_REF, ...TIPO_LEGACY] as string[]).map(v => {
                      const c = TIPO_COLORS_REF[v];
                      const label = TIPO_LABELS_REF[v] ?? v;
                      const activeTipos = (newRef.tipoReferencia ?? "geral").split(",").filter(Boolean);
                      const active = activeTipos.includes(v);
                      return (
                        <button
                          key={v}
                          type="button"
                          onClick={() => {
                            const current = (newRef.tipoReferencia ?? "geral").split(",").filter(Boolean);
                            const next = active ? current.filter(t => t !== v) : [...current, v];
                            if (next.length === 0) return;
                            setNewRef(r => ({
                              ...r,
                              tipoReferencia: next.join(","),
                              ativoRelacionado: next.includes("ativo") ? r.ativoRelacionado : "",
                            }));
                          }}
                          className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border transition-all select-none ${
                            active
                              ? `${c?.bg ?? "bg-primary/10"} ${c?.text ?? "text-primary"} border-current font-semibold shadow-sm`
                              : "bg-background border-border text-muted-foreground hover:border-primary/40 hover:bg-muted/50"
                          }`}
                        >
                          <span>{c?.dot ?? "•"}</span>
                          <span>{label}</span>
                          {active && <span className="font-bold ml-0.5">✓</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Título */}
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">Título *</label>
                  <Input
                    autoFocus
                    placeholder="Ex: Farmacopeia Brasileira, 6ª Edição"
                    value={newRef.titulo}
                    onChange={e => setNewRef(r => ({ ...r, titulo: e.target.value }))}
                    className="h-8 text-sm"
                  />
                </div>

                {/* Autores */}
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">Autores / Órgão emissor</label>
                  <Input
                    placeholder="Ex: ANVISA; Ministério da Saúde"
                    value={newRef.autores ?? ""}
                    onChange={e => setNewRef(r => ({ ...r, autores: e.target.value }))}
                    className="h-8 text-sm"
                  />
                </div>

                {/* Ano + Fonte na mesma linha */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground block mb-1">Ano</label>
                    <Input
                      type="number"
                      placeholder="Ex: 2019"
                      value={newRef.ano ?? ""}
                      onChange={e => setNewRef(r => ({ ...r, ano: e.target.value ? Number(e.target.value) : undefined }))}
                      className="h-8 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground block mb-1">Fonte / Periódico</label>
                    <Input
                      placeholder="Ex: Diário Oficial"
                      value={newRef.fonte ?? ""}
                      onChange={e => setNewRef(r => ({ ...r, fonte: e.target.value }))}
                      className="h-8 text-sm"
                    />
                  </div>
                </div>

                {/* DOI / URL */}
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">DOI / URL</label>
                  <Input
                    placeholder="https://... ou 10.xxxx/..."
                    value={newRef.doi ?? ""}
                    onChange={e => setNewRef(r => ({ ...r, doi: e.target.value }))}
                    className="h-8 text-sm"
                  />
                </div>

                {/* Descrição */}
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">Descrição / Observação</label>
                  <textarea
                    rows={2}
                    placeholder="Contexto de uso, capítulo relevante, etc."
                    value={newRef.descricao ?? ""}
                    onChange={e => setNewRef(r => ({ ...r, descricao: e.target.value }))}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                  />
                </div>

                {/* Cor do bloco */}
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1.5">Cor do bloco</label>
                  <div className="flex flex-wrap gap-2 items-center">
                    {REF_COLOR_SWATCHES_PD.map(s => (
                      <button
                        key={s.value}
                        type="button"
                        title={s.label}
                        onClick={() => setNewRef(r => ({ ...r, color: s.value }))}
                        className={`w-6 h-6 rounded-full border-2 transition-all ${s.tw} ${newRef.color === s.value ? `ring-2 ring-offset-1 ${s.ring} border-white` : "border-white hover:scale-110"}`}
                      />
                    ))}
                    <span className="text-xs text-muted-foreground ml-1">
                      {newRef.color ? REF_COLOR_SWATCHES_PD.find(s => s.value === newRef.color)?.label : "Padrão"}
                    </span>
                  </div>
                </div>

                {/* Auto-incluir */}
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-primary"
                    checked={newRef.autoInclude ?? false}
                    onChange={e => { setNewRef(r => ({ ...r, autoInclude: e.target.checked })); setDupWarn(null); }}
                  />
                  <span className="text-xs font-medium text-foreground">Auto-incluir em protocolos novos</span>
                  <span className="text-xs text-muted-foreground">(ex: referências ANVISA obrigatórias)</span>
                </label>

                {/* ── Aviso de duplicata ── */}
                {dupWarn && (
                  <div className="rounded-md border border-amber-300 bg-amber-50 p-3 space-y-2">
                    <div className="flex items-start gap-2">
                      <span className="text-amber-600 text-base leading-none mt-0.5">⚠</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-amber-800">
                          {dupWarn.inProtocol
                            ? "Referência já adicionada a este protocolo"
                            : "Referência similar já existe no banco"}
                          {dupWarn.byDoi && dupWarn.byAutores
                            ? " (mesmo DOI e mesmos autores)"
                            : dupWarn.byDoi
                            ? " (mesmo DOI)"
                            : " (mesmos autores)"}
                        </p>
                        <p className="text-xs text-amber-900 font-medium mt-1 truncate" title={dupWarn.existing.titulo}>
                          {dupWarn.existing.titulo}
                        </p>
                        {dupWarn.existing.autores && (
                          <p className="text-[11px] text-amber-700 truncate">{dupWarn.existing.autores}</p>
                        )}
                        {dupWarn.existing.doi && (
                          <p className="text-[11px] text-amber-600 font-mono truncate">{dupWarn.existing.doi}</p>
                        )}
                      </div>
                    </div>
                    <p className="text-xs text-amber-800">Deseja cadastrar mesmo assim e permitir a duplicata?</p>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs border-amber-400 text-amber-800 hover:bg-amber-100"
                        onClick={() => setDupWarn(null)}
                      >
                        Cancelar
                      </Button>
                      <Button
                        size="sm"
                        className="h-7 text-xs bg-amber-600 hover:bg-amber-700 text-white"
                        disabled={createRef.isPending}
                        onClick={() => createRef.mutate({ data: { ...newRef, titulo: newRef.titulo.trim(), force: true } })}
                      >
                        {createRef.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                        Cadastrar mesmo assim
                      </Button>
                    </div>
                  </div>
                )}

                {/* Actions */}
                {!dupWarn && (
                  <div className="flex justify-end gap-2 pt-1">
                    <Button size="sm" variant="outline" onClick={() => setMode("select")}>
                      Cancelar
                    </Button>
                    <Button
                      size="sm"
                      disabled={!newRef.titulo.trim() || createRef.isPending}
                      onClick={handleTrySave}
                    >
                      {createRef.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Plus className="h-3.5 w-3.5 mr-1" />}
                      Salvar e adicionar
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </Card>

      {/* Modal de senha — remover referência do protocolo */}
      {pendingRemoveRef && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={() => { setPendingRemoveRef(null); setRemoveRefPwd(""); setRemoveRefPwdError(""); }}
        >
          <div className="bg-white rounded-xl shadow-2xl w-96 mx-4 p-5 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2">
              <Trash2 className="h-4 w-4 text-destructive shrink-0" />
              <p className="font-semibold text-sm">Remover referência do protocolo</p>
            </div>
            <div className="rounded-lg bg-muted/50 border px-3 py-2">
              <p className="text-sm text-foreground">{pendingRemoveRef.title}</p>
            </div>
            <p className="text-xs text-muted-foreground">
              A referência será desvinculada deste protocolo. O cadastro continuará na biblioteca geral.
            </p>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Senha mestra para confirmar</label>
              <div className="relative">
                <input
                  type={removeRefPwdShow ? "text" : "password"}
                  autoFocus
                  autoComplete="off"
                  value={removeRefPwd}
                  onChange={e => { setRemoveRefPwd(e.target.value); setRemoveRefPwdError(""); }}
                  onKeyDown={e => {
                    if (e.key === "Enter") confirmRemoveRef();
                    if (e.key === "Escape") { setPendingRemoveRef(null); setRemoveRefPwd(""); setRemoveRefPwdError(""); }
                  }}
                  placeholder="Digite a senha mestra"
                  className="w-full border border-border rounded px-3 py-1.5 text-sm pr-9 focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <button
                  type="button"
                  onClick={() => setRemoveRefPwdShow(s => !s)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
                >
                  {removeRefPwdShow ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {removeRefPwdError && <p className="text-xs text-destructive font-medium">{removeRefPwdError}</p>}
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => { setPendingRemoveRef(null); setRemoveRefPwd(""); setRemoveRefPwdError(""); }}
                className="text-sm px-4 py-1.5 rounded border border-border hover:bg-muted transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmRemoveRef}
                disabled={removeRefPwdLoading || !removeRefPwd.trim()}
                className="text-sm px-4 py-1.5 rounded bg-destructive text-white hover:bg-destructive/80 transition-colors disabled:opacity-50"
              >
                {removeRefPwdLoading ? "Verificando…" : "Remover referência"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── AnvisaTab ─────────────────────────────────────────────────────────────────

type AnvisaNotification = {
  id: number;
  protocolId: number;
  companyName: string;
  companyCnpj: string | null;
  brandName: string | null;
  notifiedAt: string;
  confirmed: boolean;
  expedienteNumber: string | null;
  processNumber: string | null;
  transactionNumber: string | null;
  protocolNumber: string | null;
  attachmentObjectPath: string | null;
  attachmentFileName: string | null;
  attachmentFileType: string | null;
  rotuloObjectPath: string | null;
  rotuloFileName: string | null;
  rotuloFileType: string | null;
  padronizacaoObjectPath: string | null;
  padronizacaoFileName: string | null;
  padronizacaoFileType: string | null;
  docTextJson: string | null;
  notes: string | null;
  createdByName: string | null;
  createdAt: string;
  signedByName: string | null;
  signedByRole: string | null;
  signedAt: string | null;
};

type AnvisaProtocolInfo = {
  companyName: string;
  cnpj: string;
  productName: string;
  productType: string | null;
  activeIngredients: string | null;
  approvedBy: string | null;
  certNumber: string;
};

// ── Default doc text values ───────────────────────────────────────────────────
const DEFAULT_DOC_TEXT = {
  assunto: "Documento com a descrição das alterações realizadas",
  descricaoAlteracao: "A presente alteração refere-se à inclusão de nova empresa responsável pela comercialização do produto, previamente notificado junto à ANVISA.\n\nNão houve qualquer modificação em:\nFormulação qualitativa e quantitativa, Composição, Processo produtivo, Especificações técnicas, Métodos analíticos.\n\nO produto permanece tecnicamente idêntico ao originalmente notificado, sendo a alteração restrita exclusivamente à inclusão de empresa comercializadora adicional.",
  validacao: "Os estudos previamente realizados para o produto original permanecem válidos e aplicáveis, incluindo:\nEstudos de estabilidade, Ensaios de qualidade, Avaliações de segurança, Avaliações de desempenho.\n\nConsiderando que não houve alteração na formulação ou no processo produtivo, não há impacto nos resultados analíticos previamente obtidos, mantendo-se os critérios de aceitação estabelecidos.",
  justificativa: "A inclusão da empresa comercializadora visa ampliar a distribuição e alcance do produto no mercado, mantendo-se integralmente suas características técnicas e regulatórias.\n\nA presente alteração possui caráter exclusivamente administrativo/comercial, não impactando a qualidade, segurança ou eficácia do produto.",
};

function parseDocText(json: string | null) {
  try { return { ...DEFAULT_DOC_TEXT, ...(json ? JSON.parse(json) : {}) }; }
  catch { return { ...DEFAULT_DOC_TEXT }; }
}

function escHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
          .replace(/\n\n/g, "</p><p>").replace(/\n/g, "<br/>");
}

function buildAnvisaDocHtml(
  n: AnvisaNotification,
  p: AnvisaProtocolInfo,
  imgs: { protocolo: string | null; rotulo: string | null; padronizacao: string | null },
  logoSrc?: string
) {
  const today = new Date().toLocaleDateString("pt-BR");
  const dt = parseDocText(n.docTextJson);

  const imgBlock = (src: string | null, label: string, mime: string | null, divId: string) => {
    if (!src) return "";
    if (mime && mime.startsWith("image/")) {
      return `<div style="margin:20px 0;page-break-inside:avoid">
  <p style="font-weight:bold;font-size:10pt;margin-bottom:8px;color:#1e3a5f;border-left:3px solid #1e3a5f;padding-left:8px">${label}</p>
  <img src="${src}" style="max-width:100%;border:1px solid #d1d5db;border-radius:4px;display:block;box-shadow:0 1px 4px rgba(0,0,0,.08)"/>
</div>`;
    }
    if (mime === "application/pdf") {
      return `<div style="margin:20px 0">
  <p style="font-weight:bold;font-size:10pt;margin-bottom:8px;color:#1e3a5f;border-left:3px solid #1e3a5f;padding-left:8px">${label}</p>
  <div id="${divId}" style="border:1px solid #d1d5db;border-radius:4px;background:#f9fafb;min-height:80px;padding:12px;text-align:center">
    <p style="color:#9ca3af;font-size:9pt">⏳ Renderizando páginas do PDF…</p>
  </div>
</div>`;
    }
    return `<p style="color:#9ca3af;font-size:9pt;font-style:italic;margin:8px 0">[${label}: Word/formato não pré-visualizável — abra o arquivo original]</p>`;
  };

  // Build PDF data for JS rendering (only PDFs need canvas rendering)
  const pdfEntries: string[] = [];
  if (imgs.protocolo && n.attachmentFileType === "application/pdf") pdfEntries.push(`"pdf-protocolo":"${imgs.protocolo}"`);
  if (imgs.rotulo && n.rotuloFileType === "application/pdf") pdfEntries.push(`"pdf-rotulo":"${imgs.rotulo}"`);
  if (imgs.padronizacao && n.padronizacaoFileType === "application/pdf") pdfEntries.push(`"pdf-padronizacao":"${imgs.padronizacao}"`);
  const pdfRenderScript = pdfEntries.length > 0 ? `<script>
(async function(){
  const P={${pdfEntries.join(",")}};
  const s=document.createElement('script');
  s.src='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
  document.head.appendChild(s);
  await new Promise(r=>{s.onload=r;s.onerror=r});
  const lib=window['pdfjs-dist/build/pdf'];
  lib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  for(const[id,url]of Object.entries(P)){
    const el=document.getElementById(id);
    if(!el)continue;
    el.innerHTML='';
    try{
      const pdfDoc=await lib.getDocument({data:atob(url.split(',')[1])}).promise;
      for(let pn=1;pn<=pdfDoc.numPages;pn++){
        const page=await pdfDoc.getPage(pn);
        const vp=page.getViewport({scale:1.5});
        const cv=document.createElement('canvas');
        cv.width=vp.width;cv.height=vp.height;
        cv.style.cssText='max-width:100%;width:100%;display:block;margin-bottom:3px;border-radius:2px';
        await page.render({canvasContext:cv.getContext('2d'),viewport:vp}).promise;
        el.appendChild(cv);
        if(pn<pdfDoc.numPages){const hr=document.createElement('div');hr.style.cssText='height:1px;background:#e5e7eb;margin:6px 0';el.appendChild(hr);}
      }
    }catch(e){el.innerHTML='<p style="color:#ef4444;font-size:9pt;padding:8px">Erro ao renderizar PDF — verifique se o arquivo não está protegido por senha.</p>';}
  }
})();
</script>` : "";

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8"/>
<title>Documento ANVISA — ${escHtml(n.companyName)}</title>
<link href="https://fonts.googleapis.com/css2?family=Dancing+Script:wght@600&display=swap" rel="stylesheet"/>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:Arial,sans-serif;font-size:11pt;color:#000;padding:2.5cm 3cm;line-height:1.6}
  h1{font-size:13pt;font-weight:bold;text-align:center;margin-bottom:24px;text-transform:uppercase;letter-spacing:.5px}
  .section{margin-bottom:20px}
  .section-title{font-size:11pt;font-weight:bold;margin-bottom:8px;border-bottom:1.5px solid #1e3a5f;padding-bottom:2px;color:#1e3a5f}
  p{margin-bottom:6px}
  .field-row{display:flex;gap:8px;margin-bottom:4px}
  .field-label{font-weight:bold;min-width:170px;flex-shrink:0}
  .sig-area{margin-top:40px;display:flex;justify-content:flex-end}
  .sig-box{text-align:center;min-width:240px}
  .sig-line{border-top:1.5px solid #1e3a5f;padding-top:8px}
  .sig-cursiva{font-family:'Dancing Script',cursive;font-size:20pt;font-weight:600;color:#111827;line-height:1.3}
  .sig-verified{color:#16a34a;font-size:8pt;margin:2px 0 8px}
  @media print{body{padding:1.5cm 2cm}button{display:none!important}}
</style>
</head>
<body>
<div style="display:flex;align-items:center;justify-content:space-between;border-bottom:2.5px solid #1e3a5f;padding-bottom:12px;margin-bottom:20px">
  ${logoSrc ? `<img src="${logoSrc}" alt="Alphafitus" style="height:80px;width:auto;object-fit:contain"/>` : `<div style="font-weight:900;font-size:13pt;color:#1e3a5f;letter-spacing:.5px">ALPHAFITUS</div>`}
  <div style="text-align:right;font-size:9.5pt;line-height:1.8;color:#374151">
    ${n.expedienteNumber ? `<div><strong>EXPEDIENTE Nº ${escHtml(n.expedienteNumber)}</strong></div>` : ""}
    ${n.processNumber ? `<div>Nº do Processo: ${escHtml(n.processNumber)}</div>` : ""}
    ${n.transactionNumber ? `<div>Nº de Transação: ${escHtml(n.transactionNumber)}</div>` : ""}
    ${n.protocolNumber ? `<div>Nº de Protocolo: ${escHtml(n.protocolNumber)}</div>` : ""}
    <div style="font-size:8.5pt;color:#9ca3af">Data: ${today}</div>
  </div>
</div>

${(p.certNumber || p.productName) ? `
<div style="background:#f0f4f8;border:1.5px solid #1e3a5f;border-radius:4px;padding:10px 16px;margin-bottom:20px;font-size:10pt">
  <div style="color:#888;font-size:9pt;margin-bottom:2px;text-transform:uppercase;letter-spacing:.5px">Referência do Protocolo</div>
  <div style="font-weight:bold;color:#1e3a5f;font-size:11pt">${escHtml((p.productType ? p.productType + " — " : "") + p.productName)}</div>
  ${p.certNumber ? `<div style="font-family:monospace;color:#1e3a5f;font-size:10.5pt;margin-top:3px">${escHtml(p.certNumber)}</div>` : ""}
</div>` : ""}

<h1>Documento com a Descrição das Alterações Realizadas</h1>

<div class="section">
  <p class="section-title">1. Assunto</p>
  <p>${escHtml(dt.assunto)}</p>
</div>

<div class="section">
  <p class="section-title">2. Identificação do Produto Original</p>
  <div class="field-row"><span class="field-label">Designação do Produto (Outros):</span><span>${escHtml(p.productType ?? "Suplemento Alimentar em Cápsula")}</span></div>
  <div class="field-row"><span class="field-label">Nome do Produto:</span><span>${escHtml(p.productName)}</span></div>
  ${p.activeIngredients ? `<div class="field-row"><span class="field-label">Ativos:</span><span>${escHtml(p.activeIngredients)}</span></div>` : ""}
</div>

<div class="section">
  <p class="section-title">3. Descrição da Alteração</p>
  <p>${escHtml(dt.descricaoAlteracao)}</p>
</div>

<div class="section">
  <p class="section-title">4. Identificação da Empresa Responsável pela Comercialização (Nova Inclusão)</p>
  <div class="field-row"><span class="field-label">Razão Social:</span><span>${escHtml(n.companyName)}</span></div>
  ${n.companyCnpj ? `<div class="field-row"><span class="field-label">CNPJ:</span><span>${escHtml(n.companyCnpj)}</span></div>` : ""}
</div>

<div class="section">
  <p class="section-title">5. Identificação Comercial do Produto</p>
  <div class="field-row"><span class="field-label">Marca / Produto:</span><span>${escHtml(n.brandName ?? n.companyName)}</span></div>
  <div class="field-row"><span class="field-label">Nome do Produto:</span><span>${escHtml(p.productName)}</span></div>
</div>

<div class="section">
  <p class="section-title">6. Validação Analítica e Estudos</p>
  <p>${escHtml(dt.validacao)}</p>
</div>

<div class="section">
  <p class="section-title">7. Justificativa Técnica</p>
  <p>${escHtml(dt.justificativa)}</p>
</div>

${(imgs.protocolo || imgs.rotulo || imgs.padronizacao) ? `
<div class="section">
  <p class="section-title">Anexos</p>
  ${imgBlock(imgs.protocolo, "Protocolo ANVISA", n.attachmentFileType, "pdf-protocolo")}
  ${imgBlock(imgs.rotulo, "Rótulo", n.rotuloFileType, "pdf-rotulo")}
  ${imgBlock(imgs.padronizacao, "Padronização", n.padronizacaoFileType, "pdf-padronizacao")}
</div>` : ""}

<div class="section">
  <p class="section-title">8. Assinatura e Liberação</p>
  <div class="sig-area">
    <div class="sig-box">
      ${n.signedByName ? `
      <p class="sig-cursiva">${escHtml(n.signedByName)}</p>
      <p class="sig-verified">✓ Assinado digitalmente — ${n.signedAt ? new Date(n.signedAt).toLocaleString("pt-BR",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"}) : today}</p>
      ` : `<div style="height:55px"></div>`}
      <div class="sig-line">
        <p><strong>${escHtml(n.signedByName ?? p.approvedBy ?? "Responsável Técnico")}</strong></p>
        <p>${escHtml(n.signedByRole ?? "Representante Legal")}</p>
        <p style="font-size:9pt;color:#6b7280;margin-top:4px">${escHtml(p.companyName)}</p>
      </div>
    </div>
  </div>
</div>

<div style="text-align:center;margin-top:36px">
  <button onclick="window.print()" style="padding:10px 28px;background:#1e3a5f;color:#fff;border:none;border-radius:4px;font-size:11pt;cursor:pointer">🖨️ Imprimir / Salvar como PDF</button>
</div>
${pdfRenderScript}
</body>
</html>`;
}


export { ReferencesTab };
