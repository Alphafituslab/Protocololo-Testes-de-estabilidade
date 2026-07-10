import { Router, type IRouter } from "express";
import { db, settingsTable } from "@workspace/db";
import { requireAuth } from "../lib/session";
import { PERM, requirePermission } from "../lib/permissions";
import { runBackup, BACKUP_DIR, listCloudBackups, downloadCloudBackup } from "../lib/backup-scheduler";
import { runRestore } from "../lib/backup-restore";
import { logger } from "../lib/logger";
import fs from "fs";
import path from "path";

const router: IRouter = Router();

async function upsertSetting(key: string, value: string) {
  await db
    .insert(settingsTable)
    .values({ key, value, updatedAt: new Date() })
    .onConflictDoUpdate({ target: settingsTable.key, set: { value, updatedAt: new Date() } });
}

router.get("/backup/config", requireAuth, requirePermission(PERM.SETTINGS_MANAGE), async (_req, res): Promise<void> => {
  const rows = await db.select().from(settingsTable);
  const s: Record<string, string> = {};
  for (const r of rows) s[r.key] = r.value;
  res.json({
    enabled:    s["backup.enabled"] === "true",
    time:       s["backup.time"]     || "08:00",
    time2:      s["backup.time2"]    || "20:00",
    time3:      s["backup.time3"]    || "",
    lastRun:    s["backup.last_run"]    || null,
    lastStatus: s["backup.last_status"] || null,
    lastFile:   s["backup.last_file"]   || null,
    backupDir:  BACKUP_DIR,
  });
});

router.put("/backup/config", requireAuth, requirePermission(PERM.SETTINGS_MANAGE), async (req, res): Promise<void> => {
  const { enabled, time, time2, time3 } = req.body as { enabled?: boolean; time?: string; time2?: string; time3?: string };
  if (enabled !== undefined) await upsertSetting("backup.enabled", String(enabled));
  if (time)  await upsertSetting("backup.time", time);
  if (time2) await upsertSetting("backup.time2", time2);
  if (time3 !== undefined) await upsertSetting("backup.time3", time3);
  res.json({ ok: true });
});

router.post("/backup/run", requireAuth, requirePermission(PERM.SETTINGS_MANAGE), async (_req, res): Promise<void> => {
  try {
    const result = await runBackup();
    res.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await Promise.all([
      upsertSetting("backup.last_run", new Date().toISOString()),
      upsertSetting("backup.last_status", "error"),
    ]).catch(() => {});
    res.status(500).json({ error: message });
  }
});

router.get("/backup/cloud-history", requireAuth, requirePermission(PERM.SETTINGS_MANAGE), async (_req, res): Promise<void> => {
  try {
    res.json(await listCloudBackups());
  } catch {
    res.json([]);
  }
});

router.post("/backup/cloud-restore/:filename", requireAuth, requirePermission(PERM.SETTINGS_MANAGE), async (req, res): Promise<void> => {
  try {
    const data = await downloadCloudBackup(String(req.params["filename"]));
    const result = await runRestore(data);
    logger.info(result, "backup: cloud restore completed");
    res.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err }, "backup: cloud restore error");
    res.status(500).json({ error: `Erro ao restaurar da nuvem: ${message}` });
  }
});

router.get("/backup/history", requireAuth, requirePermission(PERM.SETTINGS_MANAGE), (_req, res): void => {
  try {
    if (!fs.existsSync(BACKUP_DIR)) { res.json([]); return; }
    const files = fs
      .readdirSync(BACKUP_DIR)
      .filter(f => f.endsWith(".json"))
      .map(f => {
        const st = fs.statSync(path.join(BACKUP_DIR, f));
        return { filename: f, size: st.size, createdAt: st.mtime.toISOString() };
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 60);
    res.json(files);
  } catch {
    res.json([]);
  }
});

router.get("/backup/download/:filename", requireAuth, requirePermission(PERM.SETTINGS_MANAGE), (req, res): void => {
  const filename = path.basename(String(req.params["filename"]));
  const filepath = path.join(BACKUP_DIR, filename);
  if (!fs.existsSync(filepath)) { res.status(404).json({ error: "Arquivo não encontrado" }); return; }
  res.download(filepath, filename);
});

router.post("/backup/restore", requireAuth, requirePermission(PERM.SETTINGS_MANAGE), async (req, res): Promise<void> => {
  try {
    const result = await runRestore(req.body as unknown);
    logger.info(result, "backup: restore completed");
    res.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err }, "backup: restore error");
    res.status(500).json({ error: `Erro ao restaurar: ${message}` });
  }
});

export default router;
