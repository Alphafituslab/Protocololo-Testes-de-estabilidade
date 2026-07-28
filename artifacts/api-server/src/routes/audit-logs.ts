import { Router, type IRouter } from "express";
import { db, auditLogsTable } from "@workspace/db";
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
 * audit_logs entry dated today. Used by the list/dashboard to show the
 * "Alterado hoje" badge WITHOUT relying on updated_at.
 */
router.get("/audit-logs/today-changed", requireAuth, async (req, res): Promise<void> => {
  const rows = await db
    .selectDistinct({ protocolId: auditLogsTable.protocolId })
    .from(auditLogsTable)
    .where(sql`${auditLogsTable.createdAt}::date = CURRENT_DATE AND ${auditLogsTable.protocolId} IS NOT NULL`);

  res.json({ protocolIds: rows.map((r) => r.protocolId).filter(Boolean) });
});

export default router;
