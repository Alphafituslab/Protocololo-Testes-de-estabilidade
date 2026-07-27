import { useState } from "react";
import {
  useListContainerTypes, useListCapsuleTypes, useListProductTypes,
  useCreateContainerType, useUpdateContainerType, useDeleteContainerType,
  useCreateCapsuleType, useUpdateCapsuleType, useDeleteCapsuleType,
  useCreateProductType, useUpdateProductType, useDeleteProductType,
  getListContainerTypesQueryKey, getListCapsuleTypesQueryKey, getListProductTypesQueryKey,
  useListBibliographicReferences, useCreateBibliographicReference,
  useUpdateBibliographicReference, useDeleteBibliographicReference,
  getListBibliographicReferencesQueryKey,
  type CatalogItem, type ProductTypeItem, type BibliographicReference,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useUnlock } from "@/hooks/use-unlock";
import { UnlockDialog } from "@/components/unlock-dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, Check, X, Package, Pill, FlaskConical, BookOpenCheck, ExternalLink, ChevronDown, ChevronRight, Copy } from "lucide-react";

const TIPO_LABELS: Record<string, string> = {
  geral: "Geral",
  ativo: "Ativo/Ingrediente",
  analitica: "Analítica",
  regulatoria: "Regulatória",
  embalagem: "Embalagem",
  degradacao: "Degradação",
  artigo: "Artigo",
  livro: "Livro",
  site: "Site/URL",
  regulamentacao: "Regulamentação",
  norma: "Norma Técnica",
  outro: "Outro",
};

const TIPO_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  geral:          { bg: "bg-emerald-100",  text: "text-emerald-800", dot: "🟢" },
  ativo:          { bg: "bg-blue-100",     text: "text-blue-800",    dot: "🔵" },
  analitica:      { bg: "bg-purple-100",   text: "text-purple-800",  dot: "🟣" },
  regulatoria:    { bg: "bg-orange-100",   text: "text-orange-800",  dot: "🟠" },
  embalagem:      { bg: "bg-yellow-100",   text: "text-yellow-800",  dot: "🟡" },
  degradacao:     { bg: "bg-red-100",      text: "text-red-800",     dot: "🔴" },
  artigo:         { bg: "bg-sky-100",      text: "text-sky-800",     dot: "🔷" },
  livro:          { bg: "bg-teal-100",     text: "text-teal-800",    dot: "📘" },
  site:           { bg: "bg-slate-100",    text: "text-slate-700",   dot: "🌐" },
  regulamentacao: { bg: "bg-amber-100",    text: "text-amber-800",   dot: "📋" },
  norma:          { bg: "bg-cyan-100",     text: "text-cyan-800",    dot: "📐" },
  outro:          { bg: "bg-gray-100",     text: "text-gray-700",    dot: "•" },
};

// dot color for group header (Tailwind bg class)
const TIPO_DOT_TW: Record<string, string> = {
  geral:          "bg-emerald-500",
  ativo:          "bg-blue-500",
  analitica:      "bg-purple-500",
  regulatoria:    "bg-orange-500",
  embalagem:      "bg-yellow-400",
  degradacao:     "bg-red-500",
  artigo:         "bg-sky-500",
  livro:          "bg-teal-500",
  site:           "bg-slate-400",
  regulamentacao: "bg-amber-500",
  norma:          "bg-cyan-500",
  outro:          "bg-gray-400",
};

const TIPO_ORDER = [
  "geral","ativo","analitica","regulatoria","embalagem","degradacao",
  "artigo","livro","site","regulamentacao","norma","outro",
];

const REF_COLOR_SWATCHES = [
  { value: "",         label: "Padrão",  tw: "bg-gray-300",    ring: "ring-gray-400" },
  { value: "vermelho", label: "Vermelho",tw: "bg-red-500",     ring: "ring-red-400" },
  { value: "laranja",  label: "Laranja", tw: "bg-orange-500",  ring: "ring-orange-400" },
  { value: "amarelo",  label: "Amarelo", tw: "bg-yellow-400",  ring: "ring-yellow-400" },
  { value: "verde",    label: "Verde",   tw: "bg-green-500",   ring: "ring-green-400" },
  { value: "ciano",    label: "Ciano",   tw: "bg-teal-500",    ring: "ring-teal-400" },
  { value: "azul",     label: "Azul",    tw: "bg-blue-500",    ring: "ring-blue-400" },
  { value: "violeta",  label: "Violeta", tw: "bg-violet-500",  ring: "ring-violet-400" },
  { value: "rosa",     label: "Rosa",    tw: "bg-pink-500",    ring: "ring-pink-400" },
  { value: "cinza",    label: "Cinza",   tw: "bg-slate-500",   ring: "ring-slate-400" },
];

