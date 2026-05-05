import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, analysisResultsTable, lotsTable } from "@workspace/db";
import {
  UpsertResultBody,
  UpsertResultParams,
  ListResultsParams,
  DeleteResultParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/protocols/:id/results", async (req, res): Promise<void> => {
  const params = ListResultsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const results = await db
    .select()
    .from(analysisResultsTable)
    .where(eq(analysisResultsTable.protocolId, params.data.id))
    .orderBy(analysisResultsTable.period);

  const lots = await db
    .select()
    .from(lotsTable)
    .where(eq(lotsTable.protocolId, params.data.id));
  const lotsMap = Object.fromEntries(lots.map((l) => [l.id, l.lotNumber]));

  const enriched = results.map((r) => ({ ...r, lotNumber: lotsMap[r.lotId] ?? "" }));
  res.json(enriched);
});

router.post("/protocols/:id/results", async (req, res): Promise<void> => {
  const params = UpsertResultParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpsertResultBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const existing = await db
    .select()
    .from(analysisResultsTable)
    .where(
      and(
        eq(analysisResultsTable.protocolId, params.data.id),
        eq(analysisResultsTable.lotId, parsed.data.lotId),
        eq(analysisResultsTable.period, parsed.data.period),
        eq(analysisResultsTable.parameter, parsed.data.parameter)
      )
    );

  let result;
  if (existing.length > 0) {
    const [updated] = await db
      .update(analysisResultsTable)
      .set({
        analysisDate: parsed.data.analysisDate,
        category: parsed.data.category,
        criterion: parsed.data.criterion,
        result: parsed.data.result,
        numericResult: parsed.data.numericResult ?? null,
        status: parsed.data.status,
        observation: parsed.data.observation ?? null,
      })
      .where(eq(analysisResultsTable.id, existing[0].id))
      .returning();
    result = updated;
  } else {
    const [created] = await db
      .insert(analysisResultsTable)
      .values({ ...parsed.data, protocolId: params.data.id })
      .returning();
    result = created;
  }

  const [lot] = await db.select().from(lotsTable).where(eq(lotsTable.id, result.lotId));
  res.json({ ...result, lotNumber: lot?.lotNumber ?? "" });
});

router.delete("/protocols/:id/results/:resultId", async (req, res): Promise<void> => {
  const params = DeleteResultParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [deleted] = await db
    .delete(analysisResultsTable)
    .where(
      and(
        eq(analysisResultsTable.id, params.data.resultId),
        eq(analysisResultsTable.protocolId, params.data.id)
      )
    )
    .returning();
  if (!deleted) {
    res.status(404).json({ error: "Result not found" });
    return;
  }
  res.sendStatus(204);
});

export default router;
