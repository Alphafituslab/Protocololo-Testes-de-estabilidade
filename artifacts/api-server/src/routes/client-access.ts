import { Router, type IRouter } from "express";
import { db, usersTable, clientProtocolAccessTable, clientCoaAccessTable, protocolsTable, coaDocumentsTable, loginLogTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth } from "../lib/session";
import { PERM, requirePermission } from "../lib/permissions";
import bcrypt from "bcryptjs";
import { sendClientAccessEmail, sendClientCoaAccessEmail } from "../lib/mailer.js";

const router: IRouter = Router();

const canManageUsers = [requireAuth, requirePermission(PERM.USER_MANAGE)];

// List protocols assigned to a client user
router.get("/clients/:userId/protocols", ...canManageUsers, async (req, res): Promise<void> => {
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
      allowedAttachmentIds: clientProtocolAccessTable.allowedAttachmentIds,
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
router.post("/clients/:userId/protocols", ...canManageUsers, async (req, res): Promise<void> => {
  const userId = parseInt(String(req.params["userId"] ?? ""));
  if (isNaN(userId)) { res.status(400).json({ error: "ID inválido." }); return; }

  const { protocolId, canViewCertificate, canViewReport, canPrint, canViewHistory, canViewAttachments, allowedAttachmentIds } = req.body as {
    protocolId?: number;
    canViewCertificate?: boolean;
    canViewReport?: boolean;
    canPrint?: boolean;
    canViewHistory?: boolean;
    canViewAttachments?: boolean;
    allowedAttachmentIds?: number[];
  };
  if (!protocolId) { res.status(400).json({ error: "protocolId é obrigatório." }); return; }

  // Verify user exists and is "cliente"
  const [user] = await db.select({
    id: usersTable.id, role: usersTable.role, email: usersTable.email,
    displayName: usersTable.displayName, username: usersTable.username,
    accessExpiresAt: usersTable.accessExpiresAt,
  }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!user) { res.status(404).json({ error: "Usuário não encontrado." }); return; }
  if (user.role !== "cliente") { res.status(400).json({ error: "Apenas usuários do tipo 'cliente' podem ter protocolos atribuídos." }); return; }

  // Verify protocol exists
  const [protocol] = await db.select({
    id: protocolsTable.id, productName: protocolsTable.productName, certNumber: protocolsTable.certNumber,
  }).from(protocolsTable).where(eq(protocolsTable.id, protocolId)).limit(1);
  if (!protocol) { res.status(404).json({ error: "Protocolo não encontrado." }); return; }

  // Generate a secure random password (12 chars: letters + digits)
  const charset = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const rawPassword = Array.from({ length: 12 }, () => charset[Math.floor(Math.random() * charset.length)]).join("");
  const passwordHash = await bcrypt.hash(rawPassword, 10);

  // Update client's password
  await db.update(usersTable).set({ passwordHash }).where(eq(usersTable.id, userId));

  const resolvedCert = canViewCertificate ?? true;
  const resolvedReport = canViewReport ?? true;

  try {
    const [row] = await db.insert(clientProtocolAccessTable).values({
      clientUserId: userId,
      protocolId,
      canViewCertificate: resolvedCert,
      canViewReport: resolvedReport,
      canPrint: canPrint ?? true,
      canViewHistory: canViewHistory ?? false,
      canViewAttachments: canViewAttachments ?? false,
      allowedAttachmentIds: Array.isArray(allowedAttachmentIds) ? allowedAttachmentIds : [],
    }).returning();

    // Send notification email if client has an email configured
    let emailResult: { ok: boolean; error?: string } = { ok: false, error: "Cliente sem e-mail cadastrado." };
    if (user.email) {
      const domains = process.env.REPLIT_DOMAINS?.split(",") ?? [];
      const appUrl = domains.length > 0 ? `https://${domains[0].trim()}/client-portal` : "https://seu-dominio.replit.app/client-portal";
      emailResult = await sendClientAccessEmail({
        toEmail: user.email,
        toName: user.displayName,
        username: user.username,
        password: rawPassword,
        productName: protocol.productName,
        certNumber: protocol.certNumber,
        accessExpiresAt: user.accessExpiresAt ?? null,
        appUrl,
        canViewCertificate: resolvedCert,
        canViewReport: resolvedReport,
      });
    }

    res.status(201).json({ ...row, emailSent: emailResult.ok, emailError: emailResult.error ?? null });
  } catch {
    res.status(409).json({ error: "Este protocolo já está atribuído a este cliente." });
  }
});

// Update permissions for a specific access entry
router.put("/clients/:userId/protocols/:accessId", ...canManageUsers, async (req, res): Promise<void> => {
  const userId = parseInt(String(req.params["userId"] ?? ""));
  const accessId = parseInt(String(req.params["accessId"] ?? ""));
  if (isNaN(userId) || isNaN(accessId)) { res.status(400).json({ error: "IDs inválidos." }); return; }

  const { canViewCertificate, canViewReport, canPrint, canViewHistory, canViewAttachments, allowedAttachmentIds } = req.body as {
    canViewCertificate?: boolean;
    canViewReport?: boolean;
    canPrint?: boolean;
    canViewHistory?: boolean;
    canViewAttachments?: boolean;
    allowedAttachmentIds?: number[];
  };

  const updates: Partial<{ canViewCertificate: boolean; canViewReport: boolean; canPrint: boolean; canViewHistory: boolean; canViewAttachments: boolean; allowedAttachmentIds: number[] }> = {};
  if (canViewCertificate !== undefined) updates.canViewCertificate = canViewCertificate;
  if (canViewReport !== undefined) updates.canViewReport = canViewReport;
  if (canPrint !== undefined) updates.canPrint = canPrint;
  if (canViewHistory !== undefined) updates.canViewHistory = canViewHistory;
  if (canViewAttachments !== undefined) updates.canViewAttachments = canViewAttachments;
  if (allowedAttachmentIds !== undefined && Array.isArray(allowedAttachmentIds)) updates.allowedAttachmentIds = allowedAttachmentIds;

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
router.delete("/clients/:userId/protocols/:accessId", ...canManageUsers, async (req, res): Promise<void> => {
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

// Login history for a specific client user
router.get("/clients/:userId/login-history", ...canManageUsers, async (req, res): Promise<void> => {
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

// Send / resend credentials email for a client user (generates new password)
router.post("/clients/:userId/send-email", ...canManageUsers, async (req, res): Promise<void> => {
  const userId = parseInt(String(req.params["userId"] ?? ""));
  if (isNaN(userId)) { res.status(400).json({ error: "ID inválido." }); return; }

  const [user] = await db.select({
    id: usersTable.id, role: usersTable.role, email: usersTable.email,
    displayName: usersTable.displayName, username: usersTable.username,
    accessExpiresAt: usersTable.accessExpiresAt,
  }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);

  if (!user) { res.status(404).json({ error: "Usuário não encontrado." }); return; }
  if (user.role !== "cliente") { res.status(400).json({ error: "Apenas clientes." }); return; }
  if (!user.email) { res.status(400).json({ error: "Cliente sem e-mail cadastrado." }); return; }

  // Generate new password and update hash
  const charset = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const rawPassword = Array.from({ length: 12 }, () => charset[Math.floor(Math.random() * charset.length)]).join("");
  const passwordHash = await bcrypt.hash(rawPassword, 10);
  await db.update(usersTable).set({ passwordHash }).where(eq(usersTable.id, userId));

  // Find most recent protocol access for context (optional)
  const [access] = await db
    .select({ productName: protocolsTable.productName, certNumber: protocolsTable.certNumber })
    .from(clientProtocolAccessTable)
    .innerJoin(protocolsTable, eq(clientProtocolAccessTable.protocolId, protocolsTable.id))
    .where(eq(clientProtocolAccessTable.clientUserId, userId))
    .orderBy(desc(clientProtocolAccessTable.createdAt))
    .limit(1);

  // Check if the client has any standalone CoA access
  const [coaAccess] = await db
    .select({ productName: coaDocumentsTable.productName })
    .from(clientCoaAccessTable)
    .innerJoin(coaDocumentsTable, eq(clientCoaAccessTable.coaId, coaDocumentsTable.id))
    .where(eq(clientCoaAccessTable.clientUserId, userId))
    .orderBy(desc(clientCoaAccessTable.createdAt))
    .limit(1);

  const domains = process.env.REPLIT_DOMAINS?.split(",") ?? [];
  const appUrl = domains.length > 0 ? `https://${domains[0].trim()}/client-portal` : "https://seu-dominio.replit.app/client-portal";

  const hasProtocolAccess = !!access;
  const hasCoaAccess = !!coaAccess;

  // productName: prefer protocol name, fall back to CoA name, then generic
  const productName = access?.productName ?? coaAccess?.productName ?? "Portal do Cliente";

  const emailResult = await sendClientAccessEmail({
    toEmail: user.email,
    toName: user.displayName,
    username: user.username,
    password: rawPassword,
    productName,
    certNumber: access?.certNumber ?? null,
    accessExpiresAt: user.accessExpiresAt ?? null,
    appUrl,
    // Only show each doc type if the client actually has access to it
    canViewCertificate: hasProtocolAccess,
    canViewReport: hasProtocolAccess,
    canViewCoa: hasCoaAccess,
  });

  res.json({ emailSent: emailResult.ok, emailError: emailResult.error ?? null });
});

// ── CoA Client Access ──────────────────────────────────────────────────────────

// List CoAs assigned to a client user
router.get("/clients/:userId/coa", ...canManageUsers, async (req, res): Promise<void> => {
  const userId = parseInt(String(req.params["userId"] ?? ""));
  if (isNaN(userId)) { res.status(400).json({ error: "ID inválido." }); return; }

  const rows = await db
    .select({
      id: clientCoaAccessTable.id,
      coaId: clientCoaAccessTable.coaId,
      canPrint: clientCoaAccessTable.canPrint,
      createdAt: clientCoaAccessTable.createdAt,
      productName: coaDocumentsTable.productName,
      lotNumber: coaDocumentsTable.lotNumber,
      status: coaDocumentsTable.status,
    })
    .from(clientCoaAccessTable)
    .innerJoin(coaDocumentsTable, eq(clientCoaAccessTable.coaId, coaDocumentsTable.id))
    .where(eq(clientCoaAccessTable.clientUserId, userId))
    .orderBy(desc(clientCoaAccessTable.createdAt));

  res.json(rows);
});

// Assign a CoA to a client user (creates user if not exists, sends email)
router.post("/clients/:userId/coa", ...canManageUsers, async (req, res): Promise<void> => {
  const userId = parseInt(String(req.params["userId"] ?? ""));
  if (isNaN(userId)) { res.status(400).json({ error: "ID inválido." }); return; }

  const { coaId, canPrint } = req.body as { coaId?: number; canPrint?: boolean };
  if (!coaId) { res.status(400).json({ error: "coaId é obrigatório." }); return; }

  const [user] = await db.select({
    id: usersTable.id, role: usersTable.role, email: usersTable.email,
    displayName: usersTable.displayName, username: usersTable.username,
    accessExpiresAt: usersTable.accessExpiresAt,
  }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!user) { res.status(404).json({ error: "Usuário não encontrado." }); return; }
  if (user.role !== "cliente") { res.status(400).json({ error: "Apenas clientes podem ter CoAs atribuídos." }); return; }

  const [coa] = await db.select({
    id: coaDocumentsTable.id, productName: coaDocumentsTable.productName, lotNumber: coaDocumentsTable.lotNumber,
  }).from(coaDocumentsTable).where(eq(coaDocumentsTable.id, coaId)).limit(1);
  if (!coa) { res.status(404).json({ error: "CoA não encontrado." }); return; }

  const charset = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const rawPassword = Array.from({ length: 12 }, () => charset[Math.floor(Math.random() * charset.length)]).join("");
  const passwordHash = await bcrypt.hash(rawPassword, 10);
  await db.update(usersTable).set({ passwordHash }).where(eq(usersTable.id, userId));

  try {
    const [row] = await db.insert(clientCoaAccessTable).values({
      clientUserId: userId,
      coaId,
      canPrint: canPrint ?? true,
    }).returning();

    let emailResult: { ok: boolean; error?: string } = { ok: false, error: "Cliente sem e-mail cadastrado." };
    if (user.email) {
      const domains = process.env.REPLIT_DOMAINS?.split(",") ?? [];
      const appUrl = domains.length > 0 ? `https://${domains[0].trim()}/client-portal` : "https://seu-dominio.replit.app/client-portal";
      emailResult = await sendClientCoaAccessEmail({
        toEmail: user.email,
        toName: user.displayName,
        username: user.username,
        password: rawPassword,
        productName: coa.productName,
        lotNumber: coa.lotNumber,
        accessExpiresAt: user.accessExpiresAt ?? null,
        appUrl,
      });
    }

    res.status(201).json({ ...row, emailSent: emailResult.ok, emailError: emailResult.error ?? null });
  } catch {
    res.status(409).json({ error: "Este CoA já está atribuído a este cliente." });
  }
});

// Revoke a CoA from a client user
router.delete("/clients/:userId/coa/:accessId", ...canManageUsers, async (req, res): Promise<void> => {
  const userId = parseInt(String(req.params["userId"] ?? ""));
  const accessId = parseInt(String(req.params["accessId"] ?? ""));
  if (isNaN(userId) || isNaN(accessId)) { res.status(400).json({ error: "IDs inválidos." }); return; }

  const [deleted] = await db
    .delete(clientCoaAccessTable)
    .where(and(eq(clientCoaAccessTable.id, accessId), eq(clientCoaAccessTable.clientUserId, userId)))
    .returning({ id: clientCoaAccessTable.id });

  if (!deleted) { res.status(404).json({ error: "Acesso não encontrado." }); return; }
  res.json({ ok: true });
});

// Get client users who have access to a specific CoA (for the CoA detail page)
router.get("/coa/:coaId/clients", requireAuth, async (req, res): Promise<void> => {
  const coaId = parseInt(String(req.params["coaId"] ?? ""));
  if (isNaN(coaId)) { res.status(400).json({ error: "ID inválido." }); return; }

  const rows = await db
    .select({
      id: clientCoaAccessTable.id,
      clientUserId: clientCoaAccessTable.clientUserId,
      canPrint: clientCoaAccessTable.canPrint,
      createdAt: clientCoaAccessTable.createdAt,
      displayName: usersTable.displayName,
      username: usersTable.username,
      email: usersTable.email,
    })
    .from(clientCoaAccessTable)
    .innerJoin(usersTable, eq(clientCoaAccessTable.clientUserId, usersTable.id))
    .where(eq(clientCoaAccessTable.coaId, coaId))
    .orderBy(desc(clientCoaAccessTable.createdAt));

  res.json(rows);
});

// My CoAs — for "cliente" role
router.get("/my/coa", requireAuth, async (req, res): Promise<void> => {
  const user = req.authUser!;
  if (user.role !== "cliente") { res.status(403).json({ error: "Apenas clientes podem acessar esta rota." }); return; }

  const rows = await db
    .select({
      id: clientCoaAccessTable.id,
      coaId: clientCoaAccessTable.coaId,
      canPrint: clientCoaAccessTable.canPrint,
      createdAt: clientCoaAccessTable.createdAt,
      productName: coaDocumentsTable.productName,
      lotNumber: coaDocumentsTable.lotNumber,
      manufacturingDate: coaDocumentsTable.manufacturingDate,
      expiryDate: coaDocumentsTable.expiryDate,
      status: coaDocumentsTable.status,
    })
    .from(clientCoaAccessTable)
    .innerJoin(coaDocumentsTable, eq(clientCoaAccessTable.coaId, coaDocumentsTable.id))
    .where(eq(clientCoaAccessTable.clientUserId, user.id))
    .orderBy(desc(clientCoaAccessTable.createdAt));

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
      allowedAttachmentIds: clientProtocolAccessTable.allowedAttachmentIds,
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
