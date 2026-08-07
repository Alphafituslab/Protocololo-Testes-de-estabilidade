import { Router, type IRouter } from "express";
import { eq, and, isNull } from "drizzle-orm";
import { db, lotsTable } from "@workspace/db";
import { CreateLotBody, CreateLotParams, UpdateLotParams, DeleteLotParams, ListLotsParams } from "@workspace/api-zod";
import { logAudit } from "../lib/audit";
import { requireAuth } from "../lib/session";
import { PERM, requirePermission, isProtocolSigned } from "../lib/permissions";
import { createAutoSnapshot } from "../lib/snapshot-helper";

const router: IRouter = Router();

function pgCode(err: unknown): string | undefined {
  if (!err || typeof err !== "object") return undefined;
  const e = err as Record<string, unknown>;
  // Direct postgres error
  if (typeof e["code"] === "string" && e["code"].length === 5) return e["code"];
  // Drizzle wraps the original error in .cause
  if (e["cause"]) return pgCode(e["cause"]);
  return undefined;
}

function dbErrMessage(err: unknown): string {
  const code = pgCode(err);
  if (code === "23505") {
    return "Já existe um lote com esse número neste protocolo. Escolha outro número de lote.";
  }
  if (code === "23514") return "Dados inválidos (violação de regra). Verifique as datas e valores.";
  if (code === "23502") return "Campo obrigatório ausente.";
  if (code === "23503") return "Protocolo não encontrado.";
  // Fallback: check message text for common patterns
  const msg = String((err as Record<string, unknown>)?.["message"] ?? "");
  if (msg.toLowerCase().includes("unique") || msg.toLowerCase().includes("duplicate")) {
    return "Já existe um lote com esse número neste protocolo. Escolha outro número de lote.";
  }
  return "Erro ao salvar o lote. Tente novamente ou contate o administrador.";
}

router.get("/protocols/:id/lots", requireAuth, async (req, res): Promise<void> => {
  const params = ListLotsParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const lots = await db.select().from(lotsTable)
    .where(and(eq(lotsTable.protocolId, params.data.id), isNull(lotsTable.deletedAt)))
    .orderBy(lotsTable.manufacturingDate, lotsTable.lotNumber);
  res.json(lots);
});

router.post("/protocols/:id/lots", requireAuth, requirePermission(PERM.LOTS_MANAGE), async (req, res): Promise<void> => {
  const params = CreateLotParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = CreateLotBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  try {
    const [lot] = await db.insert(lotsTable).values({ ...parsed.data, protocolId: params.data.id }).returning();
    await logAudit(req, "CRIAR_LOTE", "lote", `Lote "${lot.lotNumber}" adicionado`, { entityId: lot.id, protocolId: params.data.id });
    void createAutoSnapshot(params.data.id, `Auto: após adicionar lote "${lot.lotNumber}"`, req.authUser?.displayName ?? "Sistema");
    res.status(201).json(lot);
  } catch (err) {
    res.status(409).json({ error: dbErrMessage(err) });
  }
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

  try {
    const [lot] = await db.update(lotsTable).set(parsed.data).where(eq(lotsTable.id, params.data.lotId)).returning();
    if (!lot) { res.status(404).json({ error: "Lot not found" }); return; }
    await logAudit(req, "ATUALIZAR_LOTE", "lote", `Lote "${lot.lotNumber}" atualizado`, { entityId: lot.id, protocolId: params.data.id });
    res.json(lot);
  } catch (err) {
    res.status(409).json({ error: dbErrMessage(err) });
  }
});

router.delete("/protocols/:id/lots/:lotId", requireAuth, requirePermission(PERM.LOTS_MANAGE), async (req, res): Promise<void> => {
  const params = DeleteLotParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  // Post-signature lock: only admin can delete lots after protocol is signed
  const signed = await isProtocolSigned(params.data.id);
  if (signed && req.authUser?.role !== "admin") {
    res.status(403).json({ error: "Protocolo assinado. Apenas o administrador pode excluir lotes." }); return;
  }

  try {
    const [deleted] = await db
      .update(lotsTable)
      .set({ deletedAt: new Date() })
      .where(and(eq(lotsTable.id, params.data.lotId), isNull(lotsTable.deletedAt)))
      .returning();
    if (!deleted) { res.status(404).json({ error: "Lot not found" }); return; }
    await logAudit(req, "EXCLUIR_LOTE", "lote", `Lote "${deleted.lotNumber}" enviado para a lixeira`, { entityId: deleted.id, protocolId: params.data.id });
    void createAutoSnapshot(params.data.id, `Auto: antes de excluir lote "${deleted.lotNumber}"`, req.authUser?.displayName ?? "Sistema");
    res.sendStatus(204);
  } catch (err) {
    res.status(500).json({ error: dbErrMessage(err) });
  }
});

export default router;
