import { Router } from "express";
import { db } from "@workspace/db";
import { coaDocumentsTable, coaResultsTable, protocolsTable, lotsTable, analysisResultsTable } from "@workspace/db";
import { requireAuth } from "../lib/session";
import { eq, desc, asc, and, isNull } from "drizzle-orm";
import { z } from "zod/v4";

const router = Router();

const docBodySchema = z.object({
  productName: z.string().optional(),
  lotNumber: z.string().optional(),
  manufacturingDate: z.string().optional(),
  expiryDate: z.string().optional(),
  company: z.string().optional(),
  responsibleTech: z.string().optional(),
  responsibleTechCrq: z.string().optional(),
  cnpj: z.string().optional(),
  ie: z.string().optional(),
  address: z.string().optional(),
  cep: z.string().optional(),
  notes: z.string().nullish(),
  status: z.string().optional(),
  linkedProtocolId: z.number().int().nullish(),
  linkedLotId: z.number().int().nullish(),
});

const resultBodySchema = z.object({
  category: z.string().optional().default(""),
  parameter: z.string().optional().default(""),
  result: z.string().optional().default(""),
  unit: z.string().optional().default(""),
  spec: z.string().optional().default(""),
  method: z.string().optional().default(""),
  status: z.string().optional().default("pendente"),
  sortOrder: z.number().int().optional().default(0),
});

router.get("/coa", requireAuth, async (req, res) => {
  try {
    const docs = await db.select().from(coaDocumentsTable).orderBy(desc(coaDocumentsTable.createdAt));
    res.json(docs);
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Erro ao listar CoAs" });
  }
});

router.post("/coa", requireAuth, async (req, res) => {
  try {
    const parsed = docBodySchema.safeParse(req.body);
    if (!parsed.success) return void res.status(400).json({ error: String(parsed.error) });
    const [doc] = await db.insert(coaDocumentsTable).values({
      productName: parsed.data.productName ?? "",
      lotNumber: parsed.data.lotNumber ?? "",
      manufacturingDate: parsed.data.manufacturingDate ?? "",
      expiryDate: parsed.data.expiryDate ?? "",
      company: parsed.data.company ?? "",
      responsibleTech: parsed.data.responsibleTech ?? "",
      responsibleTechCrq: parsed.data.responsibleTechCrq ?? "",
      cnpj: parsed.data.cnpj ?? "",
      notes: parsed.data.notes ?? null,
      status: parsed.data.status ?? "rascunho",
      linkedProtocolId: parsed.data.linkedProtocolId ?? null,
      linkedLotId: parsed.data.linkedLotId ?? null,
    }).returning();
    res.status(201).json(doc);
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Erro ao criar CoA" });
  }
});

router.get("/coa/:id", requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return void res.status(400).json({ error: "ID inválido" });
    const [doc] = await db.select().from(coaDocumentsTable).where(eq(coaDocumentsTable.id, id));
    if (!doc) return void res.status(404).json({ error: "CoA não encontrado" });
    const results = await db.select().from(coaResultsTable)
      .where(eq(coaResultsTable.coaId, id))
      .orderBy(asc(coaResultsTable.sortOrder), asc(coaResultsTable.id));

    let linkedProtocol: { id: number; productName: string } | null = null;
    let linkedLots: { id: number; lotNumber: string; manufacturingDate: string; expiryDate: string | null }[] = [];
    let protocolResults: { id: number; parameter: string; category: string; result: string; status: string; period: number }[] = [];

    if (doc.linkedProtocolId) {
      const [proto] = await db.select({ id: protocolsTable.id, productName: protocolsTable.productName })
        .from(protocolsTable).where(eq(protocolsTable.id, doc.linkedProtocolId));
      linkedProtocol = proto ?? null;

      linkedLots = await db.select({
        id: lotsTable.id,
        lotNumber: lotsTable.lotNumber,
        manufacturingDate: lotsTable.manufacturingDate,
        expiryDate: lotsTable.expiryDate,
      }).from(lotsTable).where(
        and(eq(lotsTable.protocolId, doc.linkedProtocolId), isNull(lotsTable.deletedAt))
      );

      if (doc.linkedLotId) {
        protocolResults = await db.select({
          id: analysisResultsTable.id,
          parameter: analysisResultsTable.parameter,
          category: analysisResultsTable.category,
          result: analysisResultsTable.result,
          status: analysisResultsTable.status,
          period: analysisResultsTable.period,
        }).from(analysisResultsTable).where(
          and(eq(analysisResultsTable.lotId, doc.linkedLotId), isNull(analysisResultsTable.deletedAt))
        ).orderBy(desc(analysisResultsTable.period), asc(analysisResultsTable.parameter));
      }
    }

    res.json({ ...doc, results, linkedProtocol, linkedLots, protocolResults });
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Erro ao buscar CoA" });
  }
});

