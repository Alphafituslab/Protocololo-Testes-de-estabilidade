import { Router, type IRouter } from "express";
import { db, settingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../lib/session";

const router: IRouter = Router();

router.get("/settings", async (_req, res): Promise<void> => {
  const rows = await db.select().from(settingsTable);
  const result: Record<string, string> = {};
  for (const r of rows) result[r.key] = r.value;
  res.json(result);
});

router.put("/settings/:key", requireAuth, async (req, res): Promise<void> => {
  const key = String(req.params["key"]);
  const { value } = req.body as { value?: string };
  if (value === undefined || value === null) {
    res.status(400).json({ error: "value obrigatório" });
    return;
  }
  await db
    .insert(settingsTable)
    .values({ key, value, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: settingsTable.key,
      set: { value, updatedAt: new Date() },
    });
  res.json({ ok: true });
});

router.delete("/settings/:key", requireAuth, async (req, res): Promise<void> => {
  const key = String(req.params["key"]);
  await db.delete(settingsTable).where(eq(settingsTable.key, key));
  res.json({ ok: true });
});

export default router;
