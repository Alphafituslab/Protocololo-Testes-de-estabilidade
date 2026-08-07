import { z } from "zod";

// ── Status labels & colors ────────────────────────────────────────────────────
const STATUS_LABELS: Record<string, string> = {
  rascunho: "Rascunho",
  em_andamento: "Em Andamento",
  concluido: "Concluído",
  aprovado: "Aprovado",
  reprovado: "Reprovado",
  aprovado_com_ressalva: "Aprovado c/ Ressalva",
};

const STATUS_COLORS: Record<string, string> = {
  rascunho: "bg-slate-100 text-slate-700 border-slate-200",
  em_andamento: "bg-blue-100 text-blue-700 border-blue-200",
  concluido: "bg-purple-100 text-purple-700 border-purple-200",
  aprovado: "bg-green-100 text-green-700 border-green-200",
  reprovado: "bg-red-100 text-red-700 border-red-200",
  aprovado_com_ressalva: "bg-amber-100 text-amber-700 border-amber-200",
};

const RESULT_STATUS_COLORS: Record<string, string> = {
  conforme: "text-green-700 bg-green-50 border-green-200",
  nao_conforme: "text-red-700 bg-red-50 border-red-200",
  na: "text-slate-500 bg-slate-50 border-slate-200",
  aprovado_com_ressalva: "text-amber-700 bg-amber-50 border-amber-200",
};

const ANALYSIS_PARAMETERS = [
  { parameter: "pH", category: "fisico_quimica", criterion: "8,90 – 9,40" },
  { parameter: "Perda por dessecação", category: "fisico_quimica", criterion: "≤ 5%" },
  { parameter: "Cor", category: "fisico_quimica", criterion: "Branco" },
  { parameter: "Odor", category: "fisico_quimica", criterion: "Característico" },
  { parameter: "Aparência", category: "fisico_quimica", criterion: "Homogênea" },
  { parameter: "Cinzas totais", category: "fisico_quimica", criterion: "≤ 50%" },
  { parameter: "Dissolução", category: "fisico_quimica", criterion: "Q ≥ 80% em 30 min" },
  { parameter: "Massa média", category: "fisico_quimica", criterion: "± 7,5%" },
  { parameter: "Kcal", category: "fisico_quimica", criterion: "≤ 4 kcal declara 0" },
  { parameter: "Sódio", category: "fisico_quimica", criterion: "≤ 5 mg declara 0" },
  { parameter: "Salmonella spp. em 10 g", category: "microbiologica", criterion: "Ausente em 10 g" },
  { parameter: "Bolores e leveduras", category: "microbiologica", criterion: "≤ 10² UFC/g" },
  { parameter: "Escherichia coli", category: "microbiologica", criterion: "Ausente em 1 g" },
  { parameter: "Contagem de Micro-organismos Aeróbios Mesófilos", category: "microbiologica", criterion: "≤ 10³ UFC/g" },
  { parameter: "Cálcio", category: "teor_ativo", criterion: "98,50% - 100,50%" },
  { parameter: "Vitamina D", category: "teor_ativo", criterion: "97,00% - 103,00%" },
  { parameter: "Torque de tampa", category: "embalagem", criterion: "2 unidades a cada 100" },
  { parameter: "Selagem por indução", category: "embalagem", criterion: "2 unidades a cada 100" },
  { parameter: "Integridade selagem", category: "embalagem", criterion: "2 unidades a cada 100" },
  { parameter: "Headspace", category: "embalagem", criterion: "15% - 20%" },
];

// ── Parâmetros microbiológicos padrão por forma farmacêutica ─────────────────
const MICRO_PARAMS_CAPSULA = [
  { parameter: "Salmonella spp. em 10 g", category: "microbiologica", criterion: "Ausente em 10 g" },
  { parameter: "Bolores e leveduras", category: "microbiologica", criterion: "≤ 10² UFC/g" },
  { parameter: "Escherichia coli", category: "microbiologica", criterion: "Ausente em 1 g" },
  { parameter: "Contagem de Micro-organismos Aeróbios Mesófilos", category: "microbiologica", criterion: "≤ 10³ UFC/g" },
] as const;

const MICRO_PARAMS_PO = [
  { parameter: "Salmonella spp. em 25 g", category: "microbiologica", criterion: "Ausente em 25 g" },
  { parameter: "Bolores e leveduras", category: "microbiologica", criterion: "≤ 10³ UFC/g" },
  { parameter: "Escherichia coli", category: "microbiologica", criterion: "Ausente em 1 g" },
  { parameter: "Enterobacteriaceae", category: "microbiologica", criterion: "≤ 10² UFC/g" },
  { parameter: "Estafilococos coagulase positiva por g", category: "microbiologica", criterion: "≤ 10² UFC/g" },
] as const;

/** Retorna a lista de parâmetros padrão combinando params fixos + micro correto pela forma farmacêutica. */
function isToday(iso: string | null | undefined): boolean {
  if (!iso) return false;
  const d = new Date(iso); const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

function getDefaultParams(isPowder: boolean): Array<{ parameter: string; category: string; criterion: string; uid: string }> {
  const micro = isPowder ? [...MICRO_PARAMS_PO] : [...MICRO_PARAMS_CAPSULA];
  const all = [
    ...ANALYSIS_PARAMETERS.filter(p => p.category === "fisico_quimica"),
    ...micro,
    ...ANALYSIS_PARAMETERS.filter(p => p.category === "teor_ativo"),
    ...ANALYSIS_PARAMETERS.filter(p => p.category === "embalagem"),
  ];
  return all.map((p, i) => ({ ...p, uid: `${p.category}_${i}` }));
}

const PERIODS = [0, 3, 6];

const lotSchema = z.object({
  lotNumber: z.string().min(1, "Número do lote obrigatório"),
  manufacturingDate: z.string().min(1, "Data obrigatória"),
  expiryDate: z.string().optional(),
  quantity: z.coerce.number().min(1),
  notes: z.string().optional(),
  studyCondition: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.enum(["longa_duracao", "acelerado"]).optional(),
  ),
  temperatureC: z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? null : Number(v)),
    z.number().nullable().optional(),
  ),
  humidityRh: z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? null : Number(v)),
    z.number().nullable().optional(),
  ),
});

const finalizeSchema = z.object({
  finalStatus: z.enum(["aprovado", "reprovado", "aprovado_com_ressalva", "em_andamento"]),
  conclusion: z.string().optional(),
  validityMonths: z.coerce.number().optional(),
  issueDate: z.string().optional(),
  ressalva: z.string().optional(),
  progressPercent: z.coerce.number().min(0).max(100).optional(),
}).superRefine((data, ctx) => {
  if (data.finalStatus !== "em_andamento" && (!data.conclusion || data.conclusion.trim().length < 1)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Conclusão obrigatória", path: ["conclusion"] });
  }
  if (data.finalStatus === "aprovado_com_ressalva" && (!data.ressalva || data.ressalva.trim().length < 10)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Obrigatório descrever a ressalva (mínimo 10 caracteres) para aprovar com ressalva.", path: ["ressalva"] });
  }
});

// ── Shared types ─────────────────────────────────────────────────────────────
type ActiveCell = { lotId: number; period: number; parameter: string; category: string; criterion: string };
type EditableParam = { uid: string; parameter: string; category: string; criterion: string; methodologyShort?: string; methodologyCitation?: string };

// ── Parameter catalog (localStorage) ─────────────────────────────────────────
const PARAM_CATALOG_KEY = "param_catalog_v2";
type CatalogEntry = { shortName: string; citation: string };

