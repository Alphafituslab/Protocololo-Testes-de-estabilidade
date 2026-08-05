import { Router, type IRouter } from "express";
import { db, auditLogsTable, protocolsTable } from "@workspace/db";
import { eq, desc, and, sql } from "drizzle-orm";
import { requireAuth } from "../lib/session";
import { PERM, requirePermission } from "../lib/permissions";

const router: IRouter = Router();

router.get("/audit-logs", requireAuth, requirePermission(PERM.AUDIT_VIEW), async (req, res): Promise<void> => {
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
 * Returns { protocolIds: number[], changedAt: Record<string, string> }
 *
 * Protocols that have at least one audit_logs entry AFTER badge_dismissed_at
 * (or after created_at if never dismissed).  No longer restricted to CURRENT_DATE —
 * the badge persists until the user explicitly dismisses it with the X button.
 */
router.get("/audit-logs/today-changed", requireAuth, async (req, res): Promise<void> => {
  const result = await db.execute(sql`
    SELECT al.protocol_id, MAX(al.created_at) AS last_changed_at
    FROM audit_logs al
    JOIN protocols p ON p.id = al.protocol_id
    WHERE al.protocol_id IS NOT NULL
      AND p.deleted_at IS NULL
      AND (p.badge_dismissed_at IS NULL OR al.created_at > p.badge_dismissed_at)
    GROUP BY al.protocol_id
  `);

  const rows: any[] = Array.isArray(result) ? result : (result as any).rows ?? [];

  const protocolIds: number[] = [];
  const changedAt: Record<string, string> = {};

  for (const r of rows) {
    const id = Number(r.protocol_id);
    if (!id) continue;
    protocolIds.push(id);
    changedAt[String(id)] = r.last_changed_at instanceof Date
      ? r.last_changed_at.toISOString()
      : String(r.last_changed_at);
  }

  res.json({ protocolIds, changedAt });
});

/**
 * POST /api/audit-logs/dismiss/:protocolId
 * Marca o badge como dispensado. O badge só reaparece se houver nova alteração
 * após este momento — nunca desaparece automaticamente com a virada do dia.
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
