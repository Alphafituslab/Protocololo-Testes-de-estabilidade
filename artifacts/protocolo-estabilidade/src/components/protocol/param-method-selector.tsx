import { useState, useRef, useEffect, useCallback, useMemo, Fragment } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { BookOpen, Search, X, Pencil } from "lucide-react";
import { ANALYSIS_PARAMETERS, CATEGORY_PRESETS, normalizeSearch } from "./shared";
import type { CatalogEntry } from "./shared";

function ParamMethodSelector({
  paramName,
  selected,
  methodologies,
  catalogEntries = [],
  onSelect,
  compact = false,
  hideRemove = false,
}: {
  paramName: string;
  selected: string | null;
  methodologies: { id: number; shortName: string; citation: string; category?: string | null; subject?: string | null }[];
  catalogEntries?: { shortName: string; citation: string }[];
  onSelect: (shortName: string | null, citation: string | null) => void;
  /** Quando true, renderiza apenas um ícone de edição (para uso ao lado de texto visível). */
  compact?: boolean;
  /** Quando true, esconde o botão "× Remover seleção" dentro do popover. */
  hideRemove?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const hasCatalog = catalogEntries.length > 0;

  const norm = normalizeSearch(search);
  const paramNorm = normalizeSearch(paramName);
  const filteredCatalog = catalogEntries.filter(
    m => normalizeSearch(m.shortName).includes(norm) || normalizeSearch(m.citation).includes(norm)
  );
  const filteredMethodologies = methodologies.filter(
    m => normalizeSearch(m.shortName).includes(norm) || normalizeSearch(m.citation).includes(norm) || normalizeSearch(m.subject ?? "").includes(norm)
  );
  // Suggested: methodologies whose subject matches the param name exactly, shown first when no search and no catalog
  const suggestedIds = new Set<number>();
  const suggestedMethodologies = (!search && paramNorm.length > 0 && !hasCatalog)
    ? filteredMethodologies.filter(m => {
        const matches = normalizeSearch(m.subject ?? "") === paramNorm;
        if (matches) suggestedIds.add(m.id);
        return matches;
      })
    : [];
  const otherMethodologies = suggestedMethodologies.length > 0
    ? filteredMethodologies.filter(m => !suggestedIds.has(m.id))
    : filteredMethodologies;

  return (
    <Popover open={open} onOpenChange={(v) => { setOpen(v); if (!v) setSearch(""); }}>
      <PopoverTrigger asChild>
        {compact ? (
          <button
            type="button"
            className="flex items-center justify-center h-5 w-5 rounded text-muted-foreground/40 hover:text-primary hover:bg-primary/10 transition-colors flex-shrink-0 mt-0.5"
            title={selected ? "Alterar metodologia" : "Selecionar metodologia"}
            onClick={(e) => e.stopPropagation()}
          >
            <Pencil className="h-3 w-3" />
          </button>
        ) : (
          <button
            type="button"
            className={`flex items-start gap-1 mt-0.5 text-[11px] rounded px-1 py-0.5 transition-colors text-left ${
              selected
                ? "text-primary/90 hover:text-primary font-medium"
                : "text-muted-foreground/50 hover:text-muted-foreground"
            }`}
            title={selected ? `Clique para alterar metodologia` : "Clique para selecionar metodologia"}
            onClick={(e) => e.stopPropagation()}
          >
            <BookOpen className="h-3 w-3 flex-shrink-0 mt-0.5" />
            <span className="whitespace-normal leading-tight">
              {selected ?? (
                <span className="italic text-[10px]">
                  selecionar{hasCatalog && (
                    <span className="ml-1 not-italic bg-primary/15 text-primary rounded px-1 py-0 text-[9px] font-semibold">
                      {catalogEntries.length}
                    </span>
                  )}
                </span>
              )}
            </span>
          </button>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-80 p-2 z-50" side="right" align="start">
        <p className="text-xs font-semibold text-muted-foreground mb-2 px-1">
          Metodologia — <span className="font-normal italic">{paramName || "parâmetro"}</span>
        </p>

        {/* Campo de busca */}
        <div className="relative mb-2">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-primary/50 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nome..."
            className="w-full pl-7 pr-2 py-1.5 text-xs border-2 border-primary/30 rounded-md bg-background focus:outline-none focus:border-primary placeholder:text-muted-foreground/50"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>

        {/* Entradas do catálogo para este parâmetro */}
        {hasCatalog && filteredCatalog.length > 0 && (
          <>
            <p className="text-[9px] uppercase tracking-widest text-primary/60 font-bold px-1 mb-1">
              Cadastradas para este parâmetro
            </p>
            <div className="space-y-0.5 mb-2">
              {filteredCatalog.map((m, i) => (
                <button
                  type="button"
                  key={i}
                  onClick={() => { onSelect(m.shortName, m.citation); setOpen(false); setSearch(""); }}
                  className={`w-full text-left text-xs px-2 py-1.5 rounded border transition-colors hover:bg-primary/10 ${
                    selected === m.shortName
                      ? "border-primary/40 bg-primary/10 text-primary font-semibold"
                      : "border-primary/15 bg-primary/5"
                  }`}
                >
                  <div className="flex items-center gap-1">
                    <BookOpen className="h-2.5 w-2.5 text-primary/50 flex-shrink-0" />
                    <span className="font-medium text-[11px]">{m.shortName}</span>
                  </div>
                  <div className="text-[9px] text-muted-foreground truncate leading-tight pl-3.5">{m.citation}</div>
                </button>
              ))}
            </div>
            {filteredMethodologies.length > 0 && (
              <>
                <div className="border-t my-1.5" />
                <p className="text-[9px] uppercase tracking-widest text-muted-foreground/50 font-bold px-1 mb-1">
                  Biblioteca geral
                </p>
              </>
            )}
          </>
        )}

        {/* Sugerido: metodologias cujo subject bate com o nome do parâmetro */}
        {suggestedMethodologies.length > 0 && (
          <>
            <p className="text-[9px] uppercase tracking-widest text-primary/70 font-bold px-1 mb-1">
              Sugerido — {paramName}
            </p>
            <div className="space-y-0.5 mb-2">
              {suggestedMethodologies.map((m) => (
                <button
                  type="button"
                  key={m.id}
                  onClick={() => { onSelect(m.shortName, m.citation); setOpen(false); setSearch(""); }}
                  className={`w-full text-left text-xs px-2 py-1.5 rounded border transition-colors hover:bg-primary/10 ${
                    selected === m.shortName
                      ? "border-primary/40 bg-primary/10 text-primary font-semibold"
                      : "border-primary/15 bg-primary/5"
                  }`}
                >
                  <div className="flex items-center gap-1">
                    <BookOpen className="h-2.5 w-2.5 text-primary/50 flex-shrink-0" />
                    <span className="font-medium text-[11px]">{m.shortName}</span>
                  </div>
                  <div className="text-[9px] text-muted-foreground truncate leading-tight pl-3.5">{m.citation}</div>
                </button>
              ))}
            </div>
            {otherMethodologies.length > 0 && (
              <>
                <div className="border-t my-1.5" />
                <p className="text-[9px] uppercase tracking-widest text-muted-foreground/50 font-bold px-1 mb-1">
                  Biblioteca geral
                </p>
              </>
            )}
          </>
        )}

        {/* Todas as metodologias cadastradas */}
        {filteredMethodologies.length === 0 && filteredCatalog.length === 0 ? (
          <p className="text-xs text-muted-foreground italic px-1 py-2 text-center">
            {search ? `Nenhuma metodologia encontrada para "${search}"` : "Nenhuma metodologia cadastrada."}
          </p>
        ) : otherMethodologies.length > 0 ? (
          <div className="space-y-0.5 max-h-48 overflow-y-auto">
            {otherMethodologies.map((m) => (
              <button
                type="button"
                key={m.id}
                onClick={() => { onSelect(m.shortName, m.citation); setOpen(false); setSearch(""); }}
                className={`w-full text-left text-xs px-2 py-1.5 rounded hover:bg-muted transition-colors ${
                  selected === m.shortName && !hasCatalog ? "bg-primary/10 text-primary font-semibold" : ""
                }`}
              >
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="font-medium text-[11px]">{m.shortName}</span>
                  {m.subject && <span className="text-[9px] bg-primary/10 text-primary/80 px-1 py-0 rounded font-medium leading-tight">{m.subject}</span>}
                </div>
                <div className="text-[9px] text-muted-foreground truncate leading-tight">{m.citation}</div>
              </button>
            ))}
          </div>
        ) : null}

        {selected && !hideRemove && (
          <div className="border-t mt-1.5 pt-1">
            <button
              type="button"
              onClick={() => { onSelect(null, null); setOpen(false); setSearch(""); }}
              className="w-full text-left text-[10px] px-2 py-1 rounded hover:bg-destructive/10 text-destructive"
            >
              × Remover seleção
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

// ── Catálogo global de metodologias por parâmetro ─────────────────────────
// Suporta múltiplas metodologias por parâmetro; auto-preenche ao reutilizar

export { ParamMethodSelector };
