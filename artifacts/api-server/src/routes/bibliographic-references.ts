import { Router, type IRouter } from "express";
import { db, bibliographicReferencesTable, protocolReferencesTable } from "@workspace/db";
import { eq, and, asc } from "drizzle-orm";
import { requireAuth } from "../lib/session";
import { PERM, requirePermission } from "../lib/permissions";

const router: IRouter = Router();

// ── Banco de Referências Bibliográficas ───────────────────────────────────────

router.get("/bibliographic-references", requireAuth, async (_req, res): Promise<void> => {
  const rows = await db.select().from(bibliographicReferencesTable).orderBy(bibliographicReferencesTable.titulo);
  res.json(rows);
});

router.post("/bibliographic-references", requireAuth, requirePermission(PERM.CATALOG_MANAGE), async (req, res): Promise<void> => {
  const body = req.body as {
    titulo?: string; autores?: string; ano?: number; fonte?: string;
    volume?: string; numero?: string; paginas?: string; doi?: string;
    descricao?: string; tipoReferencia?: string; autoInclude?: boolean;
  };
  if (!body.titulo?.trim()) { res.status(400).json({ error: "titulo obrigatório" }); return; }
  const [row] = await db.insert(bibliographicReferencesTable).values({
    titulo: body.titulo.trim(),
    autores: body.autores?.trim() ?? null,
    ano: body.ano ?? null,
    fonte: body.fonte?.trim() ?? null,
    volume: body.volume?.trim() ?? null,
    numero: body.numero?.trim() ?? null,
    paginas: body.paginas?.trim() ?? null,
    doi: body.doi?.trim() ?? null,
    descricao: body.descricao?.trim() ?? null,
    tipoReferencia: body.tipoReferencia ?? "artigo",
    autoInclude: body.autoInclude ?? false,
  }).returning();
  res.status(201).json(row);
});

