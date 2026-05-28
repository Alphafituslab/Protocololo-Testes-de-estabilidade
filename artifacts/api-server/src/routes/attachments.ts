import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, protocolAttachmentsTable } from "@workspace/db";
import { z } from "zod/v4";
import { requireAuth } from "../lib/session";
import { logAudit } from "../lib/audit";

const router: IRouter = Router();

const AttachmentParams = z.object({ id: z.coerce.number().int().positive() });
const AttachmentItemParams = z.object({ id: z.coerce.number().int().positive(), attachmentId: z.coerce.number().int().positive() });

const CreateAttachmentBody = z.object({
  fileName: z.string().min(1),
  fileType: z.string().min(1),
  fileSizeBytes: z.number().int().optional(),
  objectPath: z.string().min(1),
  description: z.string().optional(),
});

router.get("/protocols/:id/attachments", requireAuth, async (req, res): Promise<void> => {
  const params = AttachmentParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const rows = await db
    .select()
    .from(protocolAttachmentsTable)
    .where(eq(protocolAttachmentsTable.protocolId, params.data.id))
    .orderBy(protocolAttachmentsTable.createdAt);
  res.json(rows);
});

router.post("/protocols/:id/attachments", requireAuth, async (req, res): Promise<void> => {
  const params = AttachmentParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = CreateAttachmentBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const user = (req as { user?: { id: number; displayName: string } }).user;
  const [row] = await db.insert(protocolAttachmentsTable).values({
    protocolId: params.data.id,
    ...parsed.data,
    uploadedBy: user?.id ?? null,
    uploadedByName: user?.displayName ?? "Sistema",
  }).returning();
  await logAudit(req, "ANEXAR_DOCUMENTO", "anexo", `Documento "${row.fileName}" anexado`, { entityId: row.id, protocolId: params.data.id });
  res.status(201).json(row);
});

router.delete("/protocols/:id/attachments/:attachmentId", requireAuth, async (req, res): Promise<void> => {
  const params = AttachmentItemParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [deleted] = await db
    .delete(protocolAttachmentsTable)
    .where(and(
      eq(protocolAttachmentsTable.id, params.data.attachmentId),
      eq(protocolAttachmentsTable.protocolId, params.data.id),
    ))
    .returning();
  if (!deleted) { res.status(404).json({ error: "Anexo não encontrado" }); return; }
  await logAudit(req, "REMOVER_DOCUMENTO", "anexo", `Documento "${deleted.fileName}" removido`, { entityId: deleted.id, protocolId: params.data.id });
  res.json({ ok: true });
});

export default router;
