import { db, sessionsTable, usersTable } from "@workspace/db";
import { eq, and, gt } from "drizzle-orm";
import type { RequestHandler } from "express";
import { defaultPermissionsForRole } from "./permissions";

// In-memory debounce: só escrevemos lastActivity no DB a cada 30s por token
const activityCache = new Map<string, number>();

export type AuthUser = {
  id: number;
  username: string;
  displayName: string;
  role: string;
  hplcAccess: boolean;
  permissions: string[];
  registrationNumber: string | null;
};

declare global {
  namespace Express {
    interface Request {
      authUser?: AuthUser;
    }
  }
}

export const sessionMiddleware: RequestHandler = async (req, _res, next): Promise<void> => {
  const authHeader = req.headers["authorization"];
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (token) {
    try {
      const result = await db
        .select({
          id: usersTable.id,
          username: usersTable.username,
          displayName: usersTable.displayName,
          role: usersTable.role,
          hplcAccess: usersTable.hplcAccess,
          permissions: usersTable.permissions,
          registrationNumber: usersTable.registrationNumber,
        })
        .from(sessionsTable)
        .innerJoin(usersTable, eq(sessionsTable.userId, usersTable.id))
        .where(
          and(
            eq(sessionsTable.token, token),
            gt(sessionsTable.expiresAt, new Date()),
            eq(usersTable.active, true),
          ),
        )
        .limit(1);

      if (result[0]) {
        const u = result[0];
        // Se o usuário não tem permissões explícitas gravadas, usa os defaults do papel
        if (!u.permissions || u.permissions.length === 0) {
          u.permissions = defaultPermissionsForRole(u.role) as string[];
        }
        req.authUser = u;
        // Debounce: toca lastActivity no DB no máximo 1x a cada 30s por token
        const now = Date.now();
        const last = activityCache.get(token) ?? 0;
        if (now - last > 30_000) {
          activityCache.set(token, now);
          db.update(sessionsTable)
            .set({ lastActivity: new Date() })
            .where(eq(sessionsTable.token, token))
            .catch(() => { /* fire-and-forget */ });
        }
      }
    } catch { /* ignore auth errors */ }
  }

  next();
};

export const requireAuth: RequestHandler = (req, res, next): void => {
  if (!req.authUser) {
    res.status(401).json({ error: "Não autenticado. Faça login para continuar." });
    return;
  }
  next();
};

export const requireAdmin: RequestHandler = (req, res, next): void => {
  if (!req.authUser || req.authUser.role !== "admin") {
    res.status(403).json({ error: "Acesso negado. Apenas administradores." });
    return;
  }
  next();
};
