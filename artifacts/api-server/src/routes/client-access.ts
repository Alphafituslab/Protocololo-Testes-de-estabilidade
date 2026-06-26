import { Router, type IRouter } from "express";
import { db, usersTable, clientProtocolAccessTable, protocolsTable, loginLogTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../lib/session";

const router: IRouter = Router();

// List protocols assigned to a client user
router.get("/clients/:userId/protocols", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const userId = parseInt(String(req.params["userId"] ?? ""));
  if (isNaN(userId)) { res.status(400).json({ error: "ID inválido." }); return; }

  const rows = await db
    .select({
      id: clientProtocolAccessTable.id,
      protocolId: clientProtocolAccessTable.protocolId,
      createdAt: clientProtocolAccessTable.createdAt,
      canViewCertificate: clientProtocolAccessTable.canViewCertificate,
      canViewReport: clientProtocolAccessTable.canViewReport,
      canPrint: clientProtocolAccessTable.canPrint,
      canViewHistory: clientProtocolAccessTable.canViewHistory,
      canViewAttachments: clientProtocolAccessTable.canViewAttachments,
      certNumber: protocolsTable.certNumber,
      productName: protocolsTable.productName,
      status: protocolsTable.status,
    })
    .from(clientProtocolAccessTable)
    .innerJoin(protocolsTable, eq(clientProtocolAccessTable.protocolId, protocolsTable.id))
    .where(eq(clientProtocolAccessTable.clientUserId, userId))
    .orderBy(desc(clientProtocolAccessTable.createdAt));

  res.json(rows);
});

// Assign a protocol to a client user
router.post("/clients/:userId/protocols", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const userId = parseInt(String(req.params["userId"] ?? ""));
  if (isNaN(userId)) { res.status(400).json({ error: "ID inválido." }); return; }

  const { protocolId, canViewCertificate, canViewReport, canPrint, canViewHistory, canViewAttachments } = req.body as {
    protocolId?: number;
    canViewCertificate?: boolean;
    canViewReport?: boolean;
    canPrint?: boolean;
    canViewHistory?: boolean;
    canViewAttachments?: boolean;
  };
  if (!protocolId) { res.status(400).json({ error: "protocolId é obrigatório." }); return; }

  // Verify user exists and is "cliente"
  const [user] = await db.select({ id: usersTable.id, role: usersTable.role }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!user) { res.status(404).json({ error: "Usuário não encontrado." }); return; }
  if (user.role !== "cliente") { res.status(400).json({ error: "Apenas usuários do tipo 'cliente' podem ter protocolos atribuídos." }); return; }

  // Verify protocol exists
  const [protocol] = await db.select({ id: protocolsTable.id }).from(protocolsTable).where(eq(protocolsTable.id, protocolId)).limit(1);
  if (!protocol) { res.status(404).json({ error: "Protocolo não encontrado." }); return; }

  try {
    const [row] = await db.insert(clientProtocolAccessTable).values({
      clientUserId: userId,
      protocolId,
      canViewCertificate: canViewCertificate ?? true,
      canViewReport: canViewReport ?? true,
      canPrint: canPrint ?? true,
      canViewHistory: canViewHistory ?? false,
      canViewAttachments: canViewAttachments ?? false,
    }).returning();
    res.status(201).json(row);
  } catch {
    res.status(409).json({ error: "Este protocolo já está atribuído a este cliente." });
  }
});

