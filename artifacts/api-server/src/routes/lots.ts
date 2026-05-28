import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, lotsTable } from "@workspace/db";
import { CreateLotBody, CreateLotParams, UpdateLotParams, DeleteLotParams, ListLotsParams } from "@workspace/api-zod";
import { logAudit } from "../lib/audit";
import { requireAuth } from "../lib/session";
import { PERM, requirePermission, isProtocolSigned } from "../lib/permissions";

const router: IRouter = Router();

router.get("/protocols/:id/lots", requireAuth, async (req, res): Promise<void> => {
  const params = ListLotsParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const lots = await db.select().from(lotsTable).where(eq(lotsTable.protocolId, params.data.id)).orderBy(lotsTable.createdAt);
  res.json(lots);
});

router.post("/protocols/:id/lots", requireAuth, requirePermission(PERM.LOTS_MANAGE), async (req, res): Promise<void> => {
  const params = CreateLotParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = CreateLotBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [lot] = await db.insert(lotsTable).values({ ...parsed.data, protocolId: params.data.id }).returning();
  await logAudit(req, "CRIAR_LOTE", "lote", `Lote "${lot.lotNumber}" adicionado`, { entityId: lot.id, protocolId: params.data.id });
  res.status(201).json(lot);
});

router.put("/protocols/:id/lots/:lotId", requireAuth, requirePermission(PERM.LOTS_MANAGE), async (req, res): Promise<void> => {
  const params = UpdateLotParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = CreateLotBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  // Post-signature lock: only admin can edit lots after protocol is signed
  const signed = await isProtocolSigned(params.data.id);
  if (signed && req.authUser?.role !== "admin") {
    res.status(403).json({ error: "Protocolo assinado. Apenas o administrador pode editar lotes." }); return;
  }

  const [lot] = await db.update(lotsTable).set(parsed.data).where(eq(lotsTable.id, params.data.lotId)).returning();
  if (!lot) { res.status(404).json({ error: "Lot not found" }); return; }
  await logAudit(req, "ATUALIZAR_LOTE", "lote", `Lote "${lot.lotNumber}" atualizado`, { entityId: lot.id, protocolId: params.data.id });
  res.json(lot);
});

router.delete("/protocols/:id/lots/:lotId", requireAuth, requirePermission(PERM.LOTS_MANAGE), async (req, res): Promise<void> => {
  const params = DeleteLotParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  // Post-signature lock: only admin can delete lots after protocol is signed
  const signed = await isProtocolSigned(params.data.id);
  if (signed && req.authUser?.role !== "admin") {
    res.status(403).json({ error: "Protocolo assinado. Apenas o administrador pode excluir lotes." }); return;
  }

  const [deleted] = await db.delete(lotsTable).where(eq(lotsTable.id, params.data.lotId)).returning();
  if (!deleted) { res.status(404).json({ error: "Lot not found" }); return; }
  await logAudit(req, "EXCLUIR_LOTE", "lote", `Lote "${deleted.lotNumber}" excluído`, { entityId: deleted.id, protocolId: params.data.id });
  res.sendStatus(204);
});

export default router;
