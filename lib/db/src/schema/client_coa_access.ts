import { pgTable, serial, integer, boolean, timestamp, unique } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { coaDocumentsTable } from "./coa_documents";

export const clientCoaAccessTable = pgTable("client_coa_access", {
  id: serial("id").primaryKey(),
  clientUserId: integer("client_user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  coaId: integer("coa_id").notNull().references(() => coaDocumentsTable.id, { onDelete: "cascade" }),
  canPrint: boolean("can_print").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  uniqueAccess: unique().on(t.clientUserId, t.coaId),
}));

export type ClientCoaAccess = typeof clientCoaAccessTable.$inferSelect;
