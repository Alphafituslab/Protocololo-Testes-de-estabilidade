import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, methodologiesTable } from "@workspace/db";
import { z } from "zod";

const router: IRouter = Router();

const CreateMethodologyBody = z.object({
  shortName: z.string().min(1),
  citation: z.string().min(1),
  category: z.string().nullable().optional(),
});

const MethodologyIdParams = z.object({
  id: z.coerce.number().int().positive(),
});

const UpdateMethodologyBody = z.object({
  shortName: z.string().min(1),
  citation: z.string().min(1),
  category: z.string().nullable().optional(),
});

router.get("/methodologies", async (_req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(methodologiesTable)
    .orderBy(methodologiesTable.createdAt);
  res.json(rows);
});

router.post("/methodologies", async (req, res): Promise<void> => {
  const parsed = CreateMethodologyBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [created] = await db
    .insert(methodologiesTable)
    .values({
      shortName: parsed.data.shortName,
      citation: parsed.data.citation,
      category: parsed.data.category ?? null,
    })
    .returning();
  res.status(201).json(created);
});

router.put("/methodologies/:id", async (req, res): Promise<void> => {
  const params = MethodologyIdParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = UpdateMethodologyBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const [updated] = await db
    .update(methodologiesTable)
    .set({
      shortName: body.data.shortName,
      citation: body.data.citation,
      category: body.data.category ?? null,
    })
    .where(eq(methodologiesTable.id, params.data.id))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Methodology not found" });
    return;
  }
  res.json(updated);
});

router.delete("/methodologies/:id", async (req, res): Promise<void> => {
  const params = MethodologyIdParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [deleted] = await db
    .delete(methodologiesTable)
    .where(eq(methodologiesTable.id, params.data.id))
    .returning();
  if (!deleted) {
    res.status(404).json({ error: "Methodology not found" });
    return;
  }
  res.sendStatus(204);
});

export default router;
