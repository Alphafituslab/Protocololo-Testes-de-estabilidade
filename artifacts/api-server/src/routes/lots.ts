import { Router, type IRouter } from "express";
import { eq, and, isNull, isNotNull, ne, count } from "drizzle-orm";
import { db, lotsTable, protocolsTable, analysisResultsTable } from "@workspace/db";
import { CreateLotBody, CreateLotParams, UpdateLotParams, DeleteLotParams, ListLotsParams } from "@workspace/api-zod";
import { logAudit } from "../lib/audit";
import { requireAuth } from "../lib/session";
import { PERM, requirePermission, isProtocolSigned } from "../lib/permissions";
import { createAutoSnapshot } from "../lib/snapshot-helper";
import { logger } from "../lib/logger";

const router: IRouter = Router();

/**
 * Verifica se um número de lote já está em uso em algum protocolo (excluindo soft-deleted).
 * Retorna o nome do protocolo que já usa esse número, ou null se livre.
 *
 * skipProtocolId: ao editar um lote, ignora o próprio protocolo para não bloquear o update.
 */
async function findConflictingProtocol(
  lotNumber: string,
  skipProtocolId?: number,
): Promise<string | null> {
  const conditions = [
    isNull(lotsTable.deletedAt),
    eq(lotsTable.lotNumber, lotNumber),
  ];
  if (skipProtocolId !== undefined) {
    conditions.push(ne(lotsTable.protocolId, skipProtocolId));
  }

  const rows = await db
    .select({ productName: protocolsTable.productName, certNumber: protocolsTable.certNumber })
    .from(lotsTable)
    .innerJoin(protocolsTable, eq(lotsTable.protocolId, protocolsTable.id))
    .where(and(...conditions))
    .limit(1);

  if (rows.length === 0) return null;
  const { productName, certNumber } = rows[0];
  return certNumber ? `${productName} (${certNumber})` : productName;
}

/**
 * Verifica se o mesmo número de lote já existe no MESMO protocolo (excluindo soft-deleted).
 * skipLotId: ao editar, ignora o próprio lote para não bloquear o update.
 */
async function findConflictWithinProtocol(
  protocolId: number,
  lotNumber: string,
  skipLotId?: number,
): Promise<boolean> {
  const conditions = [
    isNull(lotsTable.deletedAt),
    eq(lotsTable.protocolId, protocolId),
    eq(lotsTable.lotNumber, lotNumber),
  ];
  if (skipLotId !== undefined) {
    conditions.push(ne(lotsTable.id, skipLotId));
  }
  const rows = await db.select({ id: lotsTable.id }).from(lotsTable).where(and(...conditions)).limit(1);
  return rows.length > 0;
}

/**
 * Formata a mensagem de erro de duplicidade com base no número do lote.
 * Números começando com "CERT-" são tratados como certificados.
 */
function duplicateMessage(lotNumber: string, protocolLabel: string): string {
  const isCert = lotNumber.toUpperCase().startsWith("CERT");
  const kind = isCert ? "CERT" : "Lote";
  return `${kind} "${lotNumber}" já está em uso no protocolo "${protocolLabel}". Exclua-o lá primeiro se desejar reutilizá-lo.`;
}

function dbErrMessage(err: unknown): string {
  const msg = String((err as Record<string, unknown>)?.["message"] ?? "");
  if (msg.toLowerCase().includes("unique") || msg.toLowerCase().includes("duplicate")) {
    return "Número de lote duplicado. Verifique os dados e tente novamente.";
  }
  return "Erro ao salvar o lote. Tente novamente ou contate o administrador.";
}

// ─── GET ─────────────────────────────────────────────────────────────────────

router.get("/protocols/:id/lots", requireAuth, async (req, res): Promise<void> => {
  const params = ListLotsParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const lots = await db.select().from(lotsTable)
    .where(and(eq(lotsTable.protocolId, params.data.id), isNull(lotsTable.deletedAt)))
    .orderBy(lotsTable.manufacturingDate, lotsTable.lotNumber);
  res.json(lots);
});

