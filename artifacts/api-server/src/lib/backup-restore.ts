import { db, protocolsTable, lotsTable, analysisResultsTable, anvisaNumberBank } from "@workspace/db";

interface BackupPayload {
  version?: string;
  exportedAt?: string;
  tables?: {
    protocols?: unknown[];
    lots?: unknown[];
    analysis_results?: unknown[];
    anvisa_number_bank?: unknown[];
  };
}

export interface RestoreResult {
  protocolsRestored: number;
  lotsRestored: number;
  resultsRestored: number;
  anvisaRestored: number;
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
  table: typeof protocolsTable | typeof lotsTable | typeof analysisResultsTable | typeof anvisaNumberBank,
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

  const { protocols = [], lots = [], analysis_results = [], anvisa_number_bank = [] } = payload.tables;

  const protocolRows = protocols
    .filter(p => p && typeof (p as Record<string, unknown>)["id"] === "number")
    .map(p => cleanRow(p, { deletedAt: null }));

  const lotRows = lots
    .filter(l => l && typeof (l as Record<string, unknown>)["id"] === "number")
    .map(l => cleanRow(l, { deletedAt: null }));

  const resultRows = analysis_results
    .filter(r => r && typeof (r as Record<string, unknown>)["id"] === "number")
    .map(r => cleanRow(r, { deletedAt: null }));

  const anvisaRows = anvisa_number_bank
    .filter(a => a && typeof (a as Record<string, unknown>)["id"] === "number")
    .map(a => cleanRow(a));

  // Ordem obrigatória: protocolos → lotes → resultados → anvisa (FK chain)
  const protocolsRestored = await batchInsert(protocolsTable, protocolRows);
  const lotsRestored = await batchInsert(lotsTable, lotRows);
  const resultsRestored = await batchInsert(analysisResultsTable, resultRows);
  const anvisaRestored = await batchInsert(anvisaNumberBank, anvisaRows);

  return {
    protocolsRestored,
    lotsRestored,
    resultsRestored,
    anvisaRestored,
    exportedAt: payload.exportedAt ?? null,
  };
}
