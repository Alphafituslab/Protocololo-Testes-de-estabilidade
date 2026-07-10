import fs from "fs";
import path from "path";
import { db, settingsTable, protocolsTable, lotsTable, analysisResultsTable } from "@workspace/db";
import { logger } from "./logger";
import { objectStorageClient } from "./objectStorage";

export const BACKUP_DIR = process.env["BACKUP_DIR"] || path.join(process.cwd(), "backups");
const MAX_BACKUPS = 60;

function ensureDir() {
  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

function cloudBucketAndPrefix(): { bucketName: string; prefix: string } | null {
  const dir = (process.env["PRIVATE_OBJECT_DIR"] || "").replace(/^\/+/, "");
  if (!dir) return null;
  const parts = dir.split("/").filter(Boolean);
  const bucketName = parts[0];
  const rest = parts.slice(1).join("/");
  const prefix = rest ? `${rest}/backups/` : "backups/";
  return { bucketName, prefix };
}

async function uploadToCloud(filepath: string, filename: string): Promise<void> {
  const target = cloudBucketAndPrefix();
  if (!target) {
    logger.warn("backup: PRIVATE_OBJECT_DIR not set, skipping cloud copy");
    return;
  }
  try {
    const bucket = objectStorageClient.bucket(target.bucketName);
    await bucket.upload(filepath, {
      destination: `${target.prefix}${filename}`,
      contentType: "application/json",
    });
  } catch (e) {
    logger.warn({ err: e }, "backup: cloud upload failed");
  }
}

async function pruneCloudBackups(keep = MAX_BACKUPS): Promise<void> {
  const target = cloudBucketAndPrefix();
  if (!target) return;
  try {
    const bucket = objectStorageClient.bucket(target.bucketName);
    const [files] = await bucket.getFiles({ prefix: target.prefix });
    const sorted = files.map(f => f.name).sort().reverse();
    const toDelete = sorted.slice(keep);
    await Promise.all(toDelete.map(name => bucket.file(name).delete().catch(() => {})));
  } catch (e) {
    logger.warn({ err: e }, "backup: cloud prune failed");
  }
}

export async function listCloudBackups(): Promise<{ filename: string; size: number; updatedAt: string }[]> {
  const target = cloudBucketAndPrefix();
  if (!target) return [];
  try {
    const bucket = objectStorageClient.bucket(target.bucketName);
    const [files] = await bucket.getFiles({ prefix: target.prefix });
    const results = await Promise.all(
      files.map(async f => {
        const [meta] = await f.getMetadata();
        return {
          filename: f.name.slice(target.prefix.length),
          size: Number(meta.size || 0),
          updatedAt: (meta.updated as string) || "",
        };
      })
    );
    return results.filter(r => r.filename).sort((a, b) => b.filename.localeCompare(a.filename)).slice(0, 60);
  } catch (e) {
    logger.warn({ err: e }, "backup: list cloud backups failed");
    return [];
  }
}

export async function downloadCloudBackup(filename: string): Promise<unknown> {
  const target = cloudBucketAndPrefix();
  if (!target) throw new Error("Armazenamento em nuvem não configurado (PRIVATE_OBJECT_DIR ausente).");
  const safeName = path.basename(filename);
  const bucket = objectStorageClient.bucket(target.bucketName);
  const file = bucket.file(`${target.prefix}${safeName}`);
  const [exists] = await file.exists();
  if (!exists) throw new Error("Backup não encontrado na nuvem.");
  const [buf] = await file.download();
  return JSON.parse(buf.toString("utf8"));
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
  const pad = (n: number) => String(n).padStart(2, "0");
  const dateStr = `${pad(now.getDate())}-${pad(now.getMonth() + 1)}-${now.getFullYear()}`;
  const timeStr = `${pad(now.getHours())}h${pad(now.getMinutes())}`;
  const filename = `backup - protocolo de testes de estabilidade - ${dateStr} ${timeStr}.json`;
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

  await uploadToCloud(filepath, filename);

  await Promise.all([
    upsertSetting("backup.last_run", now.toISOString()),
    upsertSetting("backup.last_status", "success"),
    upsertSetting("backup.last_file", filename),
  ]);

  pruneOldBackups();
  pruneCloudBackups().catch(() => {});

  const { size } = fs.statSync(filepath);
  return { filename, size, exportedAt: now.toISOString() };
}

function pruneOldBackups() {
  try {
    ensureDir();
    const files = fs
      .readdirSync(BACKUP_DIR)
      .filter(f => f.endsWith(".json") && f.startsWith("backup"))
      .map(f => ({ f, mt: fs.statSync(path.join(BACKUP_DIR, f)).mtimeMs }))
      .sort((a, b) => b.mt - a.mt);
    for (const { f } of files.slice(MAX_BACKUPS)) {
      fs.unlinkSync(path.join(BACKUP_DIR, f));
    }
  } catch (e) {
    logger.warn({ err: e }, "backup: prune failed");
  }
}

async function ensureBackupDefaults(): Promise<void> {
  try {
    const rows = await db.select().from(settingsTable);
    const has = (k: string) => rows.some(r => r.key === k);
    if (!has("backup.enabled")) await upsertSetting("backup.enabled", "true");
    if (!has("backup.time")) await upsertSetting("backup.time", "08:00");
    if (!has("backup.time2")) await upsertSetting("backup.time2", "20:00");
    if (!has("backup.last_run")) {
      logger.info("backup: nenhum backup anterior encontrado, executando o primeiro backup agora");
      try {
        const r = await runBackup();
        logger.info({ filename: r.filename, size: r.size }, "backup: primeiro backup concluído");
      } catch (err) {
        logger.error({ err }, "backup: primeiro backup falhou");
      }
    }
  } catch (e) {
    logger.warn({ err: e }, "backup: ensureBackupDefaults falhou");
  }
}

export function startBackupScheduler() {
  const ran = new Set<string>();

  ensureBackupDefaults().catch(() => {});

  setInterval(async () => {
    try {
      const rows = await db.select().from(settingsTable);
      const enabled = await getSetting(rows, "backup.enabled", "false");
      if (enabled !== "true") return;

      const time1 = await getSetting(rows, "backup.time", "08:00");
      const time2 = await getSetting(rows, "backup.time2", "20:00");
      const time3 = await getSetting(rows, "backup.time3", "");

      const now = new Date();
      const hhmm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
      const today = now.toDateString();

      for (const t of [time1, time2, time3]) {
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
