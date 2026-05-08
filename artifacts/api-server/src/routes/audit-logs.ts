import { Router, type IRouter } from "express";
import { db, auditLogsTable } from "@workspace/db";
import { eq, desc, and, isNull, or } from "drizzle-orm";
import { requireAuth } from "../lib/session";

const router: IRouter = Router();

router.get("/audit-logs", requireAuth, async (req, res): Promise<void> => {
  const protocolId = req.query["protocolId"] ? parseInt(req.query["protocolId"] as string) : undefined;
  const limit = Math.min(parseInt((req.query["limit"] as string) || "200"), 500);

  const conditions = [];
  if (protocolId && !isNaN(protocolId)) {
    // Include protocol-specific logs AND global logs (no protocolId)
    conditions.push(
      or(eq(auditLogsTable.protocolId, protocolId), isNull(auditLogsTable.protocolId)),
    );
  }

  const logs = await db
    .select()
    .from(auditLogsTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(auditLogsTable.createdAt))
    .limit(limit);

  res.json(logs);
});

export default router;
