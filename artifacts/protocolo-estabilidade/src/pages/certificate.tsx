import { useParams, Link } from "wouter";
import { useGetCertificate, getGetCertificateQueryKey, useListLots, getListLotsQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Printer, Settings2, Image as ImageIcon, ChevronDown, ChevronUp, CheckSquare, Square, Lock, Unlock, History } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useState, useMemo, useEffect } from "react";
import { useUnlock } from "@/hooks/use-unlock";
import { UnlockDialog } from "@/components/unlock-dialog";
import { AuditTrail } from "@/components/audit-trail";

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

function CertEditField({
  value, onChange, className = "", multiline = false,
}: { value: string; onChange: (v: string) => void; className?: string; multiline?: boolean }) {
  if (multiline) {
    return (
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        rows={2}
        className={`bg-transparent border-b border-dashed border-gray-400 focus:outline-none focus:border-gray-700 w-full resize-none print:border-none ${className}`}
      />
    );
  }
  return (
    <input
      value={value}
      onChange={e => onChange(e.target.value)}
      className={`bg-transparent border-b border-dashed border-gray-400 focus:outline-none focus:border-gray-700 print:border-none ${className}`}
    />
  );
}

type ShowSections = {
  condicoesAmbientais: boolean;
  textoLotes: boolean;
  infoAdicionais: boolean;
  conclusao: boolean;
  fundamentacaoCinetica: boolean;
};

const SECTION_LABELS: { key: keyof ShowSections; label: string }[] = [
  { key: "condicoesAmbientais", label: "Condições Ambientais" },
  { key: "textoLotes", label: "Texto Lotes Piloto" },
  { key: "infoAdicionais", label: "Informações Adicionais" },
  { key: "conclusao", label: "Conclusão" },
  { key: "fundamentacaoCinetica", label: "Fundamentação Cinética" },
];

