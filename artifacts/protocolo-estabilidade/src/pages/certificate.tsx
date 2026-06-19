import { useParams, Link } from "wouter";
import { fmtDate, addMonthsToIso } from "@/lib/utils";
import { useGetCertificate, getGetCertificateQueryKey, useListLots, getListLotsQueryKey, useGetKinetics, getGetKineticsQueryKey, useListSignatures, useAddSignature, useDeleteSignature, getListSignaturesQueryKey, useUpdateProtocol, useListProtocolBibliographicReferences, getListProtocolBibliographicReferencesQueryKey, type BibliographicReference } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Printer, Settings2, Image as ImageIcon, ChevronDown, ChevronUp, CheckSquare, Square, History, Lock, Unlock, Save, ShieldCheck, PenLine, Trash2, UserCheck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { Skeleton } from "@/components/ui/skeleton";
import React, { useState, useMemo, useEffect, useContext, useRef } from "react";
import { AuditTrail } from "@/components/audit-trail";
import { useUnlock } from "@/hooks/use-unlock";
import { UnlockDialog } from "@/components/unlock-dialog";
import { AuthContext } from "@/contexts/auth-context";
import { useQueryClient } from "@tanstack/react-query";

type PhotoEntry = {
  parameter: string;
  category: string;
  lotNumber: string;
  period: number;
  images: string[];
  key: string;
};

/** Default technical descriptions for each analysis parameter in the photo appendix. */
const PARAM_DESCRIPTIONS: Record<string, string> = {
  // Físico-Química
  "pH": "Avalia a acidez ou alcalinidade do produto por medição potenciométrica. No estudo de estabilidade, variações no pH indicam reações hidrolíticas ou oxidativas que comprometem a qualidade e eficácia do produto. Os registros fotográficos documentam as leituras realizadas no pHmetro calibrado, as soluções-tampão de referência e as amostras preparadas em cada período de avaliação.",
  "Perda por dessecação": "Determina o teor de umidade residual das cápsulas por gravimetria após secagem a 105 °C até peso constante. Valores elevados favorecem a proliferação microbiana e reações de degradação química. Os registros fotográficos documentam o processo de pesagem inicial, a secagem em estufa e a pesagem final das amostras em cada período.",
  "Cor": "Característica organoléptica avaliada por inspeção visual e/ou colorimetria instrumental. Alterações de coloração podem indicar oxidação lipídica, degradação química ou contaminação cruzada. Os registros fotográficos evidenciam a aparência cromática das amostras sob iluminação padronizada ao longo dos períodos de avaliação, permitindo comparação visual direta.",
  "Odor": "Parâmetro organoléptico avaliado por análise sensorial padronizada, em condições controladas de temperatura e ausência de interferências olfativas externas. Odores atípicos indicam degradação lipídica, fermentação ou contaminação. Os registros fotográficos documentam o procedimento de avaliação e as condições ambientais do ensaio.",
  "Aparência": "Avaliação macroscópica das cápsulas quanto à integridade física, uniformidade de enchimento, ausência de deformações, cápsulas abertas ou manchas. Parâmetro crítico para a aceitabilidade pelo consumidor e rastreabilidade de lote. Os registros fotográficos documentam o estado visual das amostras, dispostas de forma padronizada, em cada período de avaliação.",
  "Cinzas totais": "Determina o resíduo mineral fixo obtido após incineração completa da amostra a 550 °C em mufla. Indica a presença de minerais inorgânicos constitutivos e eventuais contaminantes pesados. Os registros fotográficos documentam o processo de calcinação, a aparência do resíduo obtido e a pesagem em balança analítica.",
  "Dissolução": "Avalia a velocidade e a extensão de liberação do princípio ativo a partir da forma farmacêutica, constituindo parâmetro crítico de qualidade para garantia da biodisponibilidade. Os registros fotográficos documentam o aparato de dissolução utilizado, as condições operacionais (meio, temperatura, agitação), as amostras coletadas nos intervalos definidos e o aspecto visual das cápsulas durante o ensaio.",
  "Massa média": "Determina a uniformidade de massa das cápsulas por pesagem individual em balança analítica. Variações fora dos limites de aceitação indicam falhas no processo de encapsulamento. Os registros fotográficos documentam a balança analítica calibrada, o procedimento de pesagem e a distribuição das massas individuais das unidades amostradas.",
  "Kcal": "Determinação do valor calórico total, calculado a partir dos macronutrientes declarados. Os registros fotográficos documentam o procedimento analítico, os equipamentos utilizados e os resultados obtidos em cada período de avaliação.",
  "Sódio": "Determinação do teor de sódio por espectrometria de absorção atômica em chama ou fotometria de chama, após digestão ácida assistida. Os registros fotográficos documentam o preparo das soluções-padrão, a digestão das amostras, as condições instrumentais e as leituras realizadas em cada período de avaliação.",
  // Microbiológica
  "Coliformes totais": "Determinação da contagem de coliformes totais como indicadores de higiene e condições sanitárias do processo produtivo. A ausência é requisito regulatório para suplementos alimentares. Os registros fotográficos documentam as placas de incubação, a morfologia das colônias típicas, a confirmação bioquímica e o resultado final de ausência ou contagem por grama.",
  "Salmonella spp.": "Pesquisa de Salmonella spp. em 25 g de amostra por método cultural com pré-enriquecimento, enriquecimento seletivo e confirmação bioquímica e sorológica. A ausência é obrigatória pela legislação brasileira. Os registros fotográficos documentam todas as etapas metodológicas, os meios de cultivo utilizados, as colônias características e o resultado confirmatório.",
  "Estafilococos coagulase+": "Contagem de Staphylococcus aureus e demais estafilococos coagulase positivos, indicadores de contaminação por manipulação inadequada. Os registros fotográficos documentam as placas seletivas (Baird-Parker), as colônias típicas negras com halo opaco, o teste de coagulase em tubo e o resultado final da contagem.",
  "Bolores e leveduras": "Contagem de fungos filamentosos e leveduras como indicadores de umidade excessiva, contaminação ambiental ou falha no controle de processo. Os registros fotográficos documentam as placas de ágar dicloran-rosa bengala-cloranfenicol (DRBC) após incubação a 22–25 °C, evidenciando a morfologia colonial e a contagem total de colônias.",
  "Escherichia coli": "Pesquisa e contagem de Escherichia coli como indicador de contaminação de origem fecal, inaceitável em produtos para consumo humano. Os registros fotográficos documentam as placas com meio seletivo, as provas confirmatórias (IMViC) e o resultado final de ausência ou contagem por grama.",
  "Enterobacteriaceae": "Contagem de enterobactérias totais como indicadores de contaminação pós-processo e deficiências de higienização. Os registros fotográficos documentam as placas com ágar Violeta Cristal Bílis Glucose (VRBG), a morfologia das colônias típicas e o resultado das contagens nos períodos avaliados.",
  // Teor do Ativo
  "Cálcio": "Determinação quantitativa do teor de cálcio por complexometria (EDTA) ou espectrometria de absorção atômica após digestão ácida. O limite mínimo regulatório é 80% do valor declarado no rótulo. Os registros fotográficos documentam o processo de digestão ácida assistida, o preparo das soluções-padrão, a titulação ou a leitura instrumental e os resultados numéricos obtidos em cada período de avaliação.",
  "Vitamina D": "Determinação do teor de vitamina D (D2 e/ou D3) por cromatografia líquida de alta eficiência (CLAE) com detecção por UV, após saponificação e extração em fase sólida. O limite mínimo regulatório é 80% do valor declarado. Os registros fotográficos documentam o preparo das amostras, as soluções-padrão de calibração, os cromatogramas representativos e as condições cromatográficas do método validado.",
  // Embalagem
  "Torque de tampa": "Medição da força de torque de abertura e fechamento da tampa por torquímetro calibrado, garantindo a vedação adequada do frasco e a proteção do produto contra umidade, oxidação e adulteração. Os registros fotográficos documentam o torquímetro utilizado, o procedimento de medição padronizado e os valores registrados para cada unidade amostrada em cada período.",
  "Selagem por indução": "Verificação da integridade da membrana termoinduzida por indução eletromagnética, elemento crítico para a proteção do produto contra umidade, oxidação e violação de embalagem. Os registros fotográficos documentam a inspeção visual da membrana, o teste de selagem por pressão, a uniformidade da aderência e o estado da membrana após abertura das unidades amostradas.",
  "Integridade selagem": "Avaliação da hermeticidade do sistema de fechamento (conjunto frasco, tampa e membrana de indução) quanto à ausência de vazamentos, deformações ou comprometimento da barreira protetora. Os registros fotográficos documentam os ensaios de integridade realizados — incluindo imersão em água corada, teste de pressão ou inspeção visual ampliada — e a condição das embalagens em cada período de avaliação.",
};

/** Returns the default description for a parameter, falling back to a generic text. */
function getParamDescription(parameter: string): string {
  return (
    PARAM_DESCRIPTIONS[parameter] ??
    `Ensaio de ${parameter} realizado conforme metodologia validada e referenciada no protocolo de estabilidade. Os registros fotográficos documentam o procedimento analítico, os equipamentos utilizados, o preparo das amostras e os resultados obtidos em cada período de avaliação, permitindo a rastreabilidade completa do ensaio.`
  );
}

const CATEGORY_LABELS: Record<string, string> = {
  fisico_quimica: "Físico-Química",
  microbiologica: "Microbiológica",
  teor_ativo: "Teor do Ativo",
  embalagem: "Embalagem",
};

/** Default reference methods for each analysis parameter.
 *  Applied automatically when no manual override exists. */
const DEFAULT_METHODS: Record<string, string> = {
  // Físico-Química
  "pH": "Métodos físico-químicos para análise de alimentos, 4. ed. São Paulo: Instituto Adolfo Lutz, 2008. Método: 017/IV.",
  "Perda por dessecação": "Métodos físico-químicos para análise de alimentos, 4. ed. São Paulo: Instituto Adolfo Lutz, 2008. Método: 012/IV.",
  "Cor": "Métodos físico-químicos para análise de alimentos, 4. ed. São Paulo: Instituto Adolfo Lutz, 2008. Método: 060/IV.",
  "Odor": "Métodos físico-químicos para análise de alimentos, 4. ed. São Paulo: Instituto Adolfo Lutz, 2008. Método: 060/IV.",
  "Aparência": "Métodos físico-químicos para análise de alimentos, 4. ed. São Paulo: Instituto Adolfo Lutz, 2008. Método: 060/IV.",
  "Cinzas totais": "Métodos físico-químicos para análise de alimentos, 4. ed. São Paulo: Instituto Adolfo Lutz, 2008. Método: 018/IV.",
  "Dissolução": "Farmacopeia Brasileira, 7ª edição (2024).",
  "Massa média": "Farmacopeia Brasileira, 7ª edição (2024).",
  "Kcal": "Métodos físico-químicos para análise de alimentos, 4. ed. São Paulo: Instituto Adolfo Lutz, 2008.",
  "Sódio": "Métodos físico-químicos para análise de alimentos, 4. ed. São Paulo: Instituto Adolfo Lutz, 2008.",
  // Microbiológica
  "Coliformes totais": "CompactDry™ CF: Instructions for Use. Tokyo: Nissui Pharmaceutical Co., Ltd.",
  "Salmonella spp.": "CompactDry™ SL: Instructions for Use. Tokyo: Nissui Pharmaceutical Co., Ltd.",
  "Estafilococos coagulase+": "CompactDry™ X-SA: Instructions for Use. Tokyo: Nissui Pharmaceutical Co., Ltd.",
  "Bolores e leveduras": "CompactDry™ YMR / YM: Instructions for Use. Tokyo: Nissui Pharmaceutical Co., Ltd.",
  "Escherichia coli": "CompactDry™ EC: Instructions for Use. Tokyo: Nissui Pharmaceutical Co., Ltd.",
  "Enterobacteriaceae": "CompactDry™ ETB: Instructions for Use. Tokyo: Nissui Pharmaceutical Co., Ltd.",
  // Teor do Ativo
  "Cálcio": "Método interno.",
  "Vitamina D": "Método interno.",
  // Embalagem
  "Torque de tampa": "Procedimento Operacional Padrão (POP) nº 047. Içara: Alphafitus Suplementos Ltda., 2024. Documento interno.",
  "Selagem por indução": "Procedimento Operacional Padrão (POP) nº 049. Içara: Alphafitus Suplementos Ltda., 2024. Documento interno.",
  "Integridade selagem": "Procedimento Operacional Padrão (POP) nº 050. Içara: Alphafitus Suplementos Ltda., 2024. Documento interno.",
};

function collectProtocolImages(
  protocolId: number,
  lots: { id: number; lotNumber: string }[],
  analyses: { parameter: string; category: string }[],
): PhotoEntry[] {
  const prefix = `imgs_${protocolId}_`;
  const entries: PhotoEntry[] = [];
  const categoryByParam: Record<string, string> = {};
  for (const a of analyses) categoryByParam[a.parameter] = a.category;

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key?.startsWith(prefix)) continue;
    const rest = key.slice(prefix.length);
    const parts = rest.split("_");
    if (parts.length < 3) continue;
    const period = parseInt(parts[parts.length - 1]);
    const lotId = parseInt(parts[parts.length - 2]);
    const parameter = parts.slice(0, parts.length - 2).join("_");
    if (isNaN(period) || isNaN(lotId)) continue;
    try {
      const images: string[] = JSON.parse(localStorage.getItem(key) ?? "[]");
      if (!images.length) continue;
      const lot = lots.find((l) => l.id === lotId);
      if (!lot) continue;
      entries.push({
        parameter,
        category: categoryByParam[parameter] ?? "",
        lotNumber: lot.lotNumber,
        period,
        images,
        key,
      });
    } catch { /* skip */ }
  }
  return entries.sort(
    (a, b) =>
      (a.category || "").localeCompare(b.category || "") ||
      a.parameter.localeCompare(b.parameter) ||
      a.lotNumber.localeCompare(b.lotNumber) ||
      a.period - b.period,
  );
}

/**
 * CertEditField — controlled <input>/<textarea> element styled to look like
 * plain text (transparent background, dashed underline only).
 * Uses contentEditable so Chrome / password-managers can NEVER autofill any
 * certificate field. Regular <input>/<textarea> elements are vulnerable to
 * autofill injection even with autoComplete="new-password". contentEditable
 * divs are completely invisible to browser autofill engines.
 */