const COLOR_BLOCK: Record<string, { border: string; bg: string; dot: string; label: string }> = {
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

function formatAbntPlain(r: BibliographicReference): string {
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

const EMPTY_FORM = { titulo: "", autores: "", ano: "", fonte: "", volume: "", numero: "", paginas: "", doi: "", descricao: "", tipoReferencia: "geral", ativoRelacionado: "", autoInclude: false, color: "" };

function BibliographicReferenceForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: BibliographicReference;
  onSave: (data: typeof EMPTY_FORM) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState(initial ? {
    titulo: initial.titulo,
    autores: initial.autores ?? "",
    ano: initial.ano != null ? String(initial.ano) : "",
    fonte: initial.fonte ?? "",
    volume: initial.volume ?? "",
    numero: initial.numero ?? "",
    paginas: initial.paginas ?? "",
    doi: initial.doi ?? "",
    descricao: initial.descricao ?? "",
    tipoReferencia: initial.tipoReferencia ?? "geral",
    ativoRelacionado: initial.ativoRelacionado ?? "",
    autoInclude: initial.autoInclude ?? false,
    color: initial.color ?? "",
  } : { ...EMPTY_FORM });

  const f = (k: keyof typeof EMPTY_FORM) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm(p => ({ ...p, [k]: e.target.value }));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="text-xs font-medium text-muted-foreground mb-1 block">
            Tipo(s) * <span className="font-normal text-muted-foreground">(selecione um ou mais)</span>
          </label>
          <div className="flex flex-wrap gap-1.5">
            {TIPO_ORDER.map(v => {
              const c = TIPO_COLORS[v];
              const activeTipos = (form.tipoReferencia ?? "geral").split(",").filter(Boolean);
              const active = activeTipos.includes(v);
              return (
                <button
                  key={v}
                  type="button"
                  onClick={() => {
                    const current = (form.tipoReferencia ?? "geral").split(",").filter(Boolean);
                    const next = active ? current.filter(t => t !== v) : [...current, v];
                    if (next.length === 0) return;
                    setForm(p => ({
                      ...p,
                      tipoReferencia: next.join(","),
                      ativoRelacionado: next.includes("ativo") ? p.ativoRelacionado : "",
                    }));
                  }}
                  className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border transition-all select-none ${
                    active
                      ? `${c.bg} ${c.text} border-current font-semibold shadow-sm`
                      : "bg-background border-border text-muted-foreground hover:border-primary/40 hover:bg-muted/50"
                  }`}
                >
                  <span>{c.dot}</span>
                  <span>{TIPO_LABELS[v]}</span>
                  {active && <span className="font-bold ml-0.5">✓</span>}
                </button>
              );
            })}
          </div>
        </div>
        <div className="col-span-2">
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Título *</label>
          <Input placeholder="Título da referência" value={form.titulo} onChange={f("titulo")} className="h-8 text-sm" autoFocus />
        </div>
        <div className="col-span-2">
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Autores (ABNT: SOBRENOME, Nome; SOBRENOME2, Nome2)</label>
          <Input placeholder="Ex: SILVA, João; COSTA, Maria" value={form.autores} onChange={f("autores")} className="h-8 text-sm" />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Fonte / Periódico / Editora</label>
          <Input placeholder="Ex: Journal of Nutrition" value={form.fonte} onChange={f("fonte")} className="h-8 text-sm" />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Ano</label>
          <Input placeholder="Ex: 2023" value={form.ano} onChange={f("ano")} className="h-8 text-sm" type="number" />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Volume</label>
          <Input placeholder="Ex: 12" value={form.volume} onChange={f("volume")} className="h-8 text-sm" />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Número / Fascículo</label>
          <Input placeholder="Ex: 3" value={form.numero} onChange={f("numero")} className="h-8 text-sm" />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Páginas</label>
          <Input placeholder="Ex: 45-52" value={form.paginas} onChange={f("paginas")} className="h-8 text-sm" />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">DOI / URL</label>
          <Input placeholder="Ex: https://doi.org/..." value={form.doi} onChange={f("doi")} className="h-8 text-sm" />
        </div>
        {(form.tipoReferencia ?? "geral").split(",").includes("ativo") && (
          <div className="col-span-2">
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Ativo relacionado</label>
            <Input placeholder="Ex: Cálcio, Vitamina D, Taurina..." value={form.ativoRelacionado} onChange={f("ativoRelacionado")} className="h-8 text-sm" />
          </div>
        )}
        <div className="col-span-2">
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Descrição (sobre o que trata)</label>
          <Textarea placeholder="Breve descrição do conteúdo desta referência..." value={form.descricao} onChange={f("descricao")} className="text-sm min-h-[60px] resize-none" />
        </div>
        <div className="col-span-2">
          <label className="text-xs font-medium text-muted-foreground mb-2 block">Cor do bloco</label>
          <div className="flex flex-wrap gap-2">
            {REF_COLOR_SWATCHES.map(s => (
              <button
                key={s.value}
                type="button"
                title={s.label}
                onClick={() => setForm(p => ({ ...p, color: s.value }))}
                className={`w-6 h-6 rounded-full border-2 transition-all ${s.tw} ${form.color === s.value ? `ring-2 ring-offset-1 ${s.ring} border-white` : "border-white hover:scale-110"}`}
              />
            ))}
            <span className="text-xs text-muted-foreground self-center ml-1">
              {form.color ? REF_COLOR_SWATCHES.find(s => s.value === form.color)?.label : "Padrão"}
            </span>
          </div>
        </div>
        <div className="col-span-2">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              className="h-4 w-4 accent-primary"
              checked={form.autoInclude}
              onChange={e => setForm(p => ({ ...p, autoInclude: e.target.checked }))}
            />
            <span className="text-xs font-medium text-foreground">Auto-incluir em protocolos novos</span>
            <span className="text-xs text-muted-foreground">(ex: referências ANVISA obrigatórias)</span>
          </label>
        </div>
      </div>
      {form.titulo && (
        <div className="rounded-md bg-slate-50 border border-slate-200 p-3">
          <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Prévia ABNT</p>
          <p className="text-xs text-slate-700 leading-relaxed">{formatAbntPlain({ id: 0, ...form, ano: form.ano ? Number(form.ano) : null, autores: form.autores || null, fonte: form.fonte || null, volume: form.volume || null, numero: form.numero || null, paginas: form.paginas || null, doi: form.doi || null, descricao: form.descricao || null, ativoRelacionado: form.ativoRelacionado || null, createdAt: "", updatedAt: "" })}</p>
        </div>
      )}
      <div className="flex justify-end gap-2 pt-2">
        <Button size="sm" variant="ghost" onClick={onCancel}><X className="h-3.5 w-3.5 mr-1" /> Cancelar</Button>
        <Button size="sm" onClick={() => onSave(form)} disabled={!form.titulo.trim()}><Check className="h-3.5 w-3.5 mr-1" /> Salvar</Button>
      </div>
    </div>
  );
}

function BibliographicReferencesTable({
  items,
  onCreate,
  onEdit,
  onDelete,
}: {
  items: BibliographicReference[];
  onCreate: (data: typeof EMPTY_FORM) => void;
  onEdit: (id: number, data: typeof EMPTY_FORM) => void;
  onDelete: (id: number, titulo: string) => void;
}) {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editItem, setEditItem] = useState<BibliographicReference | null>(null);
  const [dupError, setDupError] = useState<string | null>(null);
  // all tipo groups expanded by default
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    () => new Set(TIPO_ORDER)
  );
  const [expandedRefs, setExpandedRefs] = useState<Set<number>>(new Set());

  function openCreate() { setEditItem(null); setDupError(null); setDialogOpen(true); }
  function openEdit(item: BibliographicReference) { setEditItem(item); setDupError(null); setDialogOpen(true); }
  function closeDialog() { setDialogOpen(false); setEditItem(null); setDupError(null); }

  function toggleGroup(tipo: string) {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(tipo)) next.delete(tipo); else next.add(tipo);
      return next;
    });
  }
  function toggleRef(id: number) {
    setExpandedRefs(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function handleSave(data: typeof EMPTY_FORM) {
    const titulo = data.titulo.trim().toLowerCase();
    const doi = data.doi.trim().toLowerCase();
    const dup = items.find(r => {
      if (editItem && r.id === editItem.id) return false;
      return r.titulo.trim().toLowerCase() === titulo || (doi && r.doi && r.doi.trim().toLowerCase() === doi);
    });
    if (dup) {
      const motivo = doi && dup.doi && dup.doi.trim().toLowerCase() === doi ? "DOI/URL" : "título";
      setDupError(`Já existe uma referência com o mesmo ${motivo}: "${dup.titulo}"`);
      return;
    }
    setDupError(null);
    if (editItem) onEdit(editItem.id, data); else onCreate(data);
    closeDialog();
  }

  function copyAbnt(item: BibliographicReference) {
    navigator.clipboard.writeText(formatAbntPlain(item)).then(() => {
      toast({ description: "Citação ABNT copiada para a área de transferência." });
    });
  }

  // Group items by first tipoReferencia (suporta comma-separated multi-tipo)
  const byTipo: Record<string, BibliographicReference[]> = {};
  for (const item of items) {
    const firstTipo = (item.tipoReferencia ?? "outro").split(",").filter(Boolean)[0] ?? "outro";
    if (!byTipo[firstTipo]) byTipo[firstTipo] = [];
    byTipo[firstTipo].push(item);
  }
  const presentedTypes = TIPO_ORDER.filter(t => (byTipo[t]?.length ?? 0) > 0);
  // also handle unknown types (e.g. comma-separated values not matching TIPO_ORDER)
  const unknownTypes = Object.keys(byTipo).filter(t => !TIPO_ORDER.includes(t));

  function renderGroup(tipo: string) {
    const refs = byTipo[tipo] ?? [];
    if (!refs.length) return null;
    const isOpen = expandedGroups.has(tipo);
    const dotTw = TIPO_DOT_TW[tipo] ?? "bg-gray-400";
    const label = (TIPO_LABELS[tipo] ?? tipo).toUpperCase();
    const labelFull = `REFERÊNCIA ${label === "GERAL" ? "GERAL" : label === "ATIVO/INGREDIENTE" ? "DO ATIVO" : label}`;
    const assuntosCount = tipo === "ativo"
      ? new Set(refs.map(r => r.ativoRelacionado?.trim() || r.titulo)).size
      : refs.length;

    return (
      <div key={tipo} className="rounded-xl border border-border overflow-hidden">
        {/* Group header */}
        <button
          type="button"
          onClick={() => toggleGroup(tipo)}
          className="w-full flex items-center gap-2.5 px-4 py-3 bg-muted/40 hover:bg-muted/70 transition-colors text-left"
        >
          {isOpen
            ? <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            : <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />}
          <span className={`inline-block w-2.5 h-2.5 rounded-full flex-shrink-0 ${dotTw}`} />
          <span className="text-xs font-bold tracking-wide text-foreground">{labelFull}</span>
          <span className="text-xs text-muted-foreground font-normal">{refs.length} {refs.length === 1 ? "referência" : "referências"}</span>
          <span className="ml-auto text-xs text-muted-foreground">{assuntosCount} {assuntosCount === 1 ? "assunto" : "assuntos"}</span>
        </button>

        {/* Refs list */}
        {isOpen && (
          <div className="divide-y divide-border">
            {refs.map(item => {
              const isRefOpen = expandedRefs.has(item.id);
              const colorBlock = item.color ? COLOR_BLOCK[item.color] : null;
              return (
                <div key={item.id} className={colorBlock ? `border-l-4 ${colorBlock.border}` : ""}>
                  {/* Ref collapsed row */}
                  <button
                    type="button"
                    onClick={() => toggleRef(item.id)}
                    className="w-full flex items-center gap-2 px-4 py-2.5 hover:bg-muted/30 transition-colors text-left"
                  >
                    {isRefOpen
                      ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                      : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />}
                    <span className="text-sm font-medium text-foreground leading-snug flex-1 min-w-0 truncate">
                      {item.titulo}
                    </span>
                    {item.autoInclude && (
                      <span className="text-xs px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 font-semibold flex-shrink-0">★</span>
                    )}
                    {colorBlock && (
                      <span className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${colorBlock.dot}`} title={colorBlock.label} />
                    )}
                    {item.ano && (
                      <span className="text-xs text-muted-foreground flex-shrink-0">{item.ano}</span>
                    )}
                  </button>

                  {/* Ref expanded content */}
                  {isRefOpen && (
                    <div className="px-10 pb-4 pt-1 bg-background space-y-2">
                      {/* Badges — suporta múltiplos tipos (comma-separated) */}
                      <div className="flex items-center gap-2 flex-wrap">
                        {item.tipoReferencia.split(",").filter(Boolean).map((tipo, ti) => {
                          const c = TIPO_COLORS[tipo];
                          return c ? (
                            <span key={ti} className={`text-xs px-2 py-0.5 rounded font-medium ${c.bg} ${c.text}`}>
                              {c.dot} {TIPO_LABELS[tipo] ?? tipo}
                              {tipo === "ativo" && item.ativoRelacionado ? ` — ${item.ativoRelacionado}` : ""}
                            </span>
                          ) : null;
                        })}
                        {item.autoInclude && (
                          <span className="text-xs px-1.5 py-0.5 rounded bg-green-100 text-green-700 font-semibold">★ auto-incluída</span>
                        )}
                        {colorBlock && (
                          <span className={`inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded ${colorBlock.bg}`}>
                            <span className={`inline-block w-2 h-2 rounded-full ${colorBlock.dot}`} />
                            {colorBlock.label}
                          </span>
                        )}
                      </div>
                      {/* ABNT citation */}
                      <p className="text-xs text-slate-600 leading-relaxed border-l-2 border-muted pl-3 italic">
                        {formatAbntPlain(item)}
                      </p>
                      {item.descricao && (
                        <p className="text-xs text-muted-foreground border-l-2 border-muted-foreground/30 pl-3">{item.descricao}</p>
                      )}
                      {item.doi && (
                        <a href={item.doi} target="_blank" rel="noopener noreferrer"
                          className="text-xs text-primary underline inline-flex items-center gap-0.5">
                          <ExternalLink className="h-2.5 w-2.5" />
                          {item.doi.length > 60 ? item.doi.slice(0, 60) + "…" : item.doi}
                        </a>
                      )}
                      {/* Action buttons */}
                      <div className="flex items-center gap-1 pt-1">
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                          onClick={() => copyAbnt(item)} title="Copiar citação ABNT">
                          <Copy className="h-3 w-3" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                          onClick={() => openEdit(item)} title="Editar">
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button size="sm" variant="ghost"
                          className="h-7 w-7 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => onDelete(item.id, item.titulo)} title="Excluir">
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BookOpenCheck className="h-4 w-4 text-primary" />
              <CardTitle className="text-base">Referências Bibliográficas</CardTitle>
              <span className="text-xs text-muted-foreground">(ABNT NBR 6023)</span>
              {items.length > 0 && (
                <span className="text-xs text-muted-foreground">· {items.length} cadastradas</span>
              )}
            </div>
            <Button size="sm" variant="outline" onClick={openCreate}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Banco de referências cadastradas. Selecione as desejadas em cada protocolo.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {items.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">
              Nenhuma referência cadastrada. Clique em "Adicionar" para começar.
            </p>
          )}
          {presentedTypes.map(tipo => renderGroup(tipo))}
          {unknownTypes.map(tipo => renderGroup(tipo))}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={open => { if (!open) closeDialog(); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editItem ? "Editar Referência" : "Nova Referência Bibliográfica"}</DialogTitle>
          </DialogHeader>
          {dupError && (
            <div className="rounded-md bg-destructive/10 border border-destructive/30 px-3 py-2 text-sm text-destructive flex items-start gap-2">
              <span className="mt-0.5 flex-shrink-0">⚠️</span>
              <span>{dupError}</span>
            </div>
          )}
          <BibliographicReferenceForm
            initial={editItem ?? undefined}
            onSave={handleSave}
            onCancel={closeDialog}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

type CatalogSection = "container" | "capsule" | "product" | "reference";

function CatalogTable({
  title,
  icon: Icon,
  items,
  onAdd,
  onEdit,
  onDelete,
}: {
  title: string;
  icon: React.ElementType;
  items: CatalogItem[];
  onAdd: (name: string, description: string) => void;
  onEdit: (id: number, name: string, description: string) => void;
  onDelete: (id: number, name: string) => void;
}) {
  const [addName, setAddName] = useState("");
  const [addDesc, setAddDesc] = useState("");
  const [adding, setAdding] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");

  function startEdit(item: CatalogItem) {
    setEditId(item.id);
    setEditName(item.name);
    setEditDesc(item.description ?? "");
  }

  function cancelEdit() {
    setEditId(null);
    setEditName("");
    setEditDesc("");
  }

  function submitEdit() {
    if (!editName.trim() || editId === null) return;
    onEdit(editId, editName.trim(), editDesc.trim());
    cancelEdit();
  }

  function submitAdd() {
    if (!addName.trim()) return;
    onAdd(addName.trim(), addDesc.trim());
    setAddName("");
    setAddDesc("");
    setAdding(false);
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icon className="h-4 w-4 text-primary" />
            <CardTitle className="text-base">{title}</CardTitle>
          </div>
          <Button size="sm" variant="outline" onClick={() => setAdding(true)} disabled={adding}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-1">
        {adding && (
          <div className="flex items-center gap-2 p-2 rounded-lg border border-primary/30 bg-primary/5 mb-2">
            <div className="flex-1 grid grid-cols-2 gap-2">
              <Input
                autoFocus
                placeholder="Nome *"
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") submitAdd(); if (e.key === "Escape") { setAdding(false); setAddName(""); setAddDesc(""); } }}
                className="h-8 text-sm"
              />
              <Input
                placeholder="Descrição (opcional)"
                value={addDesc}
                onChange={(e) => setAddDesc(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") submitAdd(); if (e.key === "Escape") { setAdding(false); setAddName(""); setAddDesc(""); } }}
                className="h-8 text-sm"
              />
            </div>
            <Button size="sm" className="h-8 px-3" onClick={submitAdd} disabled={!addName.trim()}>
              <Check className="h-3.5 w-3.5" />
            </Button>
            <Button size="sm" variant="ghost" className="h-8 px-2" onClick={() => { setAdding(false); setAddName(""); setAddDesc(""); }}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}

        {items.length === 0 && !adding && (
          <p className="text-sm text-muted-foreground text-center py-6">
            Nenhum item cadastrado. Clique em "Adicionar" para começar.
          </p>
        )}

        {items.map((item) => (
          <div key={item.id} className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-muted/40 group">
            {editId === item.id ? (
              <>
                <div className="flex-1 grid grid-cols-2 gap-2">
                  <Input
                    autoFocus
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") submitEdit(); if (e.key === "Escape") cancelEdit(); }}
                    className="h-7 text-sm"
                  />
                  <Input
                    value={editDesc}
                    onChange={(e) => setEditDesc(e.target.value)}
                    placeholder="Descrição (opcional)"
                    onKeyDown={(e) => { if (e.key === "Enter") submitEdit(); if (e.key === "Escape") cancelEdit(); }}
                    className="h-7 text-sm"
                  />
                </div>
                <Button size="sm" className="h-7 px-2" onClick={submitEdit} disabled={!editName.trim()}>
                  <Check className="h-3 w-3" />
                </Button>
                <Button size="sm" variant="ghost" className="h-7 px-2" onClick={cancelEdit}>
                  <X className="h-3 w-3" />
                </Button>
              </>
            ) : (
              <>
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium">{item.name}</span>
                  {item.description && (
                    <span className="text-xs text-muted-foreground ml-2">{item.description}</span>
                  )}
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => startEdit(item)}>
                    <Pencil className="h-3 w-3" />
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => onDelete(item.id, item.name)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function ProductTypeTable({
  items,
  onAdd,
  onEdit,
  onDelete,
}: {
  items: ProductTypeItem[];
  onAdd: (name: string, description: string, isPowder: boolean) => void;
  onEdit: (id: number, name: string, description: string, isPowder: boolean) => void;
  onDelete: (id: number, name: string) => void;
}) {
  const [addName, setAddName] = useState("");
  const [addDesc, setAddDesc] = useState("");
  const [addIsPowder, setAddIsPowder] = useState(false);
  const [adding, setAdding] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editIsPowder, setEditIsPowder] = useState(false);

  function startEdit(item: ProductTypeItem) {
    setEditId(item.id);
    setEditName(item.name);
    setEditDesc(item.description ?? "");
    setEditIsPowder(item.isPowder);
  }

  function cancelEdit() {
    setEditId(null);
    setEditName("");
    setEditDesc("");
    setEditIsPowder(false);
  }

  function submitEdit() {
    if (!editName.trim() || editId === null) return;
    onEdit(editId, editName.trim(), editDesc.trim(), editIsPowder);
    cancelEdit();
  }

  function submitAdd() {
    if (!addName.trim()) return;
    onAdd(addName.trim(), addDesc.trim(), addIsPowder);
    setAddName("");
    setAddDesc("");
    setAddIsPowder(false);
    setAdding(false);
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FlaskConical className="h-4 w-4 text-primary" />
            <CardTitle className="text-base">Tipos de Produto</CardTitle>
          </div>
          <Button size="sm" variant="outline" onClick={() => setAdding(true)} disabled={adding}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-1">
        {adding && (
          <div className="flex items-center gap-2 p-2 rounded-lg border border-primary/30 bg-primary/5 mb-2">
            <div className="flex-1 grid grid-cols-2 gap-2">
              <Input
                autoFocus
                placeholder="Nome *"
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") submitAdd(); if (e.key === "Escape") { setAdding(false); setAddName(""); setAddDesc(""); setAddIsPowder(false); } }}
                className="h-8 text-sm"
              />
              <Input
                placeholder="Descrição (opcional)"
                value={addDesc}
                onChange={(e) => setAddDesc(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") submitAdd(); if (e.key === "Escape") { setAdding(false); setAddName(""); setAddDesc(""); setAddIsPowder(false); } }}
                className="h-8 text-sm"
              />
            </div>
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground whitespace-nowrap cursor-pointer select-none">
              <input
                type="checkbox"
                checked={addIsPowder}
                onChange={(e) => setAddIsPowder(e.target.checked)}
                className="h-3.5 w-3.5 rounded"
              />
              Em pó
            </label>
            <Button size="sm" className="h-8 px-3" onClick={submitAdd} disabled={!addName.trim()}>
              <Check className="h-3.5 w-3.5" />
            </Button>
            <Button size="sm" variant="ghost" className="h-8 px-2" onClick={() => { setAdding(false); setAddName(""); setAddDesc(""); setAddIsPowder(false); }}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}

        {items.length === 0 && !adding && (
          <p className="text-sm text-muted-foreground text-center py-6">
            Nenhum item cadastrado. Clique em "Adicionar" para começar.
          </p>
        )}

        {items.map((item) => (
          <div key={item.id} className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-muted/40 group">
            {editId === item.id ? (
              <>
                <div className="flex-1 grid grid-cols-2 gap-2">
                  <Input
                    autoFocus
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") submitEdit(); if (e.key === "Escape") cancelEdit(); }}
                    className="h-7 text-sm"
                  />
                  <Input
                    value={editDesc}
                    onChange={(e) => setEditDesc(e.target.value)}
                    placeholder="Descrição (opcional)"
                    onKeyDown={(e) => { if (e.key === "Enter") submitEdit(); if (e.key === "Escape") cancelEdit(); }}
                    className="h-7 text-sm"
                  />
                </div>
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground whitespace-nowrap cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={editIsPowder}
                    onChange={(e) => setEditIsPowder(e.target.checked)}
                    className="h-3.5 w-3.5 rounded"
                  />
                  Em pó
                </label>
                <Button size="sm" className="h-7 px-2" onClick={submitEdit} disabled={!editName.trim()}>
                  <Check className="h-3 w-3" />
                </Button>
                <Button size="sm" variant="ghost" className="h-7 px-2" onClick={cancelEdit}>
                  <X className="h-3 w-3" />
                </Button>
              </>
            ) : (
              <>
                <div className="flex-1 min-w-0 flex items-center gap-2">
                  <span className="text-sm font-medium">{item.name}</span>
                  {item.isPowder && (
                    <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-medium">Em pó</span>
                  )}
                  {item.description && (
                    <span className="text-xs text-muted-foreground">{item.description}</span>
                  )}
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => startEdit(item)}>
                    <Pencil className="h-3 w-3" />
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => onDelete(item.id, item.name)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export default function CatalogPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { unlock } = useUnlock();
  const [unlockOpen, setUnlockOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<{ section: CatalogSection; id: number; name: string } | null>(null);

  const { data: containerTypes = [] } = useListContainerTypes();
  const { data: capsuleTypes = [] } = useListCapsuleTypes();
  const { data: productTypes = [] } = useListProductTypes();
  const { data: references = [] } = useListBibliographicReferences();

  const createContainer = useCreateContainerType({ mutation: { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListContainerTypesQueryKey() }); toast({ title: "Tipo de pote adicionado" }); }, onError: () => toast({ title: "Erro ao adicionar", variant: "destructive" }) } });
  const updateContainer = useUpdateContainerType({ mutation: { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListContainerTypesQueryKey() }); toast({ title: "Tipo de pote atualizado" }); }, onError: () => toast({ title: "Erro ao atualizar", variant: "destructive" }) } });
  const deleteContainer = useDeleteContainerType({ mutation: { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListContainerTypesQueryKey() }); toast({ title: "Tipo de pote excluído" }); setPendingDelete(null); }, onError: () => toast({ title: "Erro ao excluir", variant: "destructive" }) } });

  const createCapsule = useCreateCapsuleType({ mutation: { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListCapsuleTypesQueryKey() }); toast({ title: "Tipo de cápsula adicionado" }); }, onError: () => toast({ title: "Erro ao adicionar", variant: "destructive" }) } });
  const updateCapsule = useUpdateCapsuleType({ mutation: { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListCapsuleTypesQueryKey() }); toast({ title: "Tipo de cápsula atualizado" }); }, onError: () => toast({ title: "Erro ao atualizar", variant: "destructive" }) } });
  const deleteCapsule = useDeleteCapsuleType({ mutation: { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListCapsuleTypesQueryKey() }); toast({ title: "Tipo de cápsula excluído" }); setPendingDelete(null); }, onError: () => toast({ title: "Erro ao excluir", variant: "destructive" }) } });

  const createProduct = useCreateProductType({ mutation: { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListProductTypesQueryKey() }); toast({ title: "Tipo de produto adicionado" }); }, onError: () => toast({ title: "Erro ao adicionar", variant: "destructive" }) } });
  const updateProduct = useUpdateProductType({ mutation: { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListProductTypesQueryKey() }); toast({ title: "Tipo de produto atualizado" }); }, onError: () => toast({ title: "Erro ao atualizar", variant: "destructive" }) } });
  const deleteProduct = useDeleteProductType({ mutation: { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListProductTypesQueryKey() }); toast({ title: "Tipo de produto excluído" }); setPendingDelete(null); }, onError: () => toast({ title: "Erro ao excluir", variant: "destructive" }) } });

  const createReference = useCreateBibliographicReference({ mutation: { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListBibliographicReferencesQueryKey() }); toast({ title: "Referência adicionada" }); }, onError: (err) => { const msg = (err as { data?: { error?: string } })?.data?.error; toast({ title: "Erro ao adicionar referência", description: msg ?? "Tente novamente.", variant: "destructive" }); } } });
  const updateReference = useUpdateBibliographicReference({ mutation: { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListBibliographicReferencesQueryKey() }); toast({ title: "Referência atualizada" }); }, onError: (err) => { const msg = (err as { data?: { error?: string } })?.data?.error; toast({ title: "Erro ao atualizar referência", description: msg ?? "Tente novamente.", variant: "destructive" }); } } });
  const deleteReference = useDeleteBibliographicReference({ mutation: { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListBibliographicReferencesQueryKey() }); toast({ title: "Referência excluída" }); setPendingDelete(null); }, onError: () => toast({ title: "Erro ao excluir", variant: "destructive" }) } });

  function handleDelete(section: CatalogSection, id: number, name: string) {
    setPendingDelete({ section, id, name });
    setUnlockOpen(true);
  }

  function toRefInput(data: typeof EMPTY_FORM) {
    return {
      titulo: data.titulo,
      autores: data.autores || undefined,
      ano: data.ano ? Number(data.ano) : undefined,
      fonte: data.fonte || undefined,
      volume: data.volume || undefined,
      numero: data.numero || undefined,
      paginas: data.paginas || undefined,
      doi: data.doi || undefined,
      descricao: data.descricao || undefined,
      tipoReferencia: data.tipoReferencia,
      ativoRelacionado: data.ativoRelacionado || undefined,
      autoInclude: data.autoInclude,
      color: data.color || undefined,
    };
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Cadastros</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Gerencie tipos de produto, pote, cápsula e referências bibliográficas utilizados nos protocolos.
        </p>
      </div>

      <BibliographicReferencesTable
        items={references}
        onCreate={(data) => createReference.mutate({ data: toRefInput(data) })}
        onEdit={(id, data) => updateReference.mutate({ id, data: toRefInput(data) })}
        onDelete={(id, titulo) => handleDelete("reference", id, titulo)}
      />

      <ProductTypeTable
        items={productTypes}
        onAdd={(name, description, isPowder) => createProduct.mutate({ data: { name, description, isPowder } })}
        onEdit={(id, name, description, isPowder) => updateProduct.mutate({ id, data: { name, description, isPowder } })}
        onDelete={(id, name) => handleDelete("product", id, name)}
      />

      <CatalogTable
        title="Tipos de Pote / Embalagem"
        icon={Package}
        items={containerTypes}
        onAdd={(name, description) => createContainer.mutate({ data: { name, description } })}
        onEdit={(id, name, description) => updateContainer.mutate({ id, data: { name, description } })}
        onDelete={(id, name) => handleDelete("container", id, name)}
      />

      <CatalogTable
        title="Tipos de Cápsula"
        icon={Pill}
        items={capsuleTypes}
        onAdd={(name, description) => createCapsule.mutate({ data: { name, description } })}
        onEdit={(id, name, description) => updateCapsule.mutate({ id, data: { name, description } })}
        onDelete={(id, name) => handleDelete("capsule", id, name)}
      />

      <UnlockDialog
        open={unlockOpen}
        onOpenChange={(open) => { setUnlockOpen(open); if (!open) setPendingDelete(null); }}
        onUnlock={unlock}
        onSuccess={() => {
          if (!pendingDelete) return;
          if (pendingDelete.section === "reference") deleteReference.mutate({ id: pendingDelete.id });
          else if (pendingDelete.section === "container") deleteContainer.mutate({ id: pendingDelete.id });
          else if (pendingDelete.section === "capsule") deleteCapsule.mutate({ id: pendingDelete.id });
          else deleteProduct.mutate({ id: pendingDelete.id });
        }}
        title="Confirmar exclusão"
        description={pendingDelete ? `Digite a senha mestra para excluir "${pendingDelete.name}".` : ""}
        submitLabel="Excluir"
      />
    </div>
  );
}
