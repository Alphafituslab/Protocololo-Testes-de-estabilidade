import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { protocolsTable } from "./protocols";

export const protocolSignaturesTable = pgTable("protocol_signatures", {
  id: serial("id").primaryKey(),
  protocolId: integer("protocol_id").notNull().references(() => protocolsTable.id, { onDelete: "cascade" }),
  userId: integer("user_id").references(() => usersTable.id, { onDelete: "set null" }),
  userDisplay: text("user_display").notNull(),
  userRole: text("user_role").notNull().default("analyst"),
  roleLabel: text("role_label").notNull(),
  signedAt: timestamp("signed_at", { withTimezone: true }).notNull().defaultNow(),
});

export type DbProtocolSignature = typeof protocolSignaturesTable.$inferSelect;
