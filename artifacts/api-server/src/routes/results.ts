import { Router, type IRouter } from "express";
import { eq, and, count } from "drizzle-orm";
import { db, analysisResultsTable, lotsTable, protocolsTable } from "@workspace/db";
import { UpsertResultBody, UpsertResultParams, ListResultsParams, DeleteResultParams } from "@workspace/api-zod";
import { logAudit } from "../lib/audit";
import { requireAuth } from "../lib/session";
import { PERM, requirePermission, isProtocolSigned } from "../lib/permissions";

const router: IRouter = Router();

const STANDARD_PARAMS = 21;

/** Recalculate and persist progressPercent for a protocol after any result change. */
async function recalcProgress(protocolId: number): Promise<void> {
  const [protocol] = await db
    .select({ testIntervals: protocolsTable.testIntervals, customParamsJson: protocolsTable.customParamsJson, status: protocolsTable.status })
    .from(protocolsTable)
    .where(eq(protocolsTable.id, protocolId));

  if (!protocol || protocol.status !== "em_andamento") return;

  const periods = (protocol.testIntervals ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0).length;

  if (periods === 0) return;

  let customCount = 0;
  if (protocol.customParamsJson) {
    try {
      const parsed = JSON.parse(protocol.customParamsJson);
      customCount = Array.isArray(parsed) ? parsed.length : 0;
    } catch { /* ignore */ }
  }

  const totalParams = STANDARD_PARAMS + customCount;

  const [{ lotCount }] = await db
    .select({ lotCount: count() })
    .from(lotsTable)
    .where(eq(lotsTable.protocolId, protocolId));

  const nLots = Number(lotCount);
  if (nLots === 0) return;

  const totalSlots = totalParams * periods * nLots;

  const [{ resultCount }] = await db
    .select({ resultCount: count() })
    .from(analysisResultsTable)
    .where(eq(analysisResultsTable.protocolId, protocolId));

  const filled = Number(resultCount);
  const progress = Math.min(100, Math.round((filled / totalSlots) * 100));

  await db
    .update(protocolsTable)
    .set({ progressPercent: progress })
    .where(eq(protocolsTable.id, protocolId));
}

router.get("/protocols/:id/results", requireAuth, async (req, res): Promise<void> => {
  const params = ListResultsParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const results = await db.select().from(analysisResultsTable).where(eq(analysisResultsTable.protocolId, params.data.id)).orderBy(analysisResultsTable.period);
  const lots = await db.select().from(lotsTable).where(eq(lotsTable.protocolId, params.data.id));
  const lotsMap = Object.fromEntries(lots.map((l) => [l.id, l.lotNumber]));
  const enriched = results.map((r) => ({ ...r, lotNumber: lotsMap[r.lotId] ?? "" }));
  res.json(enriched);
});

router.post("/protocols/:id/results", requireAuth, requirePermission(PERM.RESULTS_ENTER), async (req, res): Promise<void> => {
  const params = UpsertResultParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = UpsertResultBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  // Post-signature lock: only admin can enter/edit results after protocol is signed
  const signed = await isProtocolSigned(params.data.id);
  if (signed && req.authUser?.role !== "admin") {
    res.status(403).json({ error: "Protocolo assinado. Apenas o administrador pode alterar resultados." }); return;
  }

  const existing = await db.select().from(analysisResultsTable).where(
    and(
      eq(analysisResultsTable.protocolId, params.data.id),
      eq(analysisResultsTable.lotId, parsed.data.lotId),
      eq(analysisResultsTable.period, parsed.data.period),
      eq(analysisResultsTable.parameter, parsed.data.parameter)
    )
  );

  let result;
  const isUpdate = existing.length > 0;
  if (isUpdate) {
    const [updated] = await db.update(analysisResultsTable)
      .set({ analysisDate: parsed.data.analysisDate, category: parsed.data.category, criterion: parsed.data.criterion, result: parsed.data.result, numericResult: parsed.data.numericResult ?? null, status: parsed.data.status, observation: parsed.data.observation ?? null })
      .where(eq(analysisResultsTable.id, existing[0]!.id)).returning();
    result = updated;
  } else {
    const [created] = await db.insert(analysisResultsTable).values({ ...parsed.data, protocolId: params.data.id }).returning();
    result = created;
  }

  const [lot] = await db.select().from(lotsTable).where(eq(lotsTable.id, result!.lotId));
  const action = isUpdate ? "ATUALIZAR_RESULTADO" : "REGISTRAR_RESULTADO";
  const statusLabel: Record<string, string> = {
    conforme: "Conforme", nao_conforme: "Não Conforme", na: "Não se Aplica",
    aprovado_com_ressalva: "Aprovado c/ Ressalva", nd: "Não Detectado", lq: "Limite de Quantificação",
  };
  const statusText = statusLabel[result!.status] ?? result!.status;
  const desc = `${result!.parameter} — T${result!.period}m — Lote ${lot?.lotNumber ?? result!.lotId}: valor="${result!.result}" [${statusText}]${result!.observation ? ` · Justificativa: ${result!.observation}` : ""}`;
  await logAudit(req, action, "resultado", desc, { entityId: result!.id, protocolId: params.data.id });
  await recalcProgress(params.data.id);
  res.json({ ...result, lotNumber: lot?.lotNumber ?? "" });
});

router.delete("/protocols/:id/results/:resultId", requireAuth, requirePermission(PERM.RESULTS_DELETE), async (req, res): Promise<void> => {
  const params = DeleteResultParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  // Post-signature lock: only admin can delete results after protocol is signed
  const signed = await isProtocolSigned(params.data.id);
  if (signed && req.authUser?.role !== "admin") {
    res.status(403).json({ error: "Protocolo assinado. Apenas o administrador pode excluir resultados." }); return;
  }

  const [deleted] = await db.delete(analysisResultsTable)
    .where(and(eq(analysisResultsTable.id, params.data.resultId), eq(analysisResultsTable.protocolId, params.data.id)))
    .returning();
  if (!deleted) { res.status(404).json({ error: "Result not found" }); return; }
  await logAudit(req, "EXCLUIR_RESULTADO", "resultado", `Resultado excluído: ${deleted.parameter} — Período ${deleted.period} meses`, { entityId: deleted.id, protocolId: params.data.id });
  await recalcProgress(params.data.id);
  res.sendStatus(204);
});

export default router;
