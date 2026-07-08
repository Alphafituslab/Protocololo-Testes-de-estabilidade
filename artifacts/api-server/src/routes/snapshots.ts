import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import {
  db,
  protocolsTable,
  lotsTable,
  analysisResultsTable,
  protocolSnapshotsTable,
} from "@workspace/db";
import { requireAuth } from "../lib/session";
import { buildSnapshotData } from "../lib/snapshot-helper";

const router: IRouter = Router();

/** List snapshots for a protocol (lightweight — no snapshotData payload). */
router.get("/protocols/:id/snapshots", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params["id"] ?? ""), 10);
  if (isNaN(id)) { res.status(400).json({ error: "ID inválido." }); return; }

  const snapshots = await db
    .select({
      id: protocolSnapshotsTable.id,
      protocolId: protocolSnapshotsTable.protocolId,
      label: protocolSnapshotsTable.label,
      createdBy: protocolSnapshotsTable.createdBy,
      createdAt: protocolSnapshotsTable.createdAt,
    })
    .from(protocolSnapshotsTable)
    .where(eq(protocolSnapshotsTable.protocolId, id))
    .orderBy(desc(protocolSnapshotsTable.createdAt));

  res.json(snapshots);
});

/** Create a manual snapshot. */
router.post("/protocols/:id/snapshots", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params["id"] ?? ""), 10);
  if (isNaN(id)) { res.status(400).json({ error: "ID inválido." }); return; }

  const { label } = req.body as { label?: string };

  const snapshotData = await buildSnapshotData(id);
  if (!snapshotData) { res.status(404).json({ error: "Protocolo não encontrado." }); return; }

  const [snap] = await db
    .insert(protocolSnapshotsTable)
    .values({
      protocolId: id,
      label: (label?.trim() || null) ?? "Versão salva manualmente",
      snapshotData,
      createdBy: req.authUser?.displayName ?? "Sistema",
    })
    .returning({
      id: protocolSnapshotsTable.id,
      protocolId: protocolSnapshotsTable.protocolId,
      label: protocolSnapshotsTable.label,
      createdBy: protocolSnapshotsTable.createdBy,
      createdAt: protocolSnapshotsTable.createdAt,
    });

  res.status(201).json(snap);
});

type SnapshotPayload = {
  protocol: Record<string, unknown>;
  lots: Record<string, unknown>[];
  results: Record<string, unknown>[];
};

/** Restore a snapshot. Requires MASTER_PASSWORD in the request body. */
router.post("/protocols/:id/snapshots/:snapshotId/restore", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params["id"] ?? ""), 10);
  const snapshotId = parseInt(String(req.params["snapshotId"] ?? ""), 10);
  if (isNaN(id) || isNaN(snapshotId)) { res.status(400).json({ error: "ID inválido." }); return; }

  const { password } = req.body as { password?: string };
  const masterPwd = process.env["MASTER_PASSWORD"];
  if (!masterPwd) { res.status(503).json({ error: "Senha mestra não configurada." }); return; }
  if (!password || password !== masterPwd) { res.status(401).json({ error: "Senha incorreta." }); return; }

  const [snap] = await db
    .select()
    .from(protocolSnapshotsTable)
    .where(eq(protocolSnapshotsTable.id, snapshotId));
  if (!snap || snap.protocolId !== id) { res.status(404).json({ error: "Versão não encontrada." }); return; }

  let payload: SnapshotPayload;
  try {
    payload = JSON.parse(snap.snapshotData) as SnapshotPayload;
  } catch {
    res.status(422).json({ error: "Dados da versão corrompidos." }); return;
  }

  // Auto-save a "before restore" snapshot so the action can be undone
  const beforeData = await buildSnapshotData(id);
  if (beforeData) {
    await db.insert(protocolSnapshotsTable).values({
      protocolId: id,
      label: `Auto: antes de restaurar "${snap.label}"`,
      snapshotData: beforeData,
      createdBy: req.authUser?.displayName ?? "Sistema",
    });
  }

  // Restore protocol fields (exclude DB-managed fields)
  const { id: _pid, createdAt: _pc, updatedAt: _pu, ...protocolFields } = payload.protocol as Record<string, unknown>;
  void _pid; void _pc; void _pu;
  await db
    .update(protocolsTable)
    .set(protocolFields)
    .where(eq(protocolsTable.id, id));

  // Restore lots: delete existing, re-insert one by one to capture new IDs.
  // Building old→new ID mapping is critical because analysis_results reference lot IDs.
  await db.delete(lotsTable).where(eq(lotsTable.protocolId, id));
  const lotIdMap = new Map<number, number>(); // old lot ID → new lot ID
  if (payload.lots.length > 0) {
    for (const l of payload.lots as Record<string, unknown>[]) {
      const { id: oldLotId, createdAt: _lc, ...lotRest } = l;
      void _lc;
      const [inserted] = await db
        .insert(lotsTable)
        .values({ ...lotRest, protocolId: id } as typeof lotsTable.$inferInsert)
        .returning({ id: lotsTable.id });
      if (inserted && typeof oldLotId === "number") {
        lotIdMap.set(oldLotId, inserted.id);
      }
    }
  }

  // Restore results: delete existing, re-insert with remapped lot IDs.
  await db.delete(analysisResultsTable).where(eq(analysisResultsTable.protocolId, id));
  if (payload.results.length > 0) {
    const resultsToInsert = (payload.results as Record<string, unknown>[]).map((r) => {
      const { id: _rid, createdAt: _rc, updatedAt: _ru, ...resultRest } = r;
      void _rid; void _rc; void _ru;
      const oldLotId = typeof resultRest["lotId"] === "number" ? resultRest["lotId"] as number : undefined;
      const newLotId = oldLotId !== undefined ? (lotIdMap.get(oldLotId) ?? oldLotId) : resultRest["lotId"];
      return { ...resultRest, lotId: newLotId, protocolId: id } as typeof analysisResultsTable.$inferInsert;
    });
    await db.insert(analysisResultsTable).values(resultsToInsert);
  }

  res.json({ ok: true, restoredLabel: snap.label, restoredAt: snap.createdAt });
});

/** Delete a snapshot. */
router.delete("/protocols/:id/snapshots/:snapshotId", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params["id"] ?? ""), 10);
  const snapshotId = parseInt(String(req.params["snapshotId"] ?? ""), 10);
  if (isNaN(id) || isNaN(snapshotId)) { res.status(400).json({ error: "ID inválido." }); return; }

  const [snap] = await db
    .select({ id: protocolSnapshotsTable.id, protocolId: protocolSnapshotsTable.protocolId })
    .from(protocolSnapshotsTable)
    .where(eq(protocolSnapshotsTable.id, snapshotId));

  if (!snap || snap.protocolId !== id) { res.status(404).json({ error: "Versão não encontrada." }); return; }

  await db.delete(protocolSnapshotsTable).where(eq(protocolSnapshotsTable.id, snapshotId));
  res.status(204).send();
});

export default router;
