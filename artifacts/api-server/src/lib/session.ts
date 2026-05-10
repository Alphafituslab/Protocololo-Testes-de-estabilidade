import { db, sessionsTable, usersTable } from "@workspace/db";
import { eq, and, gt } from "drizzle-orm";
import type { RequestHandler } from "express";

export type AuthUser = {
  id: number;
  username: string;
  displayName: string;
  role: string;
  hplcAccess: boolean;
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

      if (result[0]) req.authUser = result[0];
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
