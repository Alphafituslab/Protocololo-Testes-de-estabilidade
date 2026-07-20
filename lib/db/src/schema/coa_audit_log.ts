import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";

export const coaAuditLogTable = pgTable("coa_audit_log", {
  id: serial("id").primaryKey(),
  coaId: integer("coa_id").notNull(),
  userId: integer("user_id"),
  userName: text("user_name").notNull().default("Sistema"),
  action: text("action").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type DbCoaAuditLog = typeof coaAuditLogTable.$inferSelect;
