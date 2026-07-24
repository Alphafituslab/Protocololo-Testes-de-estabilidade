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

const BATCH = 200;

async function batchUpsert(
  table: typeof protocolsTable | typeof lotsTable | typeof analysisResultsTable,
  rows: { id: number; rest: Record<string, unknown> }[],
): Promise<number> {
  if (rows.length === 0) return 0;
  let count = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const values = chunk.map(({ id, rest }) => ({ id, ...(rest as any) }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const firstRest = chunk[0]!.rest;
    const setCols = Object.fromEntries(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      Object.keys(firstRest).map(k => [k, (table as any)[k]])
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db.insert(table) as any)
      .values(values)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .onConflictDoUpdate({ target: (table as any).id, set: setCols });
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

  // Protocolos e lotes primeiro (resultados dependem dos lotes)
  const [protocolsRestored, lotsRestored] = await Promise.all([
    batchUpsert(protocolsTable, protocolRows),
    batchUpsert(lotsTable, lotRows),
  ]);

  // Resultados depois (podem ser muitos — batch de 200)
  const resultsRestored = await batchUpsert(analysisResultsTable, resultRows);

  return {
    protocolsRestored,
    lotsRestored,
    resultsRestored,
    exportedAt: payload.exportedAt ?? null,
  };
}