function getCatalogEntries(paramName: string): CatalogEntry[] {
  if (!paramName.trim()) return [];
  try {
    const raw = localStorage.getItem(PARAM_CATALOG_KEY);
    if (!raw) return [];
    const catalog = JSON.parse(raw) as Record<string, CatalogEntry[]>;
    return catalog[paramName.trim().toLowerCase()] ?? [];
  } catch { return []; }
}

function addToCatalog(paramName: string, shortName: string, citation: string) {
  if (!paramName.trim() || !shortName) return;
  try {
    const raw = localStorage.getItem(PARAM_CATALOG_KEY);
    const catalog: Record<string, CatalogEntry[]> = raw ? JSON.parse(raw) : {};
    const key = paramName.trim().toLowerCase();
    const existing = catalog[key] ?? [];
    // Deduplicar por shortName
    if (!existing.some(e => e.shortName === shortName)) {
      catalog[key] = [...existing, { shortName, citation }];
      localStorage.setItem(PARAM_CATALOG_KEY, JSON.stringify(catalog));
    }
  } catch { /* ignore */ }
}

/**
 * Lookup reverso: dado um shortName de metodologia, retorna os parâmetros
 * que já usaram essa metodologia (nome de exibição + critério de aceitação).
 * Usado para auto-preencher nome e critério ao selecionar metodologia em parâmetro em branco.
 */
function getParamsForMethodology(shortName: string): { paramName: string; criterion: string }[] {
  if (!shortName) return [];
  try {
    const raw = localStorage.getItem(PARAM_CATALOG_KEY);
    if (!raw) return [];
    const catalog = JSON.parse(raw) as Record<string, CatalogEntry[]>;
    // Todos os presets para reverse-lookup de nome de exibição e critério
    const allPresets = [
      ...Object.values(CATEGORY_PRESETS).flat(),
      ...ANALYSIS_PARAMETERS.map(p => ({ parameter: p.parameter, criterion: p.criterion })),
    ];
    const results: { paramName: string; criterion: string }[] = [];
    for (const [normalizedKey, entries] of Object.entries(catalog)) {
      if (entries.some(e => e.shortName === shortName)) {
        const preset = allPresets.find(p => p.parameter.trim().toLowerCase() === normalizedKey);
        const displayName = preset?.parameter
          ?? normalizedKey.replace(/\b\w/g, c => c.toUpperCase());
        results.push({ paramName: displayName, criterion: preset?.criterion ?? "" });
      }
    }
    return results;
  } catch { return []; }
}

/** Retorna todos os presets disponíveis para uma categoria, combinando CATEGORY_PRESETS com ANALYSIS_PARAMETERS. */
function getPresetsForCategory(category: string): { parameter: string; criterion: string }[] {
  const fromPresets = CATEGORY_PRESETS[category] ?? [];
  const fromAnalysis = ANALYSIS_PARAMETERS
    .filter(p => p.category === category)
    .map(p => ({ parameter: p.parameter, criterion: p.criterion }));
  const seen = new Set(fromPresets.map(p => p.parameter));
  return [...fromPresets, ...fromAnalysis.filter(p => !seen.has(p.parameter))];
}

interface ProductTemplateParam {
  parameter: string;
  category: string;
  criterion: string;
  methodologyShort: string;
  methodologyCitation: string;
}
interface ProductTemplate {
  id: string;
  name: string;
  description: string;
  params: ProductTemplateParam[];
}