function CertEditField({
  value, onChange, className = "", multiline = false,
}: { value: string; onChange: (v: string) => void; className?: string; multiline?: boolean }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const isSyncing = React.useRef(false);
  const isFocused = React.useRef(false);

  // Sync DOM ← prop only when not focused (avoids clobbering in-progress typing).
  React.useEffect(() => {
    if (!isFocused.current && ref.current) {
      const current = ref.current.textContent ?? "";
      if (current !== value) {
        isSyncing.current = true;
        ref.current.textContent = value;
        // Reset flag after microtask so the input event handler ignores this change.
        Promise.resolve().then(() => { isSyncing.current = false; });
      }
    }
  }, [value]);

  const handleInput = () => {
    if (isSyncing.current) return;
    onChange(ref.current?.textContent ?? "");
  };

  const BASE =
    "outline-none cursor-text min-h-[1em] print:hidden border-b border-t-0 border-x-0 border-dashed border-gray-400 focus:border-gray-700";

  return (
    <span className="relative block w-full min-w-0">
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        spellCheck={false}
        onFocus={() => { isFocused.current = true; }}
        onBlur={() => {
          isFocused.current = false;
          // Re-sync on blur in case the value prop was updated while focused
          // (e.g. external reset). Only fires if they diverge.
          if (ref.current && ref.current.textContent !== value) {
            onChange(ref.current.textContent ?? "");
          }
        }}
        onInput={handleInput}
        className={`${BASE} ${multiline ? "whitespace-pre-wrap break-words" : "whitespace-nowrap overflow-hidden"} ${className}`}
      />
      <span className={`hidden print:${multiline ? "block" : "inline"} whitespace-pre-wrap break-words`}>{value}</span>
    </span>
  );
}

type ShowSections = {
  condicoesAmbientais: boolean;
  textoLotes: boolean;
  infoAdicionais: boolean;
  conclusao: boolean;
  cineticaProtocolo: boolean;
  fundamentacaoCinetica: boolean;
  ressalvaNote: boolean;
  referencias: boolean;
};

const SECTION_LABELS: { key: keyof ShowSections; label: string; onlyWhenAR?: boolean }[] = [
  { key: "condicoesAmbientais", label: "Condições Ambientais" },
  { key: "textoLotes", label: "Texto Lotes Piloto" },
  { key: "infoAdicionais", label: "Informações Adicionais" },
  { key: "conclusao", label: "Conclusão" },
  { key: "cineticaProtocolo", label: "Parâmetros Cinéticos e Validade" },
  { key: "fundamentacaoCinetica", label: "Fundamentação Cinética" },
  { key: "ressalvaNote", label: "Nota de Ressalva", onlyWhenAR: true },
  { key: "referencias", label: "Referências Bibliográficas" },
];

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

// ── Module-level: certificate title corruption guard ──────────────────────────
// "BIS DE ANALISE" is a browser autofill corruption. These values must NEVER
// appear as the certificate title regardless of how they get into state/storage.
// Strip Portuguese/French diacritics before comparing so "Análise" matches "ANALISE"
const stripAccents = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

const BAD_TITLE_STRIPPED = new Set([
  "BIS DE ANALYSE", "BIS DE ANALISE",
  "BIS DE ANALYSE.", "BIS DE ANALISE.",
]);
const isBadCertTitle = (v: string) =>
  BAD_TITLE_STRIPPED.has(stripAccents(v.trim()).toUpperCase());

/**
 * ContentEditable title editor — Chrome NEVER autofills contentEditable elements.
 * This is the only browser-proof way to allow free-text editing of the H1 title.
 */
function TitleEditor({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const ref = React.useRef<HTMLSpanElement>(null);
  const lastGood = React.useRef(value);
  const isFocused = React.useRef(false);

  // Sync DOM whenever value changes from outside (e.g. async cert load),
  // but only when not currently being edited to avoid cursor disruption.
  React.useEffect(() => {
    if (!isFocused.current && ref.current && ref.current.textContent !== value) {
      ref.current.textContent = value;
      lastGood.current = value;
    }
  }, [value]);

  return (
    <>
      <span
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        className="outline-none border-b border-dashed border-gray-400 focus:border-gray-700 cursor-text min-w-[10ch] inline-block print:hidden"
        title="Clique para editar o título"
        onFocus={() => { isFocused.current = true; }}
        onBlur={() => { isFocused.current = false; }}
        onInput={() => {
          const text = ref.current?.textContent ?? "";
          if (isBadCertTitle(text)) {
            if (ref.current) ref.current.textContent = lastGood.current;
            return;
          }
          lastGood.current = text;
          onChange(text);
        }}
        onPaste={(e) => {
          e.preventDefault();
          const text = e.clipboardData.getData("text/plain");
          if (!isBadCertTitle(text) && ref.current) {
            ref.current.textContent = text;
            lastGood.current = text;
            onChange(text);
          }
        }}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); ref.current?.blur(); } }}
      />
      {/* Shown only when printing — uses React state value (already sanitized) */}
      <span className="hidden print:inline">{value}</span>
    </>
  );
}

