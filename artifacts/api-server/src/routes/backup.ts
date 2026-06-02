import { Router, type IRouter } from "express";
  import { db, settingsTable, protocolsTable, lotsTable, analysisResultsTable } from "@workspace/db";
  import { requireAuth } from "../lib/session";
  import { PERM, requirePermission } from "../lib/permissions";
  import fs from "fs";
  import path from "path";

  const router: IRouter = Router();

  const BACKUP_DIR = process.env.BACKUP_DIR || path.join(process.cwd(), "backups");

  function ensureDir() {
    if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }

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
      schedule:   s["backup.schedule"] || "daily",
      time:       s["backup.time"]     || "02:00",
      lastRun:    s["backup.last_run"]    || null,
      lastStatus: s["backup.last_status"] || null,
      lastFile:   s["backup.last_file"]   || null,
      backupDir:  BACKUP_DIR,
    });
  });

  router.put("/backup/config", requireAuth, requirePermission(PERM.SETTINGS_MANAGE), async (req, res): Promise<void> => {
    const { enabled, schedule, time } = req.body as { enabled?: boolean; schedule?: string; time?: string };
    if (enabled !== undefined) await upsertSetting("backup.enabled", String(enabled));
    if (schedule)               await upsertSetting("backup.schedule", schedule);
    if (time)                   await upsertSetting("backup.time", time);
    res.json({ ok: true });
  });

  router.post("/backup/run", requireAuth, requirePermission(PERM.SETTINGS_MANAGE), async (_req, res): Promise<void> => {
    try {
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
        version: "1.0",
        exportedAt: now.toISOString(),
        tables: { protocols, lots, analysis_results: results },
      };

      fs.writeFileSync(filepath, JSON.stringify(payload, null, 2), "utf8");

      await Promise.all([
        upsertSetting("backup.last_run",    now.toISOString()),
        upsertSetting("backup.last_status", "success"),
        upsertSetting("backup.last_file",   filename),
      ]);

      const { size } = fs.statSync(filepath);
      res.json({ ok: true, filename, size, exportedAt: now.toISOString() });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await Promise.all([
        upsertSetting("backup.last_run",    new Date().toISOString()),
        upsertSetting("backup.last_status", "error"),
      ]).catch(() => {});
      res.status(500).json({ error: message });
    }
  });

  router.get("/backup/history", requireAuth, requirePermission(PERM.SETTINGS_MANAGE), (_req, res): void => {
    try {
      ensureDir();
      const files = fs
        .readdirSync(BACKUP_DIR)
        .filter(f => f.endsWith(".json"))
        .map(f => {
          const st = fs.statSync(path.join(BACKUP_DIR, f));
          return { filename: f, size: st.size, createdAt: st.mtime.toISOString() };
        })
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 50);
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

  export default router;
  