import { eq } from "drizzle-orm";
import {
  db,
  protocolsTable,
  lotsTable,
  analysisResultsTable,
  protocolSnapshotsTable,
} from "@workspace/db";

export async function buildSnapshotData(protocolId: number): Promise<string | null> {
  const [protocol] = await db
    .select()
    .from(protocolsTable)
    .where(eq(protocolsTable.id, protocolId));
  if (!protocol) return null;

  const lots = await db
    .select()
    .from(lotsTable)
    .where(eq(lotsTable.protocolId, protocolId));

  const results = await db
    .select()
    .from(analysisResultsTable)
    .where(eq(analysisResultsTable.protocolId, protocolId));

  return JSON.stringify({ protocol, lots, results });
}

export async function createAutoSnapshot(
  protocolId: number,
  label: string,
  createdBy: string,
): Promise<void> {
  try {
    const snapshotData = await buildSnapshotData(protocolId);
    if (!snapshotData) return;
    await db.insert(protocolSnapshotsTable).values({
      protocolId,
      label,
      snapshotData,
      createdBy,
    });
  } catch { /* snapshot failures must never break main operation */ }
}
