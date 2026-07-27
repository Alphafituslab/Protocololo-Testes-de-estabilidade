import { Router, type IRouter } from "express";
import { eq, and, count, isNull } from "drizzle-orm";
import { db, pool, analysisResultsTable, lotsTable, protocolsTable } from "@workspace/db";
import { UpsertResultBody, UpsertResultParams, ListResultsParams, DeleteResultParams } from "@workspace/api-zod";
import { logAudit } from "../lib/audit";
import { requireAuth } from "../lib/session";
import { PERM, requirePermission } from "../lib/permissions";

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

  const existing = await db.select().from(analysisResultsTable).where(
    and(
      eq(analysisResultsTable.protocolId, params.data.id),
      eq(analysisResultsTable.lotId, parsed.data.lotId),
      eq(analysisResultsTable.period, parsed.data.period),
      eq(analysisResultsTable.parameter, parsed.data.parameter)
    )
  );

  const numericVal = (parsed.data.numericResult !== undefined && parsed.data.numericResult !== null)
    ? parsed.data.numericResult
    : null;
  const obsVal = parsed.data.observation ?? null;

  let savedId: number;
  const isUpdate = existing.length > 0;
  try {
    if (isUpdate) {
      const { rows } = await pool.query<{ id: number }>(
        `UPDATE analysis_results SET
           analysis_date  = $1,
           category       = $2,
           criterion      = $3,
           result         = $4,
           numeric_result = $5,
           status         = $6,
           observation    = $7,
           updated_at     = now()
         WHERE id = $8
         RETURNING id`,
        [parsed.data.analysisDate, parsed.data.category, parsed.data.criterion,
         parsed.data.result, numericVal, parsed.data.status, obsVal, existing[0]!.id]
      );
      savedId = rows[0]!.id;
    } else {
      const { rows } = await pool.query<{ id: number }>(
        `INSERT INTO analysis_results
           (protocol_id, lot_id, period, analysis_date, category, parameter, criterion, result, numeric_result, status, observation)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING id`,
        [params.data.id, parsed.data.lotId, parsed.data.period,
         parsed.data.analysisDate, parsed.data.category, parsed.data.parameter,
         parsed.data.criterion, parsed.data.result, numericVal,
         parsed.data.status, obsVal]
      );
      savedId = rows[0]!.id;
    }
  } catch (dbErr: unknown) {
    const pgErr = dbErr as { message?: string; code?: string; detail?: string; constraint?: string };
    console.error("DB error in upsert result:", {
      code: pgErr.code,
      message: pgErr.message,
      detail: pgErr.detail,
      constraint: pgErr.constraint,
      isUpdate,
      params: { protocolId: params.data.id, lotId: parsed.data.lotId, period: parsed.data.period, parameter: parsed.data.parameter },
    });
    res.status(500).json({ error: pgErr.message ?? "Erro ao salvar resultado no banco." });
    return;
  }

  // Fetch via drizzle so we get camelCase-mapped columns
  const [result] = await db.select().from(analysisResultsTable).where(eq(analysisResultsTable.id, savedId));
  const [lot] = await db.select().from(lotsTable).where(eq(lotsTable.id, result!.lotId));
  const action = isUpdate ? "ATUALIZAR_RESULTADO" : "REGISTRAR_RESULTADO";
  const statusLabel: Record<string, string> = {
    conforme: "Conforme", nao_conforme: "Não Conforme", na: "Não se Aplica",
    aprovado_com_ressalva: "Aprovado c/ Ressalva", nd: "Não Detectado", lq: "Limite de Quantificação",
  };
  const statusText = statusLabel[result!.status] ?? result!.status;
  const desc = `${result!.parameter} — T${result!.period}m — Lote ${lot?.lotNumber ?? result!.lotId}: valor="${result!.result}" [${statusText}]${result!.observation ? ` · Justificativa: ${result!.observation}` : ""}`;
  // Non-critical — do not let audit/progress errors fail the response
  try { await logAudit(req, action, "resultado", desc, { entityId: result!.id, protocolId: params.data.id }); } catch (e) { console.error("logAudit error:", e); }
  try { await recalcProgress(params.data.id); } catch (e) { console.error("recalcProgress error:", e); }
  res.json({ ...result, lotNumber: lot?.lotNumber ?? "" });
});

router.delete("/protocols/:id/results/:resultId", requireAuth, requirePermission(PERM.RESULTS_DELETE), async (req, res): Promise<void> => {
  const params = DeleteResultParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const [deleted] = await db
    .update(analysisResultsTable)
    .set({ deletedAt: new Date() })
    .where(and(eq(analysisResultsTable.id, params.data.resultId), eq(analysisResultsTable.protocolId, params.data.id), isNull(analysisResultsTable.deletedAt)))
    .returning();
  if (!deleted) { res.status(404).json({ error: "Result not found" }); return; }
  await logAudit(req, "EXCLUIR_RESULTADO", "resultado", `Resultado enviado para lixeira: ${deleted.parameter} — Período ${deleted.period} meses`, { entityId: deleted.id, protocolId: params.data.id });
  await recalcProgress(params.data.id);
  res.sendStatus(204);
});

export default router;
