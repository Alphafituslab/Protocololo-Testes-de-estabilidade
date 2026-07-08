import { Router, type IRouter } from "express";
import { db, anvisaNumberBank } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { requireAuth } from "../lib/session";

const router: IRouter = Router();

// GET /anvisa-number-bank
router.get("/anvisa-number-bank", requireAuth, async (req, res) => {
  try {
    const rows = await db.select().from(anvisaNumberBank).orderBy(desc(anvisaNumberBank.createdAt));
    res.json(rows);
  } catch (err) {
    req.log.error(err, "GET /anvisa-number-bank failed");
    res.status(500).json({ error: "Erro ao listar banco de números" });
  }
});

// POST /anvisa-number-bank
router.post("/anvisa-number-bank", requireAuth, async (req, res) => {
  try {
    const { label, expedienteNumber, processNumber, transactionNumber, protocolNumber } =
      req.body as { label?: string; expedienteNumber?: string; processNumber?: string; transactionNumber?: string; protocolNumber?: string };
    const [row] = await db
      .insert(anvisaNumberBank)
      .values({
        label: label?.trim() || null,
        expedienteNumber: expedienteNumber?.trim() || null,
        processNumber: processNumber?.trim() || null,
        transactionNumber: transactionNumber?.trim() || null,
        protocolNumber: protocolNumber?.trim() || null,
      })
      .returning();
    res.status(201).json(row);
  } catch (err) {
    req.log.error(err, "POST /anvisa-number-bank failed");
    res.status(500).json({ error: "Erro ao criar registro" });
  }
});

// PUT /anvisa-number-bank/:id
router.put("/anvisa-number-bank/:id", requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { label, expedienteNumber, processNumber, transactionNumber, protocolNumber } =
      req.body as { label?: string; expedienteNumber?: string; processNumber?: string; transactionNumber?: string; protocolNumber?: string };
    const [row] = await db
      .update(anvisaNumberBank)
      .set({
        label: label?.trim() || null,
        expedienteNumber: expedienteNumber?.trim() || null,
        processNumber: processNumber?.trim() || null,
        transactionNumber: transactionNumber?.trim() || null,
        protocolNumber: protocolNumber?.trim() || null,
        updatedAt: new Date(),
      })
      .where(eq(anvisaNumberBank.id, id))
      .returning();
    if (!row) return res.status(404).json({ error: "Registro não encontrado" });
    res.json(row);
  } catch (err) {
    req.log.error(err, "PUT /anvisa-number-bank/:id failed");
    res.status(500).json({ error: "Erro ao atualizar registro" });
  }
});

// DELETE /anvisa-number-bank/:id
router.delete("/anvisa-number-bank/:id", requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    await db.delete(anvisaNumberBank).where(eq(anvisaNumberBank.id, id));
    res.status(204).send();
  } catch (err) {
    req.log.error(err, "DELETE /anvisa-number-bank/:id failed");
    res.status(500).json({ error: "Erro ao remover registro" });
  }
});

export default router;
