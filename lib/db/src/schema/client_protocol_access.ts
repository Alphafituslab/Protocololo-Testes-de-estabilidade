import { pgTable, serial, integer, timestamp, unique } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { protocolsTable } from "./protocols";

export const clientProtocolAccessTable = pgTable("client_protocol_access", {
  id: serial("id").primaryKey(),
  clientUserId: integer("client_user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  protocolId: integer("protocol_id").notNull().references(() => protocolsTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  uniqueAccess: unique().on(t.clientUserId, t.protocolId),
}));

export type ClientProtocolAccess = typeof clientProtocolAccessTable.$inferSelect;
