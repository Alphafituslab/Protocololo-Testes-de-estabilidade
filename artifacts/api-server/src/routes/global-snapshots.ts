import { Router, type IRouter } from "express";
import { sql, desc, eq } from "drizzle-orm";
import {
  db,
  globalSnapshotsTable,
  protocolsTable,
  lotsTable,
  analysisResultsTable,
  methodologiesTable,
} from "@workspace/db";
import { requireAuth } from "../lib/session";
import { buildGlobalSnapshotData, type GlobalSnapshotData } from "../lib/global-snapshot-helper";

const router: IRouter = Router();

function castDate(val: unknown): Date {
  if (val instanceof Date) return val;
  if (typeof val === "string") return new Date(val);
  return new Date();
}

/** List all global snapshots (no snapshot_data payload). */
router.get("/global-snapshots", requireAuth, async (_req, res): Promise<void> => {
  const snapshots = await db
    .select({
      id: globalSnapshotsTable.id,
      label: globalSnapshotsTable.label,
      notes: globalSnapshotsTable.notes,
      createdAt: globalSnapshotsTable.createdAt,
      createdBy: globalSnapshotsTable.createdBy,
      isAuto: globalSnapshotsTable.isAuto,
      sizeBytes: globalSnapshotsTable.sizeBytes,
    })
    .from(globalSnapshotsTable)
    .orderBy(desc(globalSnapshotsTable.createdAt));

  res.json(snapshots);
});

/** Create a new global snapshot. */
router.post("/global-snapshots", requireAuth, async (req, res): Promise<void> => {
  const { label, notes } = req.body as { label?: string; notes?: string };

  const data = await buildGlobalSnapshotData();
  const snapshotData = JSON.stringify(data);

  const [snap] = await db
    .insert(globalSnapshotsTable)
    .values({
      label: label?.trim() || `Snapshot manual — ${new Date().toLocaleString("pt-BR")}`,
      notes: notes?.trim() || null,
      snapshotData,
      createdBy: req.authUser?.displayName ?? "Sistema",
      isAuto: false,
      sizeBytes: Buffer.byteLength(snapshotData, "utf8"),
    })
    .returning({
      id: globalSnapshotsTable.id,
      label: globalSnapshotsTable.label,
      notes: globalSnapshotsTable.notes,
      createdAt: globalSnapshotsTable.createdAt,
      createdBy: globalSnapshotsTable.createdBy,
      isAuto: globalSnapshotsTable.isAuto,
      sizeBytes: globalSnapshotsTable.sizeBytes,
    });

  res.status(201).json(snap);
});

/** Download a snapshot as JSON. */
router.get("/global-snapshots/:id/download", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params["id"]), 10);
  if (isNaN(id)) { res.status(400).json({ error: "ID inválido." }); return; }

  const [snap] = await db
    .select()
    .from(globalSnapshotsTable)
    .where(eq(globalSnapshotsTable.id, id));

  if (!snap) { res.status(404).json({ error: "Snapshot não encontrado." }); return; }

  const ts = snap.createdAt.toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const filename = `alphafitus-snapshot-${snap.id}-${ts}.json`;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(snap.snapshotData);
});

/** Restore from a global snapshot. Requires MASTER_PASSWORD. */
router.post("/global-snapshots/:id/restore", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params["id"]), 10);
  if (isNaN(id)) { res.status(400).json({ error: "ID inválido." }); return; }

  const { password } = req.body as { password?: string };
  const masterPwd = process.env["MASTER_PASSWORD"];
  if (!masterPwd) { res.status(503).json({ error: "Senha mestra não configurada no servidor." }); return; }
  if (!password || password !== masterPwd) { res.status(401).json({ error: "Senha incorreta." }); return; }

  const [snap] = await db
    .select()
    .from(globalSnapshotsTable)
    .where(eq(globalSnapshotsTable.id, id));
  if (!snap) { res.status(404).json({ error: "Snapshot não encontrado." }); return; }

  let payload: GlobalSnapshotData;
  try {
    payload = JSON.parse(snap.snapshotData) as GlobalSnapshotData;
  } catch {
    res.status(422).json({ error: "Dados do snapshot estão corrompidos." }); return;
  }

  // Auto-save current state before restoring (never loses data)
  const beforeData = await buildGlobalSnapshotData();
  const beforeJson = JSON.stringify(beforeData);
  await db.insert(globalSnapshotsTable).values({
    label: `Auto: antes de restaurar snapshot #${id} — "${snap.label}"`,
    snapshotData: beforeJson,
    createdBy: req.authUser?.displayName ?? "Sistema",
    isAuto: true,
    sizeBytes: Buffer.byteLength(beforeJson, "utf8"),
  });

  await db.transaction(async (tx) => {
    // Delete in reverse FK order — protocols CASCADE deletes lots + results
    await tx.delete(analysisResultsTable);
    await tx.delete(lotsTable);
    await tx.delete(protocolsTable);
    await tx.delete(methodologiesTable);

    if (payload.methodologies.length > 0) {
      await tx.insert(methodologiesTable).values(
        payload.methodologies.map(m => ({
          ...m,
          id: m["id"] as number,
          createdAt: castDate(m["createdAt"]),
        })) as (typeof methodologiesTable.$inferInsert)[],
      );
    }

    if (payload.protocols.length > 0) {
      await tx.insert(protocolsTable).values(
        payload.protocols.map(p => ({
          ...p,
          id: p["id"] as number,
          createdAt: castDate(p["createdAt"]),
          updatedAt: castDate(p["updatedAt"]),
        })) as (typeof protocolsTable.$inferInsert)[],
      );
    }

    if (payload.lots.length > 0) {
      await tx.insert(lotsTable).values(
        payload.lots.map(l => ({
          ...l,
          id: l["id"] as number,
          createdAt: castDate(l["createdAt"]),
        })) as (typeof lotsTable.$inferInsert)[],
      );
    }

    if (payload.results.length > 0) {
      await tx.insert(analysisResultsTable).values(
        payload.results.map(r => ({
          ...r,
          id: r["id"] as number,
          createdAt: castDate(r["createdAt"]),
        })) as (typeof analysisResultsTable.$inferInsert)[],
      );
    }

    // Reset auto-increment sequences so next inserts don't conflict
    await tx.execute(sql`SELECT setval(pg_get_serial_sequence('protocols', 'id'), COALESCE((SELECT MAX(id) FROM protocols), 1))`);
    await tx.execute(sql`SELECT setval(pg_get_serial_sequence('lots', 'id'), COALESCE((SELECT MAX(id) FROM lots), 1))`);
    await tx.execute(sql`SELECT setval(pg_get_serial_sequence('analysis_results', 'id'), COALESCE((SELECT MAX(id) FROM analysis_results), 1))`);
    await tx.execute(sql`SELECT setval(pg_get_serial_sequence('methodologies', 'id'), COALESCE((SELECT MAX(id) FROM methodologies), 1))`);
  });

  res.json({ ok: true, restoredLabel: snap.label, restoredAt: snap.createdAt });
});

export default router;