const PRODUCT_TEMPLATES: ProductTemplate[] = [
  {
    id: "colageno_ha_vitc_sache",
    name: "Colágeno + Ácido Hialurônico + Vitamina C — Pó / Sachê",
    description: "Suplemento alimentar em pó — Colágeno hidrolisado, Ácido Hialurônico e Vitamina C em sachê de 10g",
    params: [
      // Físico-química
      { parameter: "Cor", category: "fisico_quimica", criterion: "Característico (branco/creme)", methodologyShort: "Organoléptico", methodologyCitation: "Análise organoléptica — inspeção visual" },
      { parameter: "Odor", category: "fisico_quimica", criterion: "Característico", methodologyShort: "Organoléptico", methodologyCitation: "Análise organoléptica" },
      { parameter: "Solubilidade", category: "fisico_quimica", criterion: "≥ 95% em água a 20°C", methodologyShort: "Visual", methodologyCitation: "Avaliação visual — dissolução em água" },
      { parameter: "pH", category: "fisico_quimica", criterion: "4,5 – 7,5 (solução 1%)", methodologyShort: "AOAC 981.12", methodologyCitation: "AOAC 981.12 / Farmacopeia Brasileira 5ª Ed. — Determinação de pH" },
      { parameter: "Umidade", category: "fisico_quimica", criterion: "≤ 5,0%", methodologyShort: "AOAC 934.01", methodologyCitation: "AOAC 934.01 / Farmacopeia Brasileira 5ª Ed. — Umidade por dessecação" },
      { parameter: "Cinzas", category: "fisico_quimica", criterion: "≤ 3,0%", methodologyShort: "AOAC 942.05", methodologyCitation: "AOAC 942.05 — Cinzas totais por incineração" },
      { parameter: "Kcal", category: "fisico_quimica", criterion: "Conforme rotulagem ± 20%", methodologyShort: "Cálculo Atwater", methodologyCitation: "Cálculo pelos fatores de Atwater / AOAC 2011.25" },
      { parameter: "Sódio", category: "fisico_quimica", criterion: "≤ 5 mg declara 0", methodologyShort: "AOAC 984.27", methodologyCitation: "AOAC 984.27 — Sódio por ICP-OES / absorção atômica" },
      { parameter: "Massa média", category: "fisico_quimica", criterion: "10,0 g ± 5%", methodologyShort: "FB 5ª Ed.", methodologyCitation: "Farmacopeia Brasileira 5ª Ed. — Determinação de massa média" },
      { parameter: "Peso médio sachê", category: "fisico_quimica", criterion: "10,0 g ± 5%", methodologyShort: "Gravimétrico", methodologyCitation: "Método gravimétrico — pesagem direta (balança analítica)" },
      // Microbiológica
      { parameter: "Salmonella spp. em 25 g", category: "microbiologica", criterion: "Ausente em 25 g", methodologyShort: "AOAC 996.08", methodologyCitation: "AOAC 996.08 / RDC 331/2019 — Salmonella spp. em 25 g" },
      { parameter: "Bolores e leveduras", category: "microbiologica", criterion: "≤ 10³ UFC/g", methodologyShort: "AOAC 997.02", methodologyCitation: "AOAC 997.02 / RDC 331/2019 — Contagem de bolores e leveduras" },
      { parameter: "Escherichia coli", category: "microbiologica", criterion: "Ausente em 1 g", methodologyShort: "AOAC 991.14", methodologyCitation: "AOAC 991.14 / RDC 331/2019 — Escherichia coli (MPN)" },
      { parameter: "Enterobacteriaceae", category: "microbiologica", criterion: "≤ 10² UFC/g", methodologyShort: "ISO 21528-2", methodologyCitation: "ISO 21528-2 / ABNT NBR — Contagem de Enterobacteriaceae" },
      { parameter: "Estafilococos coagulase positiva por g", category: "microbiologica", criterion: "≤ 10² UFC/g", methodologyShort: "AOAC 975.55", methodologyCitation: "AOAC 975.55 / RDC 331/2019 — Estafilococos coagulase positiva" },
      // Teor do Ativo
      { parameter: "Gelatina hidrolisada/Colágeno hidrolisado", category: "teor_ativo", criterion: "≥ 80% do valor declarado", methodologyShort: "AOAC 990.03", methodologyCitation: "AOAC 990.03 — Proteína total (Kjeldahl) / Colágeno hidrolisado" },
      { parameter: "Vitamina C - Ácido Ascórbico", category: "teor_ativo", criterion: "≥ 80% do valor declarado", methodologyShort: "AOAC 967.21", methodologyCitation: "AOAC 967.21 — Ácido Ascórbico por HPLC / titulação iodométrica" },
      { parameter: "Ácido Hialurônico", category: "teor_ativo", criterion: "≥ 80% do valor declarado", methodologyShort: "HPLC", methodologyCitation: "HPLC / Método colorimétrico (ácido carbazólico) — Ácido Hialurônico" },
      // Embalagem
      { parameter: "Integridade selagem", category: "embalagem", criterion: "Íntegra, sem vazamentos", methodologyShort: "Visual", methodologyCitation: "Inspeção visual / Teste de vedação (vácuo ou pressão)" },
      { parameter: "Headspace", category: "embalagem", criterion: "15% - 20%", methodologyShort: "Headspace GC", methodologyCitation: "Cromatografia gasosa de headspace — análise do espaço livre no frasco" },
    ],
  },
  {
    id: "multivitaminico_capsula_dura",
    name: "Multivitamínico + Minerais — Cápsula Dura",
    description: "Suplemento alimentar em cápsula dura com vitaminas do complexo B, C, D, E e minerais (Zinco, Magnésio, Ferro, Cálcio)",
    params: [
      // Físico-química
      { parameter: "Aparência", category: "fisico_quimica", criterion: "Cápsulas íntegras, sem deformação, cor uniforme", methodologyShort: "Visual", methodologyCitation: "Inspeção visual / análise organoléptica" },
      { parameter: "Cor", category: "fisico_quimica", criterion: "Característico", methodologyShort: "Organoléptico", methodologyCitation: "Análise organoléptica — inspeção visual" },
      { parameter: "Odor", category: "fisico_quimica", criterion: "Característico, sem odor rançoso", methodologyShort: "Organoléptico", methodologyCitation: "Análise organoléptica" },
      { parameter: "Perda por dessecação", category: "fisico_quimica", criterion: "≤ 5,0%", methodologyShort: "FB 7ª Ed.", methodologyCitation: "Farmacopeia Brasileira 7ª Ed. — Perda por dessecação (105°C, 2h)" },
      { parameter: "Massa média", category: "fisico_quimica", criterion: "Conforme especificação ± 5%", methodologyShort: "FB 7ª Ed.", methodologyCitation: "Farmacopeia Brasileira 7ª Ed. — Determinação de massa média de cápsulas" },
      { parameter: "Dissolução", category: "fisico_quimica", criterion: "≥ 75% em 45 min (aparato Pá, 50 rpm)", methodologyShort: "FB 7ª Ed.", methodologyCitation: "Farmacopeia Brasileira 7ª Ed. — Ensaio de dissolução (Aparato 2 — Pá)" },
      { parameter: "Cinzas totais", category: "fisico_quimica", criterion: "≤ 5,0%", methodologyShort: "AOAC 942.05", methodologyCitation: "AOAC 942.05 — Cinzas totais por incineração" },
      { parameter: "Kcal", category: "fisico_quimica", criterion: "Conforme rotulagem ± 20%", methodologyShort: "Cálculo Atwater", methodologyCitation: "Cálculo pelos fatores de Atwater / AOAC 2011.25" },
      { parameter: "Sódio", category: "fisico_quimica", criterion: "Conforme rotulagem ± 20%", methodologyShort: "AOAC 984.27", methodologyCitation: "AOAC 984.27 — Sódio por ICP-OES / absorção atômica" },
      // Microbiológica
      { parameter: "Salmonella spp. em 10 g", category: "microbiologica", criterion: "Ausente em 10 g", methodologyShort: "AOAC 996.08", methodologyCitation: "AOAC 996.08 / RDC 724/2022 — Salmonella spp. em 10 g" },
      { parameter: "Bolores e leveduras", category: "microbiologica", criterion: "≤ 10² UFC/g", methodologyShort: "AOAC 997.02", methodologyCitation: "AOAC 997.02 / RDC 724/2022 — Contagem de bolores e leveduras" },
      { parameter: "Escherichia coli", category: "microbiologica", criterion: "Ausente em 1 g", methodologyShort: "AOAC 991.14", methodologyCitation: "AOAC 991.14 / RDC 724/2022 — Escherichia coli (MPN)" },
      { parameter: "Contagem de Micro-organismos Aeróbios Mesófilos", category: "microbiologica", criterion: "≤ 10³ UFC/g", methodologyShort: "ISO 4833-1", methodologyCitation: "ISO 4833-1 / ABNT NBR — Contagem de micro-organismos aeróbios mesófilos a 30°C" },
      // Teor do Ativo
      { parameter: "Vitamina C (Ácido Ascórbico)", category: "teor_ativo", criterion: "≥ 80% do valor declarado", methodologyShort: "AOAC 967.21", methodologyCitation: "AOAC 967.21 — Ácido Ascórbico por HPLC / titulação iodométrica" },
      { parameter: "Vitamina D3 (Colecalciferol)", category: "teor_ativo", criterion: "≥ 80% do valor declarado", methodologyShort: "HPLC-UV", methodologyCitation: "HPLC-UV / AOAC 995.05 — Vitamina D por cromatografia líquida de alta eficiência" },
      { parameter: "Vitamina E (Tocoferol)", category: "teor_ativo", criterion: "≥ 80% do valor declarado", methodologyShort: "HPLC", methodologyCitation: "HPLC / AOAC 971.30 — Vitamina E (alfa-tocoferol) por cromatografia" },
      { parameter: "Vitamina B1 (Tiamina)", category: "teor_ativo", criterion: "≥ 80% do valor declarado", methodologyShort: "HPLC", methodologyCitation: "HPLC / AOAC 942.23 — Tiamina por cromatografia líquida" },
      { parameter: "Vitamina B6 (Piridoxina)", category: "teor_ativo", criterion: "≥ 80% do valor declarado", methodologyShort: "HPLC", methodologyCitation: "HPLC / AOAC 985.32 — Piridoxina por cromatografia líquida" },
      { parameter: "Vitamina B12 (Cobalamina)", category: "teor_ativo", criterion: "≥ 80% do valor declarado", methodologyShort: "HPLC", methodologyCitation: "HPLC / AOAC 2011.10 — Vitamina B12 por cromatografia líquida" },
      { parameter: "Zinco", category: "teor_ativo", criterion: "≥ 80% do valor declarado", methodologyShort: "ICP-OES", methodologyCitation: "ICP-OES / AOAC 985.35 — Zinco por espectrometria de emissão atômica" },
      { parameter: "Magnésio", category: "teor_ativo", criterion: "≥ 80% do valor declarado", methodologyShort: "ICP-OES", methodologyCitation: "ICP-OES / AOAC 985.35 — Magnésio por espectrometria de emissão atômica" },
      // Embalagem
      { parameter: "Torque de tampa", category: "embalagem", criterion: "2,0 – 4,5 N·m", methodologyShort: "Torquímetro", methodologyCitation: "Ensaio de torque com torquímetro calibrado — remoção de tampa" },
      { parameter: "Selagem por indução", category: "embalagem", criterion: "Lacre íntegro, sem vazamentos ou danos", methodologyShort: "Visual", methodologyCitation: "Inspeção visual / Teste de pressão positiva" },
      { parameter: "Integridade selagem", category: "embalagem", criterion: "Sem deformação, bolhas ou ruptura", methodologyShort: "Visual", methodologyCitation: "Inspeção visual do lacre indutivo e da embalagem primária" },
    ],
  },
  {
    id: "omega3_softgel",
    name: "Ômega-3 (EPA + DHA) — Softgel / Cápsula Mole",
    description: "Suplemento alimentar de óleo de peixe em cápsula gelatinosa mole (softgel), 1g por cápsula",
    params: [
      // Físico-química
      { parameter: "Aparência", category: "fisico_quimica", criterion: "Cápsulas íntegras, translúcidas, sem vazamentos ou deformação", methodologyShort: "Visual", methodologyCitation: "Inspeção visual — integridade física da cápsula mole" },
      { parameter: "Cor", category: "fisico_quimica", criterion: "Amarelo âmbar a dourado", methodologyShort: "Organoléptico", methodologyCitation: "Análise organoléptica — inspeção visual" },
      { parameter: "Odor", category: "fisico_quimica", criterion: "Característico de óleo de peixe, sem rancidez intensa", methodologyShort: "Organoléptico", methodologyCitation: "Análise organoléptica" },
      { parameter: "Massa média", category: "fisico_quimica", criterion: "1,0 g ± 5%", methodologyShort: "FB 7ª Ed.", methodologyCitation: "Farmacopeia Brasileira 7ª Ed. — Determinação de massa média de cápsulas moles" },
      { parameter: "Índice de peróxido", category: "fisico_quimica", criterion: "≤ 5 mEq O₂/kg", methodologyShort: "AOAC 965.33", methodologyCitation: "AOAC 965.33 / AOCS Cd 8b-90 — Índice de peróxido (rancidez primária)" },
      { parameter: "Índice de anisidina (p-AV)", category: "fisico_quimica", criterion: "≤ 20", methodologyShort: "AOCS Cd 18-90", methodologyCitation: "AOCS Cd 18-90 — Índice de p-anisidina (rancidez secundária)" },
      { parameter: "TOTOX", category: "fisico_quimica", criterion: "≤ 26 (2×PV + AV)", methodologyShort: "Cálculo", methodologyCitation: "Cálculo TOTOX = 2 × Índice de Peróxido + Índice de Anisidina (GOED)" },
      { parameter: "Índice de acidez", category: "fisico_quimica", criterion: "≤ 3,0 mg KOH/g", methodologyShort: "AOCS Cd 3d-63", methodologyCitation: "AOCS Cd 3d-63 / AOAC 940.28 — Índice de acidez por titulação" },
      { parameter: "Dissolução", category: "fisico_quimica", criterion: "≥ 75% em 60 min (aparato Pá, 50 rpm)", methodologyShort: "FB 7ª Ed.", methodologyCitation: "Farmacopeia Brasileira 7ª Ed. — Ensaio de dissolução para cápsulas moles" },
      { parameter: "Sódio", category: "fisico_quimica", criterion: "Conforme rotulagem ± 20%", methodologyShort: "AOAC 984.27", methodologyCitation: "AOAC 984.27 — Sódio por ICP-OES / absorção atômica" },
      { parameter: "Kcal", category: "fisico_quimica", criterion: "Conforme rotulagem ± 20%", methodologyShort: "Cálculo Atwater", methodologyCitation: "Cálculo pelos fatores de Atwater / AOAC 2011.25" },
      // Microbiológica
      { parameter: "Salmonella spp. em 10 g", category: "microbiologica", criterion: "Ausente em 10 g", methodologyShort: "AOAC 996.08", methodologyCitation: "AOAC 996.08 / RDC 724/2022 — Salmonella spp. em 10 g" },
      { parameter: "Bolores e leveduras", category: "microbiologica", criterion: "≤ 10² UFC/g", methodologyShort: "AOAC 997.02", methodologyCitation: "AOAC 997.02 / RDC 724/2022 — Contagem de bolores e leveduras" },
      { parameter: "Escherichia coli", category: "microbiologica", criterion: "Ausente em 1 g", methodologyShort: "AOAC 991.14", methodologyCitation: "AOAC 991.14 / RDC 724/2022 — Escherichia coli (MPN)" },
      { parameter: "Contagem de Micro-organismos Aeróbios Mesófilos", category: "microbiologica", criterion: "≤ 10³ UFC/g", methodologyShort: "ISO 4833-1", methodologyCitation: "ISO 4833-1 / ABNT NBR — Contagem de micro-organismos aeróbios mesófilos a 30°C" },
      // Teor do Ativo
      { parameter: "EPA (Ácido Eicosapentaenoico)", category: "teor_ativo", criterion: "≥ 80% do valor declarado", methodologyShort: "GC-FID", methodologyCitation: "GC-FID / AOCS Ce 1b-89 — Ésteres metílicos de ácidos graxos (FAME) por cromatografia gasosa" },
      { parameter: "DHA (Ácido Docosahexaenoico)", category: "teor_ativo", criterion: "≥ 80% do valor declarado", methodologyShort: "GC-FID", methodologyCitation: "GC-FID / AOCS Ce 1b-89 — Ésteres metílicos de ácidos graxos (FAME) por cromatografia gasosa" },
      { parameter: "Ômega-3 Total (EPA + DHA)", category: "teor_ativo", criterion: "≥ 80% do valor declarado", methodologyShort: "GC-FID", methodologyCitation: "GC-FID / AOCS Ce 1b-89 — Somatório EPA + DHA por cromatografia gasosa" },
      // Embalagem
      { parameter: "Torque de tampa", category: "embalagem", criterion: "2,0 – 4,5 N·m", methodologyShort: "Torquímetro", methodologyCitation: "Ensaio de torque com torquímetro calibrado — remoção de tampa" },
      { parameter: "Selagem por indução", category: "embalagem", criterion: "Lacre íntegro, sem vazamentos ou danos", methodologyShort: "Visual", methodologyCitation: "Inspeção visual / Teste de pressão positiva" },
      { parameter: "Integridade selagem", category: "embalagem", criterion: "Sem deformação, bolhas ou ruptura", methodologyShort: "Visual", methodologyCitation: "Inspeção visual do lacre indutivo e da embalagem primária" },
    ],
  },
  {
    id: "probiotico_capsula_dura",
    name: "Probiótico — Cápsula Dura",
    description: "Suplemento alimentar de cepas probióticas liofilizadas em cápsula dura (Lactobacillus / Bifidobacterium)",
    params: [
      // Físico-química
      { parameter: "Aparência", category: "fisico_quimica", criterion: "Cápsulas íntegras, pó homogêneo internamente, cor uniforme", methodologyShort: "Visual", methodologyCitation: "Inspeção visual / análise organoléptica" },
      { parameter: "Cor", category: "fisico_quimica", criterion: "Característico (branco a levemente bege)", methodologyShort: "Organoléptico", methodologyCitation: "Análise organoléptica — inspeção visual" },
      { parameter: "Odor", category: "fisico_quimica", criterion: "Característico, sem odor de deterioração", methodologyShort: "Organoléptico", methodologyCitation: "Análise organoléptica" },
      { parameter: "Perda por dessecação", category: "fisico_quimica", criterion: "≤ 5,0%", methodologyShort: "FB 7ª Ed.", methodologyCitation: "Farmacopeia Brasileira 7ª Ed. — Perda por dessecação (105°C, 2h)" },
      { parameter: "Massa média", category: "fisico_quimica", criterion: "Conforme especificação ± 5%", methodologyShort: "FB 7ª Ed.", methodologyCitation: "Farmacopeia Brasileira 7ª Ed. — Determinação de massa média de cápsulas" },
      { parameter: "Dissolução", category: "fisico_quimica", criterion: "≥ 75% em 45 min (aparato Pá, 50 rpm)", methodologyShort: "FB 7ª Ed.", methodologyCitation: "Farmacopeia Brasileira 7ª Ed. — Ensaio de dissolução (Aparato 2 — Pá)" },
      { parameter: "Sódio", category: "fisico_quimica", criterion: "Conforme rotulagem ± 20%", methodologyShort: "AOAC 984.27", methodologyCitation: "AOAC 984.27 — Sódio por ICP-OES / absorção atômica" },
      // Microbiológica
      { parameter: "Salmonella spp. em 10 g", category: "microbiologica", criterion: "Ausente em 10 g", methodologyShort: "AOAC 996.08", methodologyCitation: "AOAC 996.08 / RDC 724/2022 — Salmonella spp. em 10 g" },
      { parameter: "Bolores e leveduras", category: "microbiologica", criterion: "≤ 10² UFC/g", methodologyShort: "AOAC 997.02", methodologyCitation: "AOAC 997.02 / RDC 724/2022 — Contagem de bolores e leveduras" },
      { parameter: "Escherichia coli", category: "microbiologica", criterion: "Ausente em 1 g", methodologyShort: "AOAC 991.14", methodologyCitation: "AOAC 991.14 / RDC 724/2022 — Escherichia coli (MPN)" },
      { parameter: "Contagem de Micro-organismos Aeróbios Mesófilos", category: "microbiologica", criterion: "≤ 10³ UFC/g", methodologyShort: "ISO 4833-1", methodologyCitation: "ISO 4833-1 / ABNT NBR — Contagem de micro-organismos aeróbios mesófilos a 30°C" },
      // Teor do Ativo
      { parameter: "Contagem de UFC — cepa probiótica total", category: "teor_ativo", criterion: "≥ 80% do valor declarado (UFC/cápsula)", methodologyShort: "ISO 19344", methodologyCitation: "ISO 19344 / IDF 232 — Contagem de bactérias probióticas viáveis por qPCR ou plaqueamento seletivo" },
      { parameter: "Viabilidade das cepas (identidade)", category: "teor_ativo", criterion: "Cepas declaradas identificadas e viáveis", methodologyShort: "PCR / Sequenc.", methodologyCitation: "PCR / Sequenciamento 16S rRNA — identificação e confirmação de identidade das cepas" },
      // Embalagem
      { parameter: "Torque de tampa", category: "embalagem", criterion: "2,0 – 4,5 N·m", methodologyShort: "Torquímetro", methodologyCitation: "Ensaio de torque com torquímetro calibrado — remoção de tampa" },
      { parameter: "Selagem por indução", category: "embalagem", criterion: "Lacre íntegro, sem vazamentos ou danos", methodologyShort: "Visual", methodologyCitation: "Inspeção visual / Teste de pressão positiva" },
      { parameter: "Integridade selagem", category: "embalagem", criterion: "Sem deformação, bolhas ou ruptura", methodologyShort: "Visual", methodologyCitation: "Inspeção visual do lacre indutivo e da embalagem primária" },
    ],
  },
  {
    id: "proteina_whey_po",
    name: "Proteína Whey / Vegetal — Pó (Frasco ou Sachê)",
    description: "Suplemento alimentar proteico em pó — Whey Protein (concentrado, isolado ou hidrolisado) ou proteína vegetal",
    params: [
      // Físico-química
      { parameter: "Aparência", category: "fisico_quimica", criterion: "Pó homogêneo, sem grumos, cor uniforme", methodologyShort: "Visual", methodologyCitation: "Inspeção visual / análise organoléptica" },
      { parameter: "Cor", category: "fisico_quimica", criterion: "Característico (branco a levemente amarelado)", methodologyShort: "Organoléptico", methodologyCitation: "Análise organoléptica — inspeção visual" },
      { parameter: "Odor", category: "fisico_quimica", criterion: "Característico, sem odor de deterioração ou rancidez", methodologyShort: "Organoléptico", methodologyCitation: "Análise organoléptica" },
      { parameter: "pH", category: "fisico_quimica", criterion: "6,0 – 7,5 (solução 1%)", methodologyShort: "AOAC 981.12", methodologyCitation: "AOAC 981.12 / Farmacopeia Brasileira 7ª Ed. — Determinação de pH" },
      { parameter: "Umidade", category: "fisico_quimica", criterion: "≤ 5,0%", methodologyShort: "AOAC 934.01", methodologyCitation: "AOAC 934.01 / Farmacopeia Brasileira 7ª Ed. — Umidade por dessecação" },
      { parameter: "Cinzas totais", category: "fisico_quimica", criterion: "≤ 5,0%", methodologyShort: "AOAC 942.05", methodologyCitation: "AOAC 942.05 — Cinzas totais por incineração" },
      { parameter: "Massa média", category: "fisico_quimica", criterion: "Conforme embalagem ± 5%", methodologyShort: "Gravimétrico", methodologyCitation: "Método gravimétrico — pesagem direta (balança analítica)" },
      { parameter: "Kcal", category: "fisico_quimica", criterion: "Conforme rotulagem ± 20%", methodologyShort: "Cálculo Atwater", methodologyCitation: "Cálculo pelos fatores de Atwater / AOAC 2011.25" },
      { parameter: "Sódio", category: "fisico_quimica", criterion: "Conforme rotulagem ± 20%", methodologyShort: "AOAC 984.27", methodologyCitation: "AOAC 984.27 — Sódio por ICP-OES / absorção atômica" },
      // Microbiológica
      { parameter: "Salmonella spp. em 25 g", category: "microbiologica", criterion: "Ausente em 25 g", methodologyShort: "AOAC 996.08", methodologyCitation: "AOAC 996.08 / RDC 724/2022 — Salmonella spp. em 25 g" },
      { parameter: "Bolores e leveduras", category: "microbiologica", criterion: "≤ 10³ UFC/g", methodologyShort: "AOAC 997.02", methodologyCitation: "AOAC 997.02 / RDC 724/2022 — Contagem de bolores e leveduras" },
      { parameter: "Escherichia coli", category: "microbiologica", criterion: "Ausente em 1 g", methodologyShort: "AOAC 991.14", methodologyCitation: "AOAC 991.14 / RDC 724/2022 — Escherichia coli (MPN)" },
      { parameter: "Enterobacteriaceae", category: "microbiologica", criterion: "≤ 10² UFC/g", methodologyShort: "ISO 21528-2", methodologyCitation: "ISO 21528-2 / ABNT NBR — Contagem de Enterobacteriaceae" },
      { parameter: "Estafilococos coagulase positiva por g", category: "microbiologica", criterion: "≤ 10² UFC/g", methodologyShort: "AOAC 975.55", methodologyCitation: "AOAC 975.55 / RDC 724/2022 — Estafilococos coagulase positiva" },
      // Teor do Ativo
      { parameter: "Proteína total", category: "teor_ativo", criterion: "≥ 80% do valor declarado", methodologyShort: "AOAC 990.03", methodologyCitation: "AOAC 990.03 — Proteína total pelo método de Kjeldahl" },
      { parameter: "BCAA total (Leucina + Isoleucina + Valina)", category: "teor_ativo", criterion: "≥ 80% do valor declarado", methodologyShort: "HPLC", methodologyCitation: "HPLC / AOAC 982.30 — Perfil de aminoácidos por cromatografia líquida" },
      // Embalagem
      { parameter: "Torque de tampa", category: "embalagem", criterion: "2,0 – 5,0 N·m", methodologyShort: "Torquímetro", methodologyCitation: "Ensaio de torque com torquímetro calibrado — remoção de tampa" },
      { parameter: "Selagem por indução", category: "embalagem", criterion: "Lacre íntegro, sem vazamentos ou danos", methodologyShort: "Visual", methodologyCitation: "Inspeção visual / Teste de pressão positiva" },
      { parameter: "Integridade selagem", category: "embalagem", criterion: "Sem deformação, bolhas ou ruptura", methodologyShort: "Visual", methodologyCitation: "Inspeção visual do lacre indutivo e da embalagem primária" },
    ],
  },
  {
    id: "vitamina_d_calcio_capsula",
    name: "Vitamina D3 + Cálcio — Cápsula Dura",
    description: "Suplemento alimentar de Vitamina D3 (colecalciferol) e Cálcio (carbonato ou citrato) em cápsula dura",
    params: [
      // Físico-química
      { parameter: "Aparência", category: "fisico_quimica", criterion: "Cápsulas íntegras, pó homogêneo, cor uniforme", methodologyShort: "Visual", methodologyCitation: "Inspeção visual / análise organoléptica" },
      { parameter: "Cor", category: "fisico_quimica", criterion: "Característico (branco a creme)", methodologyShort: "Organoléptico", methodologyCitation: "Análise organoléptica — inspeção visual" },
      { parameter: "Odor", category: "fisico_quimica", criterion: "Característico, inodoro", methodologyShort: "Organoléptico", methodologyCitation: "Análise organoléptica" },
      { parameter: "Perda por dessecação", category: "fisico_quimica", criterion: "≤ 5,0%", methodologyShort: "FB 7ª Ed.", methodologyCitation: "Farmacopeia Brasileira 7ª Ed. — Perda por dessecação (105°C, 2h)" },
      { parameter: "Massa média", category: "fisico_quimica", criterion: "Conforme especificação ± 5%", methodologyShort: "FB 7ª Ed.", methodologyCitation: "Farmacopeia Brasileira 7ª Ed. — Determinação de massa média de cápsulas" },
      { parameter: "Dissolução", category: "fisico_quimica", criterion: "≥ 75% em 45 min (aparato Pá, 50 rpm)", methodologyShort: "FB 7ª Ed.", methodologyCitation: "Farmacopeia Brasileira 7ª Ed. — Ensaio de dissolução (Aparato 2 — Pá)" },
      { parameter: "Cinzas totais", category: "fisico_quimica", criterion: "≤ 40,0% (cálcio carbonato contribui)", methodologyShort: "AOAC 942.05", methodologyCitation: "AOAC 942.05 — Cinzas totais por incineração" },
      { parameter: "Sódio", category: "fisico_quimica", criterion: "Conforme rotulagem ± 20%", methodologyShort: "AOAC 984.27", methodologyCitation: "AOAC 984.27 — Sódio por ICP-OES / absorção atômica" },
      // Microbiológica
      { parameter: "Salmonella spp. em 10 g", category: "microbiologica", criterion: "Ausente em 10 g", methodologyShort: "AOAC 996.08", methodologyCitation: "AOAC 996.08 / RDC 724/2022 — Salmonella spp. em 10 g" },
      { parameter: "Bolores e leveduras", category: "microbiologica", criterion: "≤ 10² UFC/g", methodologyShort: "AOAC 997.02", methodologyCitation: "AOAC 997.02 / RDC 724/2022 — Contagem de bolores e leveduras" },
      { parameter: "Escherichia coli", category: "microbiologica", criterion: "Ausente em 1 g", methodologyShort: "AOAC 991.14", methodologyCitation: "AOAC 991.14 / RDC 724/2022 — Escherichia coli (MPN)" },
      { parameter: "Contagem de Micro-organismos Aeróbios Mesófilos", category: "microbiologica", criterion: "≤ 10³ UFC/g", methodologyShort: "ISO 4833-1", methodologyCitation: "ISO 4833-1 / ABNT NBR — Contagem de micro-organismos aeróbios mesófilos a 30°C" },
      // Teor do Ativo
      { parameter: "Vitamina D3 (Colecalciferol)", category: "teor_ativo", criterion: "≥ 80% do valor declarado", methodologyShort: "HPLC-UV", methodologyCitation: "HPLC-UV / AOAC 995.05 — Vitamina D por cromatografia líquida de alta eficiência" },
      { parameter: "Cálcio", category: "teor_ativo", criterion: "≥ 80% do valor declarado", methodologyShort: "ICP-OES", methodologyCitation: "ICP-OES / AOAC 985.35 — Cálcio por espectrometria de emissão atômica com plasma indutivo" },
      // Embalagem
      { parameter: "Torque de tampa", category: "embalagem", criterion: "2,0 – 4,5 N·m", methodologyShort: "Torquímetro", methodologyCitation: "Ensaio de torque com torquímetro calibrado — remoção de tampa" },
      { parameter: "Selagem por indução", category: "embalagem", criterion: "Lacre íntegro, sem vazamentos ou danos", methodologyShort: "Visual", methodologyCitation: "Inspeção visual / Teste de pressão positiva" },
      { parameter: "Integridade selagem", category: "embalagem", criterion: "Sem deformação, bolhas ou ruptura", methodologyShort: "Visual", methodologyCitation: "Inspeção visual do lacre indutivo e da embalagem primária" },
    ],
  },
  {
    id: "comprimido_revestido_ferro_folico",
    name: "Ferro + Ácido Fólico — Comprimido Revestido",
    description: "Suplemento alimentar de Sulfato Ferroso e Ácido Fólico em comprimido revestido (drágea)",
    params: [
      // Físico-química
      { parameter: "Aparência", category: "fisico_quimica", criterion: "Comprimidos íntegros, revestimento uniforme, sem lascas ou fraturas", methodologyShort: "Visual", methodologyCitation: "Inspeção visual / análise organoléptica" },
      { parameter: "Cor", category: "fisico_quimica", criterion: "Característico (verde a verde-escuro uniforme)", methodologyShort: "Organoléptico", methodologyCitation: "Análise organoléptica — inspeção visual" },
      { parameter: "Odor", category: "fisico_quimica", criterion: "Característico, inodoro ou característico do revestimento", methodologyShort: "Organoléptico", methodologyCitation: "Análise organoléptica" },
      { parameter: "Perda por dessecação", category: "fisico_quimica", criterion: "≤ 5,0%", methodologyShort: "FB 7ª Ed.", methodologyCitation: "Farmacopeia Brasileira 7ª Ed. — Perda por dessecação (105°C, 2h)" },
      { parameter: "Massa média", category: "fisico_quimica", criterion: "Conforme especificação ± 5%", methodologyShort: "FB 7ª Ed.", methodologyCitation: "Farmacopeia Brasileira 7ª Ed. — Determinação de massa média de comprimidos" },
      { parameter: "Dissolução", category: "fisico_quimica", criterion: "≥ 75% em 45 min (aparato Pá, 50 rpm)", methodologyShort: "FB 7ª Ed.", methodologyCitation: "Farmacopeia Brasileira 7ª Ed. — Ensaio de dissolução (Aparato 2 — Pá)" },
      { parameter: "Dureza", category: "fisico_quimica", criterion: "≥ 40 N", methodologyShort: "FB 7ª Ed.", methodologyCitation: "Farmacopeia Brasileira 7ª Ed. — Determinação de dureza de comprimidos" },
      { parameter: "Friabilidade", category: "fisico_quimica", criterion: "≤ 1,5%", methodologyShort: "FB 7ª Ed.", methodologyCitation: "Farmacopeia Brasileira 7ª Ed. — Determinação de friabilidade de comprimidos" },
      { parameter: "Sódio", category: "fisico_quimica", criterion: "Conforme rotulagem ± 20%", methodologyShort: "AOAC 984.27", methodologyCitation: "AOAC 984.27 — Sódio por ICP-OES / absorção atômica" },
      // Microbiológica
      { parameter: "Salmonella spp. em 10 g", category: "microbiologica", criterion: "Ausente em 10 g", methodologyShort: "AOAC 996.08", methodologyCitation: "AOAC 996.08 / RDC 724/2022 — Salmonella spp. em 10 g" },
      { parameter: "Bolores e leveduras", category: "microbiologica", criterion: "≤ 10² UFC/g", methodologyShort: "AOAC 997.02", methodologyCitation: "AOAC 997.02 / RDC 724/2022 — Contagem de bolores e leveduras" },
      { parameter: "Escherichia coli", category: "microbiologica", criterion: "Ausente em 1 g", methodologyShort: "AOAC 991.14", methodologyCitation: "AOAC 991.14 / RDC 724/2022 — Escherichia coli (MPN)" },
      { parameter: "Contagem de Micro-organismos Aeróbios Mesófilos", category: "microbiologica", criterion: "≤ 10³ UFC/g", methodologyShort: "ISO 4833-1", methodologyCitation: "ISO 4833-1 / ABNT NBR — Contagem de micro-organismos aeróbios mesófilos a 30°C" },
      // Teor do Ativo
      { parameter: "Ferro (Sulfato Ferroso)", category: "teor_ativo", criterion: "≥ 80% do valor declarado", methodologyShort: "ICP-OES", methodologyCitation: "ICP-OES / AOAC 985.35 — Ferro por espectrometria de emissão atômica" },
      { parameter: "Ácido Fólico (Vitamina B9)", category: "teor_ativo", criterion: "≥ 80% do valor declarado", methodologyShort: "HPLC", methodologyCitation: "HPLC / AOAC 2004.05 — Ácido Fólico por cromatografia líquida de alta eficiência" },
      // Embalagem
      { parameter: "Torque de tampa", category: "embalagem", criterion: "2,0 – 4,5 N·m", methodologyShort: "Torquímetro", methodologyCitation: "Ensaio de torque com torquímetro calibrado — remoção de tampa" },
      { parameter: "Selagem por indução", category: "embalagem", criterion: "Lacre íntegro, sem vazamentos ou danos", methodologyShort: "Visual", methodologyCitation: "Inspeção visual / Teste de pressão positiva" },
      { parameter: "Integridade selagem", category: "embalagem", criterion: "Sem deformação, bolhas ou ruptura", methodologyShort: "Visual", methodologyCitation: "Inspeção visual do lacre indutivo e da embalagem primária" },
    ],
  },
];

