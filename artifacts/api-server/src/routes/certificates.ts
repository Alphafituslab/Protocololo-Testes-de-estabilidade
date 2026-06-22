import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, protocolsTable, lotsTable, analysisResultsTable, methodologiesTable } from "@workspace/db";
import { GetCertificateParams } from "@workspace/api-zod";

const METHOD_MAP: Record<string, string> = {
  "Calcio": "Farmacopeia Brasileira, 7ª edição (2024), Método Geral IF077-00 – Determinação de Cálcio por Titulação Complexométrica.",
  "Vitamina D": "Japanese Pharmacopoeia (JP), 18th ed. Tokyo: Ministry of Health, Labour and Welfare (MHLW), 2021.",
  "Cinzas totais": "Métodos físico-químicos para análise de alimentos, 4. ed. São Paulo: Instituto Adolfo Lutz, 2008. Método: 018/IV.",
  "pH": "Métodos físico-químicos para análise de alimentos, 4. ed. São Paulo: Instituto Adolfo Lutz, 2008. Método: 017/IV.",
  "Perda por dessecação": "Métodos físico-químicos para análise de alimentos, 4. ed. São Paulo: Instituto Adolfo Lutz, 2008. Método: 012/IV.",
  "Cor": "Métodos físico-químicos para análise de alimentos, 4. ed. São Paulo: Instituto Adolfo Lutz, 2008. Método: 060/IV.",
  "Odor": "Métodos físico-químicos para análise de alimentos, 4. ed. São Paulo: Instituto Adolfo Lutz, 2008. Método: 060/IV.",
  "Aparência": "Métodos físico-químicos para análise de alimentos, 4. ed. São Paulo: Instituto Adolfo Lutz, 2008. Método: 060/IV.",
  "Coliformes totais": "CompactDry™ CF: Instructions for Use. Tokyo: Nissui Pharmaceutical Co., Ltd.",
  "Salmonella spp.": "CompactDry™ SL: Instructions for Use. Tokyo: Nissui Pharmaceutical Co., Ltd.",
  "Estafilococos coagulase+": "CompactDry™ X-SA: Instructions for Use. Tokyo: Nissui Pharmaceutical Co., Ltd.",
  "Bolores e leveduras": "CompactDry™ YMR / YM: Instructions for Use. Tokyo: Nissui Pharmaceutical Co., Ltd.",
  "Escherichia coli": "CompactDry™ EC: Instructions for Use. Tokyo: Nissui Pharmaceutical Co., Ltd.",
  "Enterobacteriaceae": "CompactDry™ ETB: Instructions for Use. Tokyo: Nissui Pharmaceutical Co., Ltd.",
  "Torque de tampa": "Procedimento Operacional Padrão (POP) nº 047. Içara: Alphafitus Suplementos Ltda., 2024. Documento interno.",
  "Selagem por indução": "Procedimento Operacional Padrão (POP) nº 049. Içara: Alphafitus Suplementos Ltda., 2024. Documento interno.",
  "Integridade selagem": "Procedimento Operacional Padrão (POP) nº 050. Içara: Alphafitus Suplementos Ltda., 2024. Documento interno.",
  "Kcal": "Métodos físico-químicos para análise de alimentos, 4. ed. São Paulo: Instituto Adolfo Lutz, 2008.",
  "Sódio": "Métodos físico-químicos para análise de alimentos, 4. ed. São Paulo: Instituto Adolfo Lutz, 2008.",
  "Dissolução": "Farmacopeia Brasileira, 7ª edição (2024).",
  "Massa média": "Farmacopeia Brasileira, 7ª edição (2024).",
};

const router: IRouter = Router();

