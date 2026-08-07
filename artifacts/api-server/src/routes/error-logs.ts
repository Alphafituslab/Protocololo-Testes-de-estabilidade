import { Router, type IRouter } from "express";
import { db, tabErrorLogsTable } from "@workspace/db";
import { desc } from "drizzle-orm";
import { requireAuth } from "../lib/session";
import { PERM, requirePermission } from "../lib/permissions";

const router: IRouter = Router();

/**
 * POST /api/error-logs/tab-error
 * Registra um erro capturado pelo TabErrorBoundary.
 * Aceito por qualquer usuário autenticado (o erro pode ocorrer em qualquer papel).
 */
router.post("/error-logs/tab-error", requireAuth, async (req, res): Promise<void> => {
  const { protocolId, tabName, errorMessage, errorStack, componentStack } = req.body ?? {};

  if (!errorMessage || typeof errorMessage !== "string") {
    res.status(400).json({ error: "errorMessage é obrigatório" });
    return;
  }

  const user = req.authUser;

  try {
    await db.insert(tabErrorLogsTable).values({
      userId: user?.id ?? null,
      userDisplay: user?.displayName ?? null,
      protocolId: protocolId != null && !isNaN(Number(protocolId)) ? Number(protocolId) : null,
      tabName: typeof tabName === "string" ? tabName : null,
      errorMessage: String(errorMessage).slice(0, 2000),
      errorStack: typeof errorStack === "string" ? errorStack.slice(0, 8000) : null,
      componentStack: typeof componentStack === "string" ? componentStack.slice(0, 8000) : null,
    });

    res.json({ ok: true });
  } catch (err) {
    // Não vazar detalhes internos; o erro de log não deve quebrar o cliente
    console.error("[error-logs] Falha ao persistir tab-error:", err);
    res.status(500).json({ error: "Falha interna ao registrar erro" });
  }
});

/**
 * GET /api/error-logs
 * Lista os logs de erro de aba. Requer permissão de auditoria.
 */
router.get("/error-logs", requireAuth, requirePermission(PERM.AUDIT_VIEW), async (req, res): Promise<void> => {
  const limit = Math.min(parseInt((req.query["limit"] as string) || "100"), 500);

  const logs = await db
    .select()
    .from(tabErrorLogsTable)
    .orderBy(desc(tabErrorLogsTable.createdAt))
    .limit(limit);

  res.json(logs);
});

export default router;
