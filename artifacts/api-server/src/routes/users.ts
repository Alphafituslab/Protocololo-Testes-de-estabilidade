import { Router, type IRouter } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { requireAuth, requireAdmin } from "../lib/session";

const router: IRouter = Router();

const PUBLIC_FIELDS = {
  id: usersTable.id, username: usersTable.username, displayName: usersTable.displayName,
  role: usersTable.role, active: usersTable.active, createdAt: usersTable.createdAt,
};

// List users (admin only)
router.get("/users", requireAuth, requireAdmin, async (_req, res): Promise<void> => {
  const users = await db.select(PUBLIC_FIELDS).from(usersTable).orderBy(usersTable.createdAt);
  res.json(users);
});

// Create user (admin only)
router.post("/users", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const { username, displayName, password, role } = req.body as { username?: string; displayName?: string; password?: string; role?: string };
  if (!username || !displayName || !password || password.length < 6) {
    res.status(400).json({ error: "Dados inválidos. Senha mínima de 6 caracteres." }); return;
  }
  const passwordHash = await bcrypt.hash(password, 10);
  try {
    const [user] = await db.insert(usersTable).values({
      username: username.trim().toLowerCase(), displayName: displayName.trim(), passwordHash,
      role: role === "admin" ? "admin" : "analyst", active: true,
    }).returning(PUBLIC_FIELDS);
    res.status(201).json(user);
  } catch { res.status(409).json({ error: "Nome de usuário já existe." }); }
});

// Update user (admin only)
router.put("/users/:userId", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const userId = parseInt(String(req.params["userId"] ?? ""));
  if (isNaN(userId)) { res.status(400).json({ error: "ID inválido." }); return; }
  const { displayName, password, role, active } = req.body as { displayName?: string; password?: string; role?: string; active?: boolean };
  const updates: Partial<typeof usersTable.$inferInsert> = {};
  if (displayName) updates.displayName = displayName.trim();
  if (role === "admin" || role === "analyst") updates.role = role;
  if (typeof active === "boolean") {
    if (!active && req.authUser?.id === userId) { res.status(400).json({ error: "Não é possível desativar o próprio usuário." }); return; }
    updates.active = active;
  }
  if (password) {
    if (password.length < 6) { res.status(400).json({ error: "Senha mínima de 6 caracteres." }); return; }
    updates.passwordHash = await bcrypt.hash(password, 10);
  }
  const [updated] = await db.update(usersTable).set(updates).where(eq(usersTable.id, userId)).returning(PUBLIC_FIELDS);
  if (!updated) { res.status(404).json({ error: "Usuário não encontrado." }); return; }
  res.json(updated);
});

export default router;