const CATEGORY_PRESETS: Record<string, { parameter: string; criterion: string }[]> = {
  microbiologica: [
    { parameter: "Salmonella spp. em 10 g", criterion: "Ausente em 10 g" },
    { parameter: "Salmonella spp. em 25 g", criterion: "Ausente em 25 g" },
    { parameter: "Bolores e leveduras", criterion: "≤ 10² UFC/g" },
    { parameter: "Escherichia coli", criterion: "Ausente em 1 g" },
    { parameter: "Contagem de Micro-organismos Aeróbios Mesófilos", criterion: "≤ 10³ UFC/g" },
    { parameter: "Enterobacteriaceae", criterion: "≤ 10² UFC/g" },
    { parameter: "Estafilococos coagulase positiva por g", criterion: "≤ 10² UFC/g" },
    { parameter: "Coliformes totais", criterion: "≤ 10² UFC/g" },
    { parameter: "Estafilococos coagulase+", criterion: "≤ 10² UFC/g" },
  ],
  teor_ativo: [
    { parameter: "Cálcio", criterion: "Mín. 80% do valor declarado" },
    { parameter: "Vitamina D", criterion: "Mín. 80% do valor declarado" },
    { parameter: "Vitamina C (Ácido Ascórbico)", criterion: "Mín. 80% do valor declarado" },
    { parameter: "Vitamina E (Tocoferol)", criterion: "Mín. 80% do valor declarado" },
    { parameter: "Vitamina K", criterion: "Mín. 80% do valor declarado" },
    { parameter: "Vitamina A (Retinol)", criterion: "Mín. 80% do valor declarado" },
    { parameter: "Vitamina B1 (Tiamina)", criterion: "Mín. 80% do valor declarado" },
    { parameter: "Vitamina B2 (Riboflavina)", criterion: "Mín. 80% do valor declarado" },
    { parameter: "Vitamina B3 (Niacina)", criterion: "Mín. 80% do valor declarado" },
    { parameter: "Vitamina B5 (Ác. Pantotênico)", criterion: "Mín. 80% do valor declarado" },
    { parameter: "Vitamina B6 (Piridoxina)", criterion: "Mín. 80% do valor declarado" },
    { parameter: "Vitamina B9 (Ác. Fólico)", criterion: "Mín. 80% do valor declarado" },
    { parameter: "Vitamina B12 (Cobalamina)", criterion: "Mín. 80% do valor declarado" },
    { parameter: "Biotina (Vitamina H)", criterion: "Mín. 80% do valor declarado" },
    { parameter: "Magnésio", criterion: "Mín. 80% do valor declarado" },
    { parameter: "Ferro", criterion: "Mín. 80% do valor declarado" },
    { parameter: "Zinco", criterion: "Mín. 80% do valor declarado" },
    { parameter: "Selênio", criterion: "Mín. 80% do valor declarado" },
    { parameter: "Potássio", criterion: "Mín. 80% do valor declarado" },
    { parameter: "Manganês", criterion: "Mín. 80% do valor declarado" },
    { parameter: "Cromo", criterion: "Mín. 80% do valor declarado" },
    { parameter: "Cobre", criterion: "Mín. 80% do valor declarado" },
    { parameter: "Iodo", criterion: "Mín. 80% do valor declarado" },
    { parameter: "Coenzima Q10", criterion: "Mín. 80% do valor declarado" },
    { parameter: "Ômega-3 (EPA+DHA)", criterion: "Mín. 80% do valor declarado" },
    { parameter: "Colágeno Hidrolisado", criterion: "Mín. 80% do valor declarado" },
    { parameter: "Creatina", criterion: "Mín. 80% do valor declarado" },
    { parameter: "Extrato de Cúrcuma", criterion: "Mín. 80% do valor declarado" },
    { parameter: "Extrato de Própolis", criterion: "Mín. 80% do valor declarado" },
    { parameter: "Probióticos (UFC/g)", criterion: "Mín. 80% do valor declarado" },
    { parameter: "Ácido Hialurônico", criterion: "Mín. 80% do valor declarado" },
    { parameter: "Resveratrol", criterion: "Mín. 80% do valor declarado" },
    { parameter: "Extrato de Açaí", criterion: "Mín. 80% do valor declarado" },
    { parameter: "Licopeno", criterion: "Mín. 80% do valor declarado" },
    { parameter: "Luteína", criterion: "Mín. 80% do valor declarado" },
    { parameter: "Zeaxantina", criterion: "Mín. 80% do valor declarado" },
    { parameter: "L-Glutamina", criterion: "Mín. 80% do valor declarado" },
    { parameter: "L-Carnitina", criterion: "Mín. 80% do valor declarado" },
    { parameter: "Beta-Glucana", criterion: "Mín. 80% do valor declarado" },
    { parameter: "Inulina", criterion: "Mín. 80% do valor declarado" },
  ],
};