router.put("/bibliographic-references/:id", requireAuth, requirePermission(PERM.CATALOG_MANAGE), async (req, res): Promise<void> => {
  const id = Number(req.params["id"]);
  const body = req.body as {
    titulo?: string; autores?: string; ano?: number; fonte?: string;
    volume?: string; numero?: string; paginas?: string; doi?: string;
    descricao?: string; tipoReferencia?: string; autoInclude?: boolean;
  };
  if (!body.titulo?.trim()) { res.status(400).json({ error: "titulo obrigatório" }); return; }
  const [row] = await db.update(bibliographicReferencesTable).set({
    titulo: body.titulo.trim(),
    autores: body.autores?.trim() ?? null,
    ano: body.ano ?? null,
    fonte: body.fonte?.trim() ?? null,
    volume: body.volume?.trim() ?? null,
    numero: body.numero?.trim() ?? null,
    paginas: body.paginas?.trim() ?? null,
    doi: body.doi?.trim() ?? null,
    descricao: body.descricao?.trim() ?? null,
    tipoReferencia: body.tipoReferencia ?? "artigo",
    autoInclude: body.autoInclude ?? false,
    updatedAt: new Date(),
  }).where(eq(bibliographicReferencesTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Não encontrado" }); return; }
  res.json(row);
});

router.delete("/bibliographic-references/:id", requireAuth, requirePermission(PERM.CATALOG_MANAGE), async (req, res): Promise<void> => {
  const id = Number(req.params["id"]);
  await db.delete(bibliographicReferencesTable).where(eq(bibliographicReferencesTable.id, id));
  res.json({ ok: true });
});

// ── Referências por Protocolo ─────────────────────────────────────────────────

router.get("/protocols/:id/bibliographic-references", requireAuth, async (req, res): Promise<void> => {
  const protocolId = Number(req.params["id"]);
  const rows = await db
    .select({ ref: bibliographicReferencesTable, sortOrder: protocolReferencesTable.sortOrder })
    .from(protocolReferencesTable)
    .innerJoin(bibliographicReferencesTable, eq(protocolReferencesTable.referenceId, bibliographicReferencesTable.id))
    .where(eq(protocolReferencesTable.protocolId, protocolId))
    .orderBy(asc(protocolReferencesTable.sortOrder), asc(bibliographicReferencesTable.titulo));
  res.json(rows.map(r => r.ref));
});

router.post("/protocols/:id/bibliographic-references", requireAuth, async (req, res): Promise<void> => {
  const protocolId = Number(req.params["id"]);
  const { referenceId } = req.body as { referenceId?: number };
  if (!referenceId) { res.status(400).json({ error: "referenceId obrigatório" }); return; }
  const existing = await db.select().from(protocolReferencesTable)
    .where(and(eq(protocolReferencesTable.protocolId, protocolId), eq(protocolReferencesTable.referenceId, referenceId)));
  if (existing.length > 0) { res.status(409).json({ error: "Referência já associada" }); return; }
  // Place at the end
  const [maxRow] = await db
    .select({ maxOrder: protocolReferencesTable.sortOrder })
    .from(protocolReferencesTable)
    .where(eq(protocolReferencesTable.protocolId, protocolId))
    .orderBy(protocolReferencesTable.sortOrder)
    .limit(1);
  const nextOrder = (maxRow?.maxOrder ?? -1) + 1;
  const [row] = await db.insert(protocolReferencesTable).values({ protocolId, referenceId, sortOrder: nextOrder }).returning();
  res.status(201).json(row);
});

// Bulk add multiple references at once
router.post("/protocols/:id/bibliographic-references/bulk", requireAuth, async (req, res): Promise<void> => {
  const protocolId = Number(req.params["id"]);
  const { referenceIds } = req.body as { referenceIds?: number[] };
  if (!Array.isArray(referenceIds) || referenceIds.length === 0) {
    res.status(400).json({ error: "referenceIds obrigatório" }); return;
  }
  // Get current max sortOrder
  const existing = await db.select({ referenceId: protocolReferencesTable.referenceId, sortOrder: protocolReferencesTable.sortOrder })
    .from(protocolReferencesTable)
    .where(eq(protocolReferencesTable.protocolId, protocolId));
  const existingIds = new Set(existing.map(r => r.referenceId));
  const maxOrder = existing.reduce((m, r) => Math.max(m, r.sortOrder), -1);
  const toInsert = referenceIds
    .filter(id => !existingIds.has(id))
    .map((referenceId, i) => ({ protocolId, referenceId, sortOrder: maxOrder + 1 + i }));
  if (toInsert.length > 0) {
    await db.insert(protocolReferencesTable).values(toInsert);
  }
  res.json({ added: toInsert.length, skipped: referenceIds.length - toInsert.length });
});

// Reorder references
router.put("/protocols/:id/bibliographic-references/reorder", requireAuth, async (req, res): Promise<void> => {
  const protocolId = Number(req.params["id"]);
  const { orderedIds } = req.body as { orderedIds?: number[] };
  if (!Array.isArray(orderedIds)) { res.status(400).json({ error: "orderedIds obrigatório" }); return; }
  for (let i = 0; i < orderedIds.length; i++) {
    await db.update(protocolReferencesTable)
      .set({ sortOrder: i })
      .where(and(
        eq(protocolReferencesTable.protocolId, protocolId),
        eq(protocolReferencesTable.referenceId, orderedIds[i]!)
      ));
  }
  res.json({ ok: true });
});

router.delete("/protocols/:id/bibliographic-references/:refId", requireAuth, async (req, res): Promise<void> => {
  const protocolId = Number(req.params["id"]);
  const referenceId = Number(req.params["refId"]);
  await db.delete(protocolReferencesTable)
    .where(and(eq(protocolReferencesTable.protocolId, protocolId), eq(protocolReferencesTable.referenceId, referenceId)));
  res.json({ ok: true });
});

export default router;
