import { pgTable, serial, integer, text, timestamp, boolean } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const loginLogTable = pgTable("login_log", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => usersTable.id, { onDelete: "set null" }),
  username: text("username").notNull(),
  success: boolean("success").notNull().default(true),
  failReason: text("fail_reason"),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  loggedAt: timestamp("logged_at", { withTimezone: true }).notNull().defaultNow(),
});

export type LoginLog = typeof loginLogTable.$inferSelect;
