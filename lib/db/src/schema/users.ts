import { pgTable, text, serial, timestamp, boolean } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  displayName: text("display_name").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().default("analyst"),
  active: boolean("active").notNull().default(true),
  hplcAccess: boolean("hplc_access").notNull().default(true),
  permissions: text("permissions").array().notNull().default(sql`'{}'::text[]`),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  accessExpiresAt: timestamp("access_expires_at", { withTimezone: true }),
  email: text("email"),
  registrationNumber: text("registration_number"),
});

export type DbUser = typeof usersTable.$inferSelect;
export type InsertUser = typeof usersTable.$inferInsert;
