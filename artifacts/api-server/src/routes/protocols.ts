import { Router, type IRouter } from "express";
import { eq, desc, count, and } from "drizzle-orm";
import { db, protocolsTable, lotsTable, analysisResultsTable } from "@workspace/db";
import {
  CreateProtocolBody,
  UpdateProtocolBody,
  GetProtocolParams,
  UpdateProtocolParams,
  DeleteProtocolParams,
  ListProtocolsQueryParams,
  FinalizeProtocolParams,
  FinalizeProtocolBody,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/protocols", async (req, res): Promise<void> => {
  const parsed = ListProtocolsQueryParams.safeParse(req.query);
  const statusFilter = parsed.success ? parsed.data.status : undefined;

  const query = db.select().from(protocolsTable).orderBy(desc(protocolsTable.updatedAt));
  let protocols;
  if (statusFilter) {
    protocols = await db
      .select()
      .from(protocolsTable)
      .where(eq(protocolsTable.status, statusFilter))
      .orderBy(desc(protocolsTable.updatedAt));
  } else {
    protocols = await query;
  }
  res.json(protocols);
});

router.get("/protocols/stats", async (req, res): Promise<void> => {
  const allProtocols = await db.select().from(protocolsTable);
  const nonConformities = await db
    .select({ cnt: count() })
    .from(analysisResultsTable)
    .where(eq(analysisResultsTable.status, "nao_conforme"));

  const recent = allProtocols
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 10);

  res.json({
    total: allProtocols.length,
    rascunho: allProtocols.filter((p) => p.status === "rascunho").length,
    emAndamento: allProtocols.filter((p) => p.status === "em_andamento").length,
    concluido: allProtocols.filter((p) => p.status === "concluido").length,
    aprovado: allProtocols.filter((p) => p.status === "aprovado").length,
    reprovado: allProtocols.filter((p) => p.status === "reprovado").length,
    totalNonConformities: nonConformities[0]?.cnt ?? 0,
    recentProtocols: recent,
  });
});

router.post("/protocols", async (req, res): Promise<void> => {
  const parsed = CreateProtocolBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [protocol] = await db
    .insert(protocolsTable)
    .values({ ...parsed.data, status: "rascunho" })
    .returning();
  res.status(201).json(protocol);
});

router.get("/protocols/:id", async (req, res): Promise<void> => {
  const params = GetProtocolParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [protocol] = await db
    .select()
    .from(protocolsTable)
    .where(eq(protocolsTable.id, params.data.id));
  if (!protocol) {
    res.status(404).json({ error: "Protocol not found" });
    return;
  }
  const lots = await db
    .select()
    .from(lotsTable)
    .where(eq(lotsTable.protocolId, params.data.id))
    .orderBy(lotsTable.createdAt);
  const results = await db
    .select()
    .from(analysisResultsTable)
    .where(eq(analysisResultsTable.protocolId, params.data.id))
    .orderBy(analysisResultsTable.period);

  const lotsMap = Object.fromEntries(lots.map((l) => [l.id, l.lotNumber]));
  const resultsWithLotNumber = results.map((r) => ({
    ...r,
    lotNumber: lotsMap[r.lotId] ?? "",
  }));

  res.json({ ...protocol, lots, results: resultsWithLotNumber });
});

router.put("/protocols/:id", async (req, res): Promise<void> => {
  const params = UpdateProtocolParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateProtocolBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [protocol] = await db
    .update(protocolsTable)
    .set(parsed.data)
    .where(eq(protocolsTable.id, params.data.id))
    .returning();
  if (!protocol) {
    res.status(404).json({ error: "Protocol not found" });
    return;
  }
  res.json(protocol);
});

router.delete("/protocols/:id", async (req, res): Promise<void> => {
  const params = DeleteProtocolParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [deleted] = await db
    .delete(protocolsTable)
    .where(eq(protocolsTable.id, params.data.id))
    .returning();
  if (!deleted) {
    res.status(404).json({ error: "Protocol not found" });
    return;
  }
  res.sendStatus(204);
});

router.post("/protocols/:id/finalize", async (req, res): Promise<void> => {
  const params = FinalizeProtocolParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = FinalizeProtocolBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [protocol] = await db
    .update(protocolsTable)
    .set({
      status: parsed.data.finalStatus === "aprovado" ? "aprovado" : "reprovado",
      finalStatus: parsed.data.finalStatus,
      conclusion: parsed.data.conclusion,
      validityMonths: parsed.data.validityMonths ?? null,
      issueDate: parsed.data.issueDate ?? new Date().toISOString().split("T")[0],
    })
    .where(eq(protocolsTable.id, params.data.id))
    .returning();
  if (!protocol) {
    res.status(404).json({ error: "Protocol not found" });
    return;
  }
  res.json(protocol);
});

export default router;
