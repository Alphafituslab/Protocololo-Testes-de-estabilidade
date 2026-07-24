import app from "./app";
import { logger } from "./lib/logger";
import { runAllSeeds, emergencyRestoreIfNeeded } from "./seed";
import { startBackupScheduler } from "./lib/backup-scheduler";

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
  runAllSeeds().catch((e) => logger.error({ err: e }, "Seed error"));
  startBackupScheduler();
  // Restauração de emergência em background — roda APÓS o servidor já
  // estar respondendo ao healthcheck, para não ser morta pelo timeout do deploy.
  setTimeout(() => {
    emergencyRestoreIfNeeded().catch((e) => logger.error({ err: e }, "Emergency restore error"));
  }, 5000);
});
