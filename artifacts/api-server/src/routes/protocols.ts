import { Router, type IRouter } from "express";
import { eq, desc, count, and, inArray, ne } from "drizzle-orm";
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
import { logAudit } from "../lib/audit";
import { requireAuth } from "../lib/session";
import { notifyProtocolDeleted } from "../lib/notifications";

const router: IRouter = Router();

router.get("/protocols", async (req, res): Promise<void> => {
  const parsed = ListProtocolsQueryParams.safeParse(req.query);
  const statusFilter = parsed.success ? parsed.data.status : undefined;
  const nonConformesFilter = parsed.success ? parsed.data.nonConformes : undefined;

  if (nonConformesFilter === true) {
    // Retorna apenas protocolos que têm ao menos um resultado "nao_conforme"
    const rows = await db
      .select({ protocolId: analysisResultsTable.protocolId })
      .from(analysisResultsTable)
      .where(eq(analysisResultsTable.status, "nao_conforme"));
    const ids = [...new Set(rows.map((r) => r.protocolId))];
    if (ids.length === 0) { res.json([]); return; }
    const protocols = await db
      .select()
      .from(protocolsTable)
      .where(inArray(protocolsTable.id, ids))
      .orderBy(desc(protocolsTable.updatedAt));
    res.json(protocols);
    return;
  }

  let protocols;
  if (statusFilter) {
    protocols = await db.select().from(protocolsTable).where(eq(protocolsTable.status, statusFilter)).orderBy(desc(protocolsTable.updatedAt));
  } else {
    protocols = await db.select().from(protocolsTable).orderBy(desc(protocolsTable.updatedAt));
  }
  res.json(protocols);
});

router.get("/protocols/stats", async (req, res): Promise<void> => {
  const allProtocols = await db.select().from(protocolsTable);
  const nonConformities = await db.select({ cnt: count() }).from(analysisResultsTable).where(eq(analysisResultsTable.status, "nao_conforme"));
  const recent = allProtocols.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()).slice(0, 10);
  res.json({
    total: allProtocols.length,
    rascunho: allProtocols.filter((p) => p.status === "rascunho").length,
    emAndamento: allProtocols.filter((p) => p.status === "em_andamento").length,
    concluido: allProtocols.filter((p) => p.status === "concluido").length,
    aprovado: allProtocols.filter((p) => p.status === "aprovado").length,
    aprovadoComRessalva: allProtocols.filter((p) => p.status === "aprovado_com_ressalva").length,
    reprovado: allProtocols.filter((p) => p.status === "reprovado").length,
    totalNonConformities: nonConformities[0]?.cnt ?? 0,
    recentProtocols: recent,
  });
});

router.post("/protocols", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateProtocolBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  // Prevent duplicate certificate numbers
  const cn = parsed.data.certNumber?.trim();
  if (cn) {
    const [dup] = await db.select({ id: protocolsTable.id }).from(protocolsTable).where(eq(protocolsTable.certNumber, cn)).limit(1);
    if (dup) {
      res.status(409).json({ error: `Número de certificado "${cn}" já está em uso no protocolo #${dup.id}. Cada protocolo deve ter um número único.`, field: "certNumber" });
      return;
    }
  }
  const [protocol] = await db.insert(protocolsTable).values({ ...parsed.data, status: "em_andamento" }).returning();
  await logAudit(req, "CRIAR_PROTOCOLO", "protocolo", `Protocolo "${protocol.productName}" criado`, { entityId: protocol.id, protocolId: protocol.id });
  res.status(201).json(protocol);
});

router.get("/protocols/:id", async (req, res): Promise<void> => {
  const params = GetProtocolParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [protocol] = await db.select().from(protocolsTable).where(eq(protocolsTable.id, params.data.id));
  if (!protocol) { res.status(404).json({ error: "Protocol not found" }); return; }
  const lots = await db.select().from(lotsTable).where(eq(lotsTable.protocolId, params.data.id)).orderBy(lotsTable.createdAt);
  const results = await db.select().from(analysisResultsTable).where(eq(analysisResultsTable.protocolId, params.data.id)).orderBy(analysisResultsTable.period);
  const lotsMap = Object.fromEntries(lots.map((l) => [l.id, l.lotNumber]));
  const resultsWithLotNumber = results.map((r) => ({ ...r, lotNumber: lotsMap[r.lotId] ?? "" }));
  res.json({ ...protocol, lots, results: resultsWithLotNumber });
});

router.put("/protocols/:id", requireAuth, async (req, res): Promise<void> => {
  const params = UpdateProtocolParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = UpdateProtocolBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  // Prevent duplicate certificate numbers (excluding the current protocol itself)
  const cn = (parsed.data as Record<string, unknown>).certNumber as string | undefined;
  if (cn && cn.trim()) {
    const [dup] = await db.select({ id: protocolsTable.id }).from(protocolsTable)
      .where(and(eq(protocolsTable.certNumber, cn.trim()), ne(protocolsTable.id, params.data.id)))
      .limit(1);
    if (dup) {
      res.status(409).json({ error: `Número de certificado "${cn.trim()}" já está em uso no protocolo #${dup.id}. Cada protocolo deve ter um número único.`, field: "certNumber" });
      return;
    }
  }
  const [protocol] = await db.update(protocolsTable).set(parsed.data).where(eq(protocolsTable.id, params.data.id)).returning();
  if (!protocol) { res.status(404).json({ error: "Protocol not found" }); return; }
  await logAudit(req, "ATUALIZAR_PROTOCOLO", "protocolo", `Protocolo "${protocol.productName}" atualizado`, { entityId: protocol.id, protocolId: protocol.id });
  res.json(protocol);
});

