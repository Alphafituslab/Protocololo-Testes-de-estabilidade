import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { protocolsTable } from "./protocols";

export const protocolSnapshotsTable = pgTable("protocol_snapshots", {
  id: serial("id").primaryKey(),
  protocolId: integer("protocol_id").notNull().references(() => protocolsTable.id, { onDelete: "cascade" }),
  label: text("label").notNull().default("Versão salva"),
  snapshotData: text("snapshot_data").notNull(),
  createdBy: text("created_by").notNull().default("Sistema"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type DbProtocolSnapshot = typeof protocolSnapshotsTable.$inferSelect;
