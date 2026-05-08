import { db, auditLogsTable } from "@workspace/db";
import type { Request } from "express";

export async function logAudit(
  req: Request,
  action: string,
  entityType: string,
  description: string,
  options?: { entityId?: string | number; protocolId?: number },
): Promise<void> {
  try {
    await db.insert(auditLogsTable).values({
      userId: req.authUser?.id ?? null,
      userDisplay: req.authUser?.displayName ?? "Sistema",
      action,
      entityType,
      description,
      entityId: options?.entityId != null ? String(options.entityId) : null,
      protocolId: options?.protocolId ?? null,
    });
  } catch { /* audit failures must never break the main operation */ }
}
