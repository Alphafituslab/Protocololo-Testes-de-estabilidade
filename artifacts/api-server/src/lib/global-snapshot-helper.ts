import {
  db,
  protocolsTable,
  lotsTable,
  analysisResultsTable,
  methodologiesTable,
} from "@workspace/db";

export type GlobalSnapshotData = {
  version: 1;
  capturedAt: string;
  protocols: Record<string, unknown>[];
  lots: Record<string, unknown>[];
  results: Record<string, unknown>[];
  methodologies: Record<string, unknown>[];
};

export async function buildGlobalSnapshotData(): Promise<GlobalSnapshotData> {
  const [protocols, lots, results, methodologies] = await Promise.all([
    db.select().from(protocolsTable),
    db.select().from(lotsTable),
    db.select().from(analysisResultsTable),
    db.select().from(methodologiesTable),
  ]);

  return {
    version: 1,
    capturedAt: new Date().toISOString(),
    protocols: protocols as Record<string, unknown>[],
    lots: lots as Record<string, unknown>[],
    results: results as Record<string, unknown>[],
    methodologies: methodologies as Record<string, unknown>[],
  };
}
