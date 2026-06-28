import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, hplcWorkspaceTable } from "@workspace/db";
import { requireAuth } from "../lib/session";

const router: IRouter = Router();

/** Return the workspace blob for the current user. */
router.get("/hplc/workspace", requireAuth, async (req, res): Promise<void> => {
  const userId = req.authUser!.id;
  const rows = await db
    .select({ workspaceData: hplcWorkspaceTable.workspaceData, updatedAt: hplcWorkspaceTable.updatedAt })
    .from(hplcWorkspaceTable)
    .where(eq(hplcWorkspaceTable.userId, userId))
    .limit(1);

  if (rows.length === 0) {
    res.json({ workspaceData: {}, updatedAt: null });
    return;
  }

  try {
    res.json({ workspaceData: JSON.parse(rows[0].workspaceData), updatedAt: rows[0].updatedAt });
  } catch {
    res.json({ workspaceData: {}, updatedAt: rows[0].updatedAt });
  }
});

/** Upsert the workspace blob for the current user. */
router.put("/hplc/workspace", requireAuth, async (req, res): Promise<void> => {
  const userId = req.authUser!.id;
  const body = req.body as Record<string, unknown>;

  await db
    .insert(hplcWorkspaceTable)
    .values({ userId, workspaceData: JSON.stringify(body), updatedAt: new Date() })
    .onConflictDoUpdate({
      target: hplcWorkspaceTable.userId,
      set: { workspaceData: JSON.stringify(body), updatedAt: new Date() },
    });

  res.json({ ok: true });
});

export default router;