export default function CertificatePage() {
  const { id } = useParams<{ id: string }>();
  const { data: cert, isLoading } = useGetCertificate(Number(id), {
    query: { enabled: !!id, queryKey: getGetCertificateQueryKey(Number(id)), staleTime: 0, refetchOnWindowFocus: true },
  });
  const updateProtocol = useUpdateProtocol();

  // certTitle and lbl_capsuleComposition are cleaned synchronously in the
  // useState initializer above (ALWAYS_CLEAR_KEYS). No useEffect needed.

  const [showSettings, setShowSettings] = useState(false);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  // ── Print preferences — persisted per protocol in localStorage ──────────────
  const CERT_PRINT_PREFS_KEY = `cert_print_prefs_${id}`;
  const _savedPrintPrefs = (() => {
    try {
      const raw = localStorage.getItem(CERT_PRINT_PREFS_KEY);
      return raw ? (JSON.parse(raw) as { includePhotos?: boolean; includeHistory?: boolean; show?: Partial<ShowSections>; rowVisibility?: Record<string, boolean> }) : null;
    } catch { return null; }
  })();

  const { toast } = useToast();
  const _restoredFromStorage = useRef(_savedPrintPrefs !== null);

  const [show, setShow] = useState<ShowSections>(() => ({
    condicoesAmbientais: true,
    textoLotes: true,
    infoAdicionais: true,
    conclusao: true,
    cineticaProtocolo: true,
    fundamentacaoCinetica: true,
    ressalvaNote: true,
    referencias: true,
    ...(_savedPrintPrefs?.show ?? {}),
  }));

  const [includePhotos, setIncludePhotos] = useState(() => _savedPrintPrefs?.includePhotos ?? true);
  const [photosExpanded, setPhotosExpanded] = useState(false);
  const [includeHistory, setIncludeHistory] = useState(() => _savedPrintPrefs?.includeHistory ?? true);
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [cineticaExpanded, setCineticaExpanded] = useState(true);
  const [fundamentacaoExpanded, setFundamentacaoExpanded] = useState(true);

  const [analyses, setAnalyses] = useState<Array<{
    parameter: string; category: string; method: string; specification: string | null;
    result: string; status: string; visible: boolean; ativoMgInfo?: string | null;
  }> | null>(null);

  // Persist print preferences whenever they change.
  // Guard: skip writing rowVisibility until analyses has been populated from the
  // server, so we never overwrite previously saved hidden rows with an empty map.
  useEffect(() => {
    try {
      if (analyses === null) {
        // Analyses not loaded yet — persist only the non-row prefs so we don't
        // clobber a saved rowVisibility from a previous visit.
        const existing = (() => {
          try { return JSON.parse(localStorage.getItem(CERT_PRINT_PREFS_KEY) ?? "{}"); } catch { return {}; }
        })();
        localStorage.setItem(CERT_PRINT_PREFS_KEY, JSON.stringify({ ...existing, includePhotos, includeHistory, show }));
        return;
      }
      const rowVisibility: Record<string, boolean> = {};
      for (const a of analyses) rowVisibility[a.parameter] = a.visible;
      localStorage.setItem(CERT_PRINT_PREFS_KEY, JSON.stringify({ includePhotos, includeHistory, show, rowVisibility }));
    } catch { /* ignore */ }
  }, [includePhotos, includeHistory, show, analyses, CERT_PRINT_PREFS_KEY]);

  // ── Notify user when print preferences were restored from localStorage ──────
  const DEFAULT_SHOW: ShowSections = {
    condicoesAmbientais: true,
    textoLotes: true,
    infoAdicionais: true,
    conclusao: true,
    cineticaProtocolo: true,
    fundamentacaoCinetica: true,
    ressalvaNote: true,
    referencias: true,
  };

  useEffect(() => {
    if (!_restoredFromStorage.current) return;

    const { dismiss } = toast({
      title: "Configurações de impressão restauradas",
      description: "Preferências salvas de uma visita anterior foram aplicadas.",
      duration: 7000,
      action: (
        <ToastAction
          altText="Redefinir padrões"
          onClick={() => {
            try { localStorage.removeItem(CERT_PRINT_PREFS_KEY); } catch { /* ignore */ }
            setShow(DEFAULT_SHOW);
            setIncludePhotos(true);
            setIncludeHistory(true);
            setAnalyses(prev => prev ? prev.map(a => ({ ...a, visible: true })) : prev);
            dismiss();
          }}
        >
          Redefinir padrões
        </ToastAction>
      ),
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Environmental conditions — now stored in the database (samplingTemp/Humidity, receptionTemp/Humidity).
  // The old cert_env_* localStorage key is cleaned up during the v4 migration below.

  // ── Electronic signatures ─────────────────────────────────────────────────
  const auth = useContext(AuthContext);
  const queryClient = useQueryClient();
  const { data: signatures = [] } = useListSignatures(Number(id), {
    query: { queryKey: getListSignaturesQueryKey(Number(id)), enabled: !!id, staleTime: 0, refetchOnWindowFocus: true },
  });
  const { data: protocolRefs = [] } = useListProtocolBibliographicReferences(Number(id), {
    query: { enabled: !!id, staleTime: 0, queryKey: getListProtocolBibliographicReferencesQueryKey(Number(id)) },
  });
  const [sigDialogOpen, setSigDialogOpen] = useState(false);
  const [selectedRoleLabel, setSelectedRoleLabel] = useState("Elaborador");
  const [sigDateChoice, setSigDateChoice] = useState<"emissao" | "hoje">("emissao");
  const [sigCustomTime, setSigCustomTime] = useState("");
  const [sigCustomEmissaoDate, setSigCustomEmissaoDate] = useState("");
  const addSig = useAddSignature({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListSignaturesQueryKey(Number(id)) });
        setSigDialogOpen(false);
      },
    },
  });
  const deleteSig = useDeleteSignature({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListSignaturesQueryKey(Number(id)) });
      },
    },
  });
  const currentUserAlreadySigned = !!auth?.user && signatures.some(s => s.userId === auth.user!.id);

  // ── Cert-level field overrides (all free-text edits by operator) ──────────
  // v4 key — v3 data is discarded entirely on first load because the isSyncing
  // bug (programmatic textContent causing handleInput to fire) caused many
  // browsers to persist autofill-corrupted values into v3. v4 starts fresh.
  const CERT_EDITS_KEY = `cert_edits_v4_${id}`;
  const CERT_EDITS_KEY_OLD = `cert_edits_${id}`;
  const CERT_LOCKED_KEY = `cert_locked_${id}`;
  // Keys that must NEVER be loaded from cert_edits (always stripped).
  // certTitle lives in its own dedicated key (CERT_TITLE_KEY) so it is
  // completely isolated from any legacy corruption in cert_edits_v3.
  const ALWAYS_CLEAR_KEYS = new Set(["certTitle", "docTitle"]);

  // ── Dedicated key for the certificate title (completely separate from cert_edits) ──
  // Using a separate key ensures old corrupted values (e.g. "BIS DE ANALYSE")
  // stored in cert_edits_v3 can never contaminate the displayed title.
  const CERT_TITLE_KEY = `cert_custom_title_${id}`;
  const [certCustomTitle, setCertCustomTitleState] = useState<string>(() => {
    try {
      const v = localStorage.getItem(CERT_TITLE_KEY) ?? "";
      // Case-insensitive purge of all known corrupted values
      if (isBadCertTitle(v) || v.trim() === "Certificado de Análise") {
        localStorage.removeItem(CERT_TITLE_KEY);
        return "";
      }
      return v;
    } catch { return ""; }
  });

  // Watchdog: if autofill somehow updated the React state, purge it immediately
  useEffect(() => {
    if (isBadCertTitle(certCustomTitle)) {
      setCertCustomTitleState("");
      try { localStorage.removeItem(CERT_TITLE_KEY); } catch { /* ignore */ }
    }
  }, [certCustomTitle, CERT_TITLE_KEY]);

  // Render-time sanitization: NEVER render a bad title even if state is corrupted
  const safeTitle = isBadCertTitle(certCustomTitle) ? "" : certCustomTitle;
  const displayTitle = safeTitle.trim() || "Certificado de Análise";

  const setCertCustomTitle = (v: string) => {
    if (isBadCertTitle(v)) return;
    setCertCustomTitleState(v);
    try {
      if (!v.trim() || v.trim() === "Certificado de Análise") {
        localStorage.removeItem(CERT_TITLE_KEY);
      } else {
        localStorage.setItem(CERT_TITLE_KEY, v);
      }
    } catch { /* ignore */ }
  };
  const [certEdits, setCertEditsState] = useState<Record<string, string>>(() => {
    try {
      let raw = JSON.parse(localStorage.getItem(CERT_EDITS_KEY) ?? "{}") as Record<string, string>;
      let dirty = false;

      // ── Clean up all old version keys (v1, v2, v3) ──────────────────────
      // v3 is discarded because the isSyncing bug caused autofill-corrupted
      // values to be saved silently. v4 starts fresh for all users.
      try { localStorage.removeItem(CERT_EDITS_KEY_OLD); } catch { /* ignore */ }
      try { localStorage.removeItem(`cert_edits_v3_${id}`); } catch { /* ignore */ }
      try { localStorage.removeItem(`cert_edits_v2_${id}`); } catch { /* ignore */ }
      try { localStorage.removeItem(`cert_env_${id}`); } catch { /* ignore */ }

      // ── Always strip any stale bad keys even from v2 data ─────────────────
      ALWAYS_CLEAR_KEYS.forEach(k => { if (k in raw) { delete raw[k]; dirty = true; } });
      Object.keys(raw).forEach(k => { if (k.startsWith("lbl_")) { delete raw[k]; dirty = true; } });
      try { localStorage.removeItem("cert_lbl_migration_v"); } catch { /* ignore */ }

      if (dirty) localStorage.setItem(CERT_EDITS_KEY, JSON.stringify(raw));
      return raw;
    } catch { return {}; }
  });

  const [certLocked, setCertLockedState] = useState<boolean>(() => {
    try { return localStorage.getItem(`cert_locked_${id}`) === "1"; } catch { return false; }
  });
  const [showUnlockDialog, setShowUnlockDialog] = useState(false);
  const { unlock } = useUnlock();

  const setCertEdit = (key: string, val: string) => {
    setCertEditsState(prev => {
      const next = { ...prev, [key]: val };
      // Always persist immediately — contentEditable is autofill-proof so there
      // is no risk of browser-injected garbage reaching localStorage. Writing on
      // every keystroke means saveCert never depends on capturing React state
      // in a closure; the data is already safe in localStorage before Save is clicked.
      try { localStorage.setItem(CERT_EDITS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  };
  const clearCertEdit = (key: string) => {
    setCertEditsState(prev => {
      const next = { ...prev };
      delete next[key];
      try { localStorage.setItem(CERT_EDITS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  };
  const getEdit = (key: string, fallback: string | null | undefined): string =>
    certEdits[key] !== undefined ? certEdits[key] : (fallback ?? "");

  // Datas por período vindas da aba de resultados (localStorage da aba de resultados)
  const periodDatesLS: Record<number, string> = (() => {
    try {
      const raw = localStorage.getItem(`period_analysis_dates_${id}`);
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  })();

  // Helper para datas de análise:
  // Prioridade: aba de resultados (fonte primária) > cert edit manual > banco > vazio
  const getAnalysisDate = (key: string, apiDate: string | null | undefined, period: number): string => {
    const fromResultsTab = (periodDatesLS as Record<string, string>)[String(period)];
    if (fromResultsTab) return fmtDate(fromResultsTab) as string || fromResultsTab;
    const edit = certEdits[key];
    if (edit) return fmtDate(edit) as string || edit;
    if (apiDate) return fmtDate(apiDate) as string || apiDate;
    return "";
  };

  const saveCert = () => {
    // Final safety net: purge corrupted title before locking
    if (isBadCertTitle(certCustomTitle)) {
      setCertCustomTitleState("");
      try { localStorage.removeItem(CERT_TITLE_KEY); } catch { /* ignore */ }
    }
    // Use functional update to read the LATEST certEdits state rather than the
    // closure-captured value. When the user edits a field and immediately clicks
    // Save, React batches both state updates — the functional form guarantees
    // we see all pending setCertEdit calls before persisting to localStorage.
    setCertEditsState(current => {
      try {
        localStorage.setItem(CERT_LOCKED_KEY, "1");
        localStorage.setItem(CERT_EDITS_KEY, JSON.stringify(current));
      } catch { /* ignore */ }
      // Persist issueDate to the database so it survives localStorage clears
      // and is reflected immediately in the report without depending on localStorage.
      if (current["issueDate"] && id) {
        updateProtocol.mutate({ id: Number(id), data: { issueDate: current["issueDate"] } });
      }
      return current;
    });
    setCertLockedState(true);
  };
  const unlockCert = () => {
    setCertLockedState(false);
    try { localStorage.setItem(CERT_LOCKED_KEY, "0"); } catch { /* ignore */ }
  };
  const clearCertEdits = () => {
    setCertEditsState({});
    try {
      localStorage.removeItem(CERT_EDITS_KEY);
      localStorage.removeItem(CERT_LOCKED_KEY);
    } catch { /* ignore */ }
    setCertLockedState(false);
  };

  /** Wipes ALL cert localStorage for this protocol and reloads from the database.
   *  Use when corrupted autofill values (e.g. "BIS DE ANALISE", "GENT DA CAPSULA")
   *  are stuck in localStorage and can't be cleared by the nuclear scan. */
  const resetAllCertData = () => {
    if (!window.confirm(
      "Isso vai apagar todos os dados editados localmente deste certificado (título, campos personalizados, bloqueio) e recarregar os valores originais do banco de dados.\n\nContinuar?"
    )) return;
    try {
      const prefix = `cert_`;
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && (
          k === CERT_TITLE_KEY ||
          k === CERT_EDITS_KEY ||
          k === CERT_LOCKED_KEY ||
          k.startsWith(`cert_overrides_${id}`) ||
          k.startsWith(`cert_edits_v3_${id}`) ||
          k.startsWith(`cert_custom_title_${id}`) ||
          k.startsWith(`cert_locked_${id}`) ||
          k.startsWith(`param_methods_${id}`) ||
          k.startsWith(`param_methods_citations_${id}`)
        )) keysToRemove.push(k);
      }
      keysToRemove.forEach(k => { try { localStorage.removeItem(k); } catch { /* ignore */ } });
    } catch { /* ignore */ }
    // Reset React state
    setCertCustomTitleState("");
    setCertEditsState({});
    setCertLockedState(false);
  };

  // Helper: renders a CertEditField when unlocked, plain text when locked
  const ef = (key: string, fallback: string | null | undefined, opts?: { multiline?: boolean; className?: string }) => {
    const val = getEdit(key, fallback);
    if (certLocked) return <span>{val}</span>;
    return <CertEditField value={val} onChange={v => setCertEdit(key, v)} multiline={opts?.multiline} className={opts?.className ?? "w-full"} />;
  };


  // Signature name-matching helpers (used in JSX to route sigs to the right column)
  const normSigName = (s: string) =>
    s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
  const sigNameMatches = (a: string, b: string) => {
    const na = normSigName(a), nb = normSigName(b);
    return na === nb || na.includes(nb) || nb.includes(na);
  };

  const { data: lotsRaw = [] } = useListLots(Number(id), {
    query: { enabled: !!id, queryKey: getListLotsQueryKey(Number(id)), staleTime: 0, refetchOnWindowFocus: true },
  });

  const { data: kineticsData } = useGetKinetics(Number(id), {
    query: { enabled: !!id, queryKey: getGetKineticsQueryKey(Number(id)), staleTime: 0, refetchOnWindowFocus: true },
  });

  // Sync analyses from API + localStorage every time cert (re)loads.
  // Runs on mount and whenever cert refetches (e.g. after navigating back from
  // the Results tab). Preserves: visibility toggles (via map), manual cert
  // edits (via cert_overrides), and methodology selections (via param_methods).
  // Priority: cert_overrides.method > param_methods > API default.
  useEffect(() => {
    if (!cert) return;
    type FieldOverride = { method?: string; specification?: string; result?: string };
    let saved: Record<string, FieldOverride> = {};
    // paramCitations: full citation text chosen in Results tab (for Método column)
    // paramMethods: shortName (fallback if no citation stored yet)
    let paramCitations: Record<string, string> = {};
    let paramMethods: Record<string, string> = {};
    try {
      const raw = localStorage.getItem(`cert_overrides_${id}`);
      if (raw) saved = JSON.parse(raw);
      // Full citation text (primary source for Método column)
      const citRaw = localStorage.getItem(`param_methods_citations_${id}`);
      if (citRaw) paramCitations = JSON.parse(citRaw);
      // ShortName fallback (for protocols that selected methodology before this change)
      const pmRaw = localStorage.getItem(`param_methods_${id}`);
      if (pmRaw) paramMethods = JSON.parse(pmRaw);
      // Migrate old methods-only key if present
      const oldMethods = localStorage.getItem(`methods_${id}`);
      if (oldMethods) {
        const m: Record<string, string> = JSON.parse(oldMethods);
        for (const [param, method] of Object.entries(m)) {
          saved[param] = { ...saved[param], method };
        }
        localStorage.removeItem(`methods_${id}`);
        localStorage.setItem(`cert_overrides_${id}`, JSON.stringify(saved));
      }
    } catch { /* ignore */ }
    setAnalyses(prev => {
      // Preserve per-row visibility toggled by the user
      const visMap: Record<string, boolean> = {};
      if (prev) for (const a of prev) visMap[a.parameter] = a.visible;
      return cert.analyses.map(a => ({
        ...a,
        // Priority: manual cert edit > full citation from Results tab > shortName fallback > default method map > API value
        method: saved[a.parameter]?.method ?? paramCitations[a.parameter] ?? paramMethods[a.parameter] ?? (a.method || DEFAULT_METHODS[a.parameter]) ?? a.method,
        specification: saved[a.parameter]?.specification ?? a.specification,
        // result and status always come from the DB (API) so changes in the
        // Results tab propagate to the certificate automatically, even after
        // the certificate has been created.
        result: a.result,
        visible: visMap[a.parameter] ?? _savedPrintPrefs?.rowVisibility?.[a.parameter] ?? true,
      }));
    });
  }, [cert, id]);

  const allPhotoEntries = useMemo(() => {
    if (!lotsRaw.length) return [] as PhotoEntry[];
    const baseAnalyses = cert?.analyses ?? [];
    return collectProtocolImages(
      Number(id),
      lotsRaw as { id: number; lotNumber: string }[],
      baseAnalyses,
    );
  }, [id, lotsRaw, cert]);

  const [selectedPhotoKeys, setSelectedPhotoKeys] = useState<Set<string> | null>(null);

  const activePhotoKeys = useMemo(() => {
    if (selectedPhotoKeys !== null) return selectedPhotoKeys;
    return new Set(allPhotoEntries.map(e => e.key));
  }, [selectedPhotoKeys, allPhotoEntries]);

  const togglePhotoKey = (key: string) => {
    setSelectedPhotoKeys(prev => {
      const current = prev ?? new Set(allPhotoEntries.map(e => e.key));
      const next = new Set(current);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const selectAllPhotos = () => setSelectedPhotoKeys(new Set(allPhotoEntries.map(e => e.key)));
  const deselectAllPhotos = () => setSelectedPhotoKeys(new Set());
  const selectedCount = activePhotoKeys.size;

  const toggle = (key: keyof ShowSections) => setShow(prev => ({ ...prev, [key]: !prev[key] }));

  // Per-parameter descriptions in the photo appendix — editable, persisted to localStorage
  const PHOTO_DESC_KEY = `cert_photo_desc_${id}`;
  const [photoDescriptions, setPhotoDescriptions] = useState<Record<string, string>>(() => {
    try { return JSON.parse(localStorage.getItem(PHOTO_DESC_KEY) ?? "{}"); } catch { return {}; }
  });
  const setPhotoDescription = (param: string, val: string) => {
    setPhotoDescriptions(prev => {
      const next = { ...prev, [param]: val };
      try { localStorage.setItem(PHOTO_DESC_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  };
  const getDescription = (param: string) =>
    photoDescriptions[param] !== undefined ? photoDescriptions[param] : getParamDescription(param);

  const updateAnalysis = (i: number, field: "method" | "specification" | "result", val: string) => {
    setAnalyses(prev => {
      if (!prev) return prev;
      const next = [...prev];
      next[i] = { ...next[i], [field]: val };
      // Persist ALL field edits so they survive page refreshes
      try {
        const key = `cert_overrides_${id}`;
        const savedRaw = localStorage.getItem(key) ?? "{}";
        const saved: Record<string, Record<string, string>> = JSON.parse(savedRaw);
        const param = next[i].parameter;
        saved[param] = { ...saved[param], [field]: val };
        localStorage.setItem(key, JSON.stringify(saved));
      } catch { /* ignore */ }
      return next;
    });
  };

  const toggleRowVisibility = (i: number) => {
    setAnalyses(prev => {
      if (!prev) return prev;
      const next = [...prev]; next[i] = { ...next[i], visible: !next[i].visible }; return next;
    });
  };

  const allVisible = analyses?.every(a => a.visible) ?? true;
  const toggleAllRows = () => {
    setAnalyses(prev => prev ? prev.map(a => ({ ...a, visible: !allVisible })) : prev);
  };

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto space-y-4">
        <Skeleton className="h-8 w-48" /><Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!cert) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <p>Certificado nao encontrado.</p>
        <Link href={`/protocols/${id}`}>
          <Button variant="link" className="mt-2">Voltar ao Protocolo</Button>
        </Link>
      </div>
    );
  }

  const isAR = cert.finalStatus === "aprovado_com_ressalva";
  // "aprovado_com_ressalva" is an explicit approval — treated the same as "aprovado"
  const isApproved = cert.finalStatus === "aprovado" || isAR;
  const isRepproved = cert.finalStatus === "reprovado";
  const rows = analyses ?? cert.analyses.map(a => ({ ...a, visible: true }));
  const categories = Array.from(new Set(rows.map(r => r.category)));

  // When the operator finalized as AR, the protocol-level decision is sovereign:
  // NC auto-rejection is completely bypassed — the operator already made the call.
  const hasNonConforming = !isAR && rows.some(r => r.status === "Nao Conforme" && r.visible);
  const effectiveIsApproved = isApproved && !hasNonConforming;
  const effectiveIsRepproved = isRepproved || hasNonConforming;

  const visiblePhotoEntries = includePhotos
    ? allPhotoEntries.filter(e => activePhotoKeys.has(e.key))
    : [];

  const totalSelectedImages = visiblePhotoEntries.reduce((s, e) => s + e.images.length, 0);

  return (
    <div className="max-w-5xl mx-auto space-y-4">

      <UnlockDialog
        open={showUnlockDialog}
        onOpenChange={setShowUnlockDialog}
        onUnlock={unlock}
        onSuccess={unlockCert}
        title="Desbloquear edição do certificado"
        description="Digite a senha mestra para liberar a edição dos campos do certificado."
        submitLabel="Desbloquear"
      />

      {/* ─── Toolbar ─── */}
      <div className="flex items-center justify-between print:hidden">
        <Link href={`/protocols/${id}`}>
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" /> Voltar ao Protocolo
          </Button>
        </Link>
        <div className="flex gap-2 items-center">
          {!certLocked ? (
            <>
              <span className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-2 py-1 font-medium">
                ✎ Modo edição — clique em qualquer campo para corrigir
              </span>
              <Button variant="default" size="sm" onClick={saveCert} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                <Save className="h-4 w-4 mr-2" /> Salvar e Bloquear
              </Button>
            </>
          ) : (
            <Button variant="outline" size="sm" onClick={() => setShowUnlockDialog(true)}>
              <Lock className="h-4 w-4 mr-2" /> Editar (requer senha)
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => setShowSettings(s => !s)}>
            <Settings2 className="h-4 w-4 mr-2" />
            Configurar Impressão
            {showSettings ? <ChevronUp className="h-3 w-3 ml-1" /> : <ChevronDown className="h-3 w-3 ml-1" />}
          </Button>
          <Button
            variant="outline" size="sm"
            onClick={resetAllCertData}
            className="border-red-200 text-red-600 hover:bg-red-50"
            title="Limpa dados corrompidos do cache local e recarrega os valores do banco"
          >
            <Trash2 className="h-4 w-4 mr-2" /> Limpar cache
          </Button>
          <Button onClick={() => window.print()}>
            <Printer className="h-4 w-4 mr-2" /> Imprimir / Salvar PDF
          </Button>
        </div>
      </div>

      {/* ─── Banner: edições em cache detectadas ─── */}
      {Object.keys(certEdits).length > 0 && !certLocked && (
        <div className="print:hidden flex items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm text-amber-900">
          <span>
            <strong>⚠ Atenção:</strong> Este certificado possui <strong>{Object.keys(certEdits).length}</strong> campo(s) com edições manuais salvas localmente.
            Se os dados estiverem incorretos, clique em <strong>Restaurar</strong> para recarregar os valores originais do banco de dados.
          </span>
          <button
            type="button"
            onClick={() => { if (window.confirm("Restaurar todos os campos do certificado para os valores originais do banco de dados?\n\nAs edições manuais salvas localmente serão perdidas.")) clearCertEdits(); }}
            className="shrink-0 text-xs font-semibold px-3 py-1.5 rounded border border-amber-400 bg-amber-100 text-amber-800 hover:bg-amber-200 transition-colors"
          >
            ↺ Restaurar campos originais
          </button>
        </div>
      )}

      {/* ─── Settings panel ─── */}
      {showSettings && (
        <div className="print:hidden border rounded-lg bg-white shadow-sm p-5 space-y-5">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-gray-800">Configurações de Impressão / PDF</p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => { if (window.confirm("Restaurar todos os campos do certificado para os valores originais? As edições manuais serão perdidas.")) clearCertEdits(); }}
                className="text-xs px-3 py-1.5 rounded border border-red-200 text-red-600 hover:bg-red-50 transition-colors"
              >
                Restaurar campos originais
              </button>
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Seções do documento</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {SECTION_LABELS.filter(s => !s.onlyWhenAR || isAR).map(({ key, label, onlyWhenAR }) => (
                <label key={key} className={`flex items-center gap-2 cursor-pointer select-none p-2 rounded-md border hover:bg-gray-50 ${onlyWhenAR ? "border-amber-200 bg-amber-50/40" : "border-gray-100"}`}>
                  <input type="checkbox" checked={show[key]} onChange={() => toggle(key)} className="w-4 h-4 accent-primary" />
                  <span className={`text-sm ${onlyWhenAR ? "text-amber-800 font-medium" : "text-gray-700"}`}>{label}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="space-y-2 border-t pt-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Linhas de análise visíveis</p>
              <button onClick={toggleAllRows} className="text-xs px-2 py-1 rounded border border-gray-300 hover:bg-gray-50 text-gray-600">
                {allVisible ? "Desmarcar todas" : "Marcar todas"}
              </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1 max-h-40 overflow-y-auto pr-1">
              {rows.map((row, i) => (
                <label key={i} className="flex items-center gap-2 cursor-pointer select-none p-1.5 rounded hover:bg-gray-50">
                  <input type="checkbox" checked={row.visible} onChange={() => toggleRowVisibility(i)} className="w-3.5 h-3.5 accent-primary" />
                  <span className={`text-xs truncate ${row.visible ? "text-gray-700" : "text-gray-300 line-through"}`}>{row.parameter}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ─── PHOTO SELECTION PANEL — collapsible ─── */}
      {allPhotoEntries.length > 0 && (
        <div className="print:hidden rounded-lg border-2 border-blue-200 bg-blue-50 shadow-sm overflow-hidden">
          <button
            type="button"
            onClick={() => setPhotosExpanded(v => !v)}
            className="w-full flex items-center justify-between px-4 py-3 bg-blue-100 border-b border-blue-200 hover:bg-blue-200 transition-colors text-left"
          >
            <div className="flex items-center gap-2">
              <ImageIcon className="h-5 w-5 text-blue-600" />
              <span className="font-semibold text-blue-900 text-sm">Registros Fotográficos — Anexo de Impressão</span>
              <span className="text-xs text-blue-600 bg-white border border-blue-200 rounded-full px-2 py-0.5 font-semibold">
                {allPhotoEntries.length} grupo(s) · {allPhotoEntries.reduce((s, e) => s + e.images.length, 0)} foto(s) no total
              </span>
              {!photosExpanded && (
                <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${includePhotos ? "bg-green-50 border-green-300 text-green-700" : "bg-gray-100 border-gray-300 text-gray-500"}`}>
                  {includePhotos ? "✓ Incluído na impressão" : "✗ Não incluído"}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {photosExpanded ? <ChevronUp className="h-4 w-4 text-blue-600" /> : <ChevronDown className="h-4 w-4 text-blue-600" />}
            </div>
          </button>

          {photosExpanded && (
            <div className="px-4 py-3 border-b border-blue-200 bg-blue-50">
              <label className="flex items-center gap-2 cursor-pointer select-none" onClick={e => e.stopPropagation()}>
                <input
                  type="checkbox"
                  checked={includePhotos}
                  onChange={e => setIncludePhotos(e.target.checked)}
                  className="w-4 h-4 accent-blue-600"
                />
                <span className="text-sm font-semibold text-blue-800">
                  Incluir no PDF / Impressão
                  {includePhotos && selectedCount > 0 && (
                    <span className="ml-1 text-blue-600">({selectedCount} grupo(s) · {totalSelectedImages} foto(s))</span>
                  )}
                </span>
              </label>
            </div>
          )}

          {photosExpanded && includePhotos && (
            <div className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs text-blue-700">Selecione quais grupos incluir no anexo impresso:</p>
                <div className="flex gap-2">
                  <button
                    onClick={selectAllPhotos}
                    className="flex items-center gap-1 text-xs px-2.5 py-1 rounded border border-blue-300 hover:bg-blue-100 text-blue-700 font-medium"
                  >
                    <CheckSquare className="h-3 w-3" /> Marcar todas
                  </button>
                  <button
                    onClick={deselectAllPhotos}
                    className="flex items-center gap-1 text-xs px-2.5 py-1 rounded border border-blue-300 hover:bg-blue-100 text-blue-700 font-medium"
                  >
                    <Square className="h-3 w-3" /> Desmarcar todas
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {allPhotoEntries.map((entry) => {
                  const isSelected = activePhotoKeys.has(entry.key);
                  return (
                    <label
                      key={entry.key}
                      className={`flex items-center gap-3 cursor-pointer select-none p-2.5 rounded-lg border-2 transition-all ${
                        isSelected ? "border-blue-400 bg-white shadow-sm" : "border-gray-200 bg-gray-50 opacity-60"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => togglePhotoKey(entry.key)}
                        className="w-4 h-4 accent-blue-600 shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs font-bold text-gray-800 truncate">{entry.parameter}</span>
                          {entry.category && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 border border-gray-200 whitespace-nowrap">
                              {CATEGORY_LABELS[entry.category] ?? entry.category}
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] text-gray-500 mt-0.5 block">
                          Lote <strong>{entry.lotNumber}</strong> · Período <strong>T{entry.period}</strong> · {entry.images.length} foto(s)
                        </span>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        {entry.images.slice(0, 4).map((img, ii) => (
                          <img
                            key={ii}
                            src={img}
                            alt=""
                            className={`w-10 h-10 object-cover rounded border-2 transition-all ${isSelected ? "border-blue-300" : "border-gray-200"}`}
                          />
                        ))}
                        {entry.images.length > 4 && (
                          <div className="w-10 h-10 rounded border-2 border-gray-200 bg-gray-100 flex items-center justify-center text-[10px] text-gray-500 font-bold">
                            +{entry.images.length - 4}
                          </div>
                        )}
                      </div>
                    </label>
                  );
                })}
              </div>
              {selectedCount === 0 && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
                  Nenhum grupo selecionado. O anexo fotográfico não será incluído no PDF.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* ─── HISTORY PANEL — collapsible ─── */}
      <div className="print:hidden rounded-lg border-2 border-slate-200 bg-slate-50 shadow-sm overflow-hidden">
        <button
          type="button"
          onClick={() => setHistoryExpanded(v => !v)}
          className="w-full flex items-center justify-between px-4 py-3 bg-slate-100 border-b border-slate-200 hover:bg-slate-200 transition-colors text-left"
        >
          <div className="flex items-center gap-2">
            <History className="h-5 w-5 text-slate-600" />
            <span className="font-semibold text-slate-900 text-sm">Histórico de Alterações — Anexo de Impressão</span>
            {!historyExpanded && (
              <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${includeHistory ? "bg-green-50 border-green-300 text-green-700" : "bg-gray-100 border-gray-300 text-gray-500"}`}>
                {includeHistory ? "✓ Incluído na impressão" : "✗ Não incluído"}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {historyExpanded ? <ChevronUp className="h-4 w-4 text-slate-600" /> : <ChevronDown className="h-4 w-4 text-slate-600" />}
          </div>
        </button>

        {historyExpanded && (
          <div className="px-4 py-3 border-b border-slate-200">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={includeHistory}
                onChange={e => setIncludeHistory(e.target.checked)}
                className="w-4 h-4 accent-slate-600"
              />
              <span className="text-sm font-semibold text-slate-800">Incluir no PDF / Impressão</span>
            </label>
          </div>
        )}

        {historyExpanded && (
          <div className="p-4 text-xs text-slate-600 max-h-64 overflow-y-auto">
            <div className="grid grid-cols-[7rem_6rem_7rem_1fr] gap-x-3 font-bold uppercase text-slate-500 border-b border-slate-300 pb-1 mb-1 text-[10px] tracking-wide">
              <span>Data/Hora</span><span>Tipo</span><span>Responsável</span><span>Descrição</span>
            </div>
            <AuditTrail protocolId={Number(id)} printMode />
          </div>
        )}
      </div>

      {/* ─── Certificate document ─── */}
      <div
        id="certificate-document"
        className="bg-white text-gray-900 border border-gray-300 shadow-lg rounded-sm p-10 font-sans text-sm leading-relaxed"
        data-testid="certificate-document"
      >
        {/* ── BLOCO INTRODUTÓRIO — Header + Empresa + Produto + Plano ───────
             Agrupados num único div para nunca quebrar a página dentro deles  */}
        <div className="cert-intro-block">

        {/* Header */}
        <div className="flex items-start justify-between border-b-2 border-gray-800 pb-8 mb-10 gap-4">
          {/* Logo + título */}
          <div className="flex items-start gap-5 flex-1 min-w-0">
            <img
              src="/logo-alphafitus.png"
              alt="Alphafitus"
              className="h-16 w-auto flex-shrink-0 mt-1"
              style={{ filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.08))" }}
            />
            <div className="border-l border-gray-300 pl-5" style={{ minWidth: 0, flex: 1 }}>
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-0.5">Alphafitus Laboratório Nutracêutico</p>
              <h1 className="text-xl font-bold uppercase tracking-wide text-gray-800 leading-tight">
                {certLocked
                  ? <span>{displayTitle}</span>
                  : <TitleEditor value={displayTitle} onChange={setCertCustomTitle} />
                }
              </h1>
              <p className="text-sm font-semibold text-emerald-700 mt-0.5 leading-snug">{ef("productName", cert.productName, { multiline: true, className: "text-sm font-semibold text-emerald-700 w-full bg-transparent resize-none leading-snug" })}</p>
            </div>
          </div>
          {/* Cert info */}
          <div className="text-right text-sm space-y-2 flex-shrink-0">
            <div className="bg-gray-50 border border-gray-200 rounded px-3 py-2 whitespace-nowrap">
              <span className="text-gray-400 text-[10px] font-semibold uppercase tracking-wider block leading-tight mb-1">Nº do Certificado de Análise</span>
              <span className="font-bold tracking-wide text-base whitespace-nowrap">{ef("certNumber", cert.certNumber)}</span>
            </div>
            <div className="whitespace-nowrap">
              <span className="text-gray-400 text-[10px] font-semibold uppercase tracking-wider block">Data de Emissão</span>
              <span className="font-medium text-gray-700 whitespace-nowrap">{ef("issueDate", fmtDate(cert.issueDate) as string)}</span>
            </div>
          </div>
        </div>

        {/* ── DADOS DA EMPRESA ──────────────────────────────────────────────── */}
        <div className="mb-10 border border-gray-200 rounded-lg overflow-hidden text-sm">
          <div className="bg-slate-700 px-5 py-1.5">
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-slate-100">Dados da Empresa</h2>
          </div>
          <div className="px-5 py-5 grid grid-cols-2 gap-x-8 gap-y-2">
            <div className="flex gap-2"><dt className="text-gray-500 min-w-20 flex-shrink-0">Empresa:</dt><dd className="font-medium flex-1 min-w-0">{ef("companyName", cert.companyName)}</dd></div>
            <div className="flex gap-2"><dt className="text-gray-500 min-w-20 flex-shrink-0">CNPJ:</dt><dd className="font-medium flex-1 min-w-0">{ef("cnpj", cert.cnpj)}</dd></div>
            <div className="flex gap-2"><dt className="text-gray-500 min-w-20 flex-shrink-0">IE:</dt><dd className="flex-1 min-w-0">{ef("ie", (cert as any).ie)}</dd></div>
            <div className="flex gap-2"><dt className="text-gray-500 min-w-20 flex-shrink-0">Email:</dt><dd className="flex-1 min-w-0">{ef("email", cert.email)}</dd></div>
            <div className="flex gap-2 col-span-2"><dt className="text-gray-500 min-w-20 flex-shrink-0">Endereço:</dt><dd className="flex-1 min-w-0">{ef("address", cert.address)}</dd></div>
          </div>
        </div>

        {/* ── IDENTIFICAÇÃO DO PRODUTO ──────────────────────────────────────── */}
        <div className="mb-10 border border-gray-200 rounded-lg overflow-hidden text-xs">
          <div className="bg-slate-700 px-5 py-1.5">
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-slate-100">Identificação do Produto</h2>
          </div>
          <div className="px-5 py-5">
            <table className="w-full text-xs border-collapse">
              <colgroup>
                <col style={{ width: "22%" }} />
                <col style={{ width: "78%" }} />
              </colgroup>
              <tbody>
                <tr>
                  <td className="text-gray-500 align-top pr-4 pb-1 font-medium">{ef("lbl_productName", "Produto:", { className: "text-gray-500 font-medium text-xs" })}</td>
                  <td className="font-medium align-top pb-1 text-justify">{ef("productName", cert.productName, { multiline: true, className: "w-full font-medium text-xs text-justify bg-transparent resize-none" })}</td>
                </tr>
                <tr>
                  <td className="text-gray-500 align-top pr-4 pb-1 font-medium">{ef("lbl_presentation", "Tipo do Produto:", { className: "text-gray-500 font-medium text-xs" })}</td>
                  <td className="align-top pb-1 text-justify">{ef("presentation", cert.presentation)}</td>
                </tr>
                {!!getEdit("packagingType", cert.packagingType) && (
                  <tr>
                    <td className="text-gray-500 align-top pr-4 pb-1 font-medium">{ef("lbl_packagingType", "Tipo de Pote:", { className: "text-gray-500 font-medium text-xs" })}</td>
                    <td className="align-top pb-1 text-justify">{ef("packagingType", cert.packagingType)}</td>
                  </tr>
                )}
                {!!getEdit("activeIngredients", cert.activeIngredients) && (
                  <tr>
                    <td className="text-gray-500 align-top pr-4 pb-1 font-medium">{ef("lbl_activeIngredients", "Ingredientes Ativos:", { className: "text-gray-500 font-medium text-xs" })}</td>
                    <td className="align-top pb-1 text-justify">{ef("activeIngredients", cert.activeIngredients, { multiline: true })}</td>
                  </tr>
                )}
                {!!getEdit("excipients", cert.excipients) && (
                  <tr>
                    <td className="text-gray-500 align-top pr-4 pb-1 font-medium">{ef("lbl_excipients", "Excipientes:", { className: "text-gray-500 font-medium text-xs" })}</td>
                    <td className="align-top pb-1 text-justify">{ef("excipients", cert.excipients, { multiline: true })}</td>
                  </tr>
                )}
                {!!getEdit("capsuleComposition", cert.capsuleComposition) && (
                  <tr>
                    <td className="text-gray-500 align-top pr-4 pb-1 font-medium">{ef("lbl_capsuleComposition", "Composição da Cápsula:", { className: "text-gray-500 font-medium text-xs" })}</td>
                    <td className="align-top pb-1 text-justify">{ef("capsuleComposition", cert.capsuleComposition, { multiline: true })}</td>
                  </tr>
                )}
                <tr>
                  <td className="text-gray-500 align-top pr-4 pb-1 font-medium">{ef("lbl_validityMonths", "Validade:", { className: "text-gray-500 font-medium text-xs" })}</td>
                  <td className="font-semibold align-top pb-1">{ef("validityMonths", cert.validityMonths ? String(cert.validityMonths) + " meses" : "")}</td>
                </tr>
                <tr>
                  <td className="text-gray-500 align-top pr-4 whitespace-nowrap font-medium">N° do Lote:</td>
                  <td className="align-top">
                    <div className="space-y-0.5">
                      {(lotsRaw.length > 0
                        ? [...lotsRaw].sort((a, b) => a.lotNumber.localeCompare(b.lotNumber))
                        : cert.lotNumbers.map(n => ({ id: n, lotNumber: n, manufacturingDate: null, expiryDate: null, quantity: null }))
                      ).map((lot, i) => {
                        const mfgDate = (lot as { manufacturingDate?: string | null }).manufacturingDate;
                        const qty = (lot as { quantity?: number | null }).quantity;
                        return (
                        <div key={(lot as { id: string | number }).id} className="grid" style={{ gridTemplateColumns: "1fr auto auto auto", gap: "0 12px" }}>
                          <span className="font-semibold">{i + 1} — {lot.lotNumber}</span>
                          <span className="text-gray-500 text-right">{mfgDate ? `Fab. ${fmtDate(mfgDate)}` : ""}</span>
                          <span className="text-gray-800 font-semibold text-right">{cert.validityMonths ? `Val. ${cert.validityMonths} meses` : ""}</span>
                          <span className="text-gray-500 text-right">{qty ? `${qty} un.` : ""}</span>
                        </div>
                        );
                      })}
                    </div>
                    <div className="mt-3 text-center">
                      <p className="text-[10px] font-bold text-black leading-snug">
                        Alimento está sendo testado em embalagem equivalente e sistema de fechamento nos quais será comercializado.
                      </p>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* ── PLANO DE TESTE DE ESTABILIDADE ─────────────────────────────── */}
        <div className="mb-10 border border-gray-200 rounded-lg overflow-hidden text-xs">
          <div className="bg-slate-700 px-5 py-1.5">
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-slate-100">Plano de Teste de Estabilidade</h2>
          </div>

          {/* ── Sub-cabeçalho: Condições ── */}
          <div className="bg-slate-50 border-b border-gray-300 px-5 py-2">
            <span className="text-[9px] font-semibold tracking-wide text-slate-500">Condições de Armazenamento</span>
          </div>
          <div className="grid grid-cols-4 divide-x divide-gray-300 border-b border-gray-300">
            <div className="p-4">
              <p className="text-[9px] font-semibold tracking-wide text-slate-500 mb-2">{ef("lbl_storageTemp", "Temperatura", { className: "text-[9px] font-semibold tracking-wide text-slate-500" })}</p>
              <p className="font-semibold text-slate-800 text-sm leading-snug">{ef("storageTemp", cert.storageTemp ?? "40°C ± 2°C")}</p>
            </div>
            <div className="p-4">
              <p className="text-[9px] font-semibold tracking-wide text-slate-500 mb-2">{ef("lbl_storageHumidity", "Umidade Relativa", { className: "text-[9px] font-semibold tracking-wide text-slate-500" })}</p>
              <p className="font-semibold text-slate-800 text-sm leading-snug">{ef("storageHumidity", cert.storageHumidity ?? "75% UR ± 5% UR")}</p>
            </div>
            <div className="p-4">
              <p className="text-[9px] font-semibold tracking-wide text-slate-500 mb-2">{ef("lbl_studyPeriodMonths", "Período do Estudo", { className: "text-[9px] font-semibold tracking-wide text-slate-500" })}</p>
              <p className="font-semibold text-slate-800 text-sm leading-snug">{ef("studyPeriodMonths", cert.studyPeriodMonths != null ? String(cert.studyPeriodMonths) + " meses" : "—")}</p>
            </div>
            <div className="p-4">
              <p className="text-[9px] font-semibold tracking-wide text-slate-500 mb-2">{ef("lbl_testIntervals", "Intervalos de Teste", { className: "text-[9px] font-semibold tracking-wide text-slate-500" })}</p>
              <p className="font-semibold text-slate-800 text-sm leading-snug">{ef("testIntervals", cert.testIntervals ?? "—")}</p>
            </div>
          </div>

          {/* ── Sub-cabeçalho: Datas ── */}
          <div className="bg-slate-50 border-b border-gray-300 px-5 py-2">
            <span className="text-[9px] font-semibold tracking-wide text-slate-500">Datas das Análises por Período</span>
          </div>
          <div className="grid grid-cols-3 divide-x divide-gray-300">
            <div className="p-4">
              <p className="text-[9px] font-semibold tracking-wide text-slate-500 mb-2">T0 — Início do Estudo</p>
              <p className="font-semibold text-slate-800 text-sm">
                <CertEditField value={getAnalysisDate("analysisDateT0", cert.analysisDates?.t0, 0)} onChange={v => setCertEdit("analysisDateT0", v)} className="w-full" />
              </p>
            </div>
            <div className="p-4">
              <p className="text-[9px] font-semibold tracking-wide text-slate-500 mb-2">T3 — 3 Meses</p>
              <p className="font-semibold text-slate-800 text-sm">
                <CertEditField value={getAnalysisDate("analysisDateT3", cert.analysisDates?.t3, 3)} onChange={v => setCertEdit("analysisDateT3", v)} className="w-full" />
              </p>
            </div>
            <div className="p-4">
              <p className="text-[9px] font-semibold tracking-wide text-slate-500 mb-2">T6 — 6 Meses</p>
              <p className="font-semibold text-slate-800 text-sm">
                <CertEditField value={getAnalysisDate("analysisDateT6", cert.analysisDates?.t6, 6)} onChange={v => setCertEdit("analysisDateT6", v)} className="w-full" />
              </p>
            </div>
          </div>
        </div>

        {/* ── CONDIÇÕES AMBIENTAIS ─────────────────────────────────────────── */}
        {show.condicoesAmbientais && (
          <div className="mb-10 border border-gray-200 rounded-lg overflow-hidden text-xs">
            <div className="bg-slate-700 px-5 py-1.5">
              <h2 className="text-[11px] font-semibold uppercase tracking-wider text-slate-100">Condições Ambientais</h2>
            </div>
            <div className="px-5 py-5 grid grid-cols-2 gap-x-8 gap-y-2">
              <div className="space-y-0.5">
                <div className="text-gray-500">{ef("lbl_amostragemTemp", "Amostragem — Temperatura:")}</div>
                {ef("samplingTemp", cert?.samplingTemp ?? "22,8°C", { className: "w-20 text-xs" })}
              </div>
              <div className="space-y-0.5">
                <div className="text-gray-500">{ef("lbl_amostragemUmid", "Amostragem — Umidade:")}</div>
                {ef("samplingHumidity", cert?.samplingHumidity ?? "60% UR", { className: "w-20 text-xs" })}
              </div>
              <div className="space-y-0.5">
                <div className="text-gray-500">{ef("lbl_recebimentoTemp", "Recebimento — Temperatura:")}</div>
                {ef("receptionTemp", cert?.receptionTemp ?? "22,8°C", { className: "w-20 text-xs" })}
              </div>
              <div className="space-y-0.5">
                <div className="text-gray-500">{ef("lbl_recebimentoUmid", "Recebimento — Umidade:")}</div>
                {ef("receptionHumidity", cert?.receptionHumidity ?? "60% UR", { className: "w-20 text-xs" })}
              </div>
            </div>
          </div>
        )}

        </div>{/* /cert-intro-block */}

        {/* ── MÉTODO DE ANÁLISE ────────────────────────────────────────────── */}
        <div className="cert-analysis-table mb-10 border border-gray-200 rounded-lg overflow-hidden text-sm">
          <div className="bg-slate-700 px-5 py-1.5">
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-slate-100">Método de Análise</h2>
          </div>
          <div className="px-0 py-0">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-slate-700 text-slate-100">
                <th className="border border-slate-500 px-2 py-2 text-left font-semibold uppercase tracking-wide w-28">{ef("thAnalise", "Analise")}</th>
                <th className="border border-slate-500 px-2 py-2 text-left font-semibold uppercase tracking-wide">{ef("thMetodo", "Metodo")}</th>
                <th className="border border-slate-500 px-2 py-2 text-left font-semibold uppercase tracking-wide w-28">{ef("thCriterios", "Critérios de Aceitação")}</th>
                <th className="border border-slate-500 px-2 py-2 text-center font-semibold uppercase tracking-wide w-20">{ef("thResultado", "Resultado")}</th>
                <th className="border border-slate-500 px-2 py-2 text-center font-semibold uppercase tracking-wide w-24">{ef("thStatus", "Status")}</th>
                <th className="border border-slate-500 px-2 py-2 text-center font-semibold uppercase tracking-wide w-10 print:hidden">
                  <span className="text-[9px] text-gray-400 uppercase tracking-wide">PDF</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {categories.map((cat) => {
                const catRows = rows.map((r, originalIndex) => ({ ...r, originalIndex })).filter(r => r.category === cat);
                if (catRows.length === 0) return null;
                const allCatHidden = catRows.every(r => !r.visible);
                return (
                  <>
                    <tr key={`cat-${cat}`} className={`cert-category-row ${allCatHidden ? "print:hidden" : ""}`}>
                      <td colSpan={6} className="border border-slate-300 px-3 py-1.5 bg-slate-100 font-bold text-[10px] uppercase tracking-wider text-slate-700">
                        {CATEGORY_LABELS[cat] ?? cat}
                      </td>
                    </tr>
                    {catRows.map((analysis, ci) => {
                      const isNC = analysis.status === "Nao Conforme";
                      return (
                      <tr
                        key={`${cat}-${ci}`}
                        className={[
                          isNC ? "bg-red-50" : ci % 2 === 0 ? "" : "bg-gray-50",
                          !analysis.visible ? "opacity-30 print:hidden" : "",
                        ].join(" ")}
                      >
                        <td className={`border px-2 py-1.5 font-medium align-top ${isNC ? "border-red-300 text-red-900" : "border-gray-300"}`}>{analysis.parameter}</td>
                        <td className={`border px-2 py-1.5 text-gray-600 align-top ${isNC ? "border-red-300" : "border-gray-300"}`}>
                          <CertEditField value={analysis.method} onChange={v => updateAnalysis(analysis.originalIndex, "method", v)} multiline className="text-xs leading-snug" />
                        </td>
                        <td className={`border px-2 py-1.5 font-mono align-top ${isNC ? "border-red-300" : "border-gray-300"}`}>
                          <CertEditField value={analysis.specification ?? ""} onChange={v => updateAnalysis(analysis.originalIndex, "specification", v)} className="text-xs w-full font-mono" />
                        </td>
                        <td className={`border px-2 py-1.5 text-center font-mono font-medium align-top ${isNC ? "border-red-300 text-red-800" : "border-gray-300"}`}>
                          <CertEditField value={analysis.result} onChange={v => updateAnalysis(analysis.originalIndex, "result", v)} className="text-xs text-center w-16 font-mono" />
                          {analysis.ativoMgInfo && (
                            <div className="mt-0.5 text-[10px] font-sans font-normal text-indigo-700 whitespace-nowrap leading-tight">
                              {analysis.ativoMgInfo}
                            </div>
                          )}
                        </td>
                        <td className={`border px-2 py-1.5 text-center align-top ${isNC ? "border-red-400 bg-red-200" : "border-gray-300"}`}>
                          <span className={`font-bold text-xs inline-flex items-center gap-1 ${
                            isNC ? "text-red-800"
                            : analysis.status === "Conforme" ? "text-green-700"
                            : analysis.status === "Aprovado com Ressalva" ? "text-amber-700"
                            : "text-gray-500"
                          }`}>
                            {isNC && <span className="inline-block w-2 h-2 rounded-full bg-red-600 shrink-0" />}
                            {analysis.status}
                          </span>
                        </td>
                        <td className={`border px-2 py-1.5 text-center align-middle print:hidden ${isNC ? "border-red-300" : "border-gray-300"}`}>
                          <input type="checkbox" checked={analysis.visible} onChange={() => toggleRowVisibility(analysis.originalIndex)} className="w-4 h-4 accent-primary cursor-pointer" />
                        </td>
                      </tr>
                      );
                    })}
                    {cat === "embalagem" && !allCatHidden && (
                      <tr key="embalagem-note">
                        <td colSpan={6} className="border border-gray-300 px-2 py-1.5 bg-amber-50 text-[10px] text-amber-800 italic">
                          {ef("notaEmbalagem", "* Os resultados de embalagem representam a média dos ensaios realizados ao longo dos 6 meses de estudo de estabilidade (T0, T3 e T6).", { multiline: true })}
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
          </div>
        </div>

        {/* ── OBSERVAÇÕES SOBRE OS LOTES ───────────────────────────────────── */}
        {show.textoLotes && (
          <div className="cert-section mb-10 border border-gray-200 rounded-lg overflow-hidden text-xs">
            <div className="bg-slate-700 px-5 py-1.5">
              <h2 className="text-[11px] font-semibold uppercase tracking-wider text-slate-100">Observações sobre os Lotes</h2>
            </div>
            <div className="px-5 py-5 text-gray-700 space-y-3">
              <p>{ef("textoLotes1", "Os lotes piloto foram produzidos em datas distintas, sob condições equivalentes de fabricação, visando assegurar a independência entre os lotes, a rastreabilidade do estudo e a minimização do risco de desvios operacionais ou interferências de processo.", { multiline: true })}</p>
              <p>{ef("textoLotes2", "Alimento está sendo testado em embalagem equivalente e sistema de fechamento nos quais será comercializado.", { multiline: true })}</p>
              <p>{ef("textoLotes3", "Os resultados apresentados neste certificado referem-se à média dos valores obtidos nos lotes piloto avaliados.", { multiline: true })}</p>
            </div>
          </div>
        )}

        {/* ── INFORMAÇÕES ADICIONAIS ───────────────────────────────────────── */}
        {show.infoAdicionais && (
          <div className="cert-section mb-10 border border-gray-200 rounded-lg overflow-hidden text-xs">
            <div className="bg-slate-700 px-5 py-1.5">
              <h2 className="text-[11px] font-semibold uppercase tracking-wider text-slate-100">Informações Adicionais</h2>
            </div>
            <div className="px-5 py-5 text-gray-700 space-y-2">
              <p>{ef("infoAdicionais1", "Este documento deve ser reproduzido integralmente. A reproducao parcial somente e permitida mediante autorizacao formal e escrita do laboratorio.", { multiline: true })}</p>
              <p>{ef("infoAdicionais2", "Os resultados apresentados referem-se exclusivamente as amostras recebidas e foram obtidos e reportados de acordo com as condicoes analiticas estabelecidas e metodologias aplicaveis.", { multiline: true })}</p>
              <p>{ef("infoAdicionais3", "NA = Nao se aplica   ND = Nao detectado   LQ = Limite de quantificacao   AR = Aprovado com Ressalva", { multiline: true })}</p>
            </div>
          </div>
        )}

        {/* ── CONCLUSÃO ────────────────────────────────────────────────────── */}
        {show.conclusao && (
          <div className="cert-section mb-10 border border-gray-200 rounded-lg overflow-hidden text-sm">
            <div className="bg-slate-700 px-5 py-1.5">
              <h2 className="text-[11px] font-semibold uppercase tracking-wider text-slate-100">Conclusão</h2>
            </div>
            <div className="px-5 py-5 text-center" style={{ overflowWrap: "anywhere", wordBreak: "break-word" }}>
              <span className="font-normal">{ef("conclusion", cert.conclusion, { multiline: true, className: "w-full text-sm font-normal" })}</span>
            </div>
          </div>
        )}

        {/* ── DELIBERAÇÃO ──────────────────────────────────────────────────── */}
        <div className="cert-section cert-deliberacao mb-10 border border-gray-200 rounded-lg overflow-hidden text-sm">
          <div className="bg-slate-700 px-5 py-1.5">
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-slate-100">Deliberação</h2>
          </div>
          <div className="px-5 py-5">
            {hasNonConforming && (
              <div className="mb-3 rounded border border-red-400 bg-red-50 px-3 py-2 print:border-red-600 print:bg-red-50">
                <p className="text-xs font-bold text-red-700 uppercase tracking-wide">⚠ Atenção — Resultado(s) Fora do Especificado</p>
                <p className="text-xs text-red-600 mt-0.5">
                  Este protocolo contém um ou mais parâmetros com resultado <strong>Não Conforme</strong>.
                  O status do certificado foi automaticamente alterado para <strong>REPROVADO</strong>.
                </p>
              </div>
            )}
            <div className="flex items-center gap-8">
              <div className="flex items-center gap-3">
                <div className={`w-5 h-5 border-2 flex items-center justify-center ${effectiveIsApproved ? "border-gray-800 bg-gray-800" : "border-gray-400"}`}>
                  {effectiveIsApproved && <span className="text-white text-xs font-bold">X</span>}
                </div>
                <span className="font-medium">
                  APROVADO
                  {cert.finalStatus === "aprovado_com_ressalva" && effectiveIsApproved && (
                    <span className="ml-1 text-amber-700 font-semibold text-xs">(COM RESSALVA)</span>
                  )}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <div className={`w-5 h-5 border-2 flex items-center justify-center ${effectiveIsRepproved ? "border-red-700 bg-red-700" : "border-gray-400"}`}>
                  {effectiveIsRepproved && <span className="text-white text-xs font-bold">X</span>}
                </div>
                <span className={`font-medium ${effectiveIsRepproved ? "text-red-700" : ""}`}>REPROVADO</span>
              </div>
              {(getEdit("issueDate", cert.issueDate)) && <span className="ml-auto text-gray-500 text-xs">DATA: {fmtDate(getEdit("issueDate", cert.issueDate))}</span>}
            </div>
          </div>
        </div>

        {/* ── NOTA DE RESSALVA ──────────────────────────────────────────────── */}
        {isAR && cert.ressalva && show.ressalvaNote && (
          <div className="cert-section mb-10 border border-amber-300 rounded-lg overflow-hidden text-xs">
            <div className="bg-slate-700 px-5 py-1.5 flex items-center gap-2">
              <span className="text-amber-400 text-sm">⚠</span>
              <h2 className="text-[11px] font-semibold uppercase tracking-wider text-slate-100">Nota de Ressalva</h2>
            </div>
            <div className="px-5 py-5 bg-amber-50/30">
              <p className="text-xs text-amber-900 leading-relaxed whitespace-pre-wrap">{cert.ressalva}</p>
            </div>
          </div>
        )}

        {(() => {
          const kParams = kineticsData?.parameters ?? [];
          const validParams = kParams.filter(p => p !== null && p.k != null && p.k > 0) as NonNullable<typeof kParams[number]>[];
          const limiting = kineticsData?.limitingParameter ?? null;
          const estimatedMonths = kineticsData?.estimatedShelfLifeMonths ?? null;
          const recommendedMonths = kineticsData?.recommendedValidityMonths ?? null;
          const practicedMonths = (cert as any).validityMonths as number | null ?? null;
          const hasData = validParams.length > 0;

          if (!show.cineticaProtocolo) return null;
          return (
            <div className="cert-kinetica-block mb-6 rounded border border-blue-200 overflow-hidden text-xs text-gray-700">
              {/* Accordion header — screen only */}
              <div
                className="print:hidden flex items-center justify-between px-4 py-2 bg-blue-50 border-b border-blue-200 cursor-pointer hover:bg-blue-100 transition-colors select-none"
                onClick={() => setCineticaExpanded(v => !v)}
              >
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-gray-800 uppercase tracking-wide text-[11px]">Parâmetros Cinéticos e Estimativa de Validade</span>
                  {!cineticaExpanded && (
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${show.cineticaProtocolo ? "bg-green-50 border-green-300 text-green-700" : "bg-gray-100 border-gray-300 text-gray-500"}`}>
                      {show.cineticaProtocolo ? "✓ Na impressão" : "✗ Oculto na impressão"}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={e => { e.stopPropagation(); toggle("cineticaProtocolo"); }}
                    className={`flex items-center gap-1.5 text-[10px] px-2 py-0.5 rounded border transition-colors ${show.cineticaProtocolo ? "border-blue-300 bg-blue-100 text-blue-700 hover:bg-blue-200" : "border-green-300 bg-green-100 text-green-700 hover:bg-green-200"}`}
                    title="Clique para incluir/ocultar este bloco na impressão"
                  >
                    {show.cineticaProtocolo ? "✕ Ocultar na impressão" : "✓ Incluir na impressão"}
                  </button>
                  {cineticaExpanded ? <ChevronUp className="h-4 w-4 text-blue-500" /> : <ChevronDown className="h-4 w-4 text-blue-500" />}
                </div>
              </div>

              {/* Content — hidden on screen when collapsed, but always printed when show=true */}
              <div className={`bg-blue-50/40 p-4 space-y-3 ${!cineticaExpanded ? "hidden print:block" : ""}`}>
                <p className="font-semibold text-gray-800 uppercase tracking-wide text-[11px] hidden print:block">Parâmetros Cinéticos e Estimativa de Validade</p>
                {!hasData ? (
                  <p className="text-gray-400 italic">Dados cinéticos insuficientes (requer resultados de teor nos tempos T3 e T6).</p>
                ) : (
                  <>
                    <table className="w-full text-[10px] border-collapse">
                      <thead>
                        <tr className="bg-blue-100/60">
                          <th className="border border-blue-200 px-2 py-1 text-left font-semibold">Ativo</th>
                          <th className="border border-blue-200 px-2 py-1 text-center font-semibold">T0 (%)</th>
                          <th className="border border-blue-200 px-2 py-1 text-center font-semibold">T3 (%)</th>
                          <th className="border border-blue-200 px-2 py-1 text-center font-semibold">T6 (%)</th>
                          <th className="border border-blue-200 px-2 py-1 text-center font-semibold">k (mês⁻¹)</th>
                          <th className="border border-blue-200 px-2 py-1 text-center font-semibold">Validade Calc. (meses)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {validParams.map(p => {
                          const isLimiting = p.parameter === limiting;
                          return (
                            <tr key={p.parameter} className={isLimiting ? "bg-amber-50" : ""}>
                              <td className={`border border-blue-200 px-2 py-1 font-medium ${isLimiting ? "text-amber-800" : ""}`}>
                                {p.parameter}{isLimiting && <span className="ml-1 text-amber-600 font-bold">★</span>}
                              </td>
                              <td className="border border-blue-200 px-2 py-1 text-center">{p.t0 != null ? p.t0.toFixed(2) : "—"}</td>
                              <td className="border border-blue-200 px-2 py-1 text-center">{p.t3 != null ? p.t3.toFixed(2) : "—"}</td>
                              <td className="border border-blue-200 px-2 py-1 text-center">{p.t6 != null ? p.t6.toFixed(2) : "—"}</td>
                              <td className="border border-blue-200 px-2 py-1 text-center font-mono">{p.k != null ? p.k.toFixed(5) : "—"}</td>
                              <td className="border border-blue-200 px-2 py-1 text-center font-semibold">
                                {p.estimatedShelfLifeMonths != null ? p.estimatedShelfLifeMonths.toFixed(1) : "—"}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>

                    <div className="grid grid-cols-2 gap-4 pt-1">
                      <div className="space-y-1">
                        {limiting && (
                          <p><span className="text-gray-500">Ativo com maior degradação: </span><span className="font-semibold text-amber-700">★ {limiting}</span></p>
                        )}
                        {estimatedMonths != null && (
                          <p><span className="text-gray-500">Validade calculada (ICH Q1A): </span><span className="font-semibold">{estimatedMonths.toFixed(1)} meses</span></p>
                        )}
                        {recommendedMonths != null && (
                          <p><span className="text-gray-500">Validade recomendada: </span><span className="font-semibold">{recommendedMonths} meses</span></p>
                        )}
                      </div>
                      <div className="space-y-1">
                        {practicedMonths != null && (
                          <p><span className="text-gray-500">Validade praticada (rótulo): </span><span className="font-semibold">{practicedMonths} meses</span></p>
                        )}
                        {practicedMonths != null && recommendedMonths != null && (
                          <p>
                            <span className="text-gray-500">Situação: </span>
                            {practicedMonths <= recommendedMonths
                              ? <span className="font-semibold text-green-700">✓ Compatível — validade praticada ≤ validade calculada</span>
                              : <span className="font-semibold text-red-700">⚠ Atenção — validade praticada excede a calculada</span>
                            }
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="mt-2 border-l-2 border-blue-300 pl-3 bg-blue-50/50 py-1.5 pr-2 rounded-r text-[10px] text-gray-700">
                      <span className="font-semibold text-gray-500 uppercase tracking-wide text-[9px]">Observações: </span>
                      {ef("kineticsNotes", cert.kineticsNotes, { multiline: true })}
                    </div>
                  </>
                )}
              </div>
            </div>
          );
        })()}

        {show.fundamentacaoCinetica && <div className="cert-kinetica-block mb-6 rounded border border-gray-200 overflow-hidden text-xs text-gray-700">
          {/* Accordion header — screen only */}
          <div
            className="print:hidden flex items-center justify-between px-4 py-2 bg-gray-100 border-b border-gray-200 cursor-pointer hover:bg-gray-200 transition-colors select-none"
            onClick={() => setFundamentacaoExpanded(v => !v)}
          >
            <div className="flex items-center gap-2">
              <span className="font-semibold text-gray-800 uppercase tracking-wide text-[11px]">Fundamentação do Modelo Cinético</span>
              {!fundamentacaoExpanded && (
                <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${show.fundamentacaoCinetica ? "bg-green-50 border-green-300 text-green-700" : "bg-gray-100 border-gray-300 text-gray-500"}`}>
                  {show.fundamentacaoCinetica ? "✓ Na impressão" : "✗ Oculto na impressão"}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={e => { e.stopPropagation(); toggle("fundamentacaoCinetica"); }}
                className={`flex items-center gap-1.5 text-[10px] px-2 py-0.5 rounded border transition-colors ${show.fundamentacaoCinetica ? "border-gray-400 bg-gray-200 text-gray-700 hover:bg-gray-300" : "border-green-300 bg-green-100 text-green-700 hover:bg-green-200"}`}
                title="Clique para incluir/ocultar este bloco na impressão"
              >
                {show.fundamentacaoCinetica ? "✕ Ocultar na impressão" : "✓ Incluir na impressão"}
              </button>
              {fundamentacaoExpanded ? <ChevronUp className="h-4 w-4 text-gray-500" /> : <ChevronDown className="h-4 w-4 text-gray-500" />}
            </div>
          </div>

          {/* Content — hidden on screen when collapsed, but always printed when show=true */}
          <div className={`bg-gray-50 p-4 space-y-3 ${!fundamentacaoExpanded ? "hidden print:block" : ""}`}>
            <p className="font-semibold text-gray-800 uppercase tracking-wide hidden print:block">Fundamentação do Modelo Cinético</p>
            <p className="leading-relaxed">{ef("fundamentacaoTexto", "Para a estimativa do tempo de validade do produto, foi empregado o modelo cinético de degradação de primeira ordem, amplamente descrito na literatura para substâncias bioativas submetidas à avaliação de estabilidade sob condições de estresse controlado, como temperatura e umidade.", { multiline: true })}</p>
            <p className="font-mono bg-white border border-gray-200 rounded px-3 py-1.5 inline-block">C<sub>t</sub> = C<sub>0</sub> · e<sup>−kt</sup></p>
            <p className="font-mono bg-white border border-gray-200 rounded px-3 py-1.5 inline-block ml-4">k = A · e<sup>−E<sub>a</sub>/RT</sup></p>
          </div>
        </div>}

        {/* ══ ASSINATURAS ELETRÔNICAS + RODAPÉ INTEGRADO ══════════════════ */}
        {(() => {
          const leftName  = cert.issuedBy    ?? "";
          const rightName = cert.seniorAnalyst ?? "";
          const leftSigs  = signatures.filter(s => sigNameMatches(s.userDisplay, leftName));
          const rightSigs = signatures.filter(s => sigNameMatches(s.userDisplay, rightName));
          const otherSigs = signatures.filter(s =>
            !sigNameMatches(s.userDisplay, leftName) && !sigNameMatches(s.userDisplay, rightName)
          );
          const userInLeft   = !!auth?.user && sigNameMatches(auth.user.displayName, leftName);
          const userInRight  = !!auth?.user && sigNameMatches(auth.user.displayName, rightName);
          const userInOther  = !!auth?.user && !userInLeft && !userInRight;

          const SigCard = ({ sig, displayName, roleLine, emailLine }: {
            sig: typeof signatures[0];
            displayName: React.ReactNode;
            roleLine: React.ReactNode;
            emailLine?: React.ReactNode;
          }) => (
            <div className="relative mb-1">
              {auth?.user && (auth.isAdmin || auth.hasPermission?.("signatures:delete") || sig.userId === auth.user.id) && (
                <button
                  type="button"
                  title="Remover assinatura"
                  onClick={() => deleteSig.mutate({ id: Number(id), sigId: sig.id })}
                  className="print:hidden absolute top-0 right-0 text-gray-300 hover:text-red-500 transition-colors z-10"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
              <p style={{ fontFamily: "'Dancing Script', cursive", fontSize: "1.1rem", lineHeight: 1.3, color: "#111827", fontWeight: 600, letterSpacing: "0.01em" }}>
                {displayName}
              </p>
              <p className="text-[10px] text-gray-400 flex items-center gap-1 mt-0.5 mb-2">
                <ShieldCheck className="h-3 w-3 text-gray-400 flex-shrink-0" />
                {sig.displayDate
                  ? sig.displayDate
                  : new Date(sig.signedAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" })}
              </p>
              <div className="border-t border-gray-300 mb-2" />
              <p className="font-semibold text-sm text-gray-800">{displayName}</p>
              {emailLine && <p className="text-xs text-gray-400">{emailLine}</p>}
            </div>
          );

          const canSign = auth?.isAdmin || auth?.hasPermission?.("signatures:sign");
          const SignBtn = ({ preRole }: { preRole?: string }) => !canSign ? null : (
            <button
              type="button"
              onClick={() => {
                if (preRole) setSelectedRoleLabel(preRole);
                setSigDateChoice("emissao");
                const now = new Date();
                setSigCustomTime(`${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")}:${String(now.getSeconds()).padStart(2,"0")}`);
                setSigCustomEmissaoDate(cert.issueDate ?? new Date().toISOString().split("T")[0]!);
                setSigDialogOpen(true);
              }}
              className="print:hidden flex items-center gap-1.5 text-[10px] px-2.5 py-1 rounded border border-primary/40 bg-primary/8 text-primary hover:bg-primary/15 transition-colors font-medium mb-3 w-full justify-center"
            >
              <PenLine className="h-3 w-3" /> Assinar digitalmente
            </button>
          );

          return (
            <>
              {/* Signature dialog — screen only */}
              {sigDialogOpen && (() => {
                const initials = (auth?.user?.displayName ?? "?").split(" ").filter(Boolean).slice(0, 2).map(n => n[0]?.toUpperCase()).join("");
                const todayDateStr = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
                const nowStr = `${todayDateStr}, ${sigCustomTime}`;
                const fmtInputDate = (d: string) => { const [y,m,day] = d.split("-"); return day && m && y ? `${day}/${m}/${y}` : "—"; };
                const emissaoStr = sigCustomEmissaoDate ? fmtInputDate(sigCustomEmissaoDate) : (fmtDate(cert.issueDate) || "—");
                return (
                  <div className="print:hidden fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setSigDialogOpen(false)}>
                    <div className="bg-white rounded-xl shadow-2xl w-[420px] max-w-[95vw] max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                      {/* Header */}
                      <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100">
                        <h3 className="font-bold text-base flex items-center gap-2 text-gray-900">
                          <PenLine className="h-4 w-4 text-primary" /> Assinar Digitalmente
                        </h3>
                        <button type="button" onClick={() => setSigDialogOpen(false)} className="text-gray-400 hover:text-gray-700 rounded-full hover:bg-gray-100 w-7 h-7 flex items-center justify-center transition-colors">
                          <span className="text-xl leading-none">×</span>
                        </button>
                      </div>

                      <div className="px-6 py-4 space-y-4">
                        <p className="text-xs text-gray-500">Confirme os dados abaixo. A assinatura será registrada com seu nome de usuário.</p>

                        {/* User card */}
                        <div className="border border-gray-200 rounded-lg p-3 flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-white font-bold text-sm flex-shrink-0">{initials}</div>
                          <div className="min-w-0">
                            <p className="font-semibold text-sm text-gray-900 truncate">{auth?.user?.displayName}</p>
                            <p className="text-xs text-gray-400 capitalize">{auth?.user?.role === "admin" ? "Admin" : "Analista"}</p>
                            <p className="text-[10px] text-emerald-600 flex items-center gap-1 mt-0.5"><ShieldCheck className="h-3 w-3" /> Usuário verificado</p>
                          </div>
                        </div>

                        {/* Signature preview */}
                        <div className="border border-gray-200 rounded-lg p-3 bg-gray-50/50">
                          <p className="text-[9px] font-semibold uppercase tracking-widest text-gray-400 mb-1 text-center">Prévia da assinatura</p>
                          <p style={{ fontFamily: "'Dancing Script', cursive", fontSize: "1.4rem", lineHeight: 1.4, color: "#111827", fontWeight: 600, textAlign: "center" }}>
                            {auth?.user?.displayName}
                          </p>
                        </div>

                        {/* Role */}
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1.5">Cargo / Função nesta assinatura</label>
                          <select
                            value={selectedRoleLabel}
                            onChange={e => setSelectedRoleLabel(e.target.value)}
                            className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                          >
                            {["Elaborador", "Analista Sênior", "Aprovador", "Revisor", "Gestor de Qualidade", "Responsável Técnico", "Representante Legal"].map(r => (
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
                              const sub   = isEmissao ? emissaoStr : todayDateStr;
                              const sel   = sigDateChoice === opt;
                              return (
                                <div key={opt}>
                                  <button
                                    type="button"
                                    onClick={() => setSigDateChoice(opt)}
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
                                        value={sigCustomEmissaoDate}
                                        onChange={e => setSigCustomEmissaoDate(e.target.value)}
                                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                                      />
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {/* Time row — always visible */}
                        <div className="flex items-center gap-3">
                          <label className="text-xs font-medium text-gray-700 w-14 flex-shrink-0">Horário</label>
                          <input
                            type="time"
                            step="1"
                            value={sigCustomTime}
                            onChange={e => setSigCustomTime(e.target.value)}
                            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                          />
                          <span className="text-xs text-gray-400">Altere se necessário</span>
                        </div>
                      </div>

                      {/* Footer */}
                      <div className="flex gap-3 px-6 pb-5 pt-2">
                        <button type="button" onClick={() => setSigDialogOpen(false)} className="flex-1 text-sm px-4 py-2.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 font-medium transition-colors">Cancelar</button>
                        <button
                          type="button"
                          disabled={addSig.isPending}
                          onClick={() => addSig.mutate({
                            id: Number(id),
                            data: {
                              roleLabel: selectedRoleLabel,
                              displayDate: sigDateChoice === "emissao"
                                ? `${emissaoStr}, ${sigCustomTime}`
                                : `${todayDateStr}, ${sigCustomTime}`,
                            },
                          })}
                          className="flex-1 text-sm px-4 py-2.5 rounded-lg bg-primary text-white hover:bg-primary/90 disabled:opacity-50 font-semibold flex items-center justify-center gap-2 transition-colors"
                        >
                          <ShieldCheck className="h-4 w-4" />
                          {addSig.isPending ? "Assinando..." : "Confirmar Assinatura"}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* ── ASSINATURAS ─────────────────────────────────────────────── */}
              <div className="cert-signatures border border-gray-300 rounded-lg overflow-hidden">
                <div className="bg-slate-700 px-5 py-1.5">
                  <h2 className="text-[11px] font-semibold uppercase tracking-wider text-slate-100 flex items-center gap-1.5">
                    <ShieldCheck className="h-3 w-3" /> Assinaturas
                  </h2>
                </div>
                <div className="px-4 py-4">
                  <div className="grid grid-cols-2 gap-8">
                    {/* LEFT — Responsável Técnico */}
                    <div>
                      {leftSigs.length > 0 ? (
                        leftSigs.map(s => (
                          <SigCard
                            key={s.id}
                            sig={s}
                            displayName={ef("issuedBy", cert.issuedBy)}
                            roleLine={ef("lbl_cargoEsquerdo", "Responsável Técnico")}
                            emailLine={ef("issuedByEmail", cert.issuedByEmail)}
                          />
                        ))
                      ) : (
                        <>
                          <div className="min-h-[68px] flex flex-col justify-end pb-2">
                            <p style={{ fontFamily: "'Dancing Script', cursive", fontSize: "1.1rem", lineHeight: 1.3, color: "#d1d5db", fontWeight: 600, letterSpacing: "0.01em" }} className="mb-1">
                              {ef("issuedBy", cert.issuedBy)}
                            </p>
                            {userInLeft && !currentUserAlreadySigned ? (
                              <SignBtn preRole="Responsável Técnico" />
                            ) : (
                              <p className="text-[10px] text-gray-300 italic mb-2">Aguardando assinatura...</p>
                            )}
                          </div>
                          <div className="border-t border-gray-400 mb-2" />
                          <p className="font-semibold text-sm text-gray-800">{ef("issuedBy", cert.issuedBy)}</p>
                          <p className="text-xs text-gray-400">{ef("issuedByEmail", cert.issuedByEmail)}</p>
                        </>
                      )}
                    </div>

                    {/* RIGHT — Analista Sênior / Representante Legal */}
                    <div>
                      {rightSigs.length > 0 ? (
                        rightSigs.map(s => (
                          <SigCard
                            key={s.id}
                            sig={s}
                            displayName={ef("seniorAnalyst", cert.seniorAnalyst)}
                            roleLine={ef("lbl_cargoDireito", "Analista Sênior / Representante Legal")}
                            emailLine={ef("seniorAnalystEmail", cert.seniorAnalystEmail)}
                          />
                        ))
                      ) : (
                        <>
                          <div className="min-h-[68px] flex flex-col justify-end pb-2">
                            <p style={{ fontFamily: "'Dancing Script', cursive", fontSize: "1.1rem", lineHeight: 1.3, color: "#d1d5db", fontWeight: 600, letterSpacing: "0.01em" }} className="mb-1">
                              {ef("seniorAnalyst", cert.seniorAnalyst)}
                            </p>
                            {userInRight && !currentUserAlreadySigned ? (
                              <SignBtn preRole="Analista Sênior" />
                            ) : (
                              <p className="text-[10px] text-gray-300 italic mb-2">Aguardando assinatura...</p>
                            )}
                          </div>
                          <div className="border-t border-gray-400 mb-2" />
                          <p className="font-semibold text-sm text-gray-800">{ef("seniorAnalyst", cert.seniorAnalyst)}</p>
                          <p className="text-xs text-gray-400">{ef("seniorAnalystEmail", cert.seniorAnalystEmail)}</p>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Extra signers (not matching either column) */}
                  {(otherSigs.length > 0 || (userInOther && !currentUserAlreadySigned)) && (
                    <div className="mt-4 pt-3 border-t border-dashed border-gray-200">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400 flex items-center gap-1">
                          <ShieldCheck className="h-3 w-3" /> Outras Assinaturas
                        </span>
                        {userInOther && !currentUserAlreadySigned && (
                          <button
                            type="button"
                            onClick={() => setSigDialogOpen(true)}
                            className="print:hidden flex items-center gap-1 text-[10px] px-2.5 py-1 rounded border border-primary/40 bg-primary/8 text-primary hover:bg-primary/15 font-medium"
                          >
                            <PenLine className="h-2.5 w-2.5" /> Assinar
                          </button>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-6">
                        {otherSigs.map(s => (
                          <SigCard
                            key={s.id}
                            sig={s}
                            displayName={s.userDisplay}
                            roleLine={s.roleLabel}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* ── RODAPÉ DO DOCUMENTO ───────────────────────────────── */}
              {(() => {
                const lastSig = [...signatures].sort(
                  (a, b) => new Date(b.signedAt).getTime() - new Date(a.signedAt).getTime()
                )[0];
                const lastSigDate = lastSig
                  ? (lastSig.displayDate
                      ?? new Date(lastSig.signedAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" }))
                  : new Date().toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });
                const cnpjDisplay = getEdit("cnpj", cert.cnpj) || cert.cnpj || "";
                return (
                  <div className="mt-6 pt-3 border-t border-gray-200 text-center text-[9px] text-gray-400 leading-relaxed">
                    <span className="font-medium text-gray-500">Documento gerado em</span>
                    <br />
                    <span>{lastSigDate}</span>
                    <br />
                    <span>— Sistema Protocolo Técnico ANVISA — ALPHAFITUS Laboratório Nutracêutico — CNPJ {cnpjDisplay} —</span>
                  </div>
                );
              })()}
            </>
          );
        })()}

        {/* ═══════════════════════════════════════════════════════
            REFERÊNCIAS BIBLIOGRÁFICAS — anexo opcional
        ═══════════════════════════════════════════════════════ */}
        {show.referencias && protocolRefs.length > 0 && (
          <div className={`referencias-appendix-section ${!show.referencias ? "print:hidden" : ""}`}>
            <div className="pt-8 border-t-2 border-gray-800 mt-8">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-100">Alphafitus Laboratório Nutracêutico</p>
                  <h2 className="text-lg font-bold uppercase tracking-wide mt-0.5">
                    Referências Bibliográficas
                  </h2>
                </div>
                <div className="text-right text-xs text-gray-500">
                  <p>{cert.productName}</p>
                  <p className="font-semibold">{cert.certNumber}</p>
                </div>
              </div>
              <p className="text-xs text-gray-500 border-b border-gray-300 pb-3 mb-4">
                Referências técnicas e científicas que fundamentam as metodologias analíticas e os critérios de estabilidade adotados neste protocolo, apresentadas conforme ABNT NBR 6023.
              </p>
              <ol className="space-y-2 text-[10px] text-gray-700 list-decimal list-inside">
                {protocolRefs.map((ref, i) => (
                  <li key={ref.id} className="leading-relaxed">
                    <span className="font-semibold text-gray-900 mr-1">[{i + 1}]</span>
                    {formatAbntRef(ref)}
                  </li>
                ))}
              </ol>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════
            AUDIT TRAIL COMPLEMENT — prints after main certificate
        ═══════════════════════════════════════════════════════ */}
        {includeHistory && (
          <div className="audit-appendix-section">
            <div className="pt-8 border-t-2 border-gray-800 mt-8">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-100">Alphafitus Laboratório Nutracêutico</p>
                  <h2 className="text-lg font-bold uppercase tracking-wide mt-0.5 flex items-center gap-2">
                    Anexo — Histórico de Alterações do Protocolo
                  </h2>
                </div>
                <div className="text-right text-xs text-gray-500">
                  <p>{cert.productName}</p>
                  <p className="font-semibold">{cert.certNumber}</p>
                  <p>{ef("issueDate", fmtDate(cert.issueDate) as string)}</p>
                </div>
              </div>
              <p className="text-xs text-gray-500 border-b border-gray-300 pb-3 mb-4">
                Este anexo registra todas as alterações realizadas no protocolo de estabilidade, com identificação do responsável e data/hora de cada operação, para fins de rastreabilidade e conformidade regulatória.
              </p>
              <div className="text-xs">
                <div className="grid grid-cols-[7rem_6rem_7rem_1fr] gap-x-3 font-bold uppercase text-gray-600 border-b border-gray-400 pb-1 mb-1 text-[10px] tracking-wide">
                  <span>Data/Hora</span><span>Tipo</span><span>Responsável</span><span>Descrição</span>
                </div>
                <AuditTrail protocolId={Number(id)} printMode />
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════
            PHOTO APPENDIX — prints on its own page(s)
        ═══════════════════════════════════════════════════════ */}
        {includePhotos && visiblePhotoEntries.length > 0 && (
          <div className="photo-appendix-section">
            {/* Page-break header */}
            <div className="photo-appendix-header pt-8 border-t-2 border-gray-800 mt-8">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-100">Alphafitus Laboratório Nutracêutico</p>
                  <h2 className="text-lg font-bold uppercase tracking-wide mt-0.5">Anexo — Registros Fotográficos dos Ensaios</h2>
                </div>
                <div className="text-right text-xs text-gray-500">
                  <p>{cert.productName}</p>
                  <p className="font-semibold">{cert.certNumber}</p>
                  <p>{fmtDate(getEdit("issueDate", cert.issueDate))}</p>
                </div>
              </div>
              <p className="text-xs text-gray-500 border-b border-gray-300 pb-3 mb-4">
                Este anexo apresenta os registros fotográficos obtidos durante a execução dos ensaios de estabilidade. As imagens estão organizadas por parâmetro analítico, lote piloto e período de avaliação.
              </p>
            </div>

            {/* Photo groups */}
            {(() => {
              const grouped: Record<string, PhotoEntry[]> = {};
              for (const e of visiblePhotoEntries) {
                const groupKey = `${e.category}||${e.parameter}`;
                (grouped[groupKey] ??= []).push(e);
              }
              let imgCounter = 0;
              return Object.entries(grouped).map(([groupKey, entries]) => {
                const [catKey, param] = groupKey.split("||");
                const catLabel = CATEGORY_LABELS[catKey] ?? catKey;
                return (
                  <div key={groupKey} className="photo-param-group mb-8">
                    {/* Group header */}
                    <div className="flex items-baseline gap-3 mb-2 pb-1.5 border-b-2 border-gray-700">
                      <h3 className="text-sm font-bold uppercase tracking-wide text-gray-800">{param}</h3>
                      <span className="text-[10px] px-2 py-0.5 rounded bg-gray-200 text-gray-600 font-semibold uppercase tracking-wide border border-gray-300">
                        {catLabel}
                      </span>
                    </div>
                    {/* Technical description — pre-filled, editable, persisted */}
                    <div className="mb-3">
                      <textarea
                        value={getDescription(param)}
                        onChange={e => setPhotoDescription(param, e.target.value)}
                        rows={3}
                        className="w-full text-[10px] text-gray-600 leading-relaxed bg-transparent border border-dashed border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:border-gray-500 resize-none print:border-none print:p-0"
                        style={{ fontFamily: "inherit" }}
                        title="Clique para editar a descrição deste ensaio"
                      />
                    </div>
                    {entries.map((entry, ei) => (
                      <div key={ei} className="mb-5">
                        {/* Sub-header per lot × period */}
                        <p className="text-xs font-semibold text-gray-600 mb-2 bg-gray-100 px-2 py-1 rounded border border-gray-200 inline-flex items-center gap-3">
                          <span>Lote: <strong className="text-gray-800">{entry.lotNumber}</strong></span>
                          <span>·</span>
                          <span>Período: <strong className="text-gray-800">T{entry.period}</strong></span>
                          <span>·</span>
                          <span>{entry.images.length} imagem(ns)</span>
                        </p>
                        {/* Photo grid */}
                        <div className="photo-grid flex flex-wrap gap-4 mt-2">
                          {entry.images.map((img, ii) => {
                            imgCounter += 1;
                            const figNum = imgCounter;
                            return (
                              <figure key={ii} className="photo-figure flex flex-col items-center">
                                <div
                                  className="border-2 border-gray-300 rounded overflow-hidden shadow-sm print:cursor-default cursor-zoom-in"
                                  onClick={() => setLightboxSrc(img)}
                                  title="Clique para ver em tamanho real"
                                >
                                  <img
                                    src={img}
                                    alt={`${param} — Lote ${entry.lotNumber} — T${entry.period} — Imagem ${ii + 1}`}
                                    className="photo-img block object-cover"
                                    style={{ width: 200, height: 200 }}
                                  />
                                </div>
                                <figcaption className="mt-1 text-center max-w-52">
                                  <p className="text-[10px] font-bold text-gray-700">Fig. {figNum}</p>
                                  <p className="text-[9px] text-gray-500 leading-tight">
                                    {param} · Lote {entry.lotNumber} · T{entry.period}
                                  </p>
                                  <p className="text-[9px] text-gray-400">{catLabel}</p>
                                </figcaption>
                              </figure>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              });
            })()}

            {/* Appendix footer */}
            <div className="pt-4 border-t border-gray-300 mt-6">
              <p className="text-[9px] text-gray-400 text-center">
                Fim do Anexo Fotográfico — {totalSelectedImages} imagem(ns) referentes a {visiblePhotoEntries.length} ensaio(s) — {cert.certNumber} — {fmtDate(getEdit("issueDate", cert.issueDate))}
              </p>
            </div>
          </div>
        )}

        {/* Placeholder in document when photos exist but panel was found above */}
        {includePhotos && allPhotoEntries.length > 0 && visiblePhotoEntries.length === 0 && (
          <div className="mt-8 pt-4 border-t border-dashed border-gray-300 text-center text-xs text-gray-400 print:hidden">
            Nenhuma imagem selecionada no painel acima. O anexo fotográfico não será incluído no PDF.
          </div>
        )}
      </div>

      {/* Lightbox overlay — opens when a photo thumbnail is clicked */}
      {lightboxSrc && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 print:hidden"
          onClick={() => setLightboxSrc(null)}
        >
          <div className="relative max-w-[90vw] max-h-[90vh]" onClick={e => e.stopPropagation()}>
            <button
              className="absolute -top-9 right-0 text-white/80 hover:text-white text-sm font-medium flex items-center gap-1"
              onClick={() => setLightboxSrc(null)}
            >
              ✕ Fechar
            </button>
            <img
              src={lightboxSrc}
              alt="Imagem ampliada"
              className="max-w-[90vw] max-h-[90vh] object-contain rounded shadow-2xl border border-white/10"
            />
            <a
              href={lightboxSrc}
              download
              className="absolute -bottom-9 right-0 text-white/70 hover:text-white text-xs underline"
              onClick={e => e.stopPropagation()}
            >
              ⬇ Salvar imagem
            </a>
          </div>
        </div>
      )}

      <style>{`
        /* ══ MARGENS DE PÁGINA ══════════════════════════════════════════════════ */
        @page {
          size: A4 portrait;
          /* margin: 0 remove o cabeçalho/rodapé automático do Chrome
             (data, URL, número de página) do PDF gerado via Ctrl+P.
             O certificado gerencia suas próprias margens via padding. */
          margin: 0;
        }

        @media print {

          /* ── 1. Zerar html/body para eliminar margens do app ─────────────────── */
          html, body {
            margin: 0 !important;
            padding: 0 !important;
            overflow: visible !important;
            height: auto !important;
            background: white !important;
          }

          /* ── 2. Ocultar todo o conteúdo por visibilidade ──────────────────────
             Usamos visibility (não display) para manter o layout intacto e só
             revelar o certificado abaixo.                                        */
          body * { visibility: hidden !important; }

          /* ── 3. Revelar APENAS o certificado e seus filhos ───────────────────── */
          #certificate-document,
          #certificate-document * { visibility: visible !important; }

          /* ── 4. Ocultar o chrome do app (sidebar, header, toolbar, painéis) ─── */
          .print\:hidden         { display: none !important; }
          #root aside            { display: none !important; }
          #root header           { display: none !important; }

          /* ── 5. Ancorar o certificado — preenche toda a folha A4 ───────────────
             Com @page { margin: 0 }, não há margem de página — o certificado
             ocupa 100% da área física. Usamos padding próprio para as margens
             visuais do documento (equivalente às margens ABNT: 20mm × 15mm).  */
          #certificate-document {
            position: absolute !important;
            top: 0 !important;
            left: 0 !important;
            right: 0 !important;
            display: block !important;
            width: 100% !important;
            max-width: 100% !important;
            margin: 0 !important;
            padding: 9mm 12mm !important;
            box-shadow: none !important;
            border: none !important;
            border-radius: 0 !important;
            font-size: 8pt !important;
            line-height: 1.4 !important;
            overflow: visible !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          /* ── 5a2. Escala de fontes: sobrescreve classes Tailwind px-based ──────
             font-size:8pt no container NÃO afeta text-xl/sm/xs (usam px).
             Forçamos cada classe explicitamente para documento técnico compacto. */
          /* ── Escala de fontes: valores legíveis para documento técnico ──────────
             Referência: ANVISA usa ~8-9pt para corpo, seções menores 7pt.
             text-sm (14px nativo) → 8pt, text-xs (12px) → 7pt            */

          /* Classes Tailwind padrão */
          #certificate-document .text-3xl  { font-size: 13pt !important; }
          #certificate-document .text-2xl  { font-size: 11pt !important; }
          #certificate-document .text-xl   { font-size:  9.5pt !important; }
          #certificate-document .text-lg   { font-size:  9pt !important; }
          #certificate-document .text-base { font-size:  8.5pt !important; }
          #certificate-document .text-sm   { font-size:  8pt !important; }
          #certificate-document .text-xs   { font-size:  7pt !important; }

          /* ── 5a3. Cabeçalho do certificado: destaque proporcional ───────────── */
          #certificate-document .cert-intro-block > div:first-child .text-xl   { font-size: 13pt !important; }
          #certificate-document .cert-intro-block > div:first-child .text-sm   { font-size: 9.5pt !important; }
          #certificate-document .cert-intro-block > div:first-child .text-base { font-size: 10.5pt !important; }

          /* ── 5a4. Logo ───────────────────────────────────────────────────────── */
          #certificate-document img[alt="Alphafitus"] {
            height: 42px !important;
            width: auto !important;
          }

          /* ── 5b. Espaço entre seções ─────────────────────────────────────────── */
          .cert-intro-block > div:not(:first-child) { margin-bottom: 8pt !important; }
          .cert-section                              { margin-bottom: 8pt !important; }
          .cert-analysis-table                       { margin-bottom: 10pt !important; }
          .cert-kinetica-block                       { margin-bottom: 8pt !important; }

          /* ── 5b2. Header do certificado (logo + número) ──────────────────────── */
          .cert-intro-block > div:first-child {
            padding-bottom: 6pt !important;
            margin-bottom: 8pt !important;
          }

          /* ── 5b3. Padding interno das barras de título ───────────────────────── */
          .cert-intro-block > div:not(:first-child) > div:first-child,
          .cert-section > div:first-child,
          .cert-analysis-table > div:first-child,
          .cert-kinetica-block > div:first-child {
            padding: 4pt 9pt !important;
          }

          /* ── 5b4. Padding interno das áreas de conteúdo ──────────────────────── */
          .cert-intro-block > div:not(:first-child) > div:not(:first-child),
          .cert-section > div:not(:first-child),
          .cert-kinetica-block > div:not(:first-child) {
            padding: 6pt 9pt !important;
          }

          /* ── 5c. Cabeçalhos navy: garantir cor no print ──────────────────────── */
          .cert-intro-block > div:not(:first-child) > div:first-child,
          .cert-section > div:first-child,
          .cert-analysis-table > div:first-child,
          .cert-kinetica-block > div:first-child {
            background-color: rgb(51, 65, 85) !important;
            color: rgb(226, 232, 240) !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          /* ── 5d. Cabeçalho da tabela de análise ─────────────────────────────── */
          .cert-analysis-table thead tr {
            background-color: rgb(51, 65, 85) !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .cert-analysis-table thead th {
            color: rgb(226, 232, 240) !important;
            border-color: rgb(100, 116, 139) !important;
          }

          /* ── 5e. Linhas de categoria ─────────────────────────────────────────── */
          .cert-category-row td {
            background-color: rgb(241, 245, 249) !important;
            color: rgb(51, 65, 85) !important;
            border-color: rgb(203, 213, 225) !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          /* ── 6. Garantir print-color-adjust em todo o interior ──────────────── */
          #certificate-document * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          /* ── 7. Eliminar overflow:hidden dos containers internos ─────────────
             "rounded-*  overflow-hidden" corta conteúdo numa quebra de página.  */
          #certificate-document div,
          #certificate-document section,
          #certificate-document article {
            overflow: visible !important;
          }

          /* ── 8. Tabelas: células crescem com o conteúdo ──────────────────────── */
          #certificate-document td,
          #certificate-document th {
            overflow: visible !important;
          }

          /* ═══════════════════════════════════════════════════════════════════════
             QUEBRAS DE PÁGINA — apenas regras de fluxo, sem alterar aparência
          ═══════════════════════════════════════════════════════════════════════ */

          /* Bloco intro: nunca parte no meio */
          .cert-intro-block {
            break-inside: avoid;
            page-break-inside: avoid;
            overflow: visible !important;
          }

          /* Seções curtas: nunca partem no meio */
          .cert-section {
            break-inside: avoid;
            page-break-inside: avoid;
            overflow: visible !important;
          }

          /* Tabela de análises: PODE quebrar entre linhas (é longa) */
          .cert-analysis-table {
            break-inside: auto !important;
            page-break-inside: auto !important;
            overflow: visible !important;
          }

          /* Cabeçalho da tabela repete em todas as páginas */
          .cert-analysis-table thead {
            display: table-header-group;
          }

          /* Linha de categoria: não fica sozinha no fim da página */
          .cert-category-row {
            break-after: avoid;
            page-break-after: avoid;
            break-inside: avoid;
            page-break-inside: avoid;
          }

          /* Linhas de dados: não partem ao meio */
          tr {
            break-inside: avoid;
            page-break-inside: avoid;
          }

          /* Cinética: nunca parte no meio */
          .cert-kinetica-block {
            break-inside: avoid;
            page-break-inside: avoid;
            overflow: visible !important;
          }

          /* Assinaturas: não saltam sozinhas para nova página */
          .cert-signatures {
            break-inside: avoid;
            page-break-inside: avoid;
            break-before: avoid !important;
            page-break-before: avoid !important;
            overflow: visible !important;
          }

          /* Deliberação: mesma página que as assinaturas */
          .cert-deliberacao {
            break-inside: avoid;
            page-break-inside: avoid;
            overflow: visible !important;
          }

          /* Apêndices: sempre nova folha */
          .audit-appendix-section,
          .photo-appendix-section {
            page-break-before: always;
            break-before: page;
            overflow: visible !important;
          }

          .photo-appendix-header,
          .photo-param-group {
            page-break-inside: avoid;
            break-inside: avoid;
            overflow: visible !important;
          }

          /* Figura fotográfica individual */
          .photo-figure {
            page-break-inside: avoid;
            break-inside: avoid;
            display: inline-flex !important;
            flex-direction: column;
            align-items: center;
            overflow: visible !important;
          }

          /* Grade de fotos: compacta */
          .photo-grid {
            display: flex;
            flex-wrap: wrap;
            gap: 6px !important;
            overflow: visible !important;
          }

          /* Grupo de parâmetro: menos espaço */
          .photo-param-group {
            margin-bottom: 8pt !important;
          }

          /* Tamanho de imagem fotográfica: menor */
          .photo-img {
            width: 130px !important;
            height: 130px !important;
            object-fit: cover;
          }

          /* Cabeçalho do apêndice de fotos */
          .photo-appendix-header {
            margin-bottom: 6pt !important;
            padding-bottom: 4pt !important;
          }
        }
      `}</style>
    </div>
  );
}
