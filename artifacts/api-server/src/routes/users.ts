import { Router, type IRouter } from "express";
import { db, usersTable, sessionsTable } from "@workspace/db";
import { eq, gt, sql } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { requireAuth, requireAdmin } from "../lib/session";
import { defaultPermissionsForRole } from "../lib/permissions";

const router: IRouter = Router();

const VALID_ROLES = ["admin", "analyst", "tecnico_lab", "controle_qualidade", "responsavel_tecnico", "cliente"] as const;
type ValidRole = typeof VALID_ROLES[number];

const PUBLIC_FIELDS = {
  id: usersTable.id, username: usersTable.username, displayName: usersTable.displayName,
  role: usersTable.role, active: usersTable.active, hplcAccess: usersTable.hplcAccess,
  permissions: usersTable.permissions, createdAt: usersTable.createdAt,
  accessExpiresAt: usersTable.accessExpiresAt, email: usersTable.email,
  registrationNumber: usersTable.registrationNumber,
};

function sanitizeRole(role: string | undefined): string {
  return VALID_ROLES.includes(role as ValidRole) ? (role as string) : "analyst";
}

// Active sessions — who is currently logged in (admin only)
router.get("/users/active-sessions", requireAuth, requireAdmin, async (_req, res): Promise<void> => {
  try {
    const now = new Date();

    // Auto-deslogar sessões inativas há mais de 1 hora
    await db.execute(sql`
      DELETE FROM sessions
      WHERE (last_activity IS NOT NULL AND last_activity < NOW() - INTERVAL '1 hour')
         OR (last_activity IS NULL     AND created_at    < NOW() - INTERVAL '1 hour')
    `);

    const rows = await db
      .select({
        userId: usersTable.id,
        username: usersTable.username,
        displayName: usersTable.displayName,
        role: usersTable.role,
        loginAt: sessionsTable.createdAt,
        expiresAt: sessionsTable.expiresAt,
        lastActivity: sessionsTable.lastActivity,
      })
      .from(sessionsTable)
      .innerJoin(usersTable, eq(sessionsTable.userId, usersTable.id))
      .where(gt(sessionsTable.expiresAt, now));

    // Agrupa por usuário: mantém a sessão com atividade mais recente e conta quantas tem
    const byUser = new Map<number, {
      userId: number; username: string; displayName: string; role: string;
      loginAt: Date; expiresAt: Date; lastActivity: Date | null; sessionCount: number;
    }>();
    for (const r of rows) {
      const existing = byUser.get(r.userId);
      if (!existing) {
        byUser.set(r.userId, { ...r, sessionCount: 1 });
      } else {
        existing.sessionCount++;
        // Mantém a sessão com lastActivity mais recente
        const rActivity = r.lastActivity ?? r.loginAt;
        const exActivity = existing.lastActivity ?? existing.loginAt;
        if (rActivity > exActivity) {
          existing.loginAt = r.loginAt;
          existing.expiresAt = r.expiresAt;
          existing.lastActivity = r.lastActivity;
        }
      }
    }

    // Ordena por lastActivity mais recente primeiro
    const result = [...byUser.values()].sort((a, b) => {
      const ta = (a.lastActivity ?? a.loginAt).getTime();
      const tb = (b.lastActivity ?? b.loginAt).getTime();
      return tb - ta;
    });
    res.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

// Terminate all sessions of a user (admin only — cannot terminate own sessions)
router.delete("/users/:userId/sessions", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const userId = parseInt(String(req.params["userId"] ?? ""));
  if (isNaN(userId)) { res.status(400).json({ error: "ID inválido." }); return; }
  if (req.authUser?.id === userId) { res.status(400).json({ error: "Não é possível encerrar a própria sessão por aqui. Use o botão Sair." }); return; }
  try {
    await db.delete(sessionsTable).where(eq(sessionsTable.userId, userId));
    res.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

// List users (admin only)
router.get("/users", requireAuth, requireAdmin, async (_req, res): Promise<void> => {
  const users = await db.select(PUBLIC_FIELDS).from(usersTable).orderBy(usersTable.createdAt);
  res.json(users);
});

// Create user (admin only)
router.post("/users", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const { username, displayName, password, role, permissions, accessExpiresAt, email } = req.body as {
    username?: string; displayName?: string; password?: string; role?: string; permissions?: string[];
    accessExpiresAt?: string | null; email?: string;
  };
  if (!username || !displayName || !password || password.length < 6) {
    res.status(400).json({ error: "Dados inválidos. Senha mínima de 6 caracteres." }); return;
  }
  const sanitizedRole = sanitizeRole(role);
  const resolvedPermissions = sanitizedRole === "cliente" ? [] :
    (Array.isArray(permissions) ? permissions : defaultPermissionsForRole(sanitizedRole));
  const passwordHash = await bcrypt.hash(password, 10);
  const expiresAt = accessExpiresAt ? new Date(accessExpiresAt) : null;
  try {
    const [user] = await db.insert(usersTable).values({
      username: username.trim().toLowerCase(), displayName: displayName.trim(), passwordHash,
      role: sanitizedRole, active: true, permissions: resolvedPermissions,
      ...(expiresAt ? { accessExpiresAt: expiresAt } : {}),
      ...(email ? { email: email.trim().toLowerCase() } : {}),
    }).returning(PUBLIC_FIELDS);
    res.status(201).json(user);
  } catch { res.status(409).json({ error: "Nome de usuário já existe." }); }
});

// Delete user (admin only — cannot delete yourself)
router.delete("/users/:userId", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const userId = parseInt(String(req.params["userId"] ?? ""));
  if (isNaN(userId)) { res.status(400).json({ error: "ID inválido." }); return; }
  if (req.authUser?.id === userId) { res.status(400).json({ error: "Não é possível excluir o próprio usuário." }); return; }
  const [deleted] = await db.delete(usersTable).where(eq(usersTable.id, userId)).returning({ id: usersTable.id });
  if (!deleted) { res.status(404).json({ error: "Usuário não encontrado." }); return; }
  res.json({ ok: true });
});

// Update user (admin only)
router.put("/users/:userId", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const userId = parseInt(String(req.params["userId"] ?? ""));
  if (isNaN(userId)) { res.status(400).json({ error: "ID inválido." }); return; }
  const { username, displayName, password, role, active, hplcAccess, permissions, accessExpiresAt, email, registrationNumber } = req.body as {
    username?: string; displayName?: string; password?: string; role?: string; active?: boolean;
    hplcAccess?: boolean; permissions?: string[]; accessExpiresAt?: string | null; email?: string; registrationNumber?: string | null;
  };
  const updates: Partial<typeof usersTable.$inferInsert> = {};
  if (username) updates.username = username.trim().toLowerCase();
  if (displayName) updates.displayName = displayName.trim();
  if (role && VALID_ROLES.includes(role as ValidRole)) updates.role = role;
  if (Array.isArray(permissions)) updates.permissions = permissions;
  if ("accessExpiresAt" in req.body) {
    updates.accessExpiresAt = accessExpiresAt ? new Date(accessExpiresAt) : null;
  }
  if ("email" in req.body) updates.email = email ? email.trim().toLowerCase() : null;
  if ("registrationNumber" in req.body) updates.registrationNumber = registrationNumber?.trim() || null;
  if (typeof active === "boolean") {
    if (!active && req.authUser?.id === userId) { res.status(400).json({ error: "Não é possível desativar o próprio usuário." }); return; }
    updates.active = active;
  }
  if (typeof hplcAccess === "boolean") updates.hplcAccess = hplcAccess;
  if (password) {
    if (password.length < 6) { res.status(400).json({ error: "Senha mínima de 6 caracteres." }); return; }
    updates.passwordHash = await bcrypt.hash(password, 10);
  }
  try {
    const [updated] = await db.update(usersTable).set(updates).where(eq(usersTable.id, userId)).returning(PUBLIC_FIELDS);
    if (!updated) { res.status(404).json({ error: "Usuário não encontrado." }); return; }
    // Force re-login: delete all sessions of the updated user so the new
    // permissions, role, or access status take effect immediately on next login.
    // Skip only when admin is editing their own account (would self-logout).
    if (req.authUser?.id !== userId) {
      await db.delete(sessionsTable).where(eq(sessionsTable.userId, userId));
    }
    res.json(updated);
  } catch { res.status(409).json({ error: "Nome de usuário já existe." }); }
});

export default router;
