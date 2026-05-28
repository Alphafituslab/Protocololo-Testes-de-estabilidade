import { db, protocolSignaturesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { RequestHandler } from "express";

// ── Permission constants ──────────────────────────────────────────────────────

export const PERM = {
  PROTOCOLS_VIEW:     "protocols:view",
  PROTOCOLS_CREATE:   "protocols:create",
  PROTOCOLS_EDIT:     "protocols:edit",
  PROTOCOLS_DELETE:   "protocols:delete",
  PROTOCOLS_FINALIZE: "protocols:finalize",
  LOTS_MANAGE:        "lots:manage",
  RESULTS_ENTER:      "results:enter",
  RESULTS_DELETE:     "results:delete",
  SIGNATURES_SIGN:    "signatures:sign",
  SIGNATURES_DELETE:  "signatures:delete",
  CATALOG_MANAGE:     "catalog:manage",
  ATTACHMENTS_MANAGE: "attachments:manage",
  SETTINGS_MANAGE:    "settings:manage",
} as const;

export type PermKey = typeof PERM[keyof typeof PERM];

export const PERM_LABELS: Record<PermKey, string> = {
  "protocols:view":     "Visualizar protocolos",
  "protocols:create":   "Criar protocolos",
  "protocols:edit":     "Editar protocolos",
  "protocols:delete":   "Excluir protocolos",
  "protocols:finalize": "Finalizar / aprovar protocolos",
  "lots:manage":        "Gerenciar lotes (criar, editar, excluir)",
  "results:enter":      "Lançar resultados de análise",
  "results:delete":     "Excluir resultados",
  "signatures:sign":    "Assinar certificados",
  "signatures:delete":  "Excluir assinaturas",
  "catalog:manage":     "Gerenciar cadastros (catálogo)",
  "attachments:manage": "Gerenciar anexos",
  "settings:manage":    "Configurações do sistema",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

interface MinUser { role: string; permissions: string[] }

/** Admin always passes; others must have the specific permission. */
export function hasPermission(user: MinUser, perm: PermKey): boolean {
  if (user.role === "admin") return true;
  return user.permissions.includes(perm);
}

/** Express middleware — requires a valid session + specific permission. */
export function requirePermission(perm: PermKey): RequestHandler {
  return (req, res, next): void => {
    if (!req.authUser) {
      res.status(401).json({ error: "Não autenticado. Faça login para continuar." }); return;
    }
    if (!hasPermission(req.authUser, perm)) {
      res.status(403).json({ error: "Sem permissão para esta ação." }); return;
    }
    next();
  };
}

/** Returns true when the protocol already has at least one signature. */
export async function isProtocolSigned(protocolId: number): Promise<boolean> {
  const [sig] = await db
    .select({ id: protocolSignaturesTable.id })
    .from(protocolSignaturesTable)
    .where(eq(protocolSignaturesTable.protocolId, protocolId))
    .limit(1);
  return !!sig;
}

/** Default permission set for a given role — used when creating users. */
export function defaultPermissionsForRole(role: string): PermKey[] {
  const p = PERM;
  switch (role) {
    case "admin":
      return Object.values(p);
    case "responsavel_tecnico":
      return [p.PROTOCOLS_VIEW, p.PROTOCOLS_CREATE, p.PROTOCOLS_EDIT, p.PROTOCOLS_FINALIZE,
        p.LOTS_MANAGE, p.RESULTS_ENTER, p.RESULTS_DELETE, p.SIGNATURES_SIGN,
        p.CATALOG_MANAGE, p.ATTACHMENTS_MANAGE];
    case "controle_qualidade":
      return [p.PROTOCOLS_VIEW, p.PROTOCOLS_CREATE, p.PROTOCOLS_EDIT,
        p.LOTS_MANAGE, p.RESULTS_ENTER, p.SIGNATURES_SIGN, p.ATTACHMENTS_MANAGE];
    case "tecnico_lab":
      return [p.PROTOCOLS_VIEW, p.RESULTS_ENTER, p.SIGNATURES_SIGN, p.ATTACHMENTS_MANAGE];
    case "analyst":
      return [p.PROTOCOLS_VIEW, p.RESULTS_ENTER, p.SIGNATURES_SIGN];
    default:
      return [p.PROTOCOLS_VIEW, p.RESULTS_ENTER];
  }
}
