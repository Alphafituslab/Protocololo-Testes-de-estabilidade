import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, protocolsTable, lotsTable, analysisResultsTable } from "@workspace/db";
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

  const lots = await db
    .select()
    .from(lotsTable)
    .where(eq(lotsTable.protocolId, params.data.id))
    .orderBy(lotsTable.createdAt);

  const allResults = await db
    .select()
    .from(analysisResultsTable)
    .where(eq(analysisResultsTable.protocolId, params.data.id));

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
  for (const r of allResults) {
    if (!avgByParam[r.parameter]) {
      avgByParam[r.parameter] = { sum: 0, count: 0, criterion: r.criterion, resultText: r.result, status: r.status, category: r.category };
    }
    if (r.numericResult != null) {
      avgByParam[r.parameter].sum += r.numericResult;
      avgByParam[r.parameter].count += 1;
    }
    // AR is an explicit operator release — it overrides NC at individual result level too
    if (r.status === "aprovado_com_ressalva") {
      avgByParam[r.parameter].status = "aprovado_com_ressalva";
    } else if (r.status === "nao_conforme" && avgByParam[r.parameter].status !== "aprovado_com_ressalva") {
      avgByParam[r.parameter].status = "nao_conforme";
    }
  }

  const analyses = Object.entries(avgByParam)
    .sort(([, a], [, b]) => (CATEGORY_ORDER[a.category] ?? 9) - (CATEGORY_ORDER[b.category] ?? 9))
    .map(([param, data]) => {
      const avg = data.count > 0 ? data.sum / data.count : null;
      const avgResult = avg !== null ? avg.toFixed(2) : data.resultText;

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

      return {
        parameter: param,
        category: data.category,
        method: METHOD_MAP[param] ?? "Método interno.",
        specification: data.criterion,
        result: avgResult,
        status: finalStatus === "nao_conforme" ? "Nao Conforme" : finalStatus === "na" ? "N/A" : finalStatus === "aprovado_com_ressalva" ? "Aprovado com Ressalva" : "Conforme",
      };
    });

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
