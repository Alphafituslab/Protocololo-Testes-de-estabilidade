import { Router, type IRouter } from "express";
import { db, protocolSignaturesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../lib/session";
import { logAudit } from "../lib/audit";

const router: IRouter = Router();

router.get("/protocols/:id/signatures", async (req, res): Promise<void> => {
  const protocolId = parseInt(req.params["id"]);
  if (isNaN(protocolId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const sigs = await db
    .select()
    .from(protocolSignaturesTable)
    .where(eq(protocolSignaturesTable.protocolId, protocolId))
    .orderBy(protocolSignaturesTable.signedAt);

  res.json(sigs);
});

router.post("/protocols/:id/signatures", requireAuth, async (req, res): Promise<void> => {
  const protocolId = parseInt(req.params["id"]);
  if (isNaN(protocolId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const { roleLabel } = req.body as { roleLabel?: string };
  if (!roleLabel?.trim()) { res.status(400).json({ error: "roleLabel is required" }); return; }

  const user = req.authUser!;

  const [sig] = await db
    .insert(protocolSignaturesTable)
    .values({
      protocolId,
      userId: user.id,
      userDisplay: user.displayName,
      userRole: user.role,
      roleLabel: roleLabel.trim(),
    })
    .returning();

  await logAudit(req, "sign", "protocol", `${user.displayName} assinou como ${roleLabel.trim()}`, {
    protocolId,
    entityId: sig!.id,
  });

  res.status(201).json(sig);
});

router.delete("/protocols/:id/signatures/:sigId", requireAuth, async (req, res): Promise<void> => {
  const protocolId = parseInt(req.params["id"]);
  const sigId = parseInt(req.params["sigId"]);
  if (isNaN(protocolId) || isNaN(sigId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const user = req.authUser!;

  const [existing] = await db
    .select()
    .from(protocolSignaturesTable)
    .where(and(eq(protocolSignaturesTable.id, sigId), eq(protocolSignaturesTable.protocolId, protocolId)));

  if (!existing) { res.status(404).json({ error: "Signature not found" }); return; }

  if (user.role !== "admin" && existing.userId !== user.id) {
    res.status(403).json({ error: "Você só pode remover sua própria assinatura" });
    return;
  }

  await db.delete(protocolSignaturesTable).where(eq(protocolSignaturesTable.id, sigId));

  await logAudit(req, "unsign", "protocol", `Assinatura de ${existing.userDisplay} (${existing.roleLabel}) removida`, {
    protocolId,
    entityId: sigId,
  });

  res.json({ ok: true });
});

export default router;
