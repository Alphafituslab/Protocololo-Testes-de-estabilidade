import { Router, type IRouter } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { requireAuth, requireAdmin } from "../lib/session";
import { defaultPermissionsForRole } from "../lib/permissions";

const router: IRouter = Router();

const VALID_ROLES = ["admin", "analyst", "tecnico_lab", "controle_qualidade", "responsavel_tecnico"] as const;
type ValidRole = typeof VALID_ROLES[number];

const PUBLIC_FIELDS = {
  id: usersTable.id, username: usersTable.username, displayName: usersTable.displayName,
  role: usersTable.role, active: usersTable.active, hplcAccess: usersTable.hplcAccess,
  permissions: usersTable.permissions, createdAt: usersTable.createdAt,
};

function sanitizeRole(role: string | undefined): string {
  return VALID_ROLES.includes(role as ValidRole) ? (role as string) : "analyst";
}

// List users (admin only)
router.get("/users", requireAuth, requireAdmin, async (_req, res): Promise<void> => {
  const users = await db.select(PUBLIC_FIELDS).from(usersTable).orderBy(usersTable.createdAt);
  res.json(users);
});

// Create user (admin only)
router.post("/users", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const { username, displayName, password, role, permissions } = req.body as {
    username?: string; displayName?: string; password?: string; role?: string; permissions?: string[];
  };
  if (!username || !displayName || !password || password.length < 6) {
    res.status(400).json({ error: "Dados inválidos. Senha mínima de 6 caracteres." }); return;
  }
  const sanitizedRole = sanitizeRole(role);
  // Use provided permissions or auto-assign defaults for the role
  const resolvedPermissions = Array.isArray(permissions) ? permissions : defaultPermissionsForRole(sanitizedRole);
  const passwordHash = await bcrypt.hash(password, 10);
  try {
    const [user] = await db.insert(usersTable).values({
      username: username.trim().toLowerCase(), displayName: displayName.trim(), passwordHash,
      role: sanitizedRole, active: true, permissions: resolvedPermissions,
    }).returning(PUBLIC_FIELDS);
    res.status(201).json(user);
  } catch { res.status(409).json({ error: "Nome de usuário já existe." }); }
});

// Update user (admin only)
router.put("/users/:userId", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const userId = parseInt(String(req.params["userId"] ?? ""));
  if (isNaN(userId)) { res.status(400).json({ error: "ID inválido." }); return; }
  const { displayName, password, role, active, hplcAccess, permissions } = req.body as {
    displayName?: string; password?: string; role?: string; active?: boolean;
    hplcAccess?: boolean; permissions?: string[];
  };
  const updates: Partial<typeof usersTable.$inferInsert> = {};
  if (displayName) updates.displayName = displayName.trim();
  if (role && VALID_ROLES.includes(role as ValidRole)) updates.role = role;
  if (Array.isArray(permissions)) updates.permissions = permissions;
  if (typeof active === "boolean") {
    if (!active && req.authUser?.id === userId) { res.status(400).json({ error: "Não é possível desativar o próprio usuário." }); return; }
    updates.active = active;
  }
  if (typeof hplcAccess === "boolean") updates.hplcAccess = hplcAccess;
  if (password) {
    if (password.length < 6) { res.status(400).json({ error: "Senha mínima de 6 caracteres." }); return; }
    updates.passwordHash = await bcrypt.hash(password, 10);
  }
  const [updated] = await db.update(usersTable).set(updates).where(eq(usersTable.id, userId)).returning(PUBLIC_FIELDS);
  if (!updated) { res.status(404).json({ error: "Usuário não encontrado." }); return; }
  res.json(updated);
});

export default router;