router.put("/coa/:id", requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return void res.status(400).json({ error: "ID inválido" });
    const parsed = docBodySchema.safeParse(req.body);
    if (!parsed.success) return void res.status(400).json({ error: String(parsed.error) });
    const [updated] = await db.update(coaDocumentsTable)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(coaDocumentsTable.id, id))
      .returning();
    if (!updated) return void res.status(404).json({ error: "CoA não encontrado" });
    res.json(updated);
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Erro ao atualizar CoA" });
  }
});

router.delete("/coa/:id", requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return void res.status(400).json({ error: "ID inválido" });
    await db.delete(coaDocumentsTable).where(eq(coaDocumentsTable.id, id));
    res.json({ ok: true });
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Erro ao deletar CoA" });
  }
});

router.post("/coa/:id/results", requireAuth, async (req, res) => {
  try {
    const coaId = Number(req.params.id);
    if (!coaId) return void res.status(400).json({ error: "ID inválido" });
    const parsed = resultBodySchema.safeParse(req.body);
    if (!parsed.success) return void res.status(400).json({ error: String(parsed.error) });
    const [r] = await db.insert(coaResultsTable).values({ coaId, ...parsed.data }).returning();
    res.status(201).json(r);
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Erro ao adicionar resultado" });
  }
});

// Schema sem defaults para atualizações parciais (evita sobrescrever campos com "")
const resultUpdateSchema = z.object({
  category: z.string().optional(),
  parameter: z.string().optional(),
  result: z.string().optional(),
  unit: z.string().optional(),
  spec: z.string().optional(),
  method: z.string().optional(),
  status: z.string().optional(),
  sortOrder: z.number().int().optional(),
});

router.put("/coa/:id/results/:resultId", requireAuth, async (req, res) => {
  try {
    const resultId = Number(req.params.resultId);
    if (!resultId) return void res.status(400).json({ error: "ID inválido" });
    const parsed = resultUpdateSchema.safeParse(req.body);
    if (!parsed.success) return void res.status(400).json({ error: String(parsed.error) });
    // Apenas campos explicitamente enviados no body
    const updateData = Object.fromEntries(
      Object.entries(parsed.data).filter(([, v]) => v !== undefined)
    );
    if (Object.keys(updateData).length === 0) return void res.status(400).json({ error: "Nenhum campo para atualizar" });
    const [r] = await db.update(coaResultsTable).set(updateData).where(eq(coaResultsTable.id, resultId)).returning();
    if (!r) return void res.status(404).json({ error: "Resultado não encontrado" });
    res.json(r);
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Erro ao atualizar resultado" });
  }
});

router.delete("/coa/:id/results/:resultId", requireAuth, async (req, res) => {
  try {
    const resultId = Number(req.params.resultId);
    if (!resultId) return void res.status(400).json({ error: "ID inválido" });
    await db.delete(coaResultsTable).where(eq(coaResultsTable.id, resultId));
    res.json({ ok: true });
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Erro ao deletar resultado" });
  }
});

export default router;
