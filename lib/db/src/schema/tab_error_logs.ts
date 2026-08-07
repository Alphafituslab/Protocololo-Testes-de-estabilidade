import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const tabErrorLogsTable = pgTable("tab_error_logs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => usersTable.id, { onDelete: "set null" }),
  userDisplay: text("user_display"),
  protocolId: integer("protocol_id"),
  tabName: text("tab_name"),
  errorMessage: text("error_message").notNull(),
  errorStack: text("error_stack"),
  componentStack: text("component_stack"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type DbTabErrorLog = typeof tabErrorLogsTable.$inferSelect;
