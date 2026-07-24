import { db, protocolsTable, lotsTable, analysisResultsTable } from "@workspace/db";
import { sql } from "drizzle-orm";

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

function cleanRow(row: unknown, extra: Record<string, unknown> = {}): Record<string, unknown> {
  const r = { ...(row as Record<string, unknown>), ...extra };
  delete r["createdAt"];
  delete r["updatedAt"];
  delete r["deletedAt"];
  return r;
}

const BATCH = 200;

async function batchInsert(
  table: typeof protocolsTable | typeof lotsTable | typeof analysisResultsTable,
  rows: Record<string, unknown>[],
): Promise<number> {
  if (rows.length === 0) return 0;
  let count = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db.insert(table) as any)
      .values(chunk)
      .onConflictDoNothing();
    count += chunk.length;
  }
  return count;
}

export async function runRestore(body: unknown): Promise<RestoreResult> {
  const payload = body as BackupPayload;
  if (!payload?.tables) throw new Error("Arquivo de backup inválido: campo 'tables' ausente.");

  const { protocols = [], lots = [], analysis_results = [] } = payload.tables;

  const protocolRows = protocols
    .filter(p => p && typeof (p as Record<string, unknown>)["id"] === "number")
    .map(p => cleanRow(p, { deletedAt: null }));

  const lotRows = lots
    .filter(l => l && typeof (l as Record<string, unknown>)["id"] === "number")
    .map(l => cleanRow(l, { deletedAt: null }));

  const resultRows = analysis_results
    .filter(r => r && typeof (r as Record<string, unknown>)["id"] === "number")
    .map(r => cleanRow(r, { deletedAt: null }));

  // Ordem obrigatória: protocolos → lotes → resultados (FK chain)
  const protocolsRestored = await batchInsert(protocolsTable, protocolRows);
  const lotsRestored = await batchInsert(lotsTable, lotRows);
  const resultsRestored = await batchInsert(analysisResultsTable, resultRows);

  return {
    protocolsRestored,
    lotsRestored,
    resultsRestored,
    exportedAt: payload.exportedAt ?? null,
  };
}