// ── Kinetics types & utilities ────────────────────────────────────────────────
type KineticOverride = {
  t0: string; t3: string; t6: string;
  deltaLn: string; k: string;
  ichThreshold: string;   // Minimum content threshold % — used in t_val formula (default: 90)
  specMin: string;        // Specification/criterion range min — informational only, NOT used in calc
  specMax: string;        // Specification/criterion range max — informational only
  shelfLife: string; validadePraticada: string;
};

function parseCriterionRange(criterion: string | null | undefined): { min: string; max: string } {
  if (!criterion) return { min: "", max: "" };
  const normalized = criterion.replace(/,/g, ".").replace(/[–—]/g, "-").replace(/%/g, "").trim();

  // Case 1: full range "X - Y" (e.g. "98.50 - 100.50")
  const rangeMatch = normalized.match(/(\d+\.?\d*)\s*-\s*(\d+\.?\d*)/);
  if (rangeMatch) return { min: rangeMatch[1], max: rangeMatch[2] };

  // Case 2: minimum-only spec "Mín. X" / "Min X" / "≥ X" (e.g. "Mín. 80 do valor declarado")
  const minOnlyMatch = normalized.match(/(?:m[íi]n\.?\s*|>=?\s*|≥\s*)(\d+\.?\d*)/i);
  if (minOnlyMatch) return { min: minOnlyMatch[1], max: "" };

  // Case 3: bare single number
  const singleMatch = normalized.match(/^(\d+\.?\d*)$/);
  if (singleMatch) return { min: singleMatch[1], max: "" };

  return { min: "", max: "" };
}

