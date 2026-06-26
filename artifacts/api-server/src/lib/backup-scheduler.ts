import fs from "fs";
import path from "path";
import { db, settingsTable, protocolsTable, lotsTable, analysisResultsTable } from "@workspace/db";
import { logger } from "./logger";

export const BACKUP_DIR = process.env["BACKUP_DIR"] || path.join(process.cwd(), "backups");
const MAX_BACKUPS = 60;

function ensureDir() {
  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

async function getSetting(rows: { key: string; value: string }[], key: string, def: string) {
  return rows.find(r => r.key === key)?.value ?? def;
}

async function upsertSetting(key: string, value: string) {
  await db
    .insert(settingsTable)
    .values({ key, value, updatedAt: new Date() })
    .onConflictDoUpdate({ target: settingsTable.key, set: { value, updatedAt: new Date() } });
}

export async function runBackup(): Promise<{ filename: string; size: number; exportedAt: string }> {
  ensureDir();
  const now = new Date();
  const ts = now.toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const filename = `backup_${ts}.json`;
  const filepath = path.join(BACKUP_DIR, filename);

  const [protocols, lots, results] = await Promise.all([
    db.select().from(protocolsTable),
    db.select().from(lotsTable),
    db.select().from(analysisResultsTable),
  ]);

  const payload = {
    version: "2.0",
    exportedAt: now.toISOString(),
    tables: {
      protocols,
      lots,
      analysis_results: results,
    },
  };

  fs.writeFileSync(filepath, JSON.stringify(payload, null, 2), "utf8");

  await Promise.all([
    upsertSetting("backup.last_run", now.toISOString()),
    upsertSetting("backup.last_status", "success"),
    upsertSetting("backup.last_file", filename),
  ]);

  pruneOldBackups();

  const { size } = fs.statSync(filepath);
  return { filename, size, exportedAt: now.toISOString() };
}

function pruneOldBackups() {
  try {
    ensureDir();
    const files = fs
      .readdirSync(BACKUP_DIR)
      .filter(f => f.endsWith(".json") && f.startsWith("backup_"))
      .map(f => ({ f, mt: fs.statSync(path.join(BACKUP_DIR, f)).mtimeMs }))
      .sort((a, b) => b.mt - a.mt);
    for (const { f } of files.slice(MAX_BACKUPS)) {
      fs.unlinkSync(path.join(BACKUP_DIR, f));
    }
  } catch (e) {
    logger.warn({ err: e }, "backup: prune failed");
  }
}

export function startBackupScheduler() {
  const ran = new Set<string>();

  setInterval(async () => {
    try {
      const rows = await db.select().from(settingsTable);
      const enabled = await getSetting(rows, "backup.enabled", "false");
      if (enabled !== "true") return;

      const time1 = await getSetting(rows, "backup.time", "08:00");
      const time2 = await getSetting(rows, "backup.time2", "20:00");

      const now = new Date();
      const hhmm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
      const today = now.toDateString();

      for (const t of [time1, time2]) {
        if (!t) continue;
        const key = `${today}|${t}`;
        if (hhmm === t && !ran.has(key)) {
          ran.add(key);
          logger.info({ time: t }, "backup: scheduled run starting");
          try {
            const r = await runBackup();
            logger.info({ filename: r.filename, size: r.size }, "backup: scheduled run ok");
          } catch (err) {
            logger.error({ err, time: t }, "backup: scheduled run failed");
            await upsertSetting("backup.last_status", "error").catch(() => {});
          }
          if (ran.size > 200) ran.clear();
        }
      }
    } catch (e) {
      logger.warn({ err: e }, "backup: scheduler tick error");
    }
  }, 60_000);

  logger.info("backup: scheduler started (checks every minute)");
}
