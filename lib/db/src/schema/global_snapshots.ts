import { pgTable, serial, text, boolean, timestamp, integer } from "drizzle-orm/pg-core";

export const globalSnapshotsTable = pgTable("global_snapshots", {
  id: serial("id").primaryKey(),
  label: text("label").notNull().default("Snapshot manual"),
  notes: text("notes"),
  snapshotData: text("snapshot_data").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  createdBy: text("created_by").notNull().default("Sistema"),
  isAuto: boolean("is_auto").notNull().default(false),
  sizeBytes: integer("size_bytes").notNull().default(0),
});

export type DbGlobalSnapshot = typeof globalSnapshotsTable.$inferSelect;
