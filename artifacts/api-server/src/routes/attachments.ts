import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, protocolAttachmentsTable, clientProtocolAccessTable } from "@workspace/db";
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

  let rows = await db
    .select()
    .from(protocolAttachmentsTable)
    .where(eq(protocolAttachmentsTable.protocolId, params.data.id))
    .orderBy(protocolAttachmentsTable.createdAt);

  // For "cliente" role: enforce per-document visibility
  const user = req.authUser!;
  if (user.role === "cliente") {
    const [access] = await db
      .select({
        canViewAttachments: clientProtocolAccessTable.canViewAttachments,
        allowedAttachmentIds: clientProtocolAccessTable.allowedAttachmentIds,
      })
      .from(clientProtocolAccessTable)
      .where(and(
        eq(clientProtocolAccessTable.clientUserId, user.id),
        eq(clientProtocolAccessTable.protocolId, params.data.id),
      ))
      .limit(1);

    if (!access || !access.canViewAttachments) { res.json([]); return; }

    // Non-empty allowedAttachmentIds = filter to only those docs
    if (access.allowedAttachmentIds && access.allowedAttachmentIds.length > 0) {
      const allowed = new Set(access.allowedAttachmentIds);
      rows = rows.filter(r => allowed.has(r.id));
    }
  }

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

const UpdateAttachmentBody = z.object({
  fileName: z.string().min(1).optional(),
  description: z.string().optional(),
});

router.patch("/protocols/:id/attachments/:attachmentId", requireAuth, async (req, res): Promise<void> => {
  const params = AttachmentItemParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = UpdateAttachmentBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  if (Object.keys(parsed.data).length === 0) { res.status(400).json({ error: "Nenhum campo para atualizar" }); return; }
  const [updated] = await db
    .update(protocolAttachmentsTable)
    .set(parsed.data)
    .where(and(
      eq(protocolAttachmentsTable.id, params.data.attachmentId),
      eq(protocolAttachmentsTable.protocolId, params.data.id),
    ))
    .returning();
  if (!updated) { res.status(404).json({ error: "Anexo não encontrado" }); return; }
  await logAudit(req, "EDITAR_DOCUMENTO", "anexo", `Documento renomeado para "${updated.fileName}"`, { entityId: updated.id, protocolId: params.data.id });
  res.json(updated);
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
