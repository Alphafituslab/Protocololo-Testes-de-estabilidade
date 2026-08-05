import { db, protocolSignaturesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { RequestHandler } from "express";

// ── Permission constants ──────────────────────────────────────────────────────

export const PERM = {
  // ── Protocolos ──────────────────────────────────────────────────────────────
  PROTOCOLS_VIEW:      "protocols:view",
  PROTOCOLS_CREATE:    "protocols:create",
  PROTOCOLS_EDIT:      "protocols:edit",
  PROTOCOLS_DELETE:    "protocols:delete",
  PROTOCOLS_FINALIZE:  "protocols:finalize",
  PROTOCOLS_DUPLICATE: "protocols:duplicate",
  PROTOCOLS_EXPORT:    "protocols:export",
  // ── Lotes e Resultados ──────────────────────────────────────────────────────
  LOTS_MANAGE:         "lots:manage",
  LOTS_EDIT_NUMBER:    "lots:edit_number",
  RESULTS_ENTER:       "results:enter",
  RESULTS_EDIT:        "results:edit",
  RESULTS_DELETE:      "results:delete",
  // ── Assinaturas ─────────────────────────────────────────────────────────────
  SIGNATURES_SIGN:     "signatures:sign",
  SIGNATURES_DELETE:   "signatures:delete",
  // ── Cinética ────────────────────────────────────────────────────────────────
  KINETICS_VIEW:       "kinetics:view",
  KINETICS_EDIT:       "kinetics:edit",
  // ── Metodologia ─────────────────────────────────────────────────────────────
  METHODOLOGY_VIEW:    "methodology:view",
  METHODOLOGY_EDIT:    "methodology:edit",
  // ── Certificado e Relatório ─────────────────────────────────────────────────
  CERTIFICATE_VIEW:    "certificate:view",
  CERTIFICATE_EDIT:    "certificate:edit",
  REPORT_VIEW:         "report:view",
  // ── ANVISA ──────────────────────────────────────────────────────────────────
  ANVISA_MANAGE:       "anvisa:manage",
  // ── Documentos e Referências ────────────────────────────────────────────────
  DOCUMENTS_MANAGE:    "documents:manage",
  REFERENCES_MANAGE:   "references:manage",
  // ── Histórico e Versões ─────────────────────────────────────────────────────
  AUDIT_VIEW:          "audit:view",
  VERSIONS_VIEW:       "versions:view",
  // ── Sistema ─────────────────────────────────────────────────────────────────
  CATALOG_MANAGE:      "catalog:manage",
  ATTACHMENTS_MANAGE:  "attachments:manage",
  SETTINGS_MANAGE:     "settings:manage",
  USER_MANAGE:         "user:manage",
} as const;

export type PermKey = typeof PERM[keyof typeof PERM];

export const PERM_LABELS: Record<PermKey, string> = {
  // Protocolos
  "protocols:view":      "Visualizar protocolos",
  "protocols:create":    "Criar protocolos",
  "protocols:edit":      "Editar protocolos",
  "protocols:delete":    "Excluir protocolos",
  "protocols:finalize":  "Finalizar / aprovar protocolos",
  "protocols:duplicate": "Duplicar protocolo",
  "protocols:export":    "Exportar / imprimir protocolo",
  // Lotes e Resultados
  "lots:manage":         "Gerenciar lotes (criar, editar, excluir)",
  "lots:edit_number":    "Editar número do lote",
  "results:enter":       "Lançar resultados de análise",
  "results:edit":        "Editar resultados existentes",
  "results:delete":      "Excluir resultados",
  // Assinaturas
  "signatures:sign":     "Assinar certificados",
  "signatures:delete":   "Excluir assinaturas",
  // Cinética
  "kinetics:view":       "Visualizar aba Cinética",
  "kinetics:edit":       "Editar configurações da Cinética",
  // Metodologia
  "methodology:view":    "Visualizar aba Metodologia",
  "methodology:edit":    "Editar metodologia do protocolo",
  // Certificado e Relatório
  "certificate:view":    "Visualizar certificado de análise",
  "certificate:edit":    "Editar campos do certificado",
  "report:view":         "Visualizar relatório ANVISA",
  // ANVISA
  "anvisa:manage":       "Gerenciar notificações ANVISA",
  // Documentos e Referências
  "documents:manage":    "Gerenciar documentos do protocolo",
  "references:manage":   "Gerenciar referências bibliográficas",
  // Histórico e Versões
  "audit:view":          "Visualizar histórico de alterações",
  "versions:view":       "Visualizar versões do protocolo",
  // Sistema
  "catalog:manage":      "Gerenciar cadastros (catálogo)",
  "attachments:manage":  "Gerenciar anexos",
  "settings:manage":     "Configurações do sistema",
  "user:manage":         "Gerenciar usuários e acesso ao portal do cliente",
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
      return [
        p.PROTOCOLS_VIEW, p.PROTOCOLS_CREATE, p.PROTOCOLS_EDIT, p.PROTOCOLS_FINALIZE,
        p.PROTOCOLS_DUPLICATE, p.PROTOCOLS_EXPORT,
        p.LOTS_MANAGE, p.LOTS_EDIT_NUMBER,
        p.RESULTS_ENTER, p.RESULTS_EDIT, p.RESULTS_DELETE,
        p.SIGNATURES_SIGN,
        p.KINETICS_VIEW, p.KINETICS_EDIT,
        p.METHODOLOGY_VIEW, p.METHODOLOGY_EDIT,
        p.CERTIFICATE_VIEW, p.CERTIFICATE_EDIT,
        p.REPORT_VIEW,
        p.ANVISA_MANAGE,
        p.DOCUMENTS_MANAGE, p.REFERENCES_MANAGE,
        p.AUDIT_VIEW, p.VERSIONS_VIEW,
        p.CATALOG_MANAGE, p.ATTACHMENTS_MANAGE,
      ];
    case "controle_qualidade":
      return [
        p.PROTOCOLS_VIEW, p.PROTOCOLS_CREATE, p.PROTOCOLS_EDIT,
        p.LOTS_MANAGE,
        p.RESULTS_ENTER, p.RESULTS_EDIT,
        p.SIGNATURES_SIGN,
        p.KINETICS_VIEW,
        p.METHODOLOGY_VIEW,
        p.CERTIFICATE_VIEW,
        p.REPORT_VIEW,
        p.AUDIT_VIEW,
        p.DOCUMENTS_MANAGE,
        p.ATTACHMENTS_MANAGE,
      ];
    case "tecnico_lab":
      return [
        p.PROTOCOLS_VIEW,
        p.RESULTS_ENTER,
        p.SIGNATURES_SIGN,
        p.AUDIT_VIEW,
        p.ATTACHMENTS_MANAGE, p.DOCUMENTS_MANAGE,
      ];
    case "analyst":
      return [p.PROTOCOLS_VIEW, p.RESULTS_ENTER, p.SIGNATURES_SIGN];
    default:
      return [p.PROTOCOLS_VIEW, p.RESULTS_ENTER];
  }
}
