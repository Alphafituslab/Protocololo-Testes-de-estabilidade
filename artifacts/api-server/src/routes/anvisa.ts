import { Router } from "express";
import { z } from "zod";
import { db } from "@workspace/db";
import { anvisaNotifications } from "@workspace/db/schema";
import { eq, asc } from "drizzle-orm";
import { requireAuth } from "../lib/session";

const router = Router();

const nullableStr = z.string().nullable().optional();

const bodySchema = z.object({
  companyName: z.string().min(1),
  companyCnpj: nullableStr,
  brandName: nullableStr,
  notifiedAt: z.string().min(1),
  confirmed: z.boolean().default(false),
  // Números do processo ANVISA
  expedienteNumber: nullableStr,
  processNumber: nullableStr,
  transactionNumber: nullableStr,
  protocolNumber: nullableStr,
  // Anexos
  attachmentObjectPath: nullableStr,
  attachmentFileName: nullableStr,
  attachmentFileType: nullableStr,
  rotuloObjectPath: nullableStr,
  rotuloFileName: nullableStr,
  rotuloFileType: nullableStr,
  padronizacaoObjectPath: nullableStr,
  padronizacaoFileName: nullableStr,
  padronizacaoFileType: nullableStr,
  notes: nullableStr,
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

  const d = parsed.data;
  const user = (req as any).user;
  const [row] = await db
    .insert(anvisaNotifications)
    .values({
      protocolId,
      companyName: d.companyName,
      companyCnpj: d.companyCnpj ?? null,
      brandName: d.brandName ?? null,
      notifiedAt: d.notifiedAt,
      confirmed: d.confirmed,
      expedienteNumber: d.expedienteNumber ?? null,
      processNumber: d.processNumber ?? null,
      transactionNumber: d.transactionNumber ?? null,
      protocolNumber: d.protocolNumber ?? null,
      attachmentObjectPath: d.attachmentObjectPath ?? null,
      attachmentFileName: d.attachmentFileName ?? null,
      attachmentFileType: d.attachmentFileType ?? null,
      rotuloObjectPath: d.rotuloObjectPath ?? null,
      rotuloFileName: d.rotuloFileName ?? null,
      rotuloFileType: d.rotuloFileType ?? null,
      padronizacaoObjectPath: d.padronizacaoObjectPath ?? null,
      padronizacaoFileName: d.padronizacaoFileName ?? null,
      padronizacaoFileType: d.padronizacaoFileType ?? null,
      notes: d.notes ?? null,
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
