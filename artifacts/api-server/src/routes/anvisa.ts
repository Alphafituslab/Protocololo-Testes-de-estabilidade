import { Router } from "express";
import { z } from "zod";
import { db } from "@workspace/db";
import { anvisaNotifications } from "@workspace/db/schema";
import { eq, asc } from "drizzle-orm";
import { requireAuth } from "../lib/session";

const router = Router();

const bodySchema = z.object({
  companyName: z.string().min(1),
  notifiedAt: z.string().min(1),
  confirmed: z.boolean().default(false),
  attachmentObjectPath: z.string().nullable().optional(),
  attachmentFileName: z.string().nullable().optional(),
  attachmentFileType: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

// ── GET /protocols/:id/anvisa ─────────────────────────────────────────────────
router.get("/protocols/:id/anvisa", requireAuth, async (req, res) => {
  const protocolId = Number(req.params.id);
  if (!protocolId) return res.status(400).json({ error: "id inválido" });

  const rows = await db
    .select()
    .from(anvisaNotifications)
    .where(eq(anvisaNotifications.protocolId, protocolId))
    .orderBy(asc(anvisaNotifications.createdAt));

  return res.json(rows);
});

// ── POST /protocols/:id/anvisa ────────────────────────────────────────────────
router.post("/protocols/:id/anvisa", requireAuth, async (req, res) => {
  const protocolId = Number(req.params.id);
  if (!protocolId) return res.status(400).json({ error: "id inválido" });

  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const user = (req as any).user;
  const [row] = await db
    .insert(anvisaNotifications)
    .values({
      protocolId,
      companyName: parsed.data.companyName,
      notifiedAt: parsed.data.notifiedAt,
      confirmed: parsed.data.confirmed,
      attachmentObjectPath: parsed.data.attachmentObjectPath ?? null,
      attachmentFileName: parsed.data.attachmentFileName ?? null,
      attachmentFileType: parsed.data.attachmentFileType ?? null,
      notes: parsed.data.notes ?? null,
      createdBy: user?.username ?? null,
      createdByName: user?.fullName ?? null,
    })
    .returning();

  return res.status(201).json(row);
});

// ── PUT /protocols/:id/anvisa/:notifId ────────────────────────────────────────
router.put("/protocols/:id/anvisa/:notifId", requireAuth, async (req, res) => {
  const notifId = Number(req.params.notifId);
  if (!notifId) return res.status(400).json({ error: "notifId inválido" });

  const parsed = bodySchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const [row] = await db
    .update(anvisaNotifications)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(anvisaNotifications.id, notifId))
    .returning();

  if (!row) return res.status(404).json({ error: "Notificação não encontrada" });
  return res.json(row);
});

// ── DELETE /protocols/:id/anvisa/:notifId ─────────────────────────────────────
router.delete("/protocols/:id/anvisa/:notifId", requireAuth, async (req, res) => {
  const notifId = Number(req.params.notifId);
  if (!notifId) return res.status(400).json({ error: "notifId inválido" });

  await db.delete(anvisaNotifications).where(eq(anvisaNotifications.id, notifId));
  return res.status(204).send();
});

export default router;
