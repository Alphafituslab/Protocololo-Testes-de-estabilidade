import app from "./app";
import { logger } from "./lib/logger";
import { runAllSeeds, emergencyRestoreIfNeeded } from "./seed";
import { startBackupScheduler } from "./lib/backup-scheduler";
import { db, protocolsTable } from "@workspace/db";
import { sql } from "drizzle-orm";

/** ONE-TIME FIX: reset updated_at = created_at for any protocol where
 *  updated_at was set today by spurious debounced auto-saves (no real edit).
 *  Safe to run multiple times (idempotent after the first run). */
async function resetSpuriousUpdatedAt(): Promise<void> {
  try {
    const result = await db.execute(
      sql`UPDATE protocols SET updated_at = created_at WHERE updated_at::date = CURRENT_DATE`
    );
    const count = (result as unknown as { rowCount?: number }).rowCount ?? 0;
    if (count > 0) logger.info({ count }, "resetSpuriousUpdatedAt: cleared today timestamps");
  } catch (e) {
    logger.warn({ err: e }, "resetSpuriousUpdatedAt: skipped");
  }
}

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
  resetSpuriousUpdatedAt().catch((e) => logger.error({ err: e }, "resetSpuriousUpdatedAt error"));
  runAllSeeds().catch((e) => logger.error({ err: e }, "Seed error"));
  startBackupScheduler();
  // Restauração de emergência em background — roda APÓS o servidor já
  // estar respondendo ao healthcheck, para não ser morta pelo timeout do deploy.
  setTimeout(() => {
    emergencyRestoreIfNeeded().catch((e) => logger.error({ err: e }, "Emergency restore error"));
  }, 5000);
});
