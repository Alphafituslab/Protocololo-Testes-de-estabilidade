import { db, protocolsTable, lotsTable, analysisResultsTable, anvisaNumberBank, bibliographicReferencesTable, protocolReferencesTable } from "@workspace/db";

interface BackupPayload {
  version?: string;
  exportedAt?: string;
  tables?: {
    protocols?: unknown[];
    lots?: unknown[];
    analysis_results?: unknown[];
    anvisa_number_bank?: unknown[];
    bibliographic_references?: unknown[];
    protocol_references?: unknown[];
  };
}

export interface RestoreResult {
  protocolsRestored: number;
  lotsRestored: number;
  resultsRestored: number;
  anvisaRestored: number;
  bibliographicRefsRestored: number;
  protocolRefsRestored: number;
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  table: any,
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

  const {
    protocols = [],
    lots = [],
    analysis_results = [],
    anvisa_number_bank = [],
    bibliographic_references = [],
    protocol_references = [],
  } = payload.tables;

  const hasId = (row: unknown) => row && typeof (row as Record<string, unknown>)["id"] === "number";

  const protocolRows = protocols.filter(hasId).map(p => cleanRow(p, { deletedAt: null }));
  const lotRows = lots.filter(hasId).map(l => cleanRow(l, { deletedAt: null }));
  const resultRows = analysis_results.filter(hasId).map(r => cleanRow(r, { deletedAt: null }));
  const anvisaRows = anvisa_number_bank.filter(hasId).map(a => cleanRow(a));
  const bibRefRows = bibliographic_references.filter(hasId).map(r => cleanRow(r));
  const protoRefRows = protocol_references.filter(hasId).map(r => cleanRow(r));

  // Ordem obrigatória: protocolos → lotes → resultados → anvisa → refs bibliográficas → protocol_references (FK chain)
  const protocolsRestored = await batchInsert(protocolsTable, protocolRows);
  const lotsRestored = await batchInsert(lotsTable, lotRows);
  const resultsRestored = await batchInsert(analysisResultsTable, resultRows);
  const anvisaRestored = await batchInsert(anvisaNumberBank, anvisaRows);
  const bibliographicRefsRestored = await batchInsert(bibliographicReferencesTable, bibRefRows);
  const protocolRefsRestored = await batchInsert(protocolReferencesTable, protoRefRows);

  return {
    protocolsRestored,
    lotsRestored,
    resultsRestored,
    anvisaRestored,
    bibliographicRefsRestored,
    protocolRefsRestored,
    exportedAt: payload.exportedAt ?? null,
  };
}
