import { Router, type IRouter } from "express";
import { db, companies } from "@workspace/db";
import { eq, asc } from "drizzle-orm";
import { requireAuth } from "../lib/session";

const router: IRouter = Router();

// GET /companies
router.get("/companies", requireAuth, async (req, res) => {
  try {
    const rows = await db.select().from(companies).orderBy(asc(companies.name));
    res.json(rows);
  } catch (err) {
    req.log.error(err, "GET /companies failed");
    res.status(500).json({ error: "Erro ao listar empresas" });
  }
});

// POST /companies
router.post("/companies", requireAuth, async (req, res) => {
  try {
    const { name, cnpj } = req.body as { name?: string; cnpj?: string };
    if (!name?.trim()) return res.status(400).json({ error: "Nome é obrigatório" });
    const [row] = await db
      .insert(companies)
      .values({ name: name.trim(), cnpj: cnpj?.trim() || null })
      .returning();
    res.status(201).json(row);
  } catch (err) {
    req.log.error(err, "POST /companies failed");
    res.status(500).json({ error: "Erro ao criar empresa" });
  }
});

// PUT /companies/:id
router.put("/companies/:id", requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { name, cnpj } = req.body as { name?: string; cnpj?: string };
    if (!name?.trim()) return res.status(400).json({ error: "Nome é obrigatório" });
    const [row] = await db
      .update(companies)
      .set({ name: name.trim(), cnpj: cnpj?.trim() || null, updatedAt: new Date() })
      .where(eq(companies.id, id))
      .returning();
    if (!row) return res.status(404).json({ error: "Empresa não encontrada" });
    res.json(row);
  } catch (err) {
    req.log.error(err, "PUT /companies/:id failed");
    res.status(500).json({ error: "Erro ao atualizar empresa" });
  }
});

// DELETE /companies/:id
router.delete("/companies/:id", requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    await db.delete(companies).where(eq(companies.id, id));
    res.status(204).send();
  } catch (err) {
    req.log.error(err, "DELETE /companies/:id failed");
    res.status(500).json({ error: "Erro ao remover empresa" });
  }
});

export default router;
