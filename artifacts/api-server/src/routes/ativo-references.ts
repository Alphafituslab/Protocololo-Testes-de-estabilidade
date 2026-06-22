import { Router, type IRouter } from "express";
import { eq, ilike } from "drizzle-orm";
import { db, ativoReferencesTable } from "@workspace/db";

const router: IRouter = Router();

router.get("/ativo-references", async (_req, res): Promise<void> => {
  const refs = await db.select().from(ativoReferencesTable).orderBy(ativoReferencesTable.parameter);
  res.json(refs);
});

router.get("/ativo-references/lookup", async (req, res): Promise<void> => {
  const { parameter } = req.query;
  if (!parameter || typeof parameter !== "string") {
    res.status(400).json({ error: "parameter query param required" });
    return;
  }
  const refs = await db
    .select()
    .from(ativoReferencesTable)
    .where(ilike(ativoReferencesTable.parameter, `%${parameter}%`))
    .limit(5);
  res.json(refs);
});

router.post("/ativo-references", async (req, res): Promise<void> => {
  const { parameter, minValue, maxValue, unit, overage, source, notes } = req.body as {
    parameter: string;
    minValue?: string | null;
    maxValue?: string | null;
    unit?: string;
    overage?: string | null;
    source?: string | null;
    notes?: string | null;
  };
  if (!parameter?.trim()) {
    res.status(400).json({ error: "parameter is required" });
    return;
  }
  const [created] = await db
    .insert(ativoReferencesTable)
    .values({ parameter: parameter.trim(), minValue: minValue ?? null, maxValue: maxValue ?? null, unit: unit ?? "mg", overage: overage ?? null, source: source ?? null, notes: notes ?? null })
    .returning();
  res.status(201).json(created);
});

router.put("/ativo-references/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "invalid id" }); return; }
  const { parameter, minValue, maxValue, unit, overage, source, notes } = req.body as {
    parameter?: string;
    minValue?: string | null;
    maxValue?: string | null;
    unit?: string;
    overage?: string | null;
    source?: string | null;
    notes?: string | null;
  };
  const [updated] = await db
    .update(ativoReferencesTable)
    .set({
      ...(parameter !== undefined && { parameter: parameter.trim() }),
      ...(minValue !== undefined && { minValue: minValue ?? null }),
      ...(maxValue !== undefined && { maxValue: maxValue ?? null }),
      ...(unit !== undefined && { unit }),
      ...(overage !== undefined && { overage: overage ?? null }),
      ...(source !== undefined && { source: source ?? null }),
      ...(notes !== undefined && { notes: notes ?? null }),
    })
    .where(eq(ativoReferencesTable.id, id))
    .returning();
  if (!updated) { res.status(404).json({ error: "not found" }); return; }
  res.json(updated);
});

router.delete("/ativo-references/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "invalid id" }); return; }
  const [deleted] = await db.delete(ativoReferencesTable).where(eq(ativoReferencesTable.id, id)).returning();
  if (!deleted) { res.status(404).json({ error: "not found" }); return; }
  res.status(204).send();
});

export default router;
