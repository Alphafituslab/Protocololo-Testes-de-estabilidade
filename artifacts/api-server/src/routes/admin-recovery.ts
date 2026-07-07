import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import {
  db,
  protocolsTable,
  lotsTable,
  analysisResultsTable,
  protocolSnapshotsTable,
} from "@workspace/db";

const router: IRouter = Router();

type SnapshotPayload = {
  protocol: Record<string, unknown>;
  lots: Record<string, unknown>[];
  results: Record<string, unknown>[];
};

/**
 * Temporary emergency restore — requires only MASTER_PASSWORD.
 * Remove this file after use.
 */
router.post("/admin/emergency-restore", async (req, res): Promise<void> => {
  const { password, protocolId, snapshotId } = req.body as {
    password?: string;
    protocolId?: number;
    snapshotId?: number;
  };

  const masterPwd = process.env["MASTER_PASSWORD"];
  if (!masterPwd || password !== masterPwd) {
    res.status(401).json({ error: "Senha incorreta." });
    return;
  }

  if (!protocolId || !snapshotId) {
    res.status(400).json({ error: "protocolId e snapshotId são obrigatórios." });
    return;
  }

  const [snap] = await db
    .select()
    .from(protocolSnapshotsTable)
    .where(eq(protocolSnapshotsTable.id, snapshotId));

  if (!snap || snap.protocolId !== protocolId) {
    res.status(404).json({ error: "Snapshot não encontrado." });
    return;
  }

  let payload: SnapshotPayload;
  try {
    payload = JSON.parse(snap.snapshotData) as SnapshotPayload;
  } catch {
    res.status(422).json({ error: "Dados corrompidos." });
    return;
  }

  // Restore lots with ID mapping
  await db.delete(lotsTable).where(eq(lotsTable.protocolId, protocolId));
  const lotIdMap = new Map<number, number>();
  for (const l of payload.lots as Record<string, unknown>[]) {
    const { id: oldId, createdAt: _c, ...rest } = l;
    void _c;
    const [inserted] = await db
      .insert(lotsTable)
      .values({ ...rest, protocolId } as typeof lotsTable.$inferInsert)
      .returning({ id: lotsTable.id });
    if (inserted && typeof oldId === "number") {
      lotIdMap.set(oldId, inserted.id);
    }
  }

  // Restore results with remapped lot IDs
  await db.delete(analysisResultsTable).where(eq(analysisResultsTable.protocolId, protocolId));
  if (payload.results.length > 0) {
    const toInsert = (payload.results as Record<string, unknown>[]).map((r) => {
      const { id: _rid, createdAt: _rc, updatedAt: _ru, ...rest } = r;
      void _rid; void _rc; void _ru;
      const oldLotId = typeof rest["lotId"] === "number" ? rest["lotId"] as number : undefined;
      const newLotId = oldLotId !== undefined ? (lotIdMap.get(oldLotId) ?? oldLotId) : rest["lotId"];
      return { ...rest, lotId: newLotId, protocolId } as typeof analysisResultsTable.$inferInsert;
    });
    await db.insert(analysisResultsTable).values(toInsert);
  }

  // Verify
  const finalLots = await db.select().from(lotsTable).where(eq(lotsTable.protocolId, protocolId));
  const finalResults = await db.select().from(analysisResultsTable).where(eq(analysisResultsTable.protocolId, protocolId));

  res.json({
    ok: true,
    lotsRestored: finalLots.length,
    resultsRestored: finalResults.length,
    lotNumbers: finalLots.map((l) => l.lotNumber),
  });
});

export default router;
