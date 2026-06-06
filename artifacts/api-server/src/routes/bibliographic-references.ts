import { Router, type IRouter } from "express";
import { db, bibliographicReferencesTable, protocolReferencesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
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
    descricao?: string; tipoReferencia?: string;
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
  }).returning();
  res.status(201).json(row);
});

router.put("/bibliographic-references/:id", requireAuth, requirePermission(PERM.CATALOG_MANAGE), async (req, res): Promise<void> => {
  const id = Number(req.params["id"]);
  const body = req.body as {
    titulo?: string; autores?: string; ano?: number; fonte?: string;
    volume?: string; numero?: string; paginas?: string; doi?: string;
    descricao?: string; tipoReferencia?: string;
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
    .select({ ref: bibliographicReferencesTable })
    .from(protocolReferencesTable)
    .innerJoin(bibliographicReferencesTable, eq(protocolReferencesTable.referenceId, bibliographicReferencesTable.id))
    .where(eq(protocolReferencesTable.protocolId, protocolId))
    .orderBy(bibliographicReferencesTable.autores, bibliographicReferencesTable.titulo);
  res.json(rows.map(r => r.ref));
});

router.post("/protocols/:id/bibliographic-references", requireAuth, async (req, res): Promise<void> => {
  const protocolId = Number(req.params["id"]);
  const { referenceId } = req.body as { referenceId?: number };
  if (!referenceId) { res.status(400).json({ error: "referenceId obrigatório" }); return; }
  const existing = await db.select().from(protocolReferencesTable)
    .where(and(eq(protocolReferencesTable.protocolId, protocolId), eq(protocolReferencesTable.referenceId, referenceId)));
  if (existing.length > 0) { res.status(409).json({ error: "Referência já associada" }); return; }
  const [row] = await db.insert(protocolReferencesTable).values({ protocolId, referenceId }).returning();
  res.status(201).json(row);
});

router.delete("/protocols/:id/bibliographic-references/:refId", requireAuth, async (req, res): Promise<void> => {
  const protocolId = Number(req.params["id"]);
  const referenceId = Number(req.params["refId"]);
  await db.delete(protocolReferencesTable)
    .where(and(eq(protocolReferencesTable.protocolId, protocolId), eq(protocolReferencesTable.referenceId, referenceId)));
  res.json({ ok: true });
});

export default router;
