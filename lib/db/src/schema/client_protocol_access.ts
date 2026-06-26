import { pgTable, serial, integer, boolean, timestamp, unique } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { protocolsTable } from "./protocols";

export const clientProtocolAccessTable = pgTable("client_protocol_access", {
  id: serial("id").primaryKey(),
  clientUserId: integer("client_user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  protocolId: integer("protocol_id").notNull().references(() => protocolsTable.id, { onDelete: "cascade" }),
  canViewCertificate: boolean("can_view_certificate").notNull().default(true),
  canViewReport: boolean("can_view_report").notNull().default(true),
  canPrint: boolean("can_print").notNull().default(true),
  canViewHistory: boolean("can_view_history").notNull().default(false),
  canViewAttachments: boolean("can_view_attachments").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  uniqueAccess: unique().on(t.clientUserId, t.protocolId),
}));

export type ClientProtocolAccess = typeof clientProtocolAccessTable.$inferSelect;