// Update permissions for a specific access entry
router.put("/clients/:userId/protocols/:accessId", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const userId = parseInt(String(req.params["userId"] ?? ""));
  const accessId = parseInt(String(req.params["accessId"] ?? ""));
  if (isNaN(userId) || isNaN(accessId)) { res.status(400).json({ error: "IDs inválidos." }); return; }

  const { canViewCertificate, canViewReport, canPrint, canViewHistory, canViewAttachments } = req.body as {
    canViewCertificate?: boolean;
    canViewReport?: boolean;
    canPrint?: boolean;
    canViewHistory?: boolean;
    canViewAttachments?: boolean;
  };

  const updates: Partial<{ canViewCertificate: boolean; canViewReport: boolean; canPrint: boolean; canViewHistory: boolean; canViewAttachments: boolean }> = {};
  if (canViewCertificate !== undefined) updates.canViewCertificate = canViewCertificate;
  if (canViewReport !== undefined) updates.canViewReport = canViewReport;
  if (canPrint !== undefined) updates.canPrint = canPrint;
  if (canViewHistory !== undefined) updates.canViewHistory = canViewHistory;
  if (canViewAttachments !== undefined) updates.canViewAttachments = canViewAttachments;

  if (Object.keys(updates).length === 0) { res.status(400).json({ error: "Nenhum campo para atualizar." }); return; }

  const [updated] = await db
    .update(clientProtocolAccessTable)
    .set(updates)
    .where(and(eq(clientProtocolAccessTable.id, accessId), eq(clientProtocolAccessTable.clientUserId, userId)))
    .returning();

  if (!updated) { res.status(404).json({ error: "Acesso não encontrado." }); return; }
  res.json(updated);
});

// Remove a protocol from a client user
router.delete("/clients/:userId/protocols/:accessId", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const userId = parseInt(String(req.params["userId"] ?? ""));
  const accessId = parseInt(String(req.params["accessId"] ?? ""));
  if (isNaN(userId) || isNaN(accessId)) { res.status(400).json({ error: "IDs inválidos." }); return; }

  const [deleted] = await db
    .delete(clientProtocolAccessTable)
    .where(and(eq(clientProtocolAccessTable.id, accessId), eq(clientProtocolAccessTable.clientUserId, userId)))
    .returning({ id: clientProtocolAccessTable.id });

  if (!deleted) { res.status(404).json({ error: "Acesso não encontrado." }); return; }
  res.json({ ok: true });
});

// Login history for a specific client user (admin only)
router.get("/clients/:userId/login-history", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const userId = parseInt(String(req.params["userId"] ?? ""));
  if (isNaN(userId)) { res.status(400).json({ error: "ID inválido." }); return; }

  const rows = await db
    .select()
    .from(loginLogTable)
    .where(eq(loginLogTable.userId, userId))
    .orderBy(desc(loginLogTable.loggedAt))
    .limit(100);

  res.json(rows);
});

// My protocols — for "cliente" role to fetch their own assigned protocols
router.get("/my/protocols", requireAuth, async (req, res): Promise<void> => {
  const user = req.authUser!;
  if (user.role !== "cliente") { res.status(403).json({ error: "Apenas clientes podem acessar esta rota." }); return; }

  const rows = await db
    .select({
      id: clientProtocolAccessTable.id,
      protocolId: clientProtocolAccessTable.protocolId,
      createdAt: clientProtocolAccessTable.createdAt,
      canViewCertificate: clientProtocolAccessTable.canViewCertificate,
      canViewReport: clientProtocolAccessTable.canViewReport,
      canPrint: clientProtocolAccessTable.canPrint,
      canViewHistory: clientProtocolAccessTable.canViewHistory,
      canViewAttachments: clientProtocolAccessTable.canViewAttachments,
      certNumber: protocolsTable.certNumber,
      productName: protocolsTable.productName,
      status: protocolsTable.status,
      company: protocolsTable.companyName,
      studyStart: protocolsTable.studyStartDate,
      studyEnd: protocolsTable.studyEndDate,
      conclusion: protocolsTable.conclusion,
    })
    .from(clientProtocolAccessTable)
    .innerJoin(protocolsTable, eq(clientProtocolAccessTable.protocolId, protocolsTable.id))
    .where(eq(clientProtocolAccessTable.clientUserId, user.id))
    .orderBy(desc(clientProtocolAccessTable.createdAt));

  res.json(rows);
});

export default router;