// ─── GET DELETED (lixeira) ───────────────────────────────────────────────────

router.get("/protocols/:id/lots/deleted", requireAuth, async (req, res): Promise<void> => {
  const params = ListLotsParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const lots = await db.select().from(lotsTable)
    .where(and(eq(lotsTable.protocolId, params.data.id), isNotNull(lotsTable.deletedAt)))
    .orderBy(lotsTable.deletedAt, lotsTable.lotNumber);
  res.json(lots);
});

// ─── POST ─────────────────────────────────────────────────────────────────────

router.post("/protocols/:id/lots", requireAuth, requirePermission(PERM.LOTS_MANAGE), async (req, res): Promise<void> => {
  const params = CreateLotParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = CreateLotBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { lotNumber } = parsed.data;
  const protocolId = params.data.id;

  // 1. Mesmo número no mesmo protocolo (não-deletado)?
  const withinSame = await findConflictWithinProtocol(protocolId, lotNumber);
  if (withinSame) {
    res.status(409).json({ error: `Lote "${lotNumber}" já existe neste protocolo. Exclua-o primeiro para readicioná-lo.` });
    return;
  }

  // 2. Mesmo número em outro protocolo (não-deletado)?
  const otherProtocol = await findConflictingProtocol(lotNumber, protocolId);
  if (otherProtocol) {
    res.status(409).json({ error: duplicateMessage(lotNumber, otherProtocol) });
    return;
  }

  try {
    const [lot] = await db.insert(lotsTable).values({ ...parsed.data, protocolId }).returning();
    await logAudit(req, "CRIAR_LOTE", "lote", `Lote "${lot.lotNumber}" adicionado`, { entityId: lot.id, protocolId });
    void createAutoSnapshot(protocolId, `Auto: após adicionar lote "${lot.lotNumber}"`, req.authUser?.displayName ?? "Sistema");
    res.status(201).json(lot);
  } catch (err) {
    logger.error({ err, protocolId, lotNumber: parsed.data.lotNumber }, "createLot: DB insert failed");
    res.status(409).json({ error: dbErrMessage(err) });
  }
});

// ─── PUT ──────────────────────────────────────────────────────────────────────