router.delete("/protocols/:id", requireAuth, async (req, res): Promise<void> => {
  const params = DeleteProtocolParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [deleted] = await db.delete(protocolsTable).where(eq(protocolsTable.id, params.data.id)).returning();
  if (!deleted) { res.status(404).json({ error: "Protocol not found" }); return; }
  await logAudit(req, "EXCLUIR_PROTOCOLO", "protocolo", `Protocolo "${deleted.productName}" excluído`, { entityId: deleted.id, protocolId: deleted.id });
  // Notificação WhatsApp — não bloqueia a resposta; falhas são silenciosas para o cliente
  notifyProtocolDeleted({
    id: deleted.id,
    productName: deleted.productName,
    certNumber: deleted.certNumber,
    companyName: deleted.companyName,
    cnpj: deleted.cnpj,
    status: deleted.status,
    finalStatus: deleted.finalStatus,
    conclusion: deleted.conclusion,
    validityMonths: deleted.validityMonths,
    issueDate: deleted.issueDate,
    deletedByName: req.authUser?.displayName ?? "Desconhecido",
    deletedByUsername: req.authUser?.username ?? "desconhecido",
    deletedAt: new Date(),
  }).catch(() => { /* já logado internamente */ });
  res.sendStatus(204);
});

router.post("/protocols/:id/finalize", requireAuth, async (req, res): Promise<void> => {
  const params = FinalizeProtocolParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = FinalizeProtocolBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const fs = parsed.data.finalStatus;

  // Medida de segurança: se tentativa de aprovação contém não conformes, força reprovado.
  // Usa select direto (não count) para evitar ambiguidade de tipo BigInt/string do driver pg.
  let forcedReprovado = false;
  if (fs === "aprovado" || fs === "aprovado_com_ressalva") {
    const nonConformes = await db
      .select({ id: analysisResultsTable.id })
      .from(analysisResultsTable)
      .where(and(
        eq(analysisResultsTable.protocolId, params.data.id),
        eq(analysisResultsTable.status, "nao_conforme"),
      ))
      .limit(1);
    req.log.info({ protocolId: params.data.id, requestedStatus: fs, ncCount: nonConformes.length }, "finalize: verificacao de nao_conforme");
    if (nonConformes.length > 0) {
      forcedReprovado = true;
    }
  }

  let updateData: Record<string, unknown>;
  let statusLabel: string;
  if (fs === "em_andamento") {
    // Busca o protocolo atual para preservar progressPercent caso não seja enviado
    const [existing] = await db.select({ progressPercent: protocolsTable.progressPercent })
      .from(protocolsTable).where(eq(protocolsTable.id, params.data.id));
    const newProgress = parsed.data.progressPercent;
    updateData = {
      status: "em_andamento",
      finalStatus: null,
      // Só sobrescreve se o operador enviou um valor; caso contrário mantém o existente
      progressPercent: newProgress !== undefined && newProgress !== null
        ? newProgress
        : (existing?.progressPercent ?? null),
    };
    statusLabel = "EM ANDAMENTO";
  } else if (forcedReprovado) {
    // Segurança: aprovação ignorada pois há não conformes — salva como reprovado
    updateData = {
      status: "reprovado",
      finalStatus: "reprovado",
      conclusion: "REPROVADO AUTOMATICAMENTE: protocolo contém parâmetros não conformes nas análises. " + (parsed.data.conclusion ?? ""),
      validityMonths: null,
      issueDate: parsed.data.issueDate ?? new Date().toISOString().split("T")[0],
      ressalva: null,
    };
    statusLabel = "REPROVADO AUTOMATICAMENTE (havia não conformes)";
  } else {
    const workflowStatus = fs === "aprovado" ? "aprovado" : fs === "aprovado_com_ressalva" ? "aprovado_com_ressalva" : "reprovado";
    updateData = {
      status: workflowStatus,
      finalStatus: fs,
      conclusion: parsed.data.conclusion ?? null,
      validityMonths: parsed.data.validityMonths ?? null,
      issueDate: parsed.data.issueDate ?? new Date().toISOString().split("T")[0],
      ressalva: fs === "aprovado_com_ressalva" ? (parsed.data.ressalva ?? null) : null,
    };
    statusLabel = fs === "aprovado" ? "APROVADO" : fs === "aprovado_com_ressalva" ? "APROVADO COM RESSALVA" : "REPROVADO";
  }
  const [protocol] = await db.update(protocolsTable)
    .set(updateData)
    .where(eq(protocolsTable.id, params.data.id)).returning();
  if (!protocol) { res.status(404).json({ error: "Protocol not found" }); return; }
  await logAudit(req, "FINALIZAR_PROTOCOLO", "protocolo", `Protocolo "${protocol.productName}" marcado como ${statusLabel}`, { entityId: protocol.id, protocolId: protocol.id });
  res.json({ ...protocol, _autoReprovado: forcedReprovado });
});

export default router;