export default function CertificatePage() {
  const { id } = useParams<{ id: string }>();
  const { data: cert, isLoading } = useGetCertificate(Number(id), {
    query: { enabled: !!id, queryKey: getGetCertificateQueryKey(Number(id)) },
  });

  const [showSettings, setShowSettings] = useState(false);
  const [show, setShow] = useState<ShowSections>({
    condicoesAmbientais: true,
    textoLotes: true,
    infoAdicionais: true,
    conclusao: true,
    fundamentacaoCinetica: true,
  });

  const [includePhotos, setIncludePhotos] = useState(true);
  const [photosExpanded, setPhotosExpanded] = useState(false);
  const [includeHistory, setIncludeHistory] = useState(true);
  const [historyExpanded, setHistoryExpanded] = useState(false);

  // Environmental conditions — persisted in localStorage so edits survive navigation
  const ENV_KEY = `cert_env_${id}`;
  const [tempAmostragem, setTempAmostragemRaw] = useState(() => {
    try { return JSON.parse(localStorage.getItem(ENV_KEY) ?? "{}").tempAmostragem ?? "22,8°C"; } catch { return "22,8°C"; }
  });
  const [umidAmostragem, setUmidAmostragemRaw] = useState(() => {
    try { return JSON.parse(localStorage.getItem(ENV_KEY) ?? "{}").umidAmostragem ?? "60% UR"; } catch { return "60% UR"; }
  });
  const [tempRecebimento, setTempRecebimentoRaw] = useState(() => {
    try { return JSON.parse(localStorage.getItem(ENV_KEY) ?? "{}").tempRecebimento ?? "22,8°C"; } catch { return "22,8°C"; }
  });

  const saveEnv = (patch: Partial<{ tempAmostragem: string; umidAmostragem: string; tempRecebimento: string }>) => {
    try {
      const current = JSON.parse(localStorage.getItem(ENV_KEY) ?? "{}");
      localStorage.setItem(ENV_KEY, JSON.stringify({ ...current, ...patch }));
    } catch { /* ignore */ }
  };
  const setTempAmostragem = (v: string) => { setTempAmostragemRaw(v); saveEnv({ tempAmostragem: v }); };
  const setUmidAmostragem = (v: string) => { setUmidAmostragemRaw(v); saveEnv({ umidAmostragem: v }); };
  const setTempRecebimento = (v: string) => { setTempRecebimentoRaw(v); saveEnv({ tempRecebimento: v }); };

  // Environmental conditions are password-protected
  const { unlock } = useUnlock();
  const [envUnlocked, setEnvUnlocked] = useState(false);
  const [envUnlockOpen, setEnvUnlockOpen] = useState(false);

  const [analyses, setAnalyses] = useState<Array<{
    parameter: string; category: string; method: string; specification: string;
    result: string; status: string; visible: boolean;
  }> | null>(null);

  const { data: lotsRaw = [] } = useListLots(Number(id), {
    query: { enabled: !!id, queryKey: getListLotsQueryKey(Number(id)) },
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
        // Priority: manual cert edit > full citation from Results tab > shortName fallback > API default
        method: saved[a.parameter]?.method ?? paramCitations[a.parameter] ?? paramMethods[a.parameter] ?? a.method,
        specification: saved[a.parameter]?.specification ?? a.specification,
        result: saved[a.parameter]?.result ?? a.result,
        visible: visMap[a.parameter] ?? true,
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

  const isApproved = cert.finalStatus === "aprovado";
  const isRepproved = cert.finalStatus === "reprovado";
  const rows = analyses ?? cert.analyses.map(a => ({ ...a, visible: true }));
  const categories = Array.from(new Set(rows.map(r => r.category)));

  // Se qualquer resultado visível estiver fora do especificado, o certificado é automaticamente REPROVADO
  const hasNonConforming = rows.some(r => r.status === "Nao Conforme" && r.visible);
  const effectiveIsApproved = isApproved && !hasNonConforming;
  const effectiveIsRepproved = isRepproved || hasNonConforming;

  const visiblePhotoEntries = includePhotos
    ? allPhotoEntries.filter(e => activePhotoKeys.has(e.key))
    : [];

  const totalSelectedImages = visiblePhotoEntries.reduce((s, e) => s + e.images.length, 0);

  return (
    <div className="max-w-5xl mx-auto space-y-4">

      {/* ─── Toolbar ─── */}
      <div className="flex items-center justify-between print:hidden">
        <Link href={`/protocols/${id}`}>
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" /> Voltar ao Protocolo
          </Button>
        </Link>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowSettings(s => !s)}>
            <Settings2 className="h-4 w-4 mr-2" />
            Configurar Impressão
            {showSettings ? <ChevronUp className="h-3 w-3 ml-1" /> : <ChevronDown className="h-3 w-3 ml-1" />}
          </Button>
          <Button onClick={() => window.print()}>
            <Printer className="h-4 w-4 mr-2" /> Imprimir / Salvar PDF
          </Button>
        </div>
      </div>

      {/* ─── Settings panel ─── */}
      {showSettings && (
        <div className="print:hidden border rounded-lg bg-white shadow-sm p-5 space-y-5">
          <p className="text-sm font-semibold text-gray-800">Configurações de Impressão / PDF</p>
          <div className="space-y-2">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Seções do documento</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {SECTION_LABELS.map(({ key, label }) => (
                <label key={key} className="flex items-center gap-2 cursor-pointer select-none p-2 rounded-md border border-gray-100 hover:bg-gray-50">
                  <input type="checkbox" checked={show[key]} onChange={() => toggle(key)} className="w-4 h-4 accent-primary" />
                  <span className="text-sm text-gray-700">{label}</span>
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
        {/* Header */}
        <div className="flex items-start justify-between border-b-2 border-gray-800 pb-4 mb-6">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-1">Alphafitus Laboratorio Nutraceutico</p>
            <h1 className="text-2xl font-bold uppercase tracking-wide">Suplemento Alimentar</h1>
            <p className="text-base font-semibold text-gray-600 mt-0.5">{cert.productName}</p>
          </div>
          <div className="text-right text-sm space-y-1 min-w-48">
            <div>
              <span className="text-gray-500 text-xs block">Numero</span>
              <span className="font-bold tracking-wide">{cert.certNumber}</span>
            </div>
            <div>
              <span className="text-gray-500 text-xs block">Data de Emissao</span>
              <span className="font-medium">{cert.issueDate}</span>
            </div>
          </div>
        </div>

        {/* Company / product info */}
        <div className="grid grid-cols-2 gap-6 mb-6 text-sm">
          <div className="space-y-2">
            <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500 border-b pb-1">Dados do Produto</h2>
            <dl className="space-y-1">
              <div className="flex gap-2"><dt className="text-gray-500 min-w-20">Empresa:</dt><dd className="font-medium">{cert.companyName}</dd></div>
              <div className="flex gap-2"><dt className="text-gray-500 min-w-20">CNPJ:</dt><dd className="font-medium">{cert.cnpj}</dd></div>
              {(cert as any).ie && <div className="flex gap-2"><dt className="text-gray-500 min-w-20">IE:</dt><dd>{(cert as any).ie}</dd></div>}
              {cert.address && <div className="flex gap-2"><dt className="text-gray-500 min-w-20">Endereço:</dt><dd>{cert.address}</dd></div>}
              {cert.email && <div className="flex gap-2"><dt className="text-gray-500 min-w-20">Email:</dt><dd>{cert.email}</dd></div>}
            </dl>
          </div>
          <div className="space-y-2">
            <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500 border-b pb-1">Identificacao</h2>
            <dl className="space-y-1">
              <div className="flex gap-2"><dt className="text-gray-500 min-w-20">Produto:</dt><dd className="font-medium">{cert.productName}</dd></div>
              {cert.presentation && <div className="flex gap-2"><dt className="text-gray-500 min-w-20">Apresentacao:</dt><dd>{cert.presentation}</dd></div>}
              {cert.validityMonths && <div className="flex gap-2"><dt className="text-gray-500 min-w-20">Validade:</dt><dd className="font-semibold">{cert.validityMonths} meses</dd></div>}
              {cert.lotNumbers.length > 0 && (
                <div className="flex gap-2">
                  <dt className="text-gray-500 min-w-20">N° do Lote:</dt>
                  <dd>{cert.lotNumbers.join(", ")}</dd>
                </div>
              )}
            </dl>
          </div>
        </div>

        {/* Condições Ambientais — password-protected */}
        <UnlockDialog
          open={envUnlockOpen}
          onOpenChange={setEnvUnlockOpen}
          onUnlock={unlock}
          title="Alterar Condições Ambientais"
          description="Digite a senha mestra para editar as condições ambientais e de recebimento."
          submitLabel="Desbloquear"
          onSuccess={() => { setEnvUnlockOpen(false); setEnvUnlocked(true); }}
        />
        {show.condicoesAmbientais && (
          <div className="mb-6 border border-gray-200 rounded p-3 bg-gray-50 text-xs space-y-2">
            <div className="flex items-center justify-between">
              <p className="font-bold uppercase tracking-widest text-gray-500">Condições Ambientais</p>
              <button
                onClick={() => envUnlocked ? setEnvUnlocked(false) : setEnvUnlockOpen(true)}
                className={`print:hidden flex items-center gap-1 text-[10px] px-2 py-0.5 rounded border transition-colors ${
                  envUnlocked
                    ? "bg-green-50 border-green-300 text-green-700 hover:bg-red-50 hover:border-red-300 hover:text-red-700"
                    : "bg-amber-50 border-amber-300 text-amber-700 hover:bg-amber-100"
                }`}
                title={envUnlocked ? "Clique para bloquear" : "Clique para editar"}
              >
                {envUnlocked ? <Unlock className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
                {envUnlocked ? "Desbloqueado" : "Protegido"}
              </button>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-gray-500">Amostragem — Temp.:</span>
                {envUnlocked
                  ? <CertEditField value={tempAmostragem} onChange={setTempAmostragem} className="w-20 text-xs" />
                  : <span className="font-medium">{tempAmostragem}</span>
                }
                <span className="text-gray-500 ml-2">Umid.:</span>
                {envUnlocked
                  ? <CertEditField value={umidAmostragem} onChange={setUmidAmostragem} className="w-20 text-xs" />
                  : <span className="font-medium">{umidAmostragem}</span>
                }
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-gray-500">Recebimento — Temp.:</span>
                {envUnlocked
                  ? <CertEditField value={tempRecebimento} onChange={setTempRecebimento} className="w-20 text-xs" />
                  : <span className="font-medium">{tempRecebimento}</span>
                }
              </div>
            </div>
          </div>
        )}

        {/* Analysis table */}
        <div className="mb-6">
          <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500 border-b pb-1 mb-3">Resultados de Analise</h2>
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-gray-100">
                <th className="border border-gray-300 px-2 py-2 text-left font-semibold uppercase tracking-wide w-28">Analise</th>
                <th className="border border-gray-300 px-2 py-2 text-left font-semibold uppercase tracking-wide">Metodo</th>
                <th className="border border-gray-300 px-2 py-2 text-left font-semibold uppercase tracking-wide w-28">Especificacoes</th>
                <th className="border border-gray-300 px-2 py-2 text-center font-semibold uppercase tracking-wide w-20">Resultado</th>
                <th className="border border-gray-300 px-2 py-2 text-center font-semibold uppercase tracking-wide w-24">Status</th>
                <th className="border border-gray-300 px-2 py-2 text-center font-semibold uppercase tracking-wide w-10 print:hidden">
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
                    <tr key={`cat-${cat}`} className={allCatHidden ? "print:hidden" : ""}>
                      <td colSpan={6} className="border border-gray-300 px-2 py-1 bg-gray-200 font-bold text-[10px] uppercase tracking-widest text-gray-600">
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
                          <CertEditField value={analysis.specification} onChange={v => updateAnalysis(analysis.originalIndex, "specification", v)} className="text-xs w-full font-mono" />
                        </td>
                        <td className={`border px-2 py-1.5 text-center font-mono font-medium align-top ${isNC ? "border-red-300 text-red-800" : "border-gray-300"}`}>
                          <CertEditField value={analysis.result} onChange={v => updateAnalysis(analysis.originalIndex, "result", v)} className="text-xs text-center w-16 font-mono" />
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
                          * Os resultados de embalagem representam a média dos ensaios realizados ao longo dos 6 meses de estudo de estabilidade (T0, T3 e T6).
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>

        {show.textoLotes && (
          <div className="mb-6 border-l-4 border-gray-400 pl-4 bg-gray-50 py-3 pr-3 rounded-r text-xs text-gray-700 space-y-2">
            <p>Os lotes piloto foram produzidos em datas distintas, sob condições equivalentes de fabricação, visando assegurar a independência entre os lotes, a rastreabilidade do estudo e a minimização do risco de desvios operacionais ou interferências de processo.</p>
            <p>Alimento está sendo testado em embalagem equivalente e sistema de fechamento nos quais será comercializado.</p>
          </div>
        )}

        {show.infoAdicionais && (
          <div className="mb-6 border border-gray-200 rounded p-3 bg-gray-50 text-xs space-y-1">
            <p className="text-gray-500 font-semibold">Informacoes Adicionais</p>
            <p>Este documento deve ser reproduzido integralmente. A reproducao parcial somente e permitida mediante autorizacao formal e escrita do laboratorio.</p>
            <p>Os resultados apresentados referem-se exclusivamente as amostras recebidas e foram obtidos e reportados de acordo com as condicoes analiticas estabelecidas e metodologias aplicaveis.</p>
            <p><strong>NA</strong> = Nao se aplica &nbsp;&nbsp;<strong>ND</strong> = Nao detectado &nbsp;&nbsp;<strong>LQ</strong> = Limite de quantificacao &nbsp;&nbsp;<strong>AR</strong> = Aprovado com Ressalva</p>
          </div>
        )}

        {show.conclusao && cert.conclusion && (
          <div className="mb-6 font-semibold text-center text-sm uppercase tracking-wide border-t border-b border-gray-300 py-3">
            CONCLUSAO: {cert.conclusion}
          </div>
        )}

        {hasNonConforming && (
          <div className="mb-4 rounded border border-red-400 bg-red-50 px-4 py-3 print:border-red-600 print:bg-red-50">
            <p className="text-sm font-bold text-red-700 uppercase tracking-wide">⚠ Atenção — Resultado(s) Fora do Especificado</p>
            <p className="text-xs text-red-600 mt-1">
              Este protocolo contém um ou mais parâmetros com resultado <strong>Não Conforme</strong>.
              O status do certificado foi automaticamente alterado para <strong>REPROVADO</strong>.
            </p>
          </div>
        )}
        <div className="mb-6 flex items-center gap-6">
          <div className="flex items-center gap-3">
            <div className={`w-5 h-5 border-2 flex items-center justify-center ${effectiveIsApproved ? "border-gray-800 bg-gray-800" : "border-gray-400"}`}>
              {effectiveIsApproved && <span className="text-white text-xs font-bold">X</span>}
            </div>
            <span className="font-medium">APROVADO</span>
          </div>
          <div className="flex items-center gap-3">
            <div className={`w-5 h-5 border-2 flex items-center justify-center ${effectiveIsRepproved ? "border-red-700 bg-red-700" : "border-gray-400"}`}>
              {effectiveIsRepproved && <span className="text-white text-xs font-bold">X</span>}
            </div>
            <span className={`font-medium ${effectiveIsRepproved ? "text-red-700" : ""}`}>REPROVADO</span>
          </div>
          {cert.issueDate && <span className="ml-auto text-gray-500 text-xs">DATA: {cert.issueDate}</span>}
        </div>

        {show.fundamentacaoCinetica && (
          <div className="mb-6 rounded border border-gray-200 bg-gray-50 p-4 text-xs text-gray-700 space-y-3">
            <p className="font-semibold text-gray-800 uppercase tracking-wide">Fundamentação do Modelo Cinético</p>
            <p className="leading-relaxed">Para a estimativa do tempo de validade do produto, foi empregado o modelo cinético de degradação de primeira ordem, amplamente descrito na literatura para substâncias bioativas submetidas à avaliação de estabilidade sob condições de estresse controlado, como temperatura e umidade.</p>
            <p className="font-mono bg-white border border-gray-200 rounded px-3 py-1.5 inline-block">C<sub>t</sub> = C<sub>0</sub> · e<sup>−kt</sup></p>
            <p className="font-mono bg-white border border-gray-200 rounded px-3 py-1.5 inline-block ml-4">k = A · e<sup>−E<sub>a</sub>/RT</sup></p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-8 pt-4 border-t border-gray-300">
          {cert.issuedBy && (
            <div>
              <p className="font-semibold text-sm">{cert.issuedBy}</p>
              <p className="text-xs text-gray-500">Responsavel Tecnico</p>
              {cert.seniorAnalystEmail && <p className="text-xs text-gray-500">{cert.seniorAnalystEmail}</p>}
              <div className="mt-8 border-t border-gray-400 w-64">
                <p className="text-xs text-gray-400 mt-1">Assinatura</p>
              </div>
            </div>
          )}
          {cert.seniorAnalyst && (
            <div>
              <p className="font-semibold text-sm">{cert.seniorAnalyst}</p>
              <p className="text-xs text-gray-500">Analista Senior / Representante Legal</p>
              <div className="mt-8 border-t border-gray-400 w-64">
                <p className="text-xs text-gray-400 mt-1">Assinatura</p>
              </div>
            </div>
          )}
        </div>

        {/* ═══════════════════════════════════════════════════════
            AUDIT TRAIL COMPLEMENT — prints after main certificate
        ═══════════════════════════════════════════════════════ */}
        {includeHistory && (
          <div className="audit-appendix-section">
            <div className="pt-8 border-t-2 border-gray-800 mt-8">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Alphafitus Laboratorio Nutraceutico</p>
                  <h2 className="text-lg font-bold uppercase tracking-wide mt-0.5 flex items-center gap-2">
                    Anexo — Histórico de Alterações do Protocolo
                  </h2>
                </div>
                <div className="text-right text-xs text-gray-500">
                  <p>{cert.productName}</p>
                  <p className="font-semibold">{cert.certNumber}</p>
                  <p>{cert.issueDate}</p>
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
                  <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Alphafitus Laboratorio Nutraceutico</p>
                  <h2 className="text-lg font-bold uppercase tracking-wide mt-0.5">Anexo — Registros Fotográficos dos Ensaios</h2>
                </div>
                <div className="text-right text-xs text-gray-500">
                  <p>{cert.productName}</p>
                  <p className="font-semibold">{cert.certNumber}</p>
                  <p>{cert.issueDate}</p>
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
                                <div className="border-2 border-gray-300 rounded overflow-hidden shadow-sm">
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
                Fim do Anexo Fotográfico — {totalSelectedImages} imagem(ns) referentes a {visiblePhotoEntries.length} ensaio(s) — {cert.certNumber} — {cert.issueDate}
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

      <style>{`
        @media print {
          body * { visibility: hidden; }
          #certificate-document,
          #certificate-document * { visibility: visible; }
          #certificate-document {
            position: absolute; left: 0; top: 0;
            width: 100%; box-shadow: none; border: none;
            padding: 15mm 20mm;
            font-size: 10pt;
          }

          /* ── Editable fields: remove ALL browser chrome ── */
          input, textarea {
            border: none !important;
            border-bottom: none !important;
            background: transparent !important;
            outline: none !important;
            box-shadow: none !important;
            -webkit-appearance: none !important;
            appearance: none !important;
          }

          /* ── Textarea-specific: kill resize handle, unconstrain height ── */
          textarea {
            resize: none !important;
            overflow: visible !important;
            height: auto !important;
            min-height: 0 !important;
            max-height: none !important;
            /* Force all text visible — no clipping */
            white-space: pre-wrap !important;
            word-break: break-word !important;
          }

          /* ── Table cells: let their height grow with content ── */
          td, th { overflow: visible !important; }

          /* Photo appendix always starts on a fresh page */
          .photo-appendix-section {
            page-break-before: always;
            break-before: page;
          }
          .photo-appendix-header { page-break-inside: avoid; break-inside: avoid; }

          /* Each parameter group tries to stay together */
          .photo-param-group {
            page-break-inside: avoid;
            break-inside: avoid;
          }

          /* Each photo figure stays together */
          .photo-figure {
            page-break-inside: avoid;
            break-inside: avoid;
            display: inline-flex !important;
            flex-direction: column;
            align-items: center;
          }

          /* Photo grid wraps naturally */
          .photo-grid {
            display: flex;
            flex-wrap: wrap;
            gap: 12px;
          }

          /* Fixed image size for print */
          .photo-img {
            width: 180px !important;
            height: 180px !important;
            object-fit: cover;
          }
        }
      `}</style>
    </div>
  );
}