/**
 * Compute kinetic values from raw inputs.
 *
 * Formula (T0→T6 full interval):
 *   Δln = −ln(T6 / T0)
 *   k   = Δln / 6   (months⁻¹)
 *   t_val = −ln(ichThreshold / C0) / k   where C0 = T0
 *
 * ichThreshold is the ICH minimum content threshold (default 80 %).
 * It is SEPARATE from the specification/criterion range (specMin/specMax)
 * which is purely informational and must NOT be used here.
 */
function calcKineticOverride(
  t0s: string, t3s: string, t6s: string, ichThresholds: string,
): Partial<KineticOverride> {
  const t0 = parseFloat(t0s.replace(",", "."));
  const t6 = parseFloat(t6s.replace(",", "."));
  const ichThreshold = parseFloat(ichThresholds.replace(",", "."));

  if (isNaN(t0) || isNaN(t6) || t0 <= 0 || t6 <= 0) return {};

  // Δln = −ln(T6/T0)
  const deltaLn = -Math.log(t6 / t0);
  // k = Δln / 6  (T0→T6 = 6 months)
  const k = deltaLn / 6;

  if (k <= 0 || isNaN(k)) return { deltaLn: deltaLn.toFixed(6), k: "" };

  const c0 = t0;

  // t_val = −ln(ichThreshold / C0) / k
  const lnNum = isNaN(ichThreshold) || ichThreshold <= 0 ? NaN : -Math.log(ichThreshold / c0);
  const shelfLife = !isNaN(lnNum) && lnNum > 0 ? (lnNum / k).toFixed(2) : "";

  return {
    deltaLn: deltaLn.toFixed(6),
    k: k.toFixed(6),
    shelfLife,
  };
}

