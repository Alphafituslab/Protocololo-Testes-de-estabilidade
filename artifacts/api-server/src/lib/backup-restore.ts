import { db, protocolsTable, lotsTable, analysisResultsTable } from "@workspace/db";

interface BackupPayload {
  version?: string;
  exportedAt?: string;
  tables?: {
    protocols?: unknown[];
    lots?: unknown[];
    analysis_results?: unknown[];
  };
}

export interface RestoreResult {
  protocolsRestored: number;
  lotsRestored: number;
  resultsRestored: number;
  exportedAt: string | null;
}

function cleanRow(row: unknown, extra: Record<string, unknown> = {}): { id: number; rest: Record<string, unknown> } {
  const r = { ...(row as Record<string, unknown>), ...extra };
  const id = r["id"] as number;
  delete r["createdAt"];
  delete r["updatedAt"];
  delete r["deletedAt"];
  delete r["id"];
  return { id, rest: r };
}

export async function runRestore(body: unknown): Promise<RestoreResult> {
  const payload = body as BackupPayload;
  if (!payload?.tables) throw new Error("Arquivo de backup inválido: campo 'tables' ausente.");

  const { protocols = [], lots = [], analysis_results = [] } = payload.tables;

  let protocolsRestored = 0;
  let lotsRestored = 0;
  let resultsRestored = 0;

  for (const p of protocols) {
    if (!p || typeof (p as Record<string, unknown>)["id"] !== "number") continue;
    const { id, rest } = cleanRow(p, { deletedAt: null });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await db.insert(protocolsTable).values({ id, ...(rest as any) })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .onConflictDoUpdate({ target: protocolsTable.id, set: rest as any });
    protocolsRestored++;
  }

  for (const l of lots) {
    if (!l || typeof (l as Record<string, unknown>)["id"] !== "number") continue;
    const { id, rest } = cleanRow(l, { deletedAt: null });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await db.insert(lotsTable).values({ id, ...(rest as any) })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .onConflictDoUpdate({ target: lotsTable.id, set: rest as any });
    lotsRestored++;
  }

  for (const r of analysis_results) {
    if (!r || typeof (r as Record<string, unknown>)["id"] !== "number") continue;
    const { id, rest } = cleanRow(r, { deletedAt: null });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await db.insert(analysisResultsTable).values({ id, ...(rest as any) })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .onConflictDoUpdate({ target: analysisResultsTable.id, set: rest as any });
    resultsRestored++;
  }

  return {
    protocolsRestored,
    lotsRestored,
    resultsRestored,
    exportedAt: payload.exportedAt ?? null,
  };
}
