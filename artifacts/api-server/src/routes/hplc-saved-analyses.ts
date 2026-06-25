import { Router, type IRouter } from "express";
import { eq, and, isNull, desc } from "drizzle-orm";
import { db, hplcSavedAnalysesTable } from "@workspace/db";
import { requireAuth } from "../lib/session";

const router: IRouter = Router();

/** List all non-archived saved analyses for the current user. */
router.get("/hplc/analyses", requireAuth, async (req, res): Promise<void> => {
  const userId = req.authUser!.id;
  const rows = await db
    .select({
      id: hplcSavedAnalysesTable.id,
      name: hplcSavedAnalysesTable.name,
      analysisData: hplcSavedAnalysesTable.analysisData,
      createdAt: hplcSavedAnalysesTable.createdAt,
      updatedAt: hplcSavedAnalysesTable.updatedAt,
    })
    .from(hplcSavedAnalysesTable)
    .where(
      and(
        eq(hplcSavedAnalysesTable.userId, userId),
        isNull(hplcSavedAnalysesTable.archivedAt),
      ),
    )
    .orderBy(desc(hplcSavedAnalysesTable.updatedAt));

  res.json(rows.map(r => JSON.parse(r.analysisData)));
});

/** Bulk upsert — sync entire saved analyses array at once. */
router.post("/hplc/analyses/sync", requireAuth, async (req, res): Promise<void> => {
  const userId = req.authUser!.id;
  const analyses = req.body as unknown[];

  if (!Array.isArray(analyses)) {
    res.status(400).json({ error: "Esperado array de análises." });
    return;
  }

  for (const a of analyses) {
    const analysis = a as Record<string, unknown>;
    const id = analysis["id"] as string | undefined;
    if (!id) continue;
    const analysisData = JSON.stringify(analysis);
    const name = (analysis["productName"] as string | undefined) ?? (analysis["certTitle"] as string | undefined) ?? "";

    await db
      .insert(hplcSavedAnalysesTable)
      .values({ id, userId, name, analysisData, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: hplcSavedAnalysesTable.id,
        set: { name, analysisData, updatedAt: new Date() },
      });
  }

  res.json({ ok: true, synced: analyses.length });
});

/** Soft-archive a saved analysis (never hard-deletes). */
router.delete("/hplc/analyses/:id", requireAuth, async (req, res): Promise<void> => {
  const userId = req.authUser!.id;
  const id = req.params["id"] as string;

  await db
    .update(hplcSavedAnalysesTable)
    .set({ archivedAt: new Date() })
    .where(
      and(
        eq(hplcSavedAnalysesTable.id, id),
        eq(hplcSavedAnalysesTable.userId, userId),
      ),
    );

  res.json({ ok: true });
});

export default router;
