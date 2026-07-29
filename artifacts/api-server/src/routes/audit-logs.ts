import { Router, type IRouter } from "express";
import { db, auditLogsTable, protocolsTable } from "@workspace/db";
import { eq, desc, and, sql } from "drizzle-orm";
import { requireAuth } from "../lib/session";

const router: IRouter = Router();

router.get("/audit-logs", requireAuth, async (req, res): Promise<void> => {
  const protocolId = req.query["protocolId"] ? parseInt(req.query["protocolId"] as string) : undefined;
  const limit = Math.min(parseInt((req.query["limit"] as string) || "200"), 500);

  const conditions = [];
  if (protocolId && !isNaN(protocolId)) {
    conditions.push(eq(auditLogsTable.protocolId, protocolId));
  }

  const logs = await db
    .select()
    .from(auditLogsTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(auditLogsTable.createdAt))
    .limit(limit);

  res.json(logs);
});

/**
 * GET /api/audit-logs/today-changed
 * Returns { protocolIds: number[] } — IDs of protocols that have at least one
 * audit_logs entry dated today AND created AFTER badge_dismissed_at (or dismissed is null).
 * Used by the list/dashboard to show the "Alterado hoje" badge.
 */
router.get("/audit-logs/today-changed", requireAuth, async (req, res): Promise<void> => {
  const result = await db.execute(sql`
    SELECT DISTINCT al.protocol_id
    FROM audit_logs al
    JOIN protocols p ON p.id = al.protocol_id
    WHERE al.created_at::date = CURRENT_DATE
      AND al.protocol_id IS NOT NULL
      AND p.deleted_at IS NULL
      AND (p.badge_dismissed_at IS NULL OR al.created_at > p.badge_dismissed_at)
  `);

  // db.execute returns a QueryResult with a .rows array in node-postgres
  const rows: any[] = Array.isArray(result) ? result : (result as any).rows ?? [];
  const ids = rows.map((r: any) => Number(r.protocol_id)).filter(Boolean);
  res.json({ protocolIds: ids });
});

/**
 * POST /api/audit-logs/dismiss/:protocolId
 * Marca o badge "Alterado hoje" como dispensado para o protocolo.
 * O badge só reaparece se houver nova alteração após este momento.
 */
router.post("/audit-logs/dismiss/:protocolId", requireAuth, async (req, res): Promise<void> => {
  const protocolId = parseInt(req.params["protocolId"]);
  if (isNaN(protocolId)) {
    res.status(400).json({ error: "protocolId inválido" });
    return;
  }

  await db
    .update(protocolsTable)
    .set({ badgeDismissedAt: new Date() })
    .where(eq(protocolsTable.id, protocolId));

  res.json({ ok: true });
});

export default router;