function calcMedia(t0s: string, t3s: string, t6s: string): string {
  const vals = [t0s, t3s, t6s].map((s) => parseFloat(s.replace(",", "."))).filter((v) => !isNaN(v));
  if (vals.length === 0) return "";
  return (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2);
}

function normalizeSearch(s: string) {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

type KineticApiParam = {
  t0?: number | null; t3?: number | null; t6?: number | null;
  deltaLn?: number | null; k?: number | null;
  estimatedShelfLifeMonths?: number | null;
  minThresholdPercent: number;
  criterion?: string | null;
  kLongTerm?: number | null;
  kAccelerated?: number | null;
  conditionTempLt?: number | null;
  conditionTempAcc?: number | null;
  conditionHumLt?: number | null;
  conditionHumAcc?: number | null;
  ea?: number | null;
  arrheniusA?: number | null;
  shelfLifeArrhenius?: number | null;
};

function buildKineticOverride(p: KineticApiParam): KineticOverride {
  const t0 = p.t0 != null ? p.t0.toFixed(2) : "";
  const t3 = p.t3 != null ? p.t3.toFixed(2) : "";
  const t6 = p.t6 != null ? p.t6.toFixed(2) : "";
  const { min: specMin, max: specMax } = parseCriterionRange(p.criterion);
  // Prefer Arrhenius-corrected shelf life (at long-term temp) when available;
  // fall back to raw ICH Q1A estimate (at the bucket's measurement temperature).
  const effectiveShelfLife = p.shelfLifeArrhenius ?? p.estimatedShelfLifeMonths;
  return {
    t0, t3, t6,
    deltaLn: p.deltaLn != null ? p.deltaLn.toFixed(6) : "",
    k: p.k != null ? p.k.toFixed(6) : "",
    ichThreshold: p.minThresholdPercent.toString(),
    specMin,
    specMax,
    shelfLife: effectiveShelfLife != null ? effectiveShelfLife.toFixed(2) : "",
    validadePraticada: "",
  };
}

type KineticsOverridesDB = {
  savedAt?: string;
  params?: Record<string, {
    t0?: string; t3?: string; t6?: string;
    specMin?: string; specMax?: string;
    validadePraticada?: string; ichThreshold?: string;
    manualFields?: string[];
  }>;
  customShelfLife?: string;
  selectedShelfBox?: "standard" | "overage" | "extrap_std" | "extrap_overage" | null;
  /** true quando o usuário travou a Validade Praticada manualmente */
  validityLocked?: boolean;
  /** valor digitado pelo usuário para Validade Praticada */
  cardValidity?: string;
};


export type { ActiveCell, EditableParam, KineticOverride, KineticApiParam, KineticsOverridesDB, CatalogEntry, ProductTemplateParam, ProductTemplate };
export { STATUS_LABELS, STATUS_COLORS, RESULT_STATUS_COLORS, ANALYSIS_PARAMETERS, MICRO_PARAMS_CAPSULA, MICRO_PARAMS_PO, PERIODS, lotSchema, finalizeSchema };
export { isToday, getDefaultParams };
export { PARAM_CATALOG_KEY, getCatalogEntries, addToCatalog, getParamsForMethodology, getPresetsForCategory, normalizeSearch };
export { PRODUCT_TEMPLATES, CATEGORY_PRESETS };
export { parseCriterionRange, calcKineticOverride, calcMedia, buildKineticOverride };
