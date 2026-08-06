import { Router, type IRouter, type Request } from "express";
import { db, usersTable, sessionsTable, loginLogTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { requireAuth } from "../lib/session";
import { defaultPermissionsForRole } from "../lib/permissions";

const router: IRouter = Router();

async function logLogin(opts: {
  userId: number | null;
  username: string;
  success: boolean;
  failReason?: string;
  req: Request;
}) {
  const ip = (opts.req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim()
    ?? opts.req.socket.remoteAddress
    ?? null;
  const ua = opts.req.headers["user-agent"] ?? null;
  try {
    await db.insert(loginLogTable).values({
      userId: opts.userId,
      username: opts.username,
      success: opts.success,
      failReason: opts.failReason ?? null,
      ipAddress: ip,
      userAgent: ua,
    });
  } catch { /* non-critical — never fail login because of log error */ }
}

// Password verify — used throughout the app to confirm identity before sensitive actions.
// Priority: 1) bcrypt compare against the logged-in user's passwordHash (DB),
//           2) fallback to MASTER_PASSWORD env var (legacy / emergency access).
router.post("/auth/verify", async (req, res): Promise<void> => {
  const { password } = req.body as { password?: string };
  if (!password) { res.status(401).json({ error: "Senha obrigatória." }); return; }

  // 1. Try the logged-in user's own password (same credential used to log in)
  if (req.authUser) {
    try {
      const [user] = await db
        .select({ passwordHash: usersTable.passwordHash })
        .from(usersTable)
        .where(eq(usersTable.id, req.authUser.id))
        .limit(1);
      if (user && await bcrypt.compare(password, user.passwordHash)) {
        res.json({ ok: true });
        return;
      }
    } catch { /* fall through to MASTER_PASSWORD */ }
  }

  // 2. Fallback: MASTER_PASSWORD env var (works even when not logged in, e.g. setup flows)
  const masterPassword = process.env["MASTER_PASSWORD"];
  if (masterPassword && password === masterPassword) {
    res.json({ ok: true });
    return;
  }

  res.status(401).json({ error: "Senha incorreta." });
});

// Check if first-time setup is needed
router.get("/auth/setup-needed", async (_req, res): Promise<void> => {
  const users = await db.select({ id: usersTable.id }).from(usersTable).limit(1);
  res.json({ setupNeeded: users.length === 0 });
});

// Create first admin (only when no users exist)
router.post("/auth/setup", async (req, res): Promise<void> => {
  const existing = await db.select({ id: usersTable.id }).from(usersTable).limit(1);
  if (existing.length > 0) { res.status(409).json({ error: "Configuração inicial já foi realizada." }); return; }
  const { username, displayName, password } = req.body as { username?: string; displayName?: string; password?: string };
  if (!username || !displayName || !password || password.length < 6) {
    res.status(400).json({ error: "Dados inválidos. Senha mínima de 6 caracteres." }); return;
  }
  const passwordHash = await bcrypt.hash(password, 10);
  const [user] = await db.insert(usersTable).values({
    username: username.trim().toLowerCase(), displayName: displayName.trim(), passwordHash, role: "admin", active: true,
    permissions: [],
  }).returning({ id: usersTable.id, username: usersTable.username, displayName: usersTable.displayName, role: usersTable.role });
  res.status(201).json(user);
});

// Login
router.post("/auth/login", async (req, res): Promise<void> => {
  const { username, password } = req.body as { username?: string; password?: string };
  if (!username || !password) { res.status(400).json({ error: "Usuário e senha são obrigatórios." }); return; }

  const [user] = await db.select().from(usersTable)
    .where(and(eq(usersTable.username, username.trim().toLowerCase()), eq(usersTable.active, true))).limit(1);

  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    await logLogin({ userId: user?.id ?? null, username: username.trim().toLowerCase(), success: false, failReason: "Credenciais inválidas.", req });
    res.status(401).json({ error: "Usuário ou senha incorretos." }); return;
  }

  // Check access expiry for "cliente" role
  if (user.role === "cliente" && user.accessExpiresAt && new Date(user.accessExpiresAt) < new Date()) {
    await logLogin({ userId: user.id, username: user.username, success: false, failReason: "Acesso expirado.", req });
    res.status(403).json({ error: "Seu acesso ao sistema expirou. Entre em contato com o laboratório." }); return;
  }

  const token = randomUUID();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await db.insert(sessionsTable).values({ token, userId: user.id, expiresAt });
  await logLogin({ userId: user.id, username: user.username, success: true, req });

  res.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      role: user.role,
      hplcAccess: user.hplcAccess,
      permissions: (user.permissions && user.permissions.length > 0)
        ? user.permissions
        : defaultPermissionsForRole(user.role) as string[],
      accessExpiresAt: user.accessExpiresAt ?? null,
      registrationNumber: user.registrationNumber ?? null,
    },
  });
});

// Reset password using MASTER_PASSWORD as authorization
router.post("/auth/reset-password", async (req, res): Promise<void> => {
  const { masterPassword, username, newPassword } = req.body as {
    masterPassword?: string;
    username?: string;
    newPassword?: string;
  };
  const masterPwd = process.env["MASTER_PASSWORD"];
  if (!masterPwd) { res.status(503).json({ error: "Senha mestra não configurada no servidor." }); return; }
  if (!masterPassword || masterPassword !== masterPwd) {
    res.status(401).json({ error: "Senha mestra incorreta." }); return;
  }
  if (!username || !newPassword || newPassword.length < 6) {
    res.status(400).json({ error: "Usuário e nova senha (mín. 6 caracteres) são obrigatórios." }); return;
  }
  const [user] = await db.select({ id: usersTable.id }).from(usersTable)
    .where(eq(usersTable.username, username.trim().toLowerCase())).limit(1);
  if (!user) { res.status(404).json({ error: "Usuário não encontrado." }); return; }
  const passwordHash = await bcrypt.hash(newPassword, 10);
  await db.update(usersTable).set({ passwordHash }).where(eq(usersTable.id, user.id));
  res.json({ ok: true });
});

// Logout
router.post("/auth/logout", requireAuth, async (req, res): Promise<void> => {
  const token = req.headers["authorization"]?.slice(7);
  if (token) await db.delete(sessionsTable).where(eq(sessionsTable.token, token));
  res.json({ ok: true });
});

// Get current user
router.get("/auth/me", requireAuth, (req, res): void => {
  res.json(req.authUser);
});

export default router;