router.put("/protocols/:id/lots/:lotId", requireAuth, requirePermission(PERM.LOTS_MANAGE), async (req, res): Promise<void> => {
  const params = UpdateLotParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = CreateLotBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  // Post-signature lock
  const signed = await isProtocolSigned(params.data.id);
  if (signed && req.authUser?.role !== "admin") {
    res.status(403).json({ error: "Protocolo assinado. Apenas o administrador pode editar lotes." }); return;
  }

  const { lotNumber } = parsed.data;

  // Unicidade dentro do mesmo protocolo (excluindo o próprio lote)
  const withinSame = await findConflictWithinProtocol(params.data.id, lotNumber, params.data.lotId);
  if (withinSame) {
    res.status(409).json({ error: `Lote "${lotNumber}" já existe neste protocolo.` });
    return;
  }

  // Unicidade global (excluindo este protocolo)
  const otherProtocol = await findConflictingProtocol(lotNumber, params.data.id);
  if (otherProtocol) {
    res.status(409).json({ error: duplicateMessage(lotNumber, otherProtocol) });
    return;
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

// ─── DELETE ───────────────────────────────────────────────────────────────────

router.delete("/protocols/:id/lots/:lotId", requireAuth, requirePermission(PERM.LOTS_MANAGE), async (req, res): Promise<void> => {
  const params = DeleteLotParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  // Post-signature lock
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

// ─── PATCH RESTORE ───────────────────────────────────────────────────────────

router.patch("/protocols/:id/lots/:lotId/restore", requireAuth, requirePermission(PERM.LOTS_MANAGE), async (req, res): Promise<void> => {
  const params = DeleteLotParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  // Post-signature lock — same guard as soft-delete and update
  const signed = await isProtocolSigned(params.data.id);
  if (signed && req.authUser?.role !== "admin") {
    res.status(403).json({ error: "Protocolo assinado. Apenas o administrador pode restaurar lotes." }); return;
  }

  // Find the deleted lot scoped to this protocol (prevents cross-protocol operations)
  const [target] = await db.select().from(lotsTable)
    .where(and(
      eq(lotsTable.id, params.data.lotId),
      eq(lotsTable.protocolId, params.data.id),
      isNotNull(lotsTable.deletedAt),
    ))
    .limit(1);
  if (!target) { res.status(404).json({ error: "Lote excluído não encontrado neste protocolo." }); return; }

  // Check if the same lot number already exists (active) in this protocol
  const withinSame = await findConflictWithinProtocol(params.data.id, target.lotNumber);
  if (withinSame) {
    res.status(409).json({ error: `Já existe um lote ativo com o número "${target.lotNumber}" neste protocolo. Exclua-o primeiro para restaurar este.` });
    return;
  }

  // Check global uniqueness across other protocols
  const otherProtocol = await findConflictingProtocol(target.lotNumber, params.data.id);
  if (otherProtocol) {
    res.status(409).json({ error: duplicateMessage(target.lotNumber, otherProtocol) });
    return;
  }

  try {
    const [restored] = await db
      .update(lotsTable)
      .set({ deletedAt: null })
      .where(and(eq(lotsTable.id, params.data.lotId), eq(lotsTable.protocolId, params.data.id)))
      .returning();
    if (!restored) { res.status(404).json({ error: "Lote não encontrado." }); return; }
    await logAudit(req, "RESTAURAR_LOTE", "lote", `Lote "${restored.lotNumber}" restaurado da lixeira`, { entityId: restored.id, protocolId: params.data.id });
    res.json(restored);
  } catch (err) {
    res.status(500).json({ error: dbErrMessage(err) });
  }
});

// ─── DELETE PERMANENT ─────────────────────────────────────────────────────────

router.delete("/protocols/:id/lots/:lotId/permanent", requireAuth, requirePermission(PERM.LOTS_MANAGE), async (req, res): Promise<void> => {
  const params = DeleteLotParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  // Post-signature lock
  const signed = await isProtocolSigned(params.data.id);
  if (signed && req.authUser?.role !== "admin") {
    res.status(403).json({ error: "Protocolo assinado. Apenas o administrador pode excluir lotes permanentemente." }); return;
  }

  // Only allow permanent deletion of already soft-deleted lots scoped to this protocol
  const [target] = await db.select().from(lotsTable)
    .where(and(
      eq(lotsTable.id, params.data.lotId),
      eq(lotsTable.protocolId, params.data.id),
      isNotNull(lotsTable.deletedAt),
    ))
    .limit(1);
  if (!target) { res.status(404).json({ error: "Lote excluído não encontrado neste protocolo." }); return; }

  // Count ALL associated analysis results (active AND soft-deleted) — ON DELETE CASCADE would
  // silently erase both. Block whenever any exist, regardless of their deletedAt state.
  const [{ resultCount }] = await db
    .select({ resultCount: count() })
    .from(analysisResultsTable)
    .where(and(
      eq(analysisResultsTable.lotId, params.data.lotId),
      eq(analysisResultsTable.protocolId, params.data.id),
    ));

  if (resultCount > 0) {
    res.status(409).json({
      error: `Este lote possui ${resultCount} resultado(s) de análise associado(s). Exclua os resultados primeiro antes de remover o lote permanentemente.`,
      resultCount,
    });
    return;
  }

  try {
    await db.delete(lotsTable).where(and(eq(lotsTable.id, params.data.lotId), eq(lotsTable.protocolId, params.data.id)));
    await logAudit(req, "EXCLUIR_PERMANENTE_LOTE", "lote", `Lote "${target.lotNumber}" excluído permanentemente`, { entityId: target.id, protocolId: params.data.id });
    res.sendStatus(204);
  } catch (err) {
    res.status(500).json({ error: dbErrMessage(err) });
  }
});

export default router;
