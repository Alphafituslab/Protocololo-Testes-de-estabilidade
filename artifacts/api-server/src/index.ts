import path from "node:path";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import app from "./app";
import { db } from "@workspace/db";
import { logger } from "./lib/logger";
import { runAllSeeds } from "./seed";
import { startBackupScheduler } from "./lib/backup-scheduler";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
  migrate(db, { migrationsFolder: path.join(__dirname, "migrations") })
    .then(() => runAllSeeds())
    .catch((e) => logger.error({ err: e }, "Migration/seed error"));
  startBackupScheduler();
});
