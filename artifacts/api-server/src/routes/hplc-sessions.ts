import { Router, type IRouter } from "express";
import { eq, and, isNull, desc } from "drizzle-orm";
import { db, hplcSimulatorSessionsTable } from "@workspace/db";
import { requireAuth } from "../lib/session";

const router: IRouter = Router();

/** List all non-archived sessions for the current user. */
router.get("/hplc/sessions", requireAuth, async (req, res): Promise<void> => {
  const userId = req.authUser!.id;
  const rows = await db
    .select({
      id: hplcSimulatorSessionsTable.id,
      name: hplcSimulatorSessionsTable.name,
      sessionData: hplcSimulatorSessionsTable.sessionData,
      createdAt: hplcSimulatorSessionsTable.createdAt,
      updatedAt: hplcSimulatorSessionsTable.updatedAt,
    })
    .from(hplcSimulatorSessionsTable)
    .where(
      and(
        eq(hplcSimulatorSessionsTable.userId, userId),
        isNull(hplcSimulatorSessionsTable.archivedAt),
      ),
    )
    .orderBy(desc(hplcSimulatorSessionsTable.updatedAt));

  res.json(rows.map(r => JSON.parse(r.sessionData)));
});

/** Upsert (create or update) a session. */
router.put("/hplc/sessions/:id", requireAuth, async (req, res): Promise<void> => {
  const userId = req.authUser!.id;
  const id = req.params["id"] as string;
  const body = req.body as Record<string, unknown>;

  if (!id || typeof body !== "object") {
    res.status(400).json({ error: "ID e dados são obrigatórios." });
    return;
  }

  const sessionData = JSON.stringify(body);
  const name = (body["name"] as string | undefined) ?? "";

  await db
    .insert(hplcSimulatorSessionsTable)
    .values({
      id,
      userId,
      name,
      sessionData,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: hplcSimulatorSessionsTable.id,
      set: {
        name,
        sessionData,
        updatedAt: new Date(),
      },
    });

  res.json({ ok: true });
});

/** Bulk upsert — sync entire sessions array at once. */
router.post("/hplc/sessions/sync", requireAuth, async (req, res): Promise<void> => {
  const userId = req.authUser!.id;
  const sessions = req.body as unknown[];

  if (!Array.isArray(sessions)) {
    res.status(400).json({ error: "Esperado array de sessões." });
    return;
  }

  for (const s of sessions) {
    const session = s as Record<string, unknown>;
    const id = session["id"] as string | undefined;
    if (!id) continue;
    const sessionData = JSON.stringify(session);
    const name = (session["name"] as string | undefined) ?? "";

    await db
      .insert(hplcSimulatorSessionsTable)
      .values({ id, userId, name, sessionData, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: hplcSimulatorSessionsTable.id,
        set: { name, sessionData, updatedAt: new Date() },
      });
  }

  res.json({ ok: true, synced: sessions.length });
});

/** Soft-archive a session (never hard-deletes). */
router.delete("/hplc/sessions/:id", requireAuth, async (req, res): Promise<void> => {
  const userId = req.authUser!.id;
  const id = req.params["id"] as string;

  await db
    .update(hplcSimulatorSessionsTable)
    .set({ archivedAt: new Date() })
    .where(
      and(
        eq(hplcSimulatorSessionsTable.id, id),
        eq(hplcSimulatorSessionsTable.userId, userId),
      ),
    );

  res.json({ ok: true });
});

export default router;