router.get("/protocols/:id/certificate", async (req, res): Promise<void> => {
  const params = GetCertificateParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [protocol] = await db
    .select()
    .from(protocolsTable)
    .where(eq(protocolsTable.id, params.data.id));
  if (!protocol) {
    res.status(404).json({ error: "Protocol not found" });
    return;
  }

  const [lots, allResults, allMethodologies] = await Promise.all([
    db.select().from(lotsTable).where(eq(lotsTable.protocolId, params.data.id)).orderBy(lotsTable.createdAt),
    db.select().from(analysisResultsTable).where(eq(analysisResultsTable.protocolId, params.data.id)),
    db.select().from(methodologiesTable),
  ]);

  // ── Methodology library lookups ──────────────────────────────────────────
  // shortName → criteria text (for specification column)
  const shortNameToCriteria: Record<string, string> = {};
  for (const m of allMethodologies) {
    if (m.shortName && m.criteria) shortNameToCriteria[m.shortName] = m.criteria;
  }

  // paramName → methodology shortName (from paramMethodsJson stored on protocol)
  const paramMethodsMap: Record<string, string> = {};
  if (protocol.paramMethodsJson) {
    try { Object.assign(paramMethodsMap, JSON.parse(protocol.paramMethodsJson)); } catch { /* ignore */ }
  }

  // paramName → citation (from paramMethodsCitationsJson stored on protocol)
  const paramCitationsMap: Record<string, string> = {};
  if (protocol.paramMethodsCitationsJson) {
    try { Object.assign(paramCitationsMap, JSON.parse(protocol.paramMethodsCitationsJson)); } catch { /* ignore */ }
  }

  // ── ANVISA limits per ativo (min/max/unit/declared) ──────────────────────
  type AtivoLimit = { min: string; max: string; unit: string; declared: string; overage?: string };

  // Deep normalize for fuzzy matching:
  //  - removes accents ("Magnésio" → "Magnesio")
  //  - removes "L-" / "DL-" / "D-" prefixes ("L-triptofano" → "triptofano")
  //  - strips parenthetical content ("Vitamina B1 (Tiamina)" → "vitamina b1")
  //  - normalizes dashes/underscores to spaces
  const deepNorm = (s: string): string =>
    s.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/\bdl?-\s*/g, "")        // DL- or L- or D- prefix
      .replace(/\s*\(.*?\)\s*/g, " ")   // (parenthetical)
      .replace(/[-_]/g, " ")
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  const ativoLimitsMap: Record<string, AtivoLimit> = {};
  // deep-normalized key → all matching AtivoLimit entries (several keys may collapse to same deep form)
  const ativoLimitsDeep: Record<string, AtivoLimit[]> = {};

  if (protocol.ativoLimitsJson) {
    try {
      const raw = JSON.parse(protocol.ativoLimitsJson) as Record<string, AtivoLimit>;
      for (const [k, v] of Object.entries(raw)) {
        ativoLimitsMap[k] = v;
        const d = deepNorm(k);
        (ativoLimitsDeep[d] = ativoLimitsDeep[d] ?? []).push(v);
      }
    } catch { /* ignore */ }
  }

  // Among candidates, prefer the one with a non-empty declared value.
  const pickBest = (arr: AtivoLimit[]): AtivoLimit | undefined =>
    arr.find(v => v.declared) ?? arr[0];

  // Returns ativoLimit for `param`. Matching strategy (first match wins):
  //  1. Exact key
  //  2. Deep-normalized exact  (handles accents, L- prefix, parentheses)
  //  3. One deep-normalized key starts with the other at a word boundary
  //     ("vitamina k" starts "vitamina k menaquinona 7")
  //  4. One deep-normalized key contains the other as a whole word
  //     ("colina" is a word inside "vitamina b8 colina bitartarato")
  // At each step, prefer entries that have a non-empty declared value.
  const getAtivoLimit = (p: string): AtivoLimit | undefined => {
    // 1. Exact
    const exact = ativoLimitsMap[p];
    if (exact?.declared) return exact;

    // 2. Deep-normalized exact
    const pDeep = deepNorm(p);
    const deepExact = ativoLimitsDeep[pDeep];
    if (deepExact) {
      const best = pickBest(deepExact);
      if (best?.declared) return best;
    }

    // 3. Prefix match at word boundary (min length 5 to avoid "vitamin" matching many)
    if (pDeep.length >= 5) {
      let prefixBest: AtivoLimit | undefined;
      for (const [kDeep, vArr] of Object.entries(ativoLimitsDeep)) {
        if (kDeep === pDeep) continue;
        const shorter = kDeep.length <= pDeep.length ? kDeep : pDeep;
        const longer  = kDeep.length <= pDeep.length ? pDeep  : kDeep;
        if (shorter.length < 5) continue;
        if (longer.startsWith(shorter) && (longer.length === shorter.length || longer[shorter.length] === " ")) {
          const candidate = pickBest(vArr);
          if (candidate?.declared && !prefixBest?.declared) prefixBest = candidate;
          if (!prefixBest) prefixBest = candidate;
        }
      }
      if (prefixBest?.declared) return prefixBest;
    }

    // 4. Contains match at word boundary (min 6 chars to reduce false positives)
    if (pDeep.length >= 6) {
      let containsBest: AtivoLimit | undefined;
      const wordRe = new RegExp(`(?:^|\\s)${pDeep.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:\\s|$)`);
      for (const [kDeep, vArr] of Object.entries(ativoLimitsDeep)) {
        if (kDeep === pDeep) continue;
        if (wordRe.test(kDeep)) {
          const candidate = pickBest(vArr);
          if (candidate?.declared && !containsBest?.declared) containsBest = candidate;
          if (!containsBest) containsBest = candidate;
        }
      }
      if (containsBest?.declared) return containsBest;
    }

    // Fallback: return any match regardless of declared (for faixa display)
    return exact ?? pickBest(deepExact ?? []);
  };

  // ── T6 values from kinetics overrides (what the user sees in the Cinética tab) ─
  // kineticsOverridesJson is saved in nested format by saveOverridesToDb:
  //   { savedAt, params: { [param]: { t6, t0, t3, ... } }, customShelfLife }
  // Older saves may have used a legacy flat format: { [param]: { t6, ... } }
  // We support both so old data keeps working.
  type KineticOverrideEntry = { t0?: string; t3?: string; t6?: string };
  type KineticsOverridesDB = { savedAt?: string; params?: Record<string, KineticOverrideEntry>; customShelfLife?: string };
  const kineticsT6Map: Record<string, number> = {};
  const kineticsT6MapNorm: Record<string, number> = {};         // keyed by lowercase+trimmed
  if (protocol.kineticsOverridesJson) {
    try {
      const raw = JSON.parse(protocol.kineticsOverridesJson) as KineticsOverridesDB | Record<string, KineticOverrideEntry>;
      // Detect nested format: has a "params" object whose values have t0/t3/t6 strings
      const paramMap: Record<string, KineticOverrideEntry> =
        (raw as KineticsOverridesDB).params && typeof (raw as KineticsOverridesDB).params === "object"
          ? (raw as KineticsOverridesDB).params!
          : (raw as Record<string, KineticOverrideEntry>);
      for (const [param, ov] of Object.entries(paramMap)) {
        if (!ov || typeof ov !== "object") continue;
        const t6Num = parseFloat((ov as KineticOverrideEntry).t6 ?? "");
        if (!isNaN(t6Num)) {
          kineticsT6Map[param] = t6Num;
          kineticsT6MapNorm[param.toLowerCase().trim()] = t6Num;
        }
      }
    } catch { /* ignore */ }
  }
  // Returns kinetics T6 value — tries exact key first, then normalized.
  const getKineticsT6 = (p: string): number | undefined =>
    kineticsT6Map[p] ?? kineticsT6MapNorm[p.toLowerCase().trim()];

  const CATEGORY_ORDER: Record<string, number> = {
    fisico_quimica: 0,
    microbiologica: 1,
    teor_ativo: 2,
    embalagem: 3,
  };

  /**
   * Checks whether a numeric average satisfies the criterion string.
   * Returns true (within spec), false (out of spec), or null (qualitative — cannot determine).
   * Handles: "8,90 – 9,40"  |  "≤ 5%"  |  "≥ 80%"  |  "< 10"  |  "> 5"
   */
  function isWithinCriterion(avg: number, criterion: string): boolean | null {
    const normalized = criterion.replace(/,/g, ".").replace(/\s+/g, " ");

    // Range: e.g. "8.90 – 9.40" or "8.90 - 9.40"
    const rangeMatch = normalized.match(/^(\d+\.?\d*)\s*[–\-]\s*(\d+\.?\d*)/);
    if (rangeMatch) {
      const min = parseFloat(rangeMatch[1]);
      const max = parseFloat(rangeMatch[2]);
      return avg >= min && avg <= max;
    }

    // Max: "≤ 5%" or "< 5"
    const maxMatch = normalized.match(/[≤<]\s*(\d+\.?\d*)/);
    if (maxMatch) return avg <= parseFloat(maxMatch[1]);

    // Min: "≥ 80%" or "> 80"
    const minMatch = normalized.match(/[≥>]\s*(\d+\.?\d*)/);
    if (minMatch) return avg >= parseFloat(minMatch[1]);

    return null; // qualitative criterion — skip numeric check
  }

  // Protocol-level decision: if operator finalized as "aprovado_com_ressalva",
  // that override is authoritative — all NC individual results are treated as AR.
  const protocolIsAR = protocol.finalStatus === "aprovado_com_ressalva";

  const avgByParam: Record<string, { sum: number; count: number; criterion: string; resultText: string; status: string; category: string }> = {};

  // T6-only accumulator for teor_ativo — kinetics tab uses period=6 exclusively,
  // so the certificate must use the same source for ANVISA mg calculation and status.
  // Using a cross-period average inflates the value (T0/T3 are higher than T6).
  const t6AvgByParam: Record<string, { sum: number; count: number }> = {};

  for (const r of allResults) {
    if (!avgByParam[r.parameter]) {
      avgByParam[r.parameter] = { sum: 0, count: 0, criterion: r.criterion, resultText: r.result, status: r.status, category: r.category };
    }
    if (r.numericResult != null) {
      avgByParam[r.parameter].sum += r.numericResult;
      avgByParam[r.parameter].count += 1;
    }
    // Track T6-only for teor_ativo (same calculation as kinetics.ts)
    if (r.category === "teor_ativo" && r.period === 6 && r.numericResult != null) {
      if (!t6AvgByParam[r.parameter]) t6AvgByParam[r.parameter] = { sum: 0, count: 0 };
      t6AvgByParam[r.parameter].sum += r.numericResult;
      t6AvgByParam[r.parameter].count += 1;
    }
    // AR is an explicit operator release — it overrides NC at individual result level too
    if (r.status === "aprovado_com_ressalva") {
      avgByParam[r.parameter].status = "aprovado_com_ressalva";
    } else if (r.status === "nao_conforme" && avgByParam[r.parameter].status !== "aprovado_com_ressalva") {
      avgByParam[r.parameter].status = "nao_conforme";
    }
  }

  // ── Deduplicate teor_ativo params that fuzzy-match the same ANVISA limit entry ──
  // When analysis_results has both a generic name ("Creatina") and a specific name
  // ("Creatina monohidratada"), both resolve to the same ativoLimitsJson entry via
  // fuzzy matching. The generic entry (older results, no kineticsT6) may evaluate as
  // NC (e.g. 92% × declared_mg < min_mg when min = declared) while the specific entry
  // (with kineticsT6 saved) is Conforme.
  //
  // Rule: skip a teor_ativo param that has NO exact match in ativoLimitsMap when
  // another param DOES have an exact match to the same limit entry (same declared/min/max).
  const ativoDedupeSkip = new Set<string>();
  {
    // Params that are direct keys in ativoLimitsMap with a filled declared value
    const exactParams = new Set(
      Object.keys(avgByParam).filter(
        p => avgByParam[p].category === "teor_ativo" && !!(ativoLimitsMap[p]?.declared)
      )
    );
    // Build limit-key set for all exact-match params
    const exactLimKeySet = new Set<string>();
    for (const ep of exactParams) {
      const lim = getAtivoLimit(ep);
      if (lim?.declared) exactLimKeySet.add(`${lim.declared}|${lim.unit ?? ""}|${lim.min ?? ""}|${lim.max ?? ""}`);
    }
    // Any non-exact param whose fuzzy-matched limit collides with an exact param → skip
    for (const [param, data] of Object.entries(avgByParam)) {
      if (data.category !== "teor_ativo") continue;
      if (exactParams.has(param)) continue;
      const lim = getAtivoLimit(param);
      if (!lim?.declared) continue;
      const limKey = `${lim.declared}|${lim.unit ?? ""}|${lim.min ?? ""}|${lim.max ?? ""}`;
      if (exactLimKeySet.has(limKey)) ativoDedupeSkip.add(param);
    }
  }

  // ── Diagnostic log — helps debug missing mg info in production ─────────
  req.log.info({
    protocolId: params.data.id,
    ativoLimitsKeys: Object.entries(ativoLimitsMap).map(([k, v]) => ({
      param: k,
      declared: v.declared ?? "",
      min: v.min ?? "",
      max: v.max ?? "",
    })),
    teor_ativo_params: Object.entries(avgByParam)
      .filter(([, d]) => d.category === "teor_ativo")
      .map(([p]) => ({
        param: p,
        found: !!getAtivoLimit(p),
        declared: getAtivoLimit(p)?.declared ?? "(not found)",
        t6Only: (() => { const e = t6AvgByParam[p]; return e && e.count > 0 ? e.sum / e.count : null; })(),
        kineticsT6: getKineticsT6(p) ?? null,
      })),
  }, "cert-debug");

  const analyses = Object.entries(avgByParam)
    .filter(([param, data]) => !(data.category === "teor_ativo" && ativoDedupeSkip.has(param)))
    .sort(([, a], [, b]) => (CATEGORY_ORDER[a.category] ?? 9) - (CATEGORY_ORDER[b.category] ?? 9))
    .map(([param, data]) => {
      const avg = data.count > 0 ? data.sum / data.count : null;
      const avgPercent = avg !== null ? avg.toFixed(2) : null;

      // Re-evaluate status based on the computed average vs criterion.
      // AR (whether per-cell or protocol-level) is never downgraded automatically.
      let finalStatus = data.status;

      // Step 1: auto-detect NC from numeric average when status is still "conforme"
      if (avg !== null && finalStatus !== "nao_conforme" && finalStatus !== "aprovado_com_ressalva") {
        const withinSpec = isWithinCriterion(avg, data.criterion);
        if (withinSpec === false) finalStatus = "nao_conforme";
      }

      // Step 2: if protocol was finalized as AR, override ALL NC (whether from DB or auto-detected)
      if (protocolIsAR && finalStatus === "nao_conforme") {
        finalStatus = "aprovado_com_ressalva";
      }

      // Step 3: Brazilian nutritional labeling rule (RDC 429/2020 / IN 75/2020).
      // Kcal and Sódio are ALWAYS Conforme (< threshold → declare as 0 → valid; ≥ threshold → declare value → valid).
      const ALWAYS_CONFORME_PARAMS = new Set(["kcal", "sódio", "sodio", "sódio (mg)", "sodio (mg)"]);
      if (ALWAYS_CONFORME_PARAMS.has(param.toLowerCase()) && finalStatus === "nao_conforme") {
        finalStatus = "conforme";
      }

      // ── method: DB citation (from methodology library) > static fallback map > generic ──
      const method = paramCitationsMap[param] || METHOD_MAP[param] || "Método interno.";

      // ── specification: methodology library criteria > analysis result criterion ──
      // For Kcal/Sódio, use the nutritional labeling threshold rule when no methodology criterion is set.
      const methodShortName = paramMethodsMap[param];
      const libCriteria = (methodShortName && shortNameToCriteria[methodShortName])
        ? shortNameToCriteria[methodShortName]
        : null;

      let specification: string | null;
      const paramLower = param.toLowerCase();
      if (!libCriteria && (paramLower === "kcal" || paramLower === "kcal (kcal)")) {
        specification = "< 4 Kcal/porção: declarar como 0; ≥ 4 Kcal/porção: declarar";
      } else if (!libCriteria && (paramLower === "sódio" || paramLower === "sodio" || paramLower === "sódio (mg)" || paramLower === "sodio (mg)")) {
        specification = "< 5 mg/porção: declarar como 0; ≥ 5 mg/porção: declarar";
      } else {
        specification = libCriteria ?? data.criterion;
      }

      // ── ANVISA mg/mcg calculation for teor_ativo params ─────────────────
      // Priority: kinetics T6 (saved overrides) > T6-only avg (period=6) > overall avg.
      // The kinetics tab uses period=6 exclusively; the certificate must use the SAME
      // source so that status and mg values are identical in both places.
      // Falling back to the overall avg (T0+T3+T6 mixed) inflates the result because
      // T0 and T3 are generally higher than T6, masking real degradation.
      let ativoMgInfo: string | null = null;
      let ativoMgValue: string | null = null;
      let ativoFaixa: string | null = null;
      let ativoStatus: "dentro" | "fora" | null = null;
      if (data.category === "teor_ativo") {
        const lim = getAtivoLimit(param);
        if (lim?.declared) {
          const declaredNum = parseFloat(lim.declared);
          const t6Entry = t6AvgByParam[param];
          const t6Only = t6Entry && t6Entry.count > 0 ? t6Entry.sum / t6Entry.count : null;
          // Prefer: kinetics saved T6 > T6-only avg > overall avg (last resort)
          const basePercent = getKineticsT6(param) ?? t6Only ?? avg;
          if (basePercent !== null && !isNaN(declaredNum) && declaredNum > 0) {
            const actualMg = (basePercent / 100) * declaredNum;
            const minParsed = parseFloat((lim.min ?? "").replace(",", "."));
            const maxParsed = parseFloat((lim.max ?? "").replace(",", "."));
            const minNum = isNaN(minParsed) ? null : minParsed;
            const maxNum = isNaN(maxParsed) ? null : maxParsed;
            const isNEorLivre = (s: string) => { const u = s.trim().toUpperCase(); return u === "NE" || u === "LIVRE"; };
            const minIsNE = isNEorLivre(lim.min ?? "");
            const maxIsNE = isNEorLivre(lim.max ?? "");
            // Format adapts to which bounds are present; "NE" (Não Especificado) → "Livre"
            let faixaStr = "";
            let faixaLabel: string | null = null;
            if (minNum !== null && maxNum !== null) {
              faixaStr = ` | Faixa ANVISA: ${lim.min} – ${lim.max} ${lim.unit}`;
              faixaLabel = `${lim.min} – ${lim.max} ${lim.unit}`;
            } else if (minIsNE && maxNum !== null) {
              faixaStr = ` | Faixa ANVISA: Livre – ${lim.max} ${lim.unit}`;
              faixaLabel = `Livre – ${lim.max} ${lim.unit}`;
            } else if (maxIsNE && minNum !== null) {
              faixaStr = ` | Faixa ANVISA: ${lim.min} – Livre ${lim.unit}`;
              faixaLabel = `${lim.min} – Livre ${lim.unit}`;
            } else if (minNum !== null) {
              faixaStr = ` | Faixa ANVISA: ≥ ${lim.min} ${lim.unit}`;
              faixaLabel = `≥ ${lim.min} ${lim.unit}`;
            } else if (maxNum !== null) {
              faixaStr = ` | Faixa ANVISA: ≤ ${lim.max} ${lim.unit}`;
              faixaLabel = `≤ ${lim.max} ${lim.unit}`;
            } else if (minIsNE || maxIsNE) {
              faixaStr = ` | Faixa ANVISA: Livre ${lim.unit}`;
              faixaLabel = `Livre ${lim.unit}`;
            }
            ativoMgInfo = `${actualMg.toFixed(2).replace(".", ",")} ${lim.unit} (T6)${faixaStr}`;
            ativoMgValue = `${actualMg.toFixed(2).replace(".", ",")} ${lim.unit}`;
            ativoFaixa = faixaLabel;

            // Auto-flag NC when mg is outside the configured range — BUT only when
            // the percentage-based check has NOT already confirmed conformance.
            // Rationale: the configured mg limits may be approximate/rounded (e.g.,
            // max = 9 mcg when the actual calculated max is 9.56 mcg). If
            // isWithinCriterion(avg, criterion) already returned true, the parameter
            // is compliant per spec and the mg-range check must not downgrade it.
            const pctCheckResult = avg !== null ? isWithinCriterion(avg, data.criterion) : null;
            const belowMin = minNum !== null && actualMg < minNum;
            const aboveMax = maxNum !== null && actualMg > maxNum;
            const outOfRange = belowMin || aboveMax;
            ativoStatus = faixaLabel ? (outOfRange ? "fora" : "dentro") : null;
            if (finalStatus !== "aprovado_com_ressalva" && pctCheckResult !== true) {
              if (outOfRange) finalStatus = "nao_conforme";
            }
          }
        }
      }

      // ── Overage info — shown in certificate whenever overage was applied ──
      // Explains to the reader WHY the manufactured quantity differs from declared.
      let overageInfo: string | null = null;
      if (data.category === "teor_ativo") {
        const lim = getAtivoLimit(param);
        if (lim?.overage && lim?.declared) {
          const overagePct = parseFloat(lim.overage);
          const declaredNum2 = parseFloat(lim.declared);
          if (!isNaN(overagePct) && overagePct > 0 && !isNaN(declaredNum2) && declaredNum2 > 0) {
            const mfgQty = declaredNum2 * (1 + overagePct / 100);
            const fmt = (n: number) => n.toFixed(2).replace(".", ",");
            overageInfo = [
              `Overage +${fmt(overagePct)}% aplicado na fabricação`,
              `Qtd. manufaturada: ${fmt(mfgQty)} ${lim.unit} | Declarado: ${fmt(declaredNum2)} ${lim.unit}`,
              `Justificativa: compensação da degradação ao longo do prazo de validade (ICH Q1A(R2)), garantindo ≥ 80% do valor declarado até o vencimento.`,
            ].join(" — ");
          }
        }
      }

      // ── result: for teor_ativo show T6% (same source as ativoMgInfo) ────
      // For all other categories, show the overall average.
      let resultDisplay = avgPercent ?? data.resultText;
      if (data.category === "teor_ativo" && ativoMgInfo) {
        const t6Entry = t6AvgByParam[param];
        const t6Only = t6Entry && t6Entry.count > 0 ? t6Entry.sum / t6Entry.count : null;
        const t6Pct = getKineticsT6(param) ?? t6Only ?? avg;
        resultDisplay = t6Pct !== null ? `${t6Pct.toFixed(2)}%` : (avgPercent ?? data.resultText);
      } else if (ativoMgInfo) {
        resultDisplay = avgPercent !== null ? `${avgPercent}%` : data.resultText;
      }

      return {
        parameter: param,
        category: data.category,
        method,
        specification,
        result: resultDisplay,
        ativoMgInfo,
        ativoMgValue,
        ativoFaixa,
        ativoStatus,
        overageInfo,
        status: finalStatus === "nao_conforme" ? "Nao Conforme" : finalStatus === "na" ? "N/A" : finalStatus === "aprovado_com_ressalva" ? "Aprovado com Ressalva" : "Conforme",
      };
    });

  const analysisDates: { t0: string | null; t3: string | null; t6: string | null } = { t0: null, t3: null, t6: null };
  // Priority: periodDatesJson saved in DB > analysisDate from individual results
  if (protocol.periodDatesJson) {
    try {
      const pd = JSON.parse(protocol.periodDatesJson) as Record<string, string>;
      analysisDates.t0 = pd["0"] ?? null;
      analysisDates.t3 = pd["3"] ?? null;
      analysisDates.t6 = pd["6"] ?? null;
    } catch { /* ignore malformed JSON */ }
  }
  for (const r of allResults) {
    if (r.period === 0 && !analysisDates.t0) analysisDates.t0 = r.analysisDate;
    if (r.period === 3 && !analysisDates.t3) analysisDates.t3 = r.analysisDate;
    if (r.period === 6 && !analysisDates.t6) analysisDates.t6 = r.analysisDate;
  }

  const cityMatch = protocol.address?.match(/([^,]+)\/([A-Z]{2})/) ?? null;
  const city = cityMatch ? `${cityMatch[1].trim()} - ${cityMatch[2]}` : null;

  res.json({
    certNumber: protocol.certNumber || `CERT-${params.data.id}`,
    issueDate: protocol.issueDate ?? new Date().toISOString().split("T")[0],
    companyName: protocol.companyName,
    cnpj: protocol.cnpj,
    ie: protocol.ie ?? null,
    email: protocol.issuedByEmail ?? protocol.seniorAnalystEmail ?? null,
    address: protocol.address ?? null,
    cep: protocol.cep ?? null,
    city,
    productName: protocol.productName,
    presentation: protocol.productType ?? null,
    capsuleComposition: protocol.capsuleComposition ?? null,
    packagingType: protocol.packagingType ?? null,
    activeIngredients: protocol.activeIngredients ?? null,
    excipients: protocol.excipients ?? null,
    validityMonths: protocol.validityMonths ?? null,
    storageTemp: protocol.storageTemp ?? null,
    storageHumidity: protocol.storageHumidity ?? null,
    studyPeriodMonths: protocol.studyPeriodMonths ?? null,
    testIntervals: protocol.testIntervals ?? null,
    samplingTemp: protocol.samplingTemp ?? null,
    samplingHumidity: protocol.samplingHumidity ?? null,
    receptionTemp: protocol.receptionTemp ?? null,
    receptionHumidity: protocol.receptionHumidity ?? null,
    analysisDates,
    lotNumbers: lots.map((l) => l.lotNumber),
    analyses,
    conclusion: protocol.conclusion ?? null,
    finalStatus: protocol.finalStatus ?? null,
    issuedBy: protocol.issuedBy ?? null,
    issuedByEmail: protocol.issuedByEmail ?? null,
    seniorAnalyst: protocol.seniorAnalyst ?? null,
    seniorAnalystEmail: protocol.seniorAnalystEmail ?? null,
    notes: "Os resultados obtidos nos tempos T0, T3 e T6 (40 °C / 75% UR) demonstraram estabilidade do componente, com variações atribuídas exclusivamente à variabilidade analítica.",
    kineticsNotes: protocol.kineticsNotes ?? null,
    ressalva: protocol.ressalva ?? null,
  });
});

export default router;
