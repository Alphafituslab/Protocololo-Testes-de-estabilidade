import { Router, type IRouter } from "express";
import { db, containerTypesTable, capsuleTypesTable, productTypesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../lib/session";

const router: IRouter = Router();

router.get("/catalog/container-types", async (_req, res): Promise<void> => {
  const rows = await db.select().from(containerTypesTable).orderBy(containerTypesTable.name);
  res.json(rows);
});

router.post("/catalog/container-types", requireAuth, async (req, res): Promise<void> => {
  const { name, description } = req.body as { name?: string; description?: string };
  if (!name?.trim()) {
    res.status(400).json({ error: "name obrigatório" });
    return;
  }
  const [row] = await db.insert(containerTypesTable).values({ name: name.trim(), description: description?.trim() ?? null }).returning();
  res.status(201).json(row);
});

router.put("/catalog/container-types/:id", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params["id"]);
  const { name, description } = req.body as { name?: string; description?: string };
  if (!name?.trim()) {
    res.status(400).json({ error: "name obrigatório" });
    return;
  }
  const [row] = await db.update(containerTypesTable)
    .set({ name: name.trim(), description: description?.trim() ?? null, updatedAt: new Date() })
    .where(eq(containerTypesTable.id, id))
    .returning();
  if (!row) { res.status(404).json({ error: "Não encontrado" }); return; }
  res.json(row);
});

router.delete("/catalog/container-types/:id", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params["id"]);
  await db.delete(containerTypesTable).where(eq(containerTypesTable.id, id));
  res.json({ ok: true });
});

router.get("/catalog/capsule-types", async (_req, res): Promise<void> => {
  const rows = await db.select().from(capsuleTypesTable).orderBy(capsuleTypesTable.name);
  res.json(rows);
});

router.post("/catalog/capsule-types", requireAuth, async (req, res): Promise<void> => {
  const { name, description } = req.body as { name?: string; description?: string };
  if (!name?.trim()) {
    res.status(400).json({ error: "name obrigatório" });
    return;
  }
  const [row] = await db.insert(capsuleTypesTable).values({ name: name.trim(), description: description?.trim() ?? null }).returning();
  res.status(201).json(row);
});

router.put("/catalog/capsule-types/:id", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params["id"]);
  const { name, description } = req.body as { name?: string; description?: string };
  if (!name?.trim()) {
    res.status(400).json({ error: "name obrigatório" });
    return;
  }
  const [row] = await db.update(capsuleTypesTable)
    .set({ name: name.trim(), description: description?.trim() ?? null, updatedAt: new Date() })
    .where(eq(capsuleTypesTable.id, id))
    .returning();
  if (!row) { res.status(404).json({ error: "Não encontrado" }); return; }
  res.json(row);
});

router.delete("/catalog/capsule-types/:id", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params["id"]);
  await db.delete(capsuleTypesTable).where(eq(capsuleTypesTable.id, id));
  res.json({ ok: true });
});

router.get("/catalog/product-types", async (_req, res): Promise<void> => {
  const rows = await db.select().from(productTypesTable).orderBy(productTypesTable.name);
  res.json(rows);
});

router.post("/catalog/product-types", requireAuth, async (req, res): Promise<void> => {
  const { name, description, isPowder } = req.body as { name?: string; description?: string; isPowder?: boolean };
  if (!name?.trim()) {
    res.status(400).json({ error: "name obrigatório" });
    return;
  }
  const [row] = await db.insert(productTypesTable).values({ name: name.trim(), description: description?.trim() ?? null, isPowder: isPowder ?? false }).returning();
  res.status(201).json(row);
});

router.put("/catalog/product-types/:id", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params["id"]);
  const { name, description, isPowder } = req.body as { name?: string; description?: string; isPowder?: boolean };
  if (!name?.trim()) {
    res.status(400).json({ error: "name obrigatório" });
    return;
  }
  const [row] = await db.update(productTypesTable)
    .set({ name: name.trim(), description: description?.trim() ?? null, isPowder: isPowder ?? false, updatedAt: new Date() })
    .where(eq(productTypesTable.id, id))
    .returning();
  if (!row) { res.status(404).json({ error: "Não encontrado" }); return; }
  res.json(row);
});

router.delete("/catalog/product-types/:id", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params["id"]);
  await db.delete(productTypesTable).where(eq(productTypesTable.id, id));
  res.json({ ok: true });
});

export default router;
